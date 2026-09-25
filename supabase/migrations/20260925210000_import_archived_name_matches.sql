-- Reuse one existing peptide when an account has several archived records with
-- the same name. Keep the other archived records and all historical logs intact.
create or replace function public.import_shared_schedule(p_code text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  account_id uuid := auth.uid();
  shared record;
  item jsonb;
  source_group jsonb;
  group_item jsonb;
  group_name text;
  target_group text;
  group_names jsonb := '{}'::jsonb;
  normalized_name text;
  seen_names text[] := array[]::text[];
  match_count integer;
  target_peptide_id uuid;
  old_vial record;
  source_vial numeric;
  source_water numeric;
  item_group text;
  item_frequency text;
  item_slot text;
  suffix integer;
  imported_count integer := 0;
begin
  if account_id is null then raise exception 'Logga in för att importera ett schema.'; end if;
  select name, items, groups into shared from public.shared_schedules
    where code = upper(btrim(p_code));
  if not found then raise exception 'Koden finns inte.'; end if;
  if jsonb_typeof(shared.items) <> 'array' or jsonb_array_length(shared.items) not between 1 and 30 then
    raise exception 'Schemat innehåller inga giltiga peptider.';
  end if;

  -- Serialize imports for this account and validate the complete batch before writes.
  perform 1 from public.profiles where id = account_id for update;
  for item in select value from jsonb_array_elements(shared.items) loop
    normalized_name := lower(btrim(item->>'name'));
    if normalized_name is null or normalized_name = '' or char_length(btrim(item->>'name')) > 100
       or normalized_name = any(seen_names)
       or coalesce((item->>'doseMcg')::numeric, 0) <= 0
       or coalesce((item->>'vialMg')::numeric, 0) <= 0
       or coalesce((item->>'waterMl')::numeric, 0) <= 0 then
      raise exception 'Schemat har dubbla namn eller ogiltiga värden. Inget importerades.';
    end if;
    seen_names := array_append(seen_names, normalized_name);
    select count(*) into match_count from public.peptides
      where user_id = account_id and lower(btrim(name)) = normalized_name
        and archived_at is null;
    if match_count > 1 then
      raise exception 'Flera aktiva peptider heter %. Inget importerades.', item->>'name';
    end if;
  end loop;

  -- Reuse a group only when it contains no unrelated peptides. Otherwise give
  -- the imported group a distinct name, leaving the old group untouched.
  for item in select value from jsonb_array_elements(shared.items) loop
    group_name := nullif(btrim(item->>'mixGroupId'), '');
    if group_name is null or group_names ? lower(group_name) then continue; end if;
    if char_length(group_name) > 100 then raise exception 'Mixgruppens namn är för långt.'; end if;
    target_group := group_name;
    if exists (
      select 1 from public.peptides p where p.user_id = account_id
        and lower(btrim(p.mix_group_id)) = lower(group_name)
        and lower(btrim(p.name)) <> all(seen_names)
    ) or (exists (select 1 from public.mix_groups g where g.user_id = account_id and g.name_key = lower(group_name))
      and not exists (select 1 from public.peptides p where p.user_id = account_id
        and lower(btrim(p.mix_group_id)) = lower(group_name) and lower(btrim(p.name)) = any(seen_names))) then
      suffix := 2;
      loop
        target_group := left(group_name, 95 - length(suffix::text)) || ' (' || suffix || ')';
        exit when (
          not exists (select 1 from public.mix_groups g where g.user_id = account_id and g.name_key = lower(btrim(target_group)))
          and not exists (select 1 from public.peptides p where p.user_id = account_id and lower(btrim(p.mix_group_id)) = lower(target_group))
        ) or (
          exists (select 1 from public.peptides p where p.user_id = account_id and lower(btrim(p.mix_group_id)) = lower(target_group) and lower(btrim(p.name)) = any(seen_names))
          and not exists (select 1 from public.peptides p where p.user_id = account_id and lower(btrim(p.mix_group_id)) = lower(target_group) and lower(btrim(p.name)) <> all(seen_names))
        );
        suffix := suffix + 1;
      end loop;
    end if;
    group_names := group_names || jsonb_build_object(lower(group_name), target_group);
    source_group := null;
    for group_item in select value from jsonb_array_elements(coalesce(shared.groups, '[]'::jsonb)) loop
      if lower(btrim(group_item->>'name')) = lower(group_name) then source_group := group_item; exit; end if;
    end loop;
    source_group := coalesce(source_group, item);
    insert into public.mix_groups (
      user_id, name, name_key, slot, clock_time, frequency, weekdays,
      every_n_days, anchor_date, paused, cycle_start, weeks_on, weeks_off, active
    ) values (
      account_id, target_group, lower(btrim(target_group)), (source_group->>'slot')::public.dose_slot,
      nullif(source_group->>'time', '')::time,
      case when source_group->>'frequency' = 'weekdays' then 'selected_weekdays' else source_group->>'frequency' end,
      array(select value::smallint from jsonb_array_elements_text(coalesce(source_group->'weekdays', '[]'::jsonb))),
      nullif(source_group->>'everyNDays', '')::integer, nullif(source_group->>'anchorDate', '')::date,
      coalesce((source_group->>'paused')::boolean, false), nullif(source_group->>'cycleStart', '')::date,
      nullif(source_group->>'weeksOn', '')::integer, nullif(source_group->>'weeksOff', '')::integer, true
    ) on conflict (user_id, name_key) do update set
      slot = excluded.slot, clock_time = excluded.clock_time, frequency = excluded.frequency,
      weekdays = excluded.weekdays, every_n_days = excluded.every_n_days,
      anchor_date = excluded.anchor_date, paused = excluded.paused,
      cycle_start = excluded.cycle_start, weeks_on = excluded.weeks_on,
      weeks_off = excluded.weeks_off, active = true;
  end loop;

  for item in select value from jsonb_array_elements(shared.items) loop
    normalized_name := lower(btrim(item->>'name'));
    source_vial := (item->>'vialMg')::numeric;
    source_water := (item->>'waterMl')::numeric;
    item_group := nullif(btrim(item->>'mixGroupId'), '');
    if item_group is not null then item_group := group_names->>lower(item_group); end if;
    item_frequency := case when item->>'frequency' = 'weekdays' then 'selected_weekdays' else item->>'frequency' end;
    item_slot := item->>'slot';
    target_peptide_id := null;
    select p.id into target_peptide_id from public.peptides p where p.user_id = account_id
      and lower(btrim(p.name)) = normalized_name
      order by (p.archived_at is null) desc,
        (select count(*) from public.dose_logs l where l.peptide_id = p.id) desc,
        p.archived_at desc nulls last, p.created_at desc, p.id
      limit 1;
    if target_peptide_id is null then
      insert into public.peptides (
        user_id, name, short_code, color, dose_amount, dose_unit, vial_mg,
        bac_water_ml, route, fasted, fasted_note, mix_group_id, cycle_start,
        weeks_on, weeks_off, default_sites, notes, archived_at, is_example
      ) values (
        account_id, btrim(item->>'name'), coalesce(item->>'shortCode', ''), coalesce(item->>'color', 'teal'),
        (item->>'doseMcg')::numeric, 'mcg', source_vial, source_water,
        (item->>'route')::public.peptide_route, coalesce((item->>'fasted')::boolean, false),
        coalesce(item->>'fastedNote', ''), item_group,
        case when item_group is null then nullif(item->>'cycleStart', '')::date end,
        case when item_group is null then nullif(item->>'weeksOn', '')::integer end,
        case when item_group is null then nullif(item->>'weeksOff', '')::integer end,
        array(select value from jsonb_array_elements_text(coalesce(item->'sites', '[]'::jsonb))),
        coalesce(item->>'notes', ''), null, false
      ) returning id into target_peptide_id;
    else
      update public.peptides set
        name = btrim(item->>'name'), short_code = coalesce(item->>'shortCode', ''),
        color = coalesce(item->>'color', 'teal'), dose_amount = (item->>'doseMcg')::numeric,
        dose_unit = 'mcg', vial_mg = source_vial, bac_water_ml = source_water,
        route = (item->>'route')::public.peptide_route,
        fasted = coalesce((item->>'fasted')::boolean, false),
        fasted_note = coalesce(item->>'fastedNote', ''), mix_group_id = item_group,
        cycle_start = case when item_group is null then nullif(item->>'cycleStart', '')::date end,
        weeks_on = case when item_group is null then nullif(item->>'weeksOn', '')::integer end,
        weeks_off = case when item_group is null then nullif(item->>'weeksOff', '')::integer end,
        default_sites = array(select value from jsonb_array_elements_text(coalesce(item->'sites', '[]'::jsonb))),
        notes = coalesce(item->>'notes', ''), archived_at = null, is_example = false
      where id = target_peptide_id and user_id = account_id;
    end if;

    select id, initial_mg, bac_water_ml into old_vial from public.vials
      where user_id = account_id and peptide_id = target_peptide_id and closed_at is null
      order by created_at desc limit 1;
    if old_vial.id is null or old_vial.initial_mg <> source_vial or old_vial.bac_water_ml <> source_water then
      update public.vials set closed_at = now() where user_id = account_id and peptide_id = target_peptide_id and closed_at is null;
      insert into public.vials (user_id, peptide_id, initial_mg, remaining_mg, bac_water_ml, beyond_use_days)
        values (account_id, target_peptide_id, source_vial, 0, source_water, coalesce((item->>'beyondUseDays')::integer, 28));
    end if;

    if item_group is null then
      insert into public.schedules (
        id, user_id, peptide_id, slot, clock_time, frequency, weekdays,
        every_n_days, starts_on, paused, active
      ) values (
        target_peptide_id, account_id, target_peptide_id, item_slot::public.dose_slot,
        nullif(item->>'time', '')::time, item_frequency,
        array(select value::smallint from jsonb_array_elements_text(coalesce(item->'weekdays', '[]'::jsonb))),
        nullif(item->>'everyNDays', '')::integer, coalesce(nullif(item->>'anchorDate', '')::date, current_date),
        coalesce((item->>'paused')::boolean, false), true
      ) on conflict (id) do update set
        slot = excluded.slot, clock_time = excluded.clock_time, frequency = excluded.frequency,
        weekdays = excluded.weekdays, every_n_days = excluded.every_n_days,
        starts_on = excluded.starts_on, paused = excluded.paused, active = true;
    else
      update public.schedules set active = false where user_id = account_id and peptide_id = target_peptide_id;
    end if;
    imported_count := imported_count + 1;
  end loop;
  return jsonb_build_object('imported', imported_count);
end;
$$;

revoke execute on function public.import_shared_schedule(text) from public, anon;
grant execute on function public.import_shared_schedule(text) to authenticated;
