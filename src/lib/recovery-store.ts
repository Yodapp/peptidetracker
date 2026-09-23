import type { PeptimeStore } from "@/lib/types";
import { groupKey } from "@/lib/schedule";

type Collection = "peptides" | "mixGroups" | "logs" | "dailyNotes" | "purchasePlans";
export type RecoveryCounts = Record<Collection, number>;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validStore(value: unknown): value is PeptimeStore {
  if (!record(value) || !record(value.settings)) return false;
  return ["peptides", "mixGroups", "logs", "dailyNotes", "purchasePlans", "todayAdditions"].every(key => Array.isArray(value[key]));
}

/** Decode only records already present in a sync snapshot; never create IDs or write back. */
export function storeFromSyncEntities(value: unknown, fallback: PeptimeStore): PeptimeStore | undefined {
  if (!record(value)) return undefined;
  const values = (key: string) => record(value[key]) ? Object.values(value[key]) : [];
  const peptides = values("peptides").filter(item => record(item) && typeof item.id === "string" && typeof item.name === "string");
  const logs = values("logs").filter(item => record(item) && typeof item.id === "string" && typeof item.peptideId === "string");
  const dailyNotes = values("dailyNotes").filter(item => record(item) && typeof item.date === "string");
  const purchasePlans = values("purchasePlans").filter(item => record(item) && typeof item.id === "string");
  const mixGroups = values("mixGroups").filter(item => record(item) && typeof item.name === "string");
  const settings = record(value.settings) && record(value.settings.current) ? value.settings.current : fallback.settings;
  const onboarding = record(value.onboarding) && record(value.onboarding.current) && value.onboarding.current.complete === true;
  if (!onboarding && !peptides.length && !logs.length && !dailyNotes.length && !purchasePlans.length) return undefined;
  return {
    peptides: peptides as PeptimeStore["peptides"],
    mixGroups: mixGroups as PeptimeStore["mixGroups"],
    logs: logs as PeptimeStore["logs"],
    dailyNotes: dailyNotes as PeptimeStore["dailyNotes"],
    purchasePlans: purchasePlans as PeptimeStore["purchasePlans"],
    todayAdditions: record(value.todayAdditions) ? Object.keys(value.todayAdditions) : [],
    settings: { ...fallback.settings, ...settings } as PeptimeStore["settings"],
    onboardingComplete: onboarding,
  };
}

function key(collection: Collection, item: unknown): string | undefined {
  if (!record(item)) return undefined;
  const value = collection === "dailyNotes" ? item.date : collection === "mixGroups" ? item.name : item.id;
  return typeof value === "string" && value.length > 0 ? collection === "mixGroups" ? groupKey(value) : value : undefined;
}

function meaningful(store: PeptimeStore | undefined): store is PeptimeStore {
  return Boolean(store && validStore(store) && (store.onboardingComplete || store.peptides.length || store.logs.length || store.dailyNotes.length || store.purchasePlans.length));
}

/** Count only IDs absent from the latest relational account state. */
export function missingRecoveryCounts(remote: PeptimeStore, visible: PeptimeStore): RecoveryCounts {
  const collections: Collection[] = ["peptides", "mixGroups", "logs", "dailyNotes", "purchasePlans"];
  return Object.fromEntries(collections.map(collection => {
    const existing = new Set(remote[collection].map(item => key(collection, item)));
    return [collection, visible[collection].filter(item => {
      const id = key(collection, item);
      return Boolean(id && !existing.has(id));
    }).length];
  })) as RecoveryCounts;
}

/** Show missing IDs from preserved copies without replacing matching server records. */
export function visibleRecoveryStore(remote: PeptimeStore, hasRemoteData: boolean, server: PeptimeStore | undefined, device: PeptimeStore | undefined, scopedLocal: PeptimeStore | undefined) {
  const sources = [server, device, scopedLocal].filter(meaningful);
  if (!hasRemoteData && !sources.length) return { store: remote, recovered: false };
  const base = hasRemoteData ? remote : sources[0];
  if (!base) return { store: remote, recovered: false };
  const candidates = hasRemoteData ? sources : sources.slice(1);
  const collections: Collection[] = ["peptides", "mixGroups", "logs", "dailyNotes", "purchasePlans"];
  const result: PeptimeStore = { ...base, todayAdditions: [...base.todayAdditions] };
  let recovered = !hasRemoteData;
  for (const collection of collections) {
    const existing = new Set(base[collection].map(item => key(collection, item)));
    const combined = [...base[collection]] as unknown[];
    for (const source of candidates) {
      for (const item of source[collection]) {
        const id = key(collection, item);
        if (!id || existing.has(id)) continue;
        combined.push(item);
        existing.add(id);
        recovered = true;
      }
    }
    // Each collection has its own element type; the runtime values were validated above.
    (result as unknown as Record<Collection, unknown[]>)[collection] = combined;
  }
  const additions = new Set(result.todayAdditions);
  // Today's selections have no row in the rolled-back relational schema.
  // Keep them visible locally without treating them as missing cloud records.
  for (const source of candidates) for (const id of source.todayAdditions) additions.add(id);
  result.todayAdditions = [...additions];
  if (!result.onboardingComplete && sources.some(source => source.onboardingComplete)) { result.onboardingComplete = true; recovered = true; }
  return { store: result, recovered };
}
