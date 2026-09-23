import assert from "node:assert/strict";
import test from "node:test";
import { initialStore } from "./demo-data";
import { missingRecoveryCounts, storeFromSyncEntities, visibleRecoveryStore } from "./recovery-store";
import { removedRecordIds } from "./supabase/store";
import type { PeptimeStore } from "./types";

const empty: PeptimeStore = { ...initialStore, peptides: [], mixGroups: [], logs: [], dailyNotes: [], purchasePlans: [], todayAdditions: [], onboardingComplete: false };

test("shows a valid server snapshot when original tables are empty", () => {
  const peptide = initialStore.peptides[0];
  const server = storeFromSyncEntities({ peptides: { [peptide.id]: peptide }, onboarding: { current: { complete: true } } }, empty);
  assert.ok(server);
  const result = visibleRecoveryStore(empty, false, server, undefined, undefined);
  assert.equal(result.recovered, true);
  assert.equal(result.store.peptides[0].id, peptide.id);
  assert.equal(result.store.onboardingComplete, true);
});

test("keeps original server records and adds only missing device IDs", () => {
  const peptide = initialStore.peptides[0];
  const server = { ...peptide, name: "Server version" };
  const other = { ...peptide, id: "11111111-1111-4111-8111-111111111111", name: "Device only" };
  const remote = { ...empty, peptides: [server], onboardingComplete: true };
  const device = { ...empty, peptides: [{ ...peptide, name: "Stale device version" }, other], onboardingComplete: true };
  const result = visibleRecoveryStore(remote, true, undefined, device, undefined);
  assert.equal(result.recovered, true);
  assert.deepEqual(result.store.peptides.map(item => item.name), ["Server version", "Device only"]);
  assert.equal(remote.peptides.length, 1);
  assert.equal(device.peptides.length, 2);
});

test("ignores malformed and empty snapshots", () => {
  assert.equal(storeFromSyncEntities({ peptides: { bad: { name: "missing id" } } }, empty), undefined);
  assert.deepEqual(visibleRecoveryStore(empty, false, undefined, undefined, undefined), { store: empty, recovered: false });
});

test("deletion scope excludes records added by another device", () => {
  const loaded = [{ id: "old-a" }, { id: "old-b" }];
  const afterEdit = [{ id: "old-a" }, { id: "new-local" }];
  assert.deepEqual(removedRecordIds(loaded, afterEdit), ["old-b"]);
  assert.deepEqual(removedRecordIds(loaded, loaded), []);
});

test("today-only selections do not pause account sync", () => {
  const remote = { ...empty, onboardingComplete: true };
  const snapshot = { ...remote, todayAdditions: ["2026-09-23:example"] };
  const result = visibleRecoveryStore(remote, true, snapshot, undefined, undefined);
  assert.equal(result.recovered, false);
  assert.deepEqual(result.store.todayAdditions, ["2026-09-23:example"]);
});

test("recovery adds missing IDs without replacing existing server records", () => {
  const peptide = initialStore.peptides[0];
  const server = { ...empty, peptides: [{ ...peptide, name: "Server version" }], onboardingComplete: true };
  const local = { ...server, peptides: [{ ...peptide, name: "Older phone version" }], dailyNotes: [{ date: "2026-09-23", note: "Phone only", tags: [] }] };
  const result = visibleRecoveryStore(server, true, undefined, local, undefined);
  assert.equal(result.store.peptides[0].name, "Server version");
  assert.equal(result.store.dailyNotes.length, 1);
  assert.deepEqual(missingRecoveryCounts(server, result.store), { peptides: 0, mixGroups: 0, logs: 0, dailyNotes: 1, purchasePlans: 0 });
});
