import type { PeptimeStore } from "@/lib/types";
import { groupKey } from "@/lib/schedule";

export type EntityKind = "peptides" | "vials" | "mixGroups" | "logs" | "dailyNotes" | "purchasePlans" | "todayAdditions" | "settings" | "onboarding";
export type EntityMap = Record<EntityKind, Record<string, unknown>>;
export type RevisionMap = Partial<Record<EntityKind, Record<string, number>>>;
export interface PendingChange { mutationId: string; groupId: string; kind: EntityKind; id: string; baseRevision: number; value: unknown | null }
export interface SyncConflict { groupId?: string; kind: EntityKind; id: string; localValue: unknown | null; remoteValue: unknown | null; remoteRevision: number }
export interface OfflineSnapshot {
  userId: string;
  initialized?: boolean;
  store: PeptimeStore;
  revisions: RevisionMap;
  pending: PendingChange[];
  conflicts: SyncConflict[];
}

const DB_NAME = "peptime-offline-v1";
const DB_VERSION = 1;
const kinds: EntityKind[] = ["peptides", "vials", "mixGroups", "logs", "dailyNotes", "purchasePlans", "todayAdditions", "settings", "onboarding"];

export function storeEntities(store: PeptimeStore): EntityMap {
  return {
    peptides: Object.fromEntries(store.peptides.map(item => [item.id, item])),
    vials: Object.fromEntries(store.vials.map(item => [item.id, item])),
    mixGroups: Object.fromEntries(store.mixGroups.map(item => [groupKey(item.name), item])),
    logs: Object.fromEntries(store.logs.map(item => [item.id, item])),
    dailyNotes: Object.fromEntries(store.dailyNotes.map(item => [item.date, item])),
    purchasePlans: Object.fromEntries(store.purchasePlans.map(item => [item.id, item])),
    todayAdditions: Object.fromEntries(store.todayAdditions.map(id => [id, { id }])),
    settings: { current: store.settings },
    onboarding: { current: { complete: store.onboardingComplete } },
  };
}

export function entitiesStore(entities: Partial<EntityMap>, fallback: PeptimeStore): PeptimeStore {
  const values = (kind: EntityKind) => Object.values(entities[kind] ?? {});
  return {
    peptides: values("peptides") as PeptimeStore["peptides"],
    vials: values("vials") as PeptimeStore["vials"],
    mixGroups: values("mixGroups") as PeptimeStore["mixGroups"],
    logs: (values("logs") as PeptimeStore["logs"]).sort((a, b) => b.takenAt.localeCompare(a.takenAt)),
    dailyNotes: values("dailyNotes") as PeptimeStore["dailyNotes"],
    purchasePlans: values("purchasePlans") as PeptimeStore["purchasePlans"],
    todayAdditions: Object.keys(entities.todayAdditions ?? {}),
    settings: (entities.settings?.current as PeptimeStore["settings"] | undefined) ?? fallback.settings,
    onboardingComplete: Boolean((entities.onboarding?.current as { complete?: boolean } | undefined)?.complete),
  };
}

export function changedEntities(before: PeptimeStore, after: PeptimeStore, revisions: RevisionMap, existing: PendingChange[] = []): PendingChange[] {
  const oldEntities = storeEntities(before);
  const newEntities = storeEntities(after);
  const pending = new Map(existing.map(change => [`${change.kind}:${change.id}`, change]));
  const groupId = crypto.randomUUID();
  for (const kind of kinds) {
    const ids = new Set([...Object.keys(oldEntities[kind]), ...Object.keys(newEntities[kind])]);
    for (const id of ids) {
      const oldValue = oldEntities[kind][id] ?? null;
      const newValue = newEntities[kind][id] ?? null;
      if (JSON.stringify(oldValue) === JSON.stringify(newValue)) continue;
      const key = `${kind}:${id}`;
      const prior = pending.get(key);
      pending.set(key, { mutationId: crypto.randomUUID(), groupId: prior?.groupId ?? groupId, kind, id, baseRevision: prior?.baseRevision ?? revisions[kind]?.[id] ?? 0, value: newValue });
    }
  }
  return [...pending.values()];
}

export function overlayChanges(remote: EntityMap, pending: PendingChange[]): EntityMap {
  const result = structuredClone(remote);
  for (const change of pending) {
    result[change.kind] ??= {};
    if (change.value === null) delete result[change.kind][change.id];
    else result[change.kind][change.id] = change.value;
  }
  return result;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("snapshots")) db.createObjectStore("snapshots", { keyPath: "userId" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readSnapshot(userId: string): Promise<OfflineSnapshot | undefined> {
  const db = await openDatabase();
  try { return await requestResult<OfflineSnapshot | undefined>(db.transaction("snapshots", "readonly").objectStore("snapshots").get(userId)); }
  finally { db.close(); }
}

export async function lastOfflineUser(): Promise<string | undefined> {
  const db = await openDatabase();
  try { return await requestResult<string | undefined>(db.transaction("meta", "readonly").objectStore("meta").get("lastUser")); }
  finally { db.close(); }
}

export async function writeSnapshot(snapshot: OfflineSnapshot): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["snapshots", "meta"], "readwrite");
      tx.objectStore("snapshots").put(snapshot);
      tx.objectStore("meta").put(snapshot.userId, "lastUser");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export async function clearOfflineData(): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["snapshots", "meta"], "readwrite");
      tx.objectStore("snapshots").clear();
      tx.objectStore("meta").clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
