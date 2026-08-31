import type { SupabaseClient } from "@supabase/supabase-js";
import type { DoseLog, Peptide, PeptimeStore } from "@/lib/types";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuid() { return crypto.randomUUID(); }
function number(value: unknown, fallback = 0) { const result = Number(value); return Number.isFinite(result) ? result : fallback; }
function text(value: unknown, fallback = "") { return typeof value === "string" ? value : fallback; }
function optionalText(value: unknown) { const result = text(value).trim(); return result || undefined; }

export function normalizeStoreIds(store: PeptimeStore): PeptimeStore {
  const ids = new Map<string, string>();
  const peptides = store.peptides.map(peptide => {
    const id = uuidPattern.test(peptide.id) ? peptide.id : uuid();
    ids.set(peptide.id, id);
    return { ...peptide, id };
  });
  const validIds = new Set(peptides.map(peptide => peptide.id));
  const logs = store.logs
    .map(log => ({ ...log, id: uuidPattern.test(log.id) ? log.id : uuid(), peptideId: ids.get(log.peptideId) ?? log.peptideId }))
    .filter(log => validIds.has(log.peptideId));
  return {
    ...store,
    peptides,
    logs,
    settings: { ...store.settings, dayBoundaryHour: store.settings.dayBoundaryHour ?? 4 },
  };
}

export function mergeStores(remote: PeptimeStore, local: PeptimeStore) {
  const peptideNames = new Map(remote.peptides.map(peptide => [peptide.name.trim().toLocaleLowerCase("sv-SE"), peptide]));
  const idMap = new Map<string, string>();
  const additions: Peptide[] = [];
  local.peptides.forEach(peptide => {
    const match = peptideNames.get(peptide.name.trim().toLocaleLowerCase("sv-SE"));
    if (match) idMap.set(peptide.id, match.id);
    else { idMap.set(peptide.id, peptide.id); additions.push(peptide); }
  });
  const remoteLogIds = new Set(remote.logs.map(log => log.id));
  const localLogs = local.logs
    .filter(log => !remoteLogIds.has(log.id))
    .map(log => ({ ...log, peptideId: idMap.get(log.peptideId) ?? log.peptideId }))
    .filter(log => [...remote.peptides, ...additions].some(peptide => peptide.id === log.peptideId));
  const notes = new Map(local.dailyNotes.map(note => [note.date, note]));
  remote.dailyNotes.forEach(note => notes.set(note.date, note));
  return {
    ...remote,
    peptides: [...remote.peptides, ...additions],
    logs: [...remote.logs, ...localLogs],
    dailyNotes: [...notes.values()],
    onboardingComplete: remote.onboardingComplete || local.onboardingComplete,
  };
}

export async function loadRemoteStore(client: SupabaseClient, fallback: PeptimeStore) {
  const [profileResult, peptideResult, vialResult, scheduleResult, logResult, noteResult] = await Promise.all([
    client.from("profiles").select("*").maybeSingle(),
    client.from("peptides").select("*").order("created_at"),
    client.from("vials").select("*").is("closed_at", null),
    client.from("schedules").select("*").eq("active", true),
    client.from("dose_logs").select("*").order("taken_at", { ascending: false }),
    client.from("daily_notes").select("*").order("note_date", { ascending: false }),
  ]);
  const error = [profileResult, peptideResult, vialResult, scheduleResult, logResult, noteResult].find(result => result.error)?.error;
  if (error) throw error;

  const profile = profileResult.data;
  const peptideRows = peptideResult.data ?? [];
  const vialRows = vialResult.data ?? [];
  const scheduleRows = scheduleResult.data ?? [];
  const logRows = logResult.data ?? [];
  const noteRows = noteResult.data ?? [];
  const vials = new Map(vialRows.map(row => [row.peptide_id, row]));
  const schedules = new Map(scheduleRows.map(row => [row.peptide_id, row]));
  const usedMg = new Map<string, number>();
  logRows.forEach(row => {
    if (row.status !== "taken") return;
    const amountMg = row.unit === "mg" ? number(row.actual_dose) : number(row.actual_dose) / 1000;
    usedMg.set(row.peptide_id, (usedMg.get(row.peptide_id) ?? 0) + amountMg);
  });

  const peptides: Peptide[] = peptideRows.map(row => {
    const vial = vials.get(row.id);
    const schedule = schedules.get(row.id);
    const vialMg = number(vial?.initial_mg, number(row.vial_mg, 1));
    const frequency = schedule?.frequency === "selected_weekdays" ? "weekdays" : schedule?.frequency === "every_n_days" ? "interval" : schedule?.frequency === "times_per_week" ? "weekly" : "daily";
    return {
      id: row.id,
      name: row.name,
      shortCode: row.short_code,
      color: row.color,
      doseMcg: row.dose_unit === "mg" ? number(row.dose_amount) * 1000 : number(row.dose_amount),
      vialMg,
      waterMl: number(vial?.bac_water_ml, number(row.bac_water_ml, 1)),
      remainingMg: Math.max(0, vialMg - (usedMg.get(row.id) ?? 0)),
      route: row.route,
      slot: schedule?.slot ?? "as_needed",
      time: text(schedule?.clock_time, "00:00").slice(0, 5),
      frequency,
      weekdays: schedule?.weekdays ?? [],
      intervalDays: schedule?.every_n_days ?? undefined,
      fasted: row.fasted,
      fastedNote: row.fasted_note,
      mixGroupId: optionalText(row.mix_group_id),
      cycleStart: row.cycle_start ?? undefined,
      weeksOn: row.weeks_on ?? undefined,
      weeksOff: row.weeks_off ?? undefined,
      reconstitutedAt: vial?.reconstituted_at ?? undefined,
      beyondUseDays: number(vial?.beyond_use_days, 28),
      sites: row.default_sites ?? [],
      lastSite: row.last_site ?? undefined,
      notes: row.notes,
      archived: Boolean(row.archived_at),
      example: row.is_example,
    };
  });
  const names = new Map(peptides.map(peptide => [peptide.id, peptide.name]));
  const logs: DoseLog[] = logRows.filter(row => names.has(row.peptide_id)).map(row => ({
    id: row.id,
    peptideId: row.peptide_id,
    peptideName: names.get(row.peptide_id) ?? "Peptid",
    plannedDose: number(row.planned_dose),
    actualDose: number(row.actual_dose),
    unit: row.unit,
    computedIu: number(row.computed_iu),
    slot: row.slot,
    takenAt: row.taken_at,
    status: row.status,
    site: row.site ?? undefined,
    mixGroupId: optionalText(row.mix_group_id),
    vialId: row.vial_id ?? undefined,
    note: row.note,
  }));

  const store: PeptimeStore = {
    peptides,
    logs,
    dailyNotes: noteRows.map(row => ({ date: row.note_date, note: row.note })),
    settings: {
      syringe: profile?.syringe_type === "U-100 0.5 ml" ? "U-100 0.5 ml" : "U-100 1 ml",
      timezone: profile?.timezone ?? "Europe/Stockholm",
      language: profile?.language === "en" ? "en" : "sv",
      theme: profile?.theme === "light" ? "light" : "dark",
      dayBoundaryHour: number(profile?.day_boundary_hour, 4),
    },
    onboardingComplete: Boolean(profile?.onboarding_complete),
  };
  const hasData = Boolean(profile?.onboarding_complete || peptideRows.length || logRows.length || noteRows.length);
  return { store: hasData ? store : normalizeStoreIds(fallback), hasData };
}

