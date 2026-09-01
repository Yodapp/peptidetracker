import type { MixGroupSchedule, Peptide, PeptimeStore, Schedule } from "@/lib/types";

export const groupKey = (value?: string) => value?.trim().toLocaleLowerCase("sv-SE") ?? "";

export function peptideSchedule(peptide: Peptide): Schedule {
  return {
    slot: peptide.slot,
    time: peptide.time,
    frequency: peptide.frequency,
    weekdays: peptide.weekdays,
    everyNDays: peptide.everyNDays,
    anchorDate: peptide.anchorDate,
    paused: peptide.paused,
    cycleStart: peptide.cycleStart,
    weeksOn: peptide.weeksOn,
    weeksOff: peptide.weeksOff,
  };
}

export function resolvedSchedule(peptide: Peptide, mixGroups: MixGroupSchedule[]): Schedule {
  if (!peptide.mixGroupId) return peptideSchedule(peptide);
  return mixGroups.find(group => groupKey(group.name) === groupKey(peptide.mixGroupId)) ?? peptideSchedule(peptide);
}

function utcDayNumber(value: string) {
  return Math.floor(Date.parse(`${value}T00:00:00Z`) / 86400000);
}

function mondayIndex(value: string) {
  return (new Date(`${value}T12:00:00Z`).getUTCDay() + 6) % 7;
}

export function isCycleOn(schedule: Schedule, date: string) {
  if (!schedule.cycleStart || !schedule.weeksOn) return true;
  const elapsed = utcDayNumber(date) - utcDayNumber(schedule.cycleStart);
  if (elapsed < 0) return false;
  const weeksOff = Math.max(0, schedule.weeksOff ?? 0);
  const cycleDays = (schedule.weeksOn + weeksOff) * 7;
  return cycleDays === 0 || elapsed % cycleDays < schedule.weeksOn * 7;
}

export function scheduleTargetKey(peptide: Peptide) {
  return peptide.mixGroupId ? `group:${groupKey(peptide.mixGroupId)}` : `peptide:${peptide.id}`;
}

export function isDueOn(peptide: Peptide, store: PeptimeStore, date: string) {
  const schedule = resolvedSchedule(peptide, store.mixGroups);
  if (peptide.archived || schedule.paused || !isCycleOn(schedule, date)) return false;
  if (schedule.frequency === "daily") return true;
  if (schedule.frequency === "weekdays") return schedule.weekdays.includes(mondayIndex(date));
  if (schedule.frequency === "every_n_days") {
    const anchor = schedule.anchorDate ?? date;
    const elapsed = utcDayNumber(date) - utcDayNumber(anchor);
    return elapsed >= 0 && elapsed % Math.max(2, schedule.everyNDays ?? 2) === 0;
  }
  return store.todayAdditions.includes(`${date}:${scheduleTargetKey(peptide)}`);
}
