"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { initialStore } from "@/lib/demo-data";
import { changedEntities, clearOfflineData, entitiesStore, lastOfflineUser, overlayChanges, readSnapshot, storeEntities, writeSnapshot, type EntityKind, type EntityMap, type OfflineSnapshot, type PendingChange, type RevisionMap, type SyncConflict } from "@/lib/offline-store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { loadRemoteStore, normalizeStoreIds } from "@/lib/supabase/store";
import type { PeptimeStore } from "@/lib/types";

const LEGACY_KEY = "peptime-demo-v1";
const hasRemote = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
export type SyncState = "local" | "syncing" | "synced" | "offline" | "error" | "conflict";

interface ServerState { entities: EntityMap; revisions: RevisionMap; applied?: string[]; conflicts?: { mutationId: string; kind: EntityKind; id: string; remoteValue: unknown | null; remoteRevision: number }[] }

function errorText(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 240);
  if (error && typeof error === "object" && "message" in error) return String(error.message).slice(0, 240);
  return "Okänt synkfel";
}

function readLegacy(userId: string): PeptimeStore | undefined {
  try {
    const value = userId === "demo" ? localStorage.getItem(LEGACY_KEY) : localStorage.getItem(`${LEGACY_KEY}:${userId}`);
    return value ? normalizeStoreIds(JSON.parse(value)) : undefined;
  } catch { return undefined; }
}

function visibleEntities(server: EntityMap, snapshot: OfflineSnapshot) {
  const conflictChanges: PendingChange[] = snapshot.conflicts.map(conflict => ({ mutationId: "", groupId: "", kind: conflict.kind, id: conflict.id, baseRevision: conflict.remoteRevision, value: conflict.localValue }));
  return overlayChanges(server, [...snapshot.pending, ...conflictChanges]);
}

