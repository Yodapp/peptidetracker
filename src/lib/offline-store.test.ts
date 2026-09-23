import assert from "node:assert/strict";
import test from "node:test";
import { changedEntities, entitiesStore, overlayChanges, storeEntities } from "./offline-store";
import { initialStore } from "./demo-data";

const base = { ...initialStore, peptides: [], mixGroups: [], logs: [], dailyNotes: [], purchasePlans: [], todayAdditions: [], onboardingComplete: true };

test("queues only changed records and keeps the original server revision", () => {
  const first = { ...base, dailyNotes: [{ date: "2026-09-23", note: "A", tags: [] }] };
  const next = { ...base, dailyNotes: [{ date: "2026-09-23", note: "B", tags: [] }] };
  const pending = changedEntities(base, first, { dailyNotes: { "2026-09-23": 7 } });
  const updated = changedEntities(first, next, {}, pending);
  assert.equal(updated.length, 1);
  assert.equal(updated[0].baseRevision, 7);
  assert.equal((updated[0].value as { note: string }).note, "B");
  assert.notEqual(updated[0].mutationId, pending[0].mutationId);
});

test("a local deletion is explicit and unrelated remote entries survive", () => {
  const first = { ...base, dailyNotes: [{ date: "2026-09-22", note: "Old", tags: [] }] };
  const pending = changedEntities(first, base, { dailyNotes: { "2026-09-22": 3 } });
  assert.equal(pending.length, 1);
  assert.equal(pending[0].value, null);
  const remote = storeEntities({ ...first, dailyNotes: [...first.dailyNotes, { date: "2026-09-23", note: "Other device", tags: [] }] });
  const merged = entitiesStore(overlayChanges(remote, pending), base);
  assert.deepEqual(merged.dailyNotes.map(note => note.date), ["2026-09-23"]);
});

test("one-off additions survive entity conversion", () => {
  const source = { ...base, todayAdditions: ["2026-09-23:peptide:abc"] };
  assert.deepEqual(entitiesStore(storeEntities(source), base).todayAdditions, source.todayAdditions);
});
