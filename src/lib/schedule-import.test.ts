import assert from "node:assert/strict";
import test from "node:test";
import { scheduleItemFromPeptide } from "./schedule-import";
import type { MixGroupSchedule, Peptide } from "./types";

const peptide: Peptide = {
  id: "ipa", name: "Ipamorlin", shortCode: "IPA", color: "teal",
  doseMcg: 200, vialMg: 10, waterMl: 2, remainingMg: 8,
  route: "subcutaneous", slot: "morning", time: "08:00",
  frequency: "daily", weekdays: [0, 1, 2, 3, 4, 5, 6], paused: false,
  fasted: true, fastedNote: "", mixGroupId: "GH-stack",
  beyondUseDays: 28, sites: ["Buk vänster"], notes: "Min 2 h efter mat",
  archived: false, example: false,
};
const group: MixGroupSchedule = {
  name: "GH-stack", slot: "evening", time: "22:00",
  frequency: "weekdays", weekdays: [0, 2, 4], paused: false,
};

test("imports distinct peptide names while applying their shared group schedule", () => {
  const first = scheduleItemFromPeptide(peptide, [group]);
  const second = scheduleItemFromPeptide({ ...peptide, id: "cjc", name: "CJC-1295 No DAC", notes: "2 h efter mat" }, [group]);

  assert.equal(first.name, "Ipamorlin");
  assert.equal(second.name, "CJC-1295 No DAC");
  assert.equal(first.mixGroupId, "GH-stack");
  assert.equal(second.mixGroupId, "GH-stack");
  assert.equal(first.time, "22:00");
  assert.equal(second.frequency, "weekdays");
  assert.deepEqual(first.weekdays, [0, 2, 4]);
  assert.equal(first.notes, "Min 2 h efter mat");
  assert.equal(second.notes, "2 h efter mat");
});