export async function saveRemoteStore(client: SupabaseClient, userId: string, input: PeptimeStore) {
  const store = normalizeStoreIds(input);
  const usedMg = new Map<string, number>();
  store.logs.forEach(log => {
    if (log.status !== "taken") return;
    const amountMg = log.unit === "mg" ? log.actualDose : log.actualDose / 1000;
    usedMg.set(log.peptideId, (usedMg.get(log.peptideId) ?? 0) + amountMg);
  });
  const frequency = (value: Peptide["frequency"]) => value === "weekdays" ? "selected_weekdays" : value === "interval" ? "every_n_days" : value === "weekly" ? "times_per_week" : "daily";
  const results = [];
  results.push(await client.from("profiles").upsert({ id: userId, language: store.settings.language, timezone: store.settings.timezone, theme: store.settings.theme, syringe_type: store.settings.syringe, day_boundary_hour: store.settings.dayBoundaryHour, onboarding_complete: store.onboardingComplete }, { onConflict: "id" }));
  if (store.peptides.length) {
    results.push(await client.from("peptides").upsert(store.peptides.map(peptide => ({ id: peptide.id, user_id: userId, name: peptide.name, short_code: peptide.shortCode, color: peptide.color, dose_amount: peptide.doseMcg, dose_unit: "mcg", vial_mg: peptide.vialMg, bac_water_ml: peptide.waterMl, route: peptide.route, fasted: peptide.fasted, fasted_note: peptide.fastedNote, mix_group_id: peptide.mixGroupId ?? null, cycle_start: peptide.cycleStart ?? null, weeks_on: peptide.weeksOn ?? null, weeks_off: peptide.weeksOff ?? null, default_sites: peptide.sites, last_site: peptide.lastSite ?? null, notes: peptide.notes, archived_at: peptide.archived ? new Date().toISOString() : null, is_example: peptide.example })), { onConflict: "id" }));
    results.push(await client.from("vials").upsert(store.peptides.map(peptide => ({ id: peptide.id, user_id: userId, peptide_id: peptide.id, initial_mg: peptide.remainingMg + (usedMg.get(peptide.id) ?? 0), bac_water_ml: peptide.waterMl, reconstituted_at: peptide.reconstitutedAt ?? null, beyond_use_days: peptide.beyondUseDays, opened_at: peptide.reconstitutedAt ?? new Date().toISOString(), closed_at: null })), { onConflict: "id" }));
    results.push(await client.from("schedules").upsert(store.peptides.map(peptide => ({ id: peptide.id, user_id: userId, peptide_id: peptide.id, slot: peptide.slot, clock_time: peptide.time, frequency: frequency(peptide.frequency), weekdays: peptide.weekdays, every_n_days: peptide.intervalDays ?? null, times_per_week: peptide.frequency === "weekly" ? peptide.weekdays.length : null, starts_on: peptide.cycleStart ?? new Date().toISOString().slice(0, 10), active: !peptide.archived })), { onConflict: "id" }));
  }
  results.push(await client.from("dose_logs").delete().eq("user_id", userId));
  if (store.logs.length) results.push(await client.from("dose_logs").insert(store.logs.map(log => ({ id: log.id, user_id: userId, peptide_id: log.peptideId, planned_dose: log.plannedDose, actual_dose: log.actualDose, unit: log.unit, computed_iu: log.computedIu, slot: log.slot, taken_at: log.takenAt, status: log.status, site: log.site ?? null, mix_group_id: log.mixGroupId ?? null, vial_id: log.peptideId, note: log.note }))));
  if (store.dailyNotes.length) results.push(await client.from("daily_notes").upsert(store.dailyNotes.map(note => ({ user_id: userId, note_date: note.date, note: note.note })), { onConflict: "user_id,note_date" }));
  const error = results.find(result => result.error)?.error;
  if (error) throw error;
  return store;
}
