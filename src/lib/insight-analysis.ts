import { addDays, logScheduledDate } from "./log-day";
import type { DailyNote, DailyTagId, PeptimeStore, WellbeingMetric } from "./types";

export type InsightPeriod = 30 | 90 | 365;
export type InsightWindow = "same_day" | "next_day";

export const metricDefinitions: {
  key: WellbeingMetric;
  label: string;
  low: string;
  high: string;
  color: string;
  defaultWindow: InsightWindow;
}[] = [
  { key: "sleepQuality", label: "Sömn", low: "Mycket dålig", high: "Mycket bra", color: "#72b7aa", defaultWindow: "next_day" },
  { key: "brainFatigue", label: "Hjärntrötthet", low: "Ingen", high: "Extrem", color: "#7f9fca", defaultWindow: "same_day" },
  { key: "physicalFatigue", label: "Fysisk trötthet", low: "Ingen", high: "Extrem", color: "#c9828b", defaultWindow: "same_day" },
  { key: "painLevel", label: "Värk", low: "Ingen värk", high: "Mycket värk", color: "#b48a9e", defaultWindow: "same_day" },
  { key: "activityLevel", label: "Aktivitet", low: "Mycket låg", high: "Mycket hög", color: "#c4a66a", defaultWindow: "same_day" },
];

export interface ExposureGroup {
  id: string;
  label: string;
  peptideIds: string[];
  doseDates: string[];
  coDose?: { label: string; count: number; total: number };
}

export interface MetricComparison {
  kind: "metric";
  metricKey: WellbeingMetric;
  exposedAverage: number | null;
  baselineAverage: number | null;
  difference: number | null;
  exposedCount: number;
  baselineCount: number;
  eligibleDoseDays: number;
  sufficient: boolean;
}

export interface TagComparison {
  kind: "tag";
  tag: DailyTagId;
  exposedOccurrences: number;
  baselineOccurrences: number;
  exposedCount: number;
  baselineCount: number;
  difference: number | null;
  eligibleDoseDays: number;
  sufficient: boolean;
}

export interface InsightPattern {
  exposure: ExposureGroup;
  window: InsightWindow;
  score: number;
  comparison: MetricComparison | TagComparison;
}

const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

export function hasDailyEntry(note?: DailyNote) {
  return Boolean(note && (note.note.trim() || note.tags.length || metricDefinitions.some(metric => typeof note[metric.key] === "number")));
}

export function periodStart(today: string, period: InsightPeriod) {
  return addDays(today, 1 - period);
}

function doseDay(store: PeptimeStore, log: PeptimeStore["logs"][number]) {
  return logScheduledDate(log, store.settings.dayBoundaryHour);
}

function coDoseFor(store: PeptimeStore, peptideIds: string[], dates: string[]) {
  if (!dates.length) return undefined;
  const dateSet = new Set(dates);
  const counts = new Map<string, number>();
  for (const peptide of store.peptides) {
    if (peptideIds.includes(peptide.id)) continue;
    const sharedDates = new Set(store.logs.filter(log => log.status === "taken" && log.peptideId === peptide.id && dateSet.has(doseDay(store, log))).map(log => doseDay(store, log)));
    if (sharedDates.size) counts.set(peptide.name, sharedDates.size);
  }
  const strongest = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return strongest && strongest[1] / dates.length >= 0.5 ? { label: strongest[0], count: strongest[1], total: dates.length } : undefined;
}

export function exposureGroups(store: PeptimeStore, period: InsightPeriod, today: string): ExposureGroup[] {
  const start = periodStart(today, period);
  const taken = store.logs.filter(log => log.status === "taken" && doseDay(store, log) >= start && doseDay(store, log) <= today);
  const groups = new Map<string, { peptideIds: Set<string>; labels: Set<string>; dates: Set<string> }>();
  for (const log of taken) {
    const id = log.mixGroupId ? `mix:${log.mixGroupId}` : `peptide:${log.peptideId}`;
    const group = groups.get(id) ?? { peptideIds: new Set<string>(), labels: new Set<string>(), dates: new Set<string>() };
    group.peptideIds.add(log.peptideId);
    group.labels.add(log.peptideName);
    group.dates.add(doseDay(store, log));
    groups.set(id, group);
  }
  return [...groups.entries()].map(([id, value]) => {
    const peptideIds = [...value.peptideIds];
    const doseDates = [...value.dates].sort();
    return {
      id,
      label: [...value.labels].sort((a, b) => a.localeCompare(b, "sv-SE")).join(" + "),
      peptideIds,
      doseDates,
      coDose: id.startsWith("mix:") ? undefined : coDoseFor(store, peptideIds, doseDates),
    };
  }).sort((a, b) => b.doseDates.length - a.doseDates.length || a.label.localeCompare(b.label, "sv-SE"));
}

