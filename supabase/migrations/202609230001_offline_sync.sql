-- Atomic, revision-checked sync for the offline-first client. Run after earlier migrations.
create table public.sync_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  entities jsonb not null default '{}'::jsonb,
  revisions jsonb not null default '{}'::jsonb,
  next_revision bigint not null default 1,
  updated_at timestamptz not null default now()
);

create table public.sync_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  mutation_id uuid not null,
  applied_revision bigint not null,
  primary key (user_id, mutation_id)
);

alter table public.sync_state enable row level security;
alter table public.sync_receipts enable row level security;
create policy "own sync state" on public.sync_state for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own sync receipts" on public.sync_receipts for select to authenticated using ((select auth.uid()) = user_id);
grant select on public.sync_state, public.sync_receipts to authenticated;

create function public.sync_initialize(p_entities jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result public.sync_state;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.sync_state(user_id, entities)
  values (auth.uid(), coalesce(p_entities, '{}'::jsonb))
  on conflict (user_id) do nothing;
  select * into result from public.sync_state where user_id = auth.uid();
  return jsonb_build_object('entities', result.entities, 'revisions', result.revisions);
end;
$$;

create function public.sync_apply(p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  state_row public.sync_state;
  change_item jsonb;
  item_kind text;
  item_id text;
  mutation uuid;
  group_id text;
  expected_revision bigint;
  actual_revision bigint;
  applied jsonb := '[]'::jsonb;
  conflicts jsonb := '[]'::jsonb;
  rejected_groups jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) > 250 then raise exception 'Invalid sync batch'; end if;
  select * into state_row from public.sync_state where user_id = auth.uid() for update;
  if not found then raise exception 'Sync state not initialized'; end if;

  -- Check every member of each local action before applying any member.
  for change_item in select value from jsonb_array_elements(p_changes) loop
    item_kind := change_item->>'kind';
    item_id := change_item->>'id';
    if item_kind not in ('peptides','vials','mixGroups','logs','dailyNotes','purchasePlans','todayAdditions','settings','onboarding')
       or item_id is null or length(item_id) > 200 then raise exception 'Invalid sync entity'; end if;
    mutation := (change_item->>'mutationId')::uuid;
    group_id := coalesce(change_item->>'groupId', mutation::text);
    expected_revision := (change_item->>'baseRevision')::bigint;
    if exists(select 1 from public.sync_receipts where user_id = auth.uid() and mutation_id = mutation) then continue; end if;
    actual_revision := coalesce((state_row.revisions->item_kind->>item_id)::bigint, 0);
    if expected_revision <> actual_revision then rejected_groups := rejected_groups || to_jsonb(group_id); end if;
  end loop;

  for change_item in select value from jsonb_array_elements(p_changes) loop
    item_kind := change_item->>'kind';
    item_id := change_item->>'id';
    if item_kind not in ('peptides','vials','mixGroups','logs','dailyNotes','purchasePlans','todayAdditions','settings','onboarding')
       or item_id is null or length(item_id) > 200 then raise exception 'Invalid sync entity'; end if;
    mutation := (change_item->>'mutationId')::uuid;
    group_id := coalesce(change_item->>'groupId', mutation::text);
    expected_revision := (change_item->>'baseRevision')::bigint;
    if exists(select 1 from public.sync_receipts where user_id = auth.uid() and mutation_id = mutation) then
      applied := applied || to_jsonb(mutation::text);
      continue;
    end if;
    actual_revision := coalesce((state_row.revisions->item_kind->>item_id)::bigint, 0);
    if rejected_groups ? group_id then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object(
        'mutationId', mutation::text, 'kind', item_kind, 'id', item_id,
        'remoteValue', state_row.entities->item_kind->item_id, 'remoteRevision', actual_revision
      ));
      continue;
    end if;

    state_row.entities := jsonb_set(state_row.entities, array[item_kind], coalesce(state_row.entities->item_kind, '{}'::jsonb), true);
    state_row.revisions := jsonb_set(state_row.revisions, array[item_kind], coalesce(state_row.revisions->item_kind, '{}'::jsonb), true);
    if change_item->'value' = 'null'::jsonb then
      state_row.entities := state_row.entities #- array[item_kind, item_id];
    else
      state_row.entities := jsonb_set(state_row.entities, array[item_kind, item_id], change_item->'value', true);
    end if;
    state_row.revisions := jsonb_set(state_row.revisions, array[item_kind, item_id], to_jsonb(state_row.next_revision), true);
    insert into public.sync_receipts(user_id, mutation_id, applied_revision)
      values (auth.uid(), mutation, state_row.next_revision);
    state_row.next_revision := state_row.next_revision + 1;
    applied := applied || to_jsonb(mutation::text);
  end loop;

  update public.sync_state set entities = state_row.entities, revisions = state_row.revisions,
    next_revision = state_row.next_revision, updated_at = now()
  where user_id = auth.uid();
  return jsonb_build_object('entities', state_row.entities, 'revisions', state_row.revisions,
    'applied', applied, 'conflicts', conflicts);
end;
$$;

revoke execute on function public.sync_initialize(jsonb), public.sync_apply(jsonb) from public, anon;
grant execute on function public.sync_initialize(jsonb), public.sync_apply(jsonb) to authenticated;
