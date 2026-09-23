import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeInjectionSites, type DailyTagId, type DoseLog, type MixGroupSchedule, type Peptide, type PeptimeStore, type PurchasePlanItem, type ScheduleFrequency } from "@/lib/types";
import { groupKey } from "@/lib/schedule";
import { effectiveLogDate } from "@/lib/log-day";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuid() { return crypto.randomUUID(); }
function number(value: unknown, fallback = 0) { const result = Number(value); return Number.isFinite(result) ? result : fallback; }
function text(value: unknown, fallback = "") { return typeof value === "string" ? value : fallback; }
function optionalText(value: unknown) { const result = text(value).trim(); return result || undefined; }

function purchaseItems(value: unknown): PurchasePlanItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(raw => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const name = text(item.name).trim();
    if (!name) return [];
    const frequency = item.frequency === "every_n_days" ? "every_n_days" : item.frequency === "times_per_week" ? "times_per_week" : "daily";
    return [{
      id: uuidPattern.test(text(item.id)) ? text(item.id) : uuid(),
      name,
      route: item.route === "intranasal" || item.route === "oral" || item.route === "topical" ? item.route : "subcutaneous",
      vialMg: Math.max(0, number(item.vialMg)),
      doseMcg: Math.max(0, number(item.doseMcg)),
      doseEntryUnit: item.doseEntryUnit === "mg" ? "mg" as const : "mcg" as const,
      frequency,
      everyNDays: Math.max(2, number(item.everyNDays, 2)),
      timesPerWeek: Math.min(7, Math.max(1, number(item.timesPerWeek, 1))),
      bacWaterMl: Math.max(0, number(item.bacWaterMl)),
    }];
  });
}

export function normalizeStoreIds(store: PeptimeStore): PeptimeStore {
  const dayBoundaryHour = store.settings.dayBoundaryHour ?? 4;
  const ids = new Map<string, string>();
  const peptides = store.peptides.map(peptide => {
    const id = uuidPattern.test(peptide.id) ? peptide.id : uuid();
    ids.set(peptide.id, id);
    const legacyFrequency = peptide.frequency as string;
    return {
      ...peptide,
      id,
      frequency: legacyFrequency === "interval" ? "every_n_days" : legacyFrequency === "weekly" ? "weekdays" : peptide.frequency,
      weekdays: peptide.weekdays ?? [0,1,2,3,4,5,6],
      everyNDays: peptide.everyNDays ?? (peptide as Peptide & { intervalDays?: number }).intervalDays,
      paused: peptide.paused ?? false,
      sites: normalizeInjectionSites(peptide.sites ?? []),
    };
  });
  const vialIds = new Map<string, string>();
  const vials = (store.vials ?? []).map(vial => {
    const id = uuidPattern.test(vial.id) ? vial.id : uuid();
    vialIds.set(vial.id, id);
    return { ...vial, id, peptideId: ids.get(vial.peptideId) ?? vial.peptideId };
  });
  for (const peptide of peptides) {
    let current = vials.filter(vial => vial.peptideId === peptide.id && !vial.closedAt).sort((a, b) => b.openedAt.localeCompare(a.openedAt))[0];
    if (!current) {
      current = { id: vials.some(vial => vial.id === peptide.id) ? uuid() : peptide.id, peptideId: peptide.id, initialMg: peptide.vialMg, remainingMg: peptide.remainingMg, waterMl: peptide.waterMl, openedAt: peptide.reconstitutedAt ?? new Date().toISOString(), reconstitutedAt: peptide.reconstitutedAt, beyondUseDays: peptide.beyondUseDays };
      vials.push(current);
    }
    peptide.currentVialId = current.id;
  }
  const validIds = new Set(peptides.map(peptide => peptide.id));
  const logs = store.logs
    .map(log => ({ ...log, id: uuidPattern.test(log.id) ? log.id : uuid(), peptideId: ids.get(log.peptideId) ?? log.peptideId, vialId: log.vialId ? vialIds.get(log.vialId) ?? ids.get(log.vialId) ?? log.vialId : undefined, scheduledDate: log.scheduledDate ?? effectiveLogDate(log.takenAt, dayBoundaryHour) }))
    .filter(log => validIds.has(log.peptideId));
  return {
    ...store,
    peptides,
    vials,
    mixGroups: (store.mixGroups ?? []).map(group => ({ ...group, weekdays: group.weekdays ?? [], paused: group.paused ?? false })),
    logs,
    dailyNotes: (store.dailyNotes ?? []).map(note => ({ ...note, tags: note.tags ?? [] })),
    purchasePlans: (store.purchasePlans ?? []).map(plan => ({ ...plan, id: uuidPattern.test(plan.id) ? plan.id : uuid(), items: purchaseItems(plan.items), createdAt: plan.createdAt ?? new Date().toISOString(), updatedAt: plan.updatedAt ?? new Date().toISOString() })),
    todayAdditions: store.todayAdditions ?? [],
    settings: { ...store.settings, customDailyTags: store.settings.customDailyTags ?? [], themeMode: store.settings.themeMode ?? "system", massDisplayUnit: store.settings.massDisplayUnit === "mg" ? "mg" : "mcg", dayBoundaryHour, remindersEnabled: store.settings.remindersEnabled ?? false },
  };
}