export function exposureForSelection(store: PeptimeStore, peptideId: string | "all", period: InsightPeriod, today: string): ExposureGroup {
  const start = periodStart(today, period);
  const relevant = store.logs.filter(log => log.status === "taken" && (peptideId === "all" || log.peptideId === peptideId) && doseDay(store, log) >= start && doseDay(store, log) <= today);
  const dates = [...new Set(relevant.map(log => doseDay(store, log)))].sort();
  if (peptideId === "all") return { id: "all", label: "Alla doser", peptideIds: [...new Set(relevant.map(log => log.peptideId))], doseDates: dates };
  const peptide = store.peptides.find(value => value.id === peptideId);
  return { id: `peptide:${peptideId}`, label: peptide?.name ?? relevant[0]?.peptideName ?? "Peptid", peptideIds: [peptideId], doseDates: dates, coDose: coDoseFor(store, [peptideId], dates) };
}

function outcomeDates(exposure: ExposureGroup, window: InsightWindow, today: string) {
  return exposure.doseDates.map(date => window === "next_day" ? addDays(date, 1) : date).filter(date => date <= today);
}

function baselineNotes(store: PeptimeStore, exposure: ExposureGroup, window: InsightWindow, period: InsightPeriod, today: string) {
  const start = periodStart(today, period);
  const doseDates = new Set(exposure.doseDates);
  return store.dailyNotes.filter(note => note.date >= start && note.date <= today && !doseDates.has(window === "next_day" ? addDays(note.date, -1) : note.date));
}

export function compareMetric(store: PeptimeStore, exposure: ExposureGroup, metricKey: WellbeingMetric, window: InsightWindow, period: InsightPeriod, today: string, minimum = 4): MetricComparison {
  const notes = new Map(store.dailyNotes.map(note => [note.date, note]));
  const targets = outcomeDates(exposure, window, today);
  const exposedValues = targets.map(date => notes.get(date)?.[metricKey]).filter((value): value is number => typeof value === "number");
  const baselineValues = baselineNotes(store, exposure, window, period, today).map(note => note[metricKey]).filter((value): value is number => typeof value === "number");
  const exposedAverage = average(exposedValues);
  const baselineAverage = average(baselineValues);
  const sufficient = exposedValues.length >= minimum && baselineValues.length >= minimum;
  return {
    kind: "metric",
    metricKey,
    exposedAverage,
    baselineAverage,
    difference: sufficient && exposedAverage !== null && baselineAverage !== null ? exposedAverage - baselineAverage : null,
    exposedCount: exposedValues.length,
    baselineCount: baselineValues.length,
    eligibleDoseDays: targets.length,
    sufficient,
  };
}

export function compareTag(store: PeptimeStore, exposure: ExposureGroup, tag: DailyTagId, window: InsightWindow, period: InsightPeriod, today: string, minimum = 4): TagComparison {
  const notes = new Map(store.dailyNotes.map(note => [note.date, note]));
  const targets = outcomeDates(exposure, window, today);
  const exposedNotes = targets.map(date => notes.get(date)).filter((note): note is DailyNote => hasDailyEntry(note));
  const otherNotes = baselineNotes(store, exposure, window, period, today).filter(hasDailyEntry);
  const exposedOccurrences = exposedNotes.filter(note => note.tags.includes(tag)).length;
  const baselineOccurrences = otherNotes.filter(note => note.tags.includes(tag)).length;
  const sufficient = exposedNotes.length >= minimum && otherNotes.length >= minimum;
  return {
    kind: "tag",
    tag,
    exposedOccurrences,
    baselineOccurrences,
    exposedCount: exposedNotes.length,
    baselineCount: otherNotes.length,
    difference: sufficient ? exposedOccurrences / exposedNotes.length - baselineOccurrences / otherNotes.length : null,
    eligibleDoseDays: targets.length,
    sufficient,
  };
}

export function topPatterns(store: PeptimeStore, period: InsightPeriod, today: string, limit = 3): InsightPattern[] {
  const candidates: InsightPattern[] = [];
  const tags = [...new Set(store.dailyNotes.flatMap(note => note.tags))];
  for (const exposure of exposureGroups(store, period, today)) {
    for (const metric of metricDefinitions) {
      const windows: InsightWindow[] = metric.key === "sleepQuality" ? ["next_day"] : ["same_day", "next_day"];
      for (const window of windows) {
        const comparison = compareMetric(store, exposure, metric.key, window, period, today, 8);
        if (comparison.difference !== null && Math.abs(comparison.difference) >= 0.5) candidates.push({ exposure, window, comparison, score: Math.abs(comparison.difference) / 4 });
      }
    }
    for (const tag of tags) {
      for (const window of ["same_day", "next_day"] as const) {
        const comparison = compareTag(store, exposure, tag, window, period, today, 8);
        if (comparison.difference !== null && Math.abs(comparison.difference) >= 0.25) candidates.push({ exposure, window, comparison, score: Math.abs(comparison.difference) });
      }
    }
  }
  const strongest = new Map<string, InsightPattern>();
  for (const candidate of candidates) {
    const subject = candidate.comparison.kind === "metric" ? candidate.comparison.metricKey : `tag:${candidate.comparison.tag}`;
    const key = `${candidate.exposure.id}:${subject}`;
    if (!strongest.has(key) || strongest.get(key)!.score < candidate.score) strongest.set(key, candidate);
  }
  return [...strongest.values()].sort((a, b) => b.score - a.score || b.comparison.exposedCount - a.comparison.exposedCount).slice(0, limit);
}
