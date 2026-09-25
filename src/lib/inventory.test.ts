import assert from "node:assert/strict";
import test from "node:test";
import { initialStore } from "./demo-data";
import { deleteDoseLog, restoreDoseLog } from "./inventory";
import type { DoseLog } from "./types";

test("restoring a deleted log puts back both the log and the vial usage", () => {
  const peptide = { ...initialStore.peptides[0], remainingMg: 5, vialMg: 10 };
  const log: DoseLog = { id: "log-1", peptideId: peptide.id, peptideName: peptide.name, plannedDose: 250, actualDose: 250, unit: "mcg", computedIu: 10, slot: "morning", takenAt: "2026-09-25T07:00:00.000Z", status: "taken", note: "" };
  const store = { ...initialStore, peptides: [peptide], logs: [log] };
  const deleted = deleteDoseLog(store, log.id);
  assert.equal(deleted.peptides[0].remainingMg, 5.25);
  const restored = restoreDoseLog(deleted, log);
  assert.deepEqual(restored.logs.map(item => item.id), [log.id]);
  assert.equal(restored.peptides[0].remainingMg, 5);
  assert.equal(restoreDoseLog(restored, log), restored);
});
