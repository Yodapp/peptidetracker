import assert from "node:assert/strict";
import test from "node:test";
import { changeInventory, deleteDoseLog, openNewVial, replaceDoseLog } from "./inventory";
import { initialStore } from "./demo-data";
import { normalizeStoreIds } from "./supabase/store";

test("opening a new vial preserves old inventory and old log undo restores the old vial", () => {
  const initial = normalizeStoreIds({ ...initialStore, peptides: [initialStore.peptides[1]], logs: [], onboardingComplete: true });
  const peptide = initial.peptides[0];
  const oldId = peptide.currentVialId!;
  const used = changeInventory(initial, peptide.id, oldId, -0.1);
  const next = openNewVial(used, peptide.id, "2026-09-23T12:00:00Z");
  assert.equal(next.vials.find(vial => vial.id === oldId)?.closedAt, "2026-09-23T12:00:00Z");
  assert.equal(next.peptides[0].remainingMg, peptide.vialMg);
  const withLog = { ...next, logs: [{ id: crypto.randomUUID(), peptideId: peptide.id, peptideName: peptide.name, plannedDose: 100, actualDose: 100, unit: "mcg" as const, computedIu: 2, slot: "evening" as const, takenAt: "2026-09-22T12:00:00Z", scheduledDate: "2026-09-22", status: "taken" as const, vialId: oldId, note: "" }] };
  const restored = deleteDoseLog(withLog, withLog.logs[0].id);
  assert.equal(restored.peptides[0].remainingMg, peptide.vialMg);
  assert.equal(restored.vials.find(vial => vial.id === oldId)?.remainingMg, initial.vials[0].remainingMg);
  const changedCurrent = { ...withLog, peptides: withLog.peptides.map(item => ({ ...item, vialMg: item.vialMg * 2 })) };
  const edited = replaceDoseLog(changedCurrent, { ...changedCurrent.logs[0], actualDose: 200 });
  assert.equal(edited.logs[0].computedIu, 100 / (initial.vials[0].initialMg / initial.vials[0].waterMl * 1000) * 100 * 2);
  assert.equal(edited.peptides[0].remainingMg, peptide.vialMg);
  assert.equal(edited.vials.find(vial => vial.id === oldId)?.remainingMg, initial.vials[0].remainingMg - 0.2);
});
