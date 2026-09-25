import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { initialStore } from "../demo-data";
import { visibleRecoveryStore } from "../recovery-store";
import type { DoseLog } from "../types";
import { changedRecords, normalizeStoreIds, rebaseStore, saveRemoteStore } from "./store";

function recordingClient() {
  const calls: { table: string; operation: string; rows?: unknown }[] = [];
  const client = {
    from(table: string) {
      return {
        upsert(rows: unknown) { calls.push({ table, operation: "upsert", rows }); return Promise.resolve({ error: null }); },
        update(rows: unknown) { return { eq() { return { eq() { return { is() { calls.push({ table, operation: "update", rows }); return Promise.resolve({ error: null }); } }; } }; } }; },
        select() { return { limit() { return Promise.resolve({ error: null, data: [] }); } }; },
        delete() { return { eq() { return { in(_key: string, ids: string[]) { calls.push({ table, operation: "delete", rows: ids }); return Promise.resolve({ error: null }); } }; } }; },
      };
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

const userId = "11111111-1111-4111-8111-111111111111";
const base = () => ({ ...normalizeStoreIds(initialStore), onboardingComplete: true });

test("unchanged records and property order cause no writes", async () => {
  assert.deepEqual(changedRecords([{ id: "a", name: "A", dose: 1 }], [{ dose: 1, name: "A", id: "a" }], item => item.id), []);
  const before = base();
  const { client, calls } = recordingClient();
  await saveRemoteStore(client, userId, { ...before, todayAdditions: ["today:item"] }, before);
  assert.deepEqual(calls, []);
});

test("a settings edit does not rewrite peptides or dose logs", async () => {
  const before = base();
  const next = { ...before, settings: { ...before.settings, syringe: "U-100 0.5 ml" as const } };
  const { client, calls } = recordingClient();
  await saveRemoteStore(client, userId, next, before);
  assert.deepEqual(calls.map(call => call.table), ["profiles"]);
});

test("adding one dose log writes only that log", async () => {
  const before = base();
  const peptide = before.peptides[0];
  const vialId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const log: DoseLog = { id: "22222222-2222-4222-8222-222222222222", peptideId: peptide.id, peptideName: peptide.name, plannedDose: 100, actualDose: 100, unit: "mcg", computedIu: 4, slot: "morning", takenAt: "2026-09-23T08:00:00.000Z", scheduledDate: "2026-09-23", status: "taken", vialId, note: "" };
  const { client, calls } = recordingClient();
  await saveRemoteStore(client, userId, { ...before, logs: [log] }, before);
  assert.deepEqual(calls.map(call => call.table), ["dose_logs"]);
  assert.equal((calls[0].rows as DoseLog[]).length, 1);
  assert.equal((calls[0].rows as { vial_id: string }[])[0].vial_id, vialId);
});

test("new account writes its initial peptides instead of treating examples as synced", async () => {
  const next = base();
  const before = { ...next, peptides: [], mixGroups: [], onboardingComplete: false };
  const { client, calls } = recordingClient();
  await saveRemoteStore(client, userId, next, before);
  assert.ok(calls.some(call => call.table === "profiles"));
  assert.ok(calls.some(call => call.table === "peptides" && (call.rows as unknown[]).length === next.peptides.length));
  assert.ok(calls.some(call => call.table === "vials"));
});

test("account recovery inserts missing records without rewriting existing rows", async () => {
  const initial = base();
  const peptide = initial.peptides[0];
  const existing: DoseLog = { id: "22222222-2222-4222-8222-222222222222", peptideId: peptide.id, peptideName: peptide.name, plannedDose: 100, actualDose: 100, unit: "mcg", computedIu: 4, slot: "morning", takenAt: "2026-09-22T08:00:00.000Z", scheduledDate: "2026-09-22", status: "taken", note: "Server version" };
  const added: DoseLog = { ...existing, id: "33333333-3333-4333-8333-333333333333", takenAt: "2026-09-23T08:00:00.000Z", scheduledDate: "2026-09-23", note: "Phone only" };
  const before = { ...initial, logs: [existing] };
  const phone = { ...before, logs: [{ ...existing, note: "Old phone version" }, added], dailyNotes: [{ date: "2026-09-23", note: "Phone only", tags: [] }] };
  const merged = visibleRecoveryStore(before, true, undefined, phone, undefined).store;
  const { client, calls } = recordingClient();
  await saveRemoteStore(client, userId, merged, before);
  assert.deepEqual(calls.map(call => call.table), ["dose_logs", "daily_notes"]);
  assert.deepEqual((calls[0].rows as DoseLog[]).map(row => row.id), [added.id]);
  assert.equal(merged.logs[0].note, "Server version");
});

test("changing preparation closes only the old vial and keeps existing logs untouched", async () => {
  const initial = base();
  const peptide = { ...initial.peptides[0], currentVialId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
  const before = { ...initial, peptides: [peptide, ...initial.peptides.slice(1)] };
  const nextVialId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const next = { ...before, peptides: [{ ...peptide, waterMl: peptide.waterMl + 1, currentVialId: nextVialId, remainingMg: 0 }, ...before.peptides.slice(1)] };
  const { client, calls } = recordingClient();
  await saveRemoteStore(client, userId, next, before);
  assert.ok(calls.some(call => call.table === "vials" && call.operation === "update"));
  assert.ok(calls.some(call => call.table === "vials" && call.operation === "upsert" && (call.rows as { id: string }[])[0].id === nextVialId));
  assert.equal(calls.filter(call => call.table === "dose_logs").length, 0);
});

function doseLog(id: string, peptide: { id: string; name: string }, note = ""): DoseLog {
  return { id, peptideId: peptide.id, peptideName: peptide.name, plannedDose: 100, actualDose: 100, unit: "mcg", computedIu: 4, slot: "morning", takenAt: "2026-09-23T07:00:00.000Z", scheduledDate: "2026-09-23", status: "taken", note };
}

test("a log deleted on another device stays deleted here", () => {
  const initial = base();
  const peptide = initial.peptides[0];
  const kept = doseLog("22222222-2222-4222-8222-222222222222", peptide);
  const deletedElsewhere = doseLog("33333333-3333-4333-8333-333333333333", peptide);
  const synced = { ...initial, logs: [kept, deletedElsewhere] };
  const remote = { ...initial, logs: [kept] };
  const result = rebaseStore(remote, synced, synced);
  assert.deepEqual(result.logs.map(log => log.id), [kept.id]);
});

test("unsent edits from this device are replayed over newer account state", () => {
  const initial = base();
  const peptide = initial.peptides[0];
  const shared = doseLog("22222222-2222-4222-8222-222222222222", peptide);
  const fromOtherDevice = doseLog("33333333-3333-4333-8333-333333333333", peptide, "Other phone");
  const unsent = doseLog("44444444-4444-4444-8444-444444444444", peptide, "Offline");
  const removedHere = doseLog("55555555-5555-4555-8555-555555555555", peptide);
  const synced = { ...initial, logs: [shared, removedHere] };
  const local = { ...synced, logs: [{ ...shared, note: "Edited here" }, unsent], todayAdditions: ["2026-09-23:x"], settings: { ...synced.settings, themeMode: "dark" as const } };
  const remote = { ...initial, logs: [shared, removedHere, fromOtherDevice] };
  const result = rebaseStore(remote, synced, local);
  assert.deepEqual(result.logs.map(log => [log.id, log.note]), [[shared.id, "Edited here"], [fromOtherDevice.id, "Other phone"], [unsent.id, "Offline"]]);
  assert.deepEqual(result.todayAdditions, ["2026-09-23:x"]);
  assert.equal(result.settings.themeMode, "dark");
});

test("remote settings win unless this device changed them", () => {
  const initial = base();
  const remote = { ...initial, settings: { ...initial.settings, syringe: "U-100 0.3 ml" as const } };
  assert.equal(rebaseStore(remote, initial, initial).settings.syringe, "U-100 0.3 ml");
  const local = { ...initial, settings: { ...initial.settings, syringe: "U-100 0.5 ml" as const } };
  assert.equal(rebaseStore(remote, initial, local).settings.syringe, "U-100 0.5 ml");
});

test("replaying an unchanged device copy writes nothing", async () => {
  const synced = base();
  const { client, calls } = recordingClient();
  await saveRemoteStore(client, userId, synced, synced);
  assert.deepEqual(calls, []);
});
