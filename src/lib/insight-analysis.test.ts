import assert from "node:assert/strict";
import test from "node:test";
import { compareMetric, compareTag, exposureForSelection, exposureGroups, topPatterns } from "./insight-analysis";
import { addDays } from "./log-day";
import type { DailyNote, DoseLog, Peptide, PeptimeStore } from "./types";

const peptide = (id: string, name: string, mixGroupId?: string): Peptide => ({
  id, name, shortCode: name.slice(0, 3), color: "teal", doseMcg: 100, vialMg: 5, waterMl: 2, remainingMg: 5,
  route: "subcutaneous", slot: "evening", time: "20:00", frequency: "daily", weekdays: [], paused: false,
  fasted: false, fastedNote: "", mixGroupId, beyondUseDays: 30, sites: [], notes: "", archived: false, example: false,
});

const dose = (id: string, peptideId: string, peptideName: string, scheduledDate: string, options: Partial<DoseLog> = {}): DoseLog => ({
  id, peptideId, peptideName, plannedDose: 100, actualDose: 100, unit: "mcg", computedIu: 4, slot: "evening",
  takenAt: `${scheduledDate}T18:00:00.000Z`, scheduledDate, status: "taken", note: "", ...options,
});

const note = (date: string, values: Partial<DailyNote>): DailyNote => ({ date, note: "", tags: [], ...values });

const store = (logs: DoseLog[], dailyNotes: DailyNote[], peptides: Peptide[]): PeptimeStore => ({
  logs, dailyNotes, peptides, vials: [], mixGroups: [], purchasePlans: [], todayAdditions: [], onboardingComplete: true,
  settings: { syringe: "U-100 0.3 ml", customDailyTags: [], massDisplayUnit: "mcg", timezone: "Europe/Stockholm", language: "sv", theme: "dark", themeMode: "system", dayBoundaryHour: 4, remindersEnabled: false },
});

test("kopplar sömn till dagen efter dosen och jämför med andra dagar", () => {
  const p = peptide("p1", "Ipamorelin");
  const doseDates = ["2026-09-10", "2026-09-12", "2026-09-14", "2026-09-16"];
  const logs = doseDates.map((date, index) => dose(`d${index}`, p.id, p.name, date));
  const notes = [
    ...["2026-09-11", "2026-09-13", "2026-09-15", "2026-09-17"].map(date => note(date, { sleepQuality: 1 })),
    ...["2026-09-02", "2026-09-04", "2026-09-06", "2026-09-08"].map(date => note(date, { sleepQuality: 4 })),
  ];
  const data = store(logs, notes, [p]);
  const exposure = exposureForSelection(data, p.id, 30, "2026-09-20");
  const result = compareMetric(data, exposure, "sleepQuality", "next_day", 30, "2026-09-20");
  assert.equal(result.sufficient, true);
  assert.equal(result.exposedAverage, 1);
  assert.equal(result.baselineAverage, 4);
  assert.equal(result.difference, -3);
});

test("kräver minst fyra svar i båda grupperna", () => {
  const p = peptide("p1", "Selank");
  const logs = ["2026-09-10", "2026-09-12", "2026-09-14"].map((date, index) => dose(`d${index}`, p.id, p.name, date));
  const notes = ["2026-09-11", "2026-09-13", "2026-09-15"].map(date => note(date, { sleepQuality: 2 }));
  const data = store(logs, notes, [p]);
  const result = compareMetric(data, exposureForSelection(data, p.id, 30, "2026-09-20"), "sleepQuality", "next_day", 30, "2026-09-20");
  assert.equal(result.sufficient, false);
  assert.equal(result.difference, null);
  assert.equal(result.exposedCount, 3);
});

test("räknar flera doser av samma peptid samma dag som en exponering", () => {
  const p = peptide("p1", "Adamax");
  const data = store([
    dose("d1", p.id, p.name, "2026-09-10"),
    dose("d2", p.id, p.name, "2026-09-10", { takenAt: "2026-09-10T20:00:00.000Z" }),
  ], [], [p]);
  assert.deepEqual(exposureForSelection(data, p.id, 30, "2026-09-20").doseDates, ["2026-09-10"]);
});

test("använder Stockholm-gränsen för en dos efter midnatt", () => {
  const p = peptide("p1", "DSIP");
  const lateDose = dose("d1", p.id, p.name, "2026-09-11", { scheduledDate: undefined, takenAt: "2026-09-10T23:00:00.000Z" });
  const data = store([lateDose], [], [p]);
  assert.deepEqual(exposureForSelection(data, p.id, 30, "2026-09-20").doseDates, ["2026-09-10"]);
});

test("slår ihop medlemmar i samma mix och ignorerar överhoppade doser", () => {
  const p1 = peptide("p1", "CJC-1295", "mix1");
  const p2 = peptide("p2", "Ipamorelin", "mix1");
  const data = store([
    dose("d1", p1.id, p1.name, "2026-09-10", { mixGroupId: "mix1" }),
    dose("d2", p2.id, p2.name, "2026-09-10", { mixGroupId: "mix1" }),
    dose("d3", p1.id, p1.name, "2026-09-12", { status: "skipped", mixGroupId: "mix1" }),
  ], [], [p1, p2]);
  const groups = exposureGroups(data, 30, "2026-09-20");
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, "CJC-1295 + Ipamorelin");
  assert.deepEqual(groups[0].doseDates, ["2026-09-10"]);
});

test("jämför taggfrekvens med exakta nämnare", () => {
  const p = peptide("p1", "Selank");
  const dates = ["2026-09-10", "2026-09-12", "2026-09-14", "2026-09-16"];
  const logs = dates.map((date, index) => dose(`d${index}`, p.id, p.name, date));
  const notes = [
    ...dates.map(date => note(date, { tags: ["huvudvärk"] })),
    ...["2026-09-03", "2026-09-05", "2026-09-07", "2026-09-09"].map(date => note(date, { tags: [] as string[], activityLevel: 3 })),
  ];
  const data = store(logs, notes, [p]);
  const result = compareTag(data, exposureForSelection(data, p.id, 30, "2026-09-20"), "huvudvärk", "same_day", 30, "2026-09-20");
  assert.equal(result.sufficient, true);
  assert.equal(result.exposedOccurrences, 4);
  assert.equal(result.baselineOccurrences, 0);
  assert.equal(result.difference, 1);
});

test("lyfter ett starkt observerat sömnmönster", () => {
  const p = peptide("p1", "Ipamorelin");
  const dates = ["2026-08-28", "2026-08-30", "2026-09-02", "2026-09-04", "2026-09-06", "2026-09-08", "2026-09-10", "2026-09-12"];
  const logs = dates.map((date, index) => dose(`d${index}`, p.id, p.name, date));
  const notes = [
    ...dates.map(date => note(addDays(date, 1), { sleepQuality: 1 })),
    ...["2026-08-22", "2026-08-23", "2026-08-24", "2026-08-25", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"].map(date => note(date, { sleepQuality: 4 })),
  ];
  const patterns = topPatterns(store(logs, notes, [p]), 30, "2026-09-20");
  assert.equal(patterns[0]?.comparison.kind, "metric");
  assert.equal(patterns[0]?.window, "next_day");
});
