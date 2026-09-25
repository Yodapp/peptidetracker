import assert from "node:assert/strict";
import test from "node:test";
import { planReminders, type ReminderInput } from "./reminder-plan";

const base: ReminderInput = {
  preferences: { enabled: true, lead_minutes: 0, follow_up_enabled: true, daily_summary_enabled: false, daily_summary_time: "20:30" },
  peptides: [
    { id: "ipa", mix_group_id: "GH-stack", archived_at: null, cycle_start: null, weeks_on: null, weeks_off: null },
    { id: "cjc", mix_group_id: "GH-stack", archived_at: null, cycle_start: null, weeks_on: null, weeks_off: null },
  ],
  schedules: [],
  groups: [{ name_key: "gh-stack", slot: "morning", clock_time: "08:00:00", frequency: "daily", weekdays: [], every_n_days: null, anchor_date: null, paused: false, active: true, cycle_start: null, weeks_on: null, weeks_off: null }],
  logs: [], notes: [],
};

test("one first and one follow-up notification for a shared schedule", () => {
  assert.deepEqual(planReminders(base, new Date("2026-09-25T06:00:00Z")).map(event => event.key), ["dose:2026-09-25:08:00:first"]);
  assert.deepEqual(planReminders(base, new Date("2026-09-25T06:10:00Z")).map(event => event.key), ["dose:2026-09-25:08:00:follow-up"]);
});

test("an early first reminder does not move the follow-up", () => {
  const input = { ...base, preferences: { ...base.preferences, lead_minutes: 15 as const } };
  assert.deepEqual(planReminders(input, new Date("2026-09-25T05:45:00Z")).map(event => event.key), ["dose:2026-09-25:08:00:first"]);
  assert.deepEqual(planReminders(input, new Date("2026-09-25T06:10:00Z")).map(event => event.key), ["dose:2026-09-25:08:00:follow-up"]);
});

test("follow-up continues until every peptide in the time slot is logged", () => {
  const one = { ...base, logs: [{ peptide_id: "ipa", scheduled_date: "2026-09-25", status: "taken" }] };
  assert.equal(planReminders(one, new Date("2026-09-25T06:10:00Z")).some(event => event.key.endsWith("follow-up")), true);
  const both = { ...base, logs: [...one.logs, { peptide_id: "cjc", scheduled_date: "2026-09-25", status: "skipped" }] };
  assert.deepEqual(planReminders(both, new Date("2026-09-25T06:10:00Z")), []);
});

test("daily summary reminder is omitted after a completed note", () => {
  const input = { ...base, preferences: { ...base.preferences, daily_summary_enabled: true } };
  assert.equal(planReminders(input, new Date("2026-09-25T18:30:00Z")).some(event => event.key === "summary:2026-09-25"), true);
  const completed = { ...input, notes: [{ note_date: "2026-09-25", note: "Trött", tags: [], sleep_quality: null, brain_fatigue: null, physical_fatigue: null, pain_level: null, activity_level: null }] };
  assert.equal(planReminders(completed, new Date("2026-09-25T18:30:00Z")).some(event => event.key === "summary:2026-09-25"), false);
});

test("Stockholm schedule follows daylight-saving changes", () => {
  assert.equal(planReminders(base, new Date("2026-03-27T07:00:00Z")).some(event => event.key.endsWith(":first")), true);
  assert.equal(planReminders(base, new Date("2026-03-30T06:00:00Z")).some(event => event.key.endsWith(":first")), true);
  assert.equal(planReminders(base, new Date("2026-10-26T07:00:00Z")).some(event => event.key.endsWith(":first")), true);
});

test("paused and archived schedules do not notify", () => {
  const paused = { ...base, groups: [{ ...base.groups[0], paused: true }] };
  assert.deepEqual(planReminders(paused, new Date("2026-09-25T06:00:00Z")), []);
  const archived = { ...base, peptides: base.peptides.map(peptide => ({ ...peptide, archived_at: "2026-09-24T00:00:00Z" })) };
  assert.deepEqual(planReminders(archived, new Date("2026-09-25T06:00:00Z")), []);
});