export async function loadRemoteStore(client: SupabaseClient, fallback: PeptimeStore) {
  const [profileResult, peptideResult, vialResult, scheduleResult, mixGroupResult, logResult, noteResult, purchasePlanResult] = await Promise.all([
    client.from("profiles").select("*").maybeSingle(),
    client.from("peptides").select("*").order("created_at"),
    client.from("vials").select("*").is("closed_at", null),
    client.from("schedules").select("*").eq("active", true),
    client.from("mix_groups").select("*").eq("active", true),
    client.from("dose_logs").select("*").order("taken_at", { ascending: false }),
    client.from("daily_notes").select("*").order("note_date", { ascending: false }),
    client.from("purchase_plans").select("*").order("updated_at", { ascending: false }),
  ]);
  const missingMixGroups = mixGroupResult.error?.code === "PGRST205" || mixGroupResult.error?.code === "42P01";
  const missingPurchasePlans = purchasePlanResult.error?.code === "PGRST205" || purchasePlanResult.error?.code === "42P01";
  const error = [profileResult, peptideResult, vialResult, scheduleResult, logResult, noteResult].find(result => result.error)?.error ?? (missingMixGroups ? null : mixGroupResult.error) ?? (missingPurchasePlans ? null : purchasePlanResult.error);
  if (error) throw error;

  const profile = profileResult.data;
  const peptideRows = peptideResult.data ?? [];
  const vialRows = vialResult.data ?? [];
  const scheduleRows = scheduleResult.data ?? [];
  const mixGroupRows = missingMixGroups ? [] : (mixGroupResult.data ?? []);
  const logRows = logResult.data ?? [];
  const noteRows = noteResult.data ?? [];
  const purchasePlanRows = missingPurchasePlans ? [] : (purchasePlanResult.data ?? []);
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
    const vialMg = number(row.vial_mg, number(vial?.initial_mg, 1));
    const frequency: ScheduleFrequency = schedule?.frequency === "selected_weekdays" ? "weekdays" : schedule?.frequency === "every_n_days" ? "every_n_days" : schedule?.frequency === "as_needed" ? "as_needed" : "daily";
    return {
      id: row.id,
      currentVialId: vial?.id ?? row.id,
      name: row.name,
      shortCode: row.short_code,
      color: row.color,
      doseMcg: row.dose_unit === "mg" ? number(row.dose_amount) * 1000 : number(row.dose_amount),
      vialMg,
      waterMl: number(vial?.bac_water_ml, number(row.bac_water_ml, 1)),
      remainingMg: Math.max(0, number(vial?.remaining_mg, vialMg - (usedMg.get(row.id) ?? 0))),
      route: row.route,
      slot: schedule?.slot ?? "as_needed",
      time: text(schedule?.clock_time, "00:00").slice(0, 5),
      frequency,
      weekdays: schedule?.weekdays ?? [],
      everyNDays: schedule?.every_n_days ?? undefined,
      anchorDate: schedule?.starts_on ?? undefined,
      paused: schedule?.paused ?? !schedule?.active,
      fasted: row.fasted,
      fastedNote: row.fasted_note,
      mixGroupId: optionalText(row.mix_group_id),
      cycleStart: row.cycle_start ?? undefined,
      weeksOn: row.weeks_on ?? undefined,
      weeksOff: row.weeks_off ?? undefined,
      reconstitutedAt: vial?.reconstituted_at ?? undefined,
      beyondUseDays: number(vial?.beyond_use_days, 28),
      sites: normalizeInjectionSites(row.default_sites ?? []),
      lastSite: row.last_site ?? undefined,
      notes: row.notes,
      archived: Boolean(row.archived_at),
      example: row.is_example,
    };
  });
  const mixGroups: MixGroupSchedule[] = mixGroupRows.map(row => ({
    name: row.name,
    slot: row.slot,
    time: text(row.clock_time, "00:00").slice(0, 5),
    frequency: row.frequency === "selected_weekdays" ? "weekdays" : row.frequency === "every_n_days" ? "every_n_days" : row.frequency === "as_needed" ? "as_needed" : "daily",
    weekdays: row.weekdays ?? [],
    everyNDays: row.every_n_days ?? undefined,
    anchorDate: row.anchor_date ?? undefined,
    paused: row.paused ?? false,
    cycleStart: row.cycle_start ?? undefined,
    weeksOn: row.weeks_on ?? undefined,
    weeksOff: row.weeks_off ?? undefined,
  }));
  if (!mixGroups.length) {
    peptides.forEach(peptide => {
      if (!peptide.mixGroupId || mixGroups.some(group => groupKey(group.name) === groupKey(peptide.mixGroupId))) return;
      mixGroups.push({ name: peptide.mixGroupId, slot: peptide.slot, time: peptide.time, frequency: peptide.frequency, weekdays: peptide.weekdays, everyNDays: peptide.everyNDays, anchorDate: peptide.anchorDate, paused: peptide.paused, cycleStart: peptide.cycleStart, weeksOn: peptide.weeksOn, weeksOff: peptide.weeksOff });
    });
  }
  peptides.forEach(peptide => {
    const group = mixGroups.find(candidate => groupKey(candidate.name) === groupKey(peptide.mixGroupId));
    if (group) Object.assign(peptide, group, { name: peptide.name });
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
    scheduledDate: row.scheduled_date ?? undefined,
    status: row.status,
    site: row.site ?? undefined,
    mixGroupId: optionalText(row.mix_group_id),
    vialId: row.vial_id ?? undefined,
    note: row.note,
  }));

  const store: PeptimeStore = {
    peptides,
    vials: vialRows.map(row => ({ id: row.id, peptideId: row.peptide_id, initialMg: number(row.initial_mg), remainingMg: number(row.remaining_mg, number(row.initial_mg)), waterMl: number(row.bac_water_ml), openedAt: row.opened_at ?? row.reconstituted_at ?? new Date().toISOString(), reconstitutedAt: row.reconstituted_at ?? undefined, beyondUseDays: number(row.beyond_use_days, 28) })),
    mixGroups,
    logs,
    dailyNotes: noteRows.map(row => ({ date: row.note_date, note: row.note, tags: (row.tags ?? []) as DailyTagId[], sleepQuality: row.sleep_quality ?? undefined, brainFatigue: row.brain_fatigue ?? undefined, physicalFatigue: row.physical_fatigue ?? undefined, painLevel: row.pain_level ?? undefined, activityLevel: row.activity_level ?? undefined })),
    purchasePlans: purchasePlanRows.map(row => ({ id: row.id, name: row.name, items: purchaseItems(row.items), createdAt: row.created_at, updatedAt: row.updated_at })),
    todayAdditions: [],
    settings: {
      syringe: profile?.syringe_type === "U-100 0.3 ml" ? "U-100 0.3 ml" : profile?.syringe_type === "U-100 0.5 ml" ? "U-100 0.5 ml" : "U-100 1 ml",
      customDailyTags: Array.isArray(profile?.custom_daily_tags) ? profile.custom_daily_tags : [],
      massDisplayUnit: profile?.mass_display_unit === "mg" ? "mg" : fallback.settings.massDisplayUnit === "mg" ? "mg" : "mcg",
      timezone: profile?.timezone ?? "Europe/Stockholm",
      language: profile?.language === "en" ? "en" : "sv",
      theme: profile?.theme === "light" ? "light" : "dark",
      themeMode: fallback.settings.themeMode ?? "system",
      dayBoundaryHour: number(profile?.day_boundary_hour, 4),
      remindersEnabled: Boolean(profile?.reminders_enabled),
    },
    onboardingComplete: Boolean(profile?.onboarding_complete),
  };
  const hasData = Boolean(profile?.onboarding_complete || peptideRows.length || logRows.length || noteRows.length || purchasePlanRows.length);
  return { store: hasData ? store : normalizeStoreIds(fallback), hasData };
}
