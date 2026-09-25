import { addDays, stockholmDate, stockholmLocalToIso } from "@/lib/log-day";
import { groupKey, isCycleOn } from "@/lib/schedule";
import type { Schedule } from "@/lib/types";

export interface ReminderPreferences {
  enabled: boolean;
  lead_minutes: 0 | 10 | 15;
  follow_up_enabled: boolean;
  daily_summary_enabled: boolean;
  daily_summary_time: string;
}

export interface ReminderPeptide {
  id: string;
  mix_group_id: string | null;
  archived_at: string | null;
  cycle_start: string | null;
  weeks_on: number | null;
  weeks_off: number | null;
}

export interface ReminderSchedule {
  peptide_id: string;
  slot: string;
  clock_time: string | null;
  frequency: string;
  weekdays: number[];
  every_n_days: number | null;
  starts_on: string;
  paused: boolean;
  active: boolean;
}

export interface ReminderGroup {
  name_key: string;
  slot: string;
  clock_time: string | null;
  frequency: string;
  weekdays: number[];
  every_n_days: number | null;
  anchor_date: string | null;
  paused: boolean;
  active: boolean;
  cycle_start: string | null;
  weeks_on: number | null;
  weeks_off: number | null;
}

export interface ReminderLog {
  peptide_id: string;
  scheduled_date: string;
  status: string;
}

export interface ReminderDailyNote {
  note_date: string;
  note: string;
  tags: string[];
  sleep_quality: number | null;
  brain_fatigue: number | null;
  physical_fatigue: number | null;
  pain_level: number | null;
  activity_level: number | null;
}

export interface ReminderInput {
  preferences: ReminderPreferences;
  peptides: ReminderPeptide[];
  schedules: ReminderSchedule[];
  groups: ReminderGroup[];
  logs: ReminderLog[];
  notes: ReminderDailyNote[];
}

export interface ReminderEvent {
  key: string;
  dueAt: string;
  title: string;
  body: string;
  tag: string;
  url: string;
}

function dueOn(schedule: ReminderSchedule | ReminderGroup, date: string, peptide?: ReminderPeptide) {
  if (!schedule.active || schedule.paused || schedule.frequency === "as_needed") return false;
  const groupCycle = "cycle_start" in schedule ? schedule : null;
  const cycle: Pick<Schedule, "cycleStart" | "weeksOn" | "weeksOff"> = {
    cycleStart: groupCycle?.cycle_start ?? peptide?.cycle_start ?? undefined,
    weeksOn: groupCycle?.weeks_on ?? peptide?.weeks_on ?? undefined,
    weeksOff: groupCycle?.weeks_off ?? peptide?.weeks_off ?? undefined,
  };
  if (!isCycleOn(cycle, date)) return false;
  const anchor = "starts_on" in schedule ? schedule.starts_on : schedule.anchor_date;
  if (anchor && date < anchor) return false;
  if (schedule.frequency === "daily") return true;
  if (schedule.frequency === "selected_weekdays") {
    const weekday = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
    return schedule.weekdays.includes(weekday);
  }
  if (schedule.frequency === "every_n_days") {
    if (!anchor) return false;
    const elapsed = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${anchor}T12:00:00Z`)) / 86400000);
    return elapsed >= 0 && elapsed % Math.max(2, schedule.every_n_days ?? 2) === 0;
  }
  return false;
}

function timeIsValid(value: string | null): value is string {
  return Boolean(value && /^([01]\d|2[0-3]):[0-5]\d/.test(value));
}

function summaryComplete(note?: ReminderDailyNote) {
  return Boolean(note && (note.note.trim() || note.tags.length ||
    [note.sleep_quality, note.brain_fatigue, note.physical_fatigue, note.pain_level, note.activity_level].some(value => value !== null)));
}

export function planReminders(input: ReminderInput, now = new Date()): ReminderEvent[] {
  if (!input.preferences.enabled) return [];
  const nowMs = now.getTime();
  const today = stockholmDate(now);
  const scheduleByPeptide = new Map(input.schedules.map(schedule => [schedule.peptide_id, schedule]));
  const groupByName = new Map(input.groups.map(group => [group.name_key, group]));
  const results: ReminderEvent[] = [];

  for (const offset of [-1, 0, 1]) {
    const date = addDays(today, offset);
    const byTime = new Map<string, string[]>();
    for (const peptide of input.peptides) {
      if (peptide.archived_at) continue;
      const schedule = peptide.mix_group_id
        ? groupByName.get(groupKey(peptide.mix_group_id))
        : scheduleByPeptide.get(peptide.id);
      if (!schedule || !timeIsValid(schedule.clock_time) || !dueOn(schedule, date, peptide)) continue;
      const time = schedule.clock_time.slice(0, 5);
      byTime.set(time, [...(byTime.get(time) ?? []), peptide.id]);
    }

    for (const [time, peptideIds] of byTime) {
      const logged = new Set(input.logs.filter(log => log.scheduled_date === date && log.status).map(log => log.peptide_id));
      if (peptideIds.every(id => logged.has(id))) continue;
      const scheduledMs = Date.parse(stockholmLocalToIso(`${date}T${time}`));
      for (const kind of ["first", "follow-up"] as const) {
        if (kind === "follow-up" && !input.preferences.follow_up_enabled) continue;
        if (kind === "first" && input.preferences.follow_up_enabled && nowMs >= scheduledMs + 10 * 60_000) continue;
        const dueMs = scheduledMs + (kind === "first" ? -input.preferences.lead_minutes : 10) * 60_000;
        if (nowMs < dueMs || nowMs - dueMs > 20 * 60_000) continue;
        results.push({
          key: `dose:${date}:${time}:${kind}`,
          dueAt: new Date(dueMs).toISOString(),
          title: "Peptime",
          body: kind === "follow-up" ? "Din planerade dos är ännu inte loggad." : "Dags för din planerade dos.",
          tag: `dose-${date}-${time}-${kind}`,
          url: "/",
        });
      }
    }

    if (input.preferences.daily_summary_enabled && timeIsValid(input.preferences.daily_summary_time) &&
        !summaryComplete(input.notes.find(note => note.note_date === date))) {
      const time = input.preferences.daily_summary_time.slice(0, 5);
      const dueMs = Date.parse(stockholmLocalToIso(`${date}T${time}`));
      if (nowMs >= dueMs && nowMs - dueMs <= 20 * 60_000) {
        results.push({
          key: `summary:${date}`,
          dueAt: new Date(dueMs).toISOString(),
          title: "Peptime",
          body: "Vill du fylla i dagens sammanfattning?",
          tag: `summary-${date}`,
          url: "/?view=today",
        });
      }
    }
  }
  return results;
}