export function usePeptimeStore() {
  const [store, setStore] = useState<PeptimeStore>(() => normalizeStoreIds(initialStore));
  const [ready, setReady] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>("local");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [syncAttempt, setSyncAttempt] = useState(0);
  const snapshotRef = useRef<OfflineSnapshot | null>(null);
  const lastStoreRef = useRef<PeptimeStore | null>(null);
  const clientRef = useRef<SupabaseClient | null>(null);
  const writeChainRef = useRef<Promise<void>>(Promise.resolve());
  const syncingRef = useRef(false);

  const persist = useCallback((snapshot: OfflineSnapshot) => {
    snapshotRef.current = snapshot;
    setPendingCount(snapshot.pending.length);
    setConflicts(snapshot.conflicts);
    writeChainRef.current = writeChainRef.current.catch(() => undefined).then(() => writeSnapshot(snapshot));
    return writeChainRef.current;
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      let fallbackUserId: string | undefined;
      try {
        if (!hasRemote) {
          const existing = await readSnapshot("demo");
          const local = existing?.store ?? readLegacy("demo") ?? normalizeStoreIds(initialStore);
          const snapshot = existing ?? { userId: "demo", initialized: true, store: local, revisions: {}, pending: [], conflicts: [] };
          await persist(snapshot);
          if (!existing) localStorage.removeItem(LEGACY_KEY);
          if (cancelled) return;
          lastStoreRef.current = snapshot.store;
          setStore(snapshot.store);
          setSyncState("local");
          setReady(true);
          return;
        }

        const client = createSupabaseBrowserClient();
        clientRef.current = client;
        let userId: string | undefined;
        try { userId = (await client.auth.getUser()).data.user?.id; } catch { /* offline cold launch */ }
        if (!userId && !navigator.onLine) userId = await lastOfflineUser();
        if (!userId) throw new Error("Logga in online för att öppna ditt konto på den här enheten.");
        fallbackUserId = userId;
        const cached = await readSnapshot(userId);
        const legacy = cached ? undefined : readLegacy(userId);
        if (!navigator.onLine) {
          if (!cached && !legacy) throw new Error("Öppna kontot online en gång innan du använder det offline.");
          const local = cached ?? { userId, initialized: false, store: legacy!, revisions: {}, pending: [], conflicts: [] };
          await persist(local);
          if (cancelled) return;
          lastStoreRef.current = local.store;
          setStore(local.store);
          setSyncState("offline");
          setReady(true);
          return;
        }

        setSyncState("syncing");
        const legacyRemote = await loadRemoteStore(client, legacy ?? cached?.store ?? normalizeStoreIds(initialStore));
        const seed = normalizeStoreIds(legacyRemote.hasData ? legacyRemote.store : (legacy?.onboardingComplete ? legacy : cached?.store ?? legacyRemote.store));
        const init = await client.rpc("sync_initialize", { p_entities: storeEntities(seed) });
        if (init.error) throw init.error;
        const server = init.data as ServerState;
        const serverStore = entitiesStore(server.entities, seed);
        let snapshot: OfflineSnapshot;
        if (cached?.initialized === false) {
          const differences = changedEntities(serverStore, cached.store, server.revisions);
          const pending = differences.filter(change => server.entities[change.kind]?.[change.id] === undefined);
          const conflicts: SyncConflict[] = differences.filter(change => server.entities[change.kind]?.[change.id] !== undefined).map(change => ({ groupId: change.groupId, kind: change.kind, id: change.id, localValue: change.value, remoteValue: server.entities[change.kind]?.[change.id] ?? null, remoteRevision: server.revisions[change.kind]?.[change.id] ?? 0 }));
          snapshot = { userId, initialized: true, store: cached.store, revisions: server.revisions, pending, conflicts };
        } else if (cached) {
          snapshot = { ...cached, initialized: true, revisions: server.revisions, store: entitiesStore(visibleEntities(server.entities, cached), cached.store) };
        } else if (legacy?.onboardingComplete && legacyRemote.hasData) {
          const differences = changedEntities(serverStore, legacy, server.revisions);
          const pending = differences.filter(change => server.entities[change.kind]?.[change.id] === undefined);
          const conflicts: SyncConflict[] = differences.filter(change => server.entities[change.kind]?.[change.id] !== undefined).map(change => ({ groupId: change.groupId, kind: change.kind, id: change.id, localValue: change.value, remoteValue: server.entities[change.kind]?.[change.id] ?? null, remoteRevision: server.revisions[change.kind]?.[change.id] ?? 0 }));
          snapshot = { userId, initialized: true, store: legacy, revisions: server.revisions, pending, conflicts };
        } else {
          snapshot = { userId, initialized: true, store: serverStore, revisions: server.revisions, pending: [], conflicts: [] };
        }
        await persist(snapshot);
        if (cancelled) return;
        lastStoreRef.current = snapshot.store;
        setStore(snapshot.store);
        setSyncState(snapshot.conflicts.length ? "conflict" : snapshot.pending.length ? "syncing" : "synced");
        setSyncError(null);
        setReady(true);
        localStorage.removeItem(`${LEGACY_KEY}:${userId}`);
        localStorage.removeItem(LEGACY_KEY);
        setSyncAttempt(value => value + 1);
      } catch (error) {
        if (cancelled) return;
        setSyncError(errorText(error));
        const userId = fallbackUserId ?? await lastOfflineUser().catch(() => undefined);
        const cached = userId ? await readSnapshot(userId).catch(() => undefined) : undefined;
        const legacy = userId && !cached ? readLegacy(userId) : undefined;
        const local = cached ?? (userId && legacy ? { userId, initialized: false, store: legacy, revisions: {}, pending: [], conflicts: [] } : undefined);
        if (local) {
          if (!cached) await persist(local).catch(() => undefined);
          snapshotRef.current = local;
          lastStoreRef.current = local.store;
          setStore(local.store);
          setPendingCount(local.pending.length);
          setConflicts(local.conflicts);
          setReady(true);
          setSyncState(navigator.onLine ? "error" : "offline");
        } else { setReady(false); setSyncState("error"); }
      }
    }
    hydrate();
    return () => { cancelled = true; };
  }, [persist]);

  useEffect(() => {
    if (!ready || !snapshotRef.current || !lastStoreRef.current || lastStoreRef.current === store) return;
    const snapshot = snapshotRef.current;
    const changed = hasRemote ? changedEntities(lastStoreRef.current, store, snapshot.revisions, snapshot.pending) : [];
    const conflictKeys = new Set(snapshot.conflicts.map(conflict => `${conflict.kind}:${conflict.id}`));
    const pending = changed.filter(change => !conflictKeys.has(`${change.kind}:${change.id}`));
    const currentEntities = storeEntities(store);
    const conflicts = snapshot.conflicts.map(conflict => ({ ...conflict, localValue: currentEntities[conflict.kind]?.[conflict.id] ?? null }));
    lastStoreRef.current = store;
    persist({ ...snapshot, store, pending, conflicts }).then(() => {
      if (hasRemote && pending.length) setSyncAttempt(value => value + 1);
    }).catch(error => { setSyncError(`Kunde inte spara lokalt: ${errorText(error)}`); setSyncState("error"); });
  }, [store, ready, persist]);

  const syncNow = useCallback(async () => {
    if (!hasRemote || !navigator.onLine || syncingRef.current || !clientRef.current || !snapshotRef.current || snapshotRef.current.initialized === false) return;
    syncingRef.current = true;
    setSyncState("syncing");
    try {
      await writeChainRef.current;
      const allPending = snapshotRef.current.pending;
      const firstBatch = allPending.slice(0, 250);
      const lastGroup = firstBatch.at(-1)?.groupId;
      const sending = firstBatch.length === 250 && allPending[250]?.groupId === lastGroup
        ? firstBatch.filter(change => change.groupId !== lastGroup)
        : firstBatch;
      if (!sending.length && allPending.length) throw new Error("En lokal ändring är för stor för ett synkparti. Exportera en fullständig kopia.");
      const result = await clientRef.current.rpc("sync_apply", { p_changes: sending });
      if (result.error) throw result.error;
      await writeChainRef.current;
      const response = result.data as ServerState;
      const current = snapshotRef.current!;
      const applied = new Set(response.applied ?? []);
      const rejected = new Map((response.conflicts ?? []).map(item => [item.mutationId, item]));
      const pending = current.pending.filter(change => !applied.has(change.mutationId) && !rejected.has(change.mutationId)).map(change => {
        const earlier = sending.find(sent => sent.kind === change.kind && sent.id === change.id && applied.has(sent.mutationId));
        return earlier ? { ...change, baseRevision: response.revisions[change.kind]?.[change.id] ?? change.baseRevision } : change;
      });
      const conflicts = [...current.conflicts];
      for (const sent of sending) {
        const conflict = rejected.get(sent.mutationId);
        if (!conflict) continue;
        const newest = pending.find(change => change.kind === sent.kind && change.id === sent.id);
        const localValue = newest?.value ?? sent.value;
        const index = pending.findIndex(change => change.kind === sent.kind && change.id === sent.id);
        if (index >= 0) pending.splice(index, 1);
        conflicts.push({ groupId: sent.groupId, kind: sent.kind, id: sent.id, localValue, remoteValue: conflict.remoteValue, remoteRevision: conflict.remoteRevision });
      }
      const next = { ...current, revisions: response.revisions, pending, conflicts, store: entitiesStore(visibleEntities(response.entities, { ...current, pending, conflicts }), current.store) };
      lastStoreRef.current = next.store;
      await persist(next);
      setStore(next.store);
      setSyncError(null);
      setSyncState(conflicts.length ? "conflict" : pending.length ? "syncing" : "synced");
      if (pending.length && sending.length) setSyncAttempt(value => value + 1);
    } catch (error) {
      setSyncError(errorText(error));
      setSyncState(navigator.onLine ? "error" : "offline");
    } finally { syncingRef.current = false; }
  }, [persist]);

  useEffect(() => {
    if (!ready || !hasRemote) return;
    const timer = window.setTimeout(() => { void syncNow(); }, 650);
    return () => window.clearTimeout(timer);
  }, [ready, pendingCount, syncAttempt, syncNow]);

  useEffect(() => {
    if (!hasRemote) return;
    const onOnline = () => { if (!ready || snapshotRef.current?.initialized === false) window.location.reload(); else setSyncAttempt(value => value + 1); };
    const onOffline = () => setSyncState("offline");
    const onVisible = () => { if (document.visibilityState === "visible") setSyncAttempt(value => value + 1); };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(() => { if (navigator.onLine) setSyncAttempt(value => value + 1); }, 60_000);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); document.removeEventListener("visibilitychange", onVisible); window.clearInterval(interval); };
  }, [ready]);

  const resolveConflict = useCallback((kind: EntityKind, id: string, choice: "local" | "remote") => {
    const current = snapshotRef.current;
    if (!current) return;
    const conflict = current.conflicts.find(item => item.kind === kind && item.id === id);
    if (!conflict) return;
    const group = current.conflicts.filter(item => conflict.groupId ? item.groupId === conflict.groupId : item === conflict);
    const entities = storeEntities(current.store);
    for (const item of group) {
      if (choice === "remote") {
        if (item.remoteValue === null) delete entities[item.kind][item.id];
        else entities[item.kind][item.id] = item.remoteValue;
      }
    }
    const nextStore = entitiesStore(entities, current.store);
    const groupId = crypto.randomUUID();
    const pending = choice === "local" ? [...current.pending, ...group.map(item => ({ mutationId: crypto.randomUUID(), groupId, kind: item.kind, id: item.id, baseRevision: item.remoteRevision, value: item.localValue }))] : current.pending;
    const next = { ...current, store: nextStore, pending, conflicts: current.conflicts.filter(item => !group.includes(item)) };
    lastStoreRef.current = nextStore;
    void persist(next).then(() => setSyncAttempt(value => value + 1));
    setStore(nextStore);
  }, [persist]);

  const retrySync = () => { if (!ready || snapshotRef.current?.initialized === false) window.location.reload(); else setSyncAttempt(value => value + 1); };
  return { store, update: setStore, ready, syncState, retrySync, syncError, pendingCount, conflicts, resolveConflict, clearOfflineData };
}
