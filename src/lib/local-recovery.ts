import type { PeptimeStore } from "@/lib/types";

export interface LocalRecovery {
  userId: string;
  store: PeptimeStore;
  pending?: unknown[];
  conflicts?: unknown[];
}

/** Read the previous offline client's copy without modifying or deleting it. */
export async function readLocalRecovery(userId: string): Promise<LocalRecovery | undefined> {
  if (typeof indexedDB === "undefined") return undefined;
  return new Promise(resolve => {
    const request = indexedDB.open("peptime-offline-v1");
    request.onupgradeneeded = () => request.transaction?.abort();
    request.onerror = () => resolve(undefined);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("snapshots")) {
        db.close();
        resolve(undefined);
        return;
      }
      const record = db.transaction("snapshots", "readonly").objectStore("snapshots").get(userId);
      record.onerror = () => { db.close(); resolve(undefined); };
      record.onsuccess = () => {
        db.close();
        const value = record.result as LocalRecovery | undefined;
        resolve(value?.userId === userId && Array.isArray(value.store?.peptides) && Array.isArray(value.store?.logs) ? value : undefined);
      };
    };
  });
}
