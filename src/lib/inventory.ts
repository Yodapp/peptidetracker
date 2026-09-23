import { syringeUnits, type DoseLog, type PeptimeStore } from "@/lib/types";

export function doseLogMg(log: Pick<DoseLog, "actualDose" | "unit" | "status">) {
  if (log.status !== "taken") return 0;
  return log.unit === "mg" ? log.actualDose : log.actualDose / 1000;
}

export function clampInventoryMg(value: number, vialMg: number) {
  return Math.min(vialMg, Math.max(0, Number(value.toFixed(9))));
}

export function deleteDoseLog(store: PeptimeStore, logId: string): PeptimeStore {
  const removed = store.logs.find(log => log.id === logId);
  if (!removed) return store;

  const restoredMg = doseLogMg(removed);
  return {
    ...store,
    logs: store.logs.filter(log => log.id !== logId),
    peptides: restoredMg > 0
      ? store.peptides.map(peptide => peptide.id === removed.peptideId
        ? { ...peptide, remainingMg: clampInventoryMg(peptide.remainingMg + restoredMg, peptide.vialMg) }
        : peptide)
      : store.peptides,
  };
}

export function replaceDoseLog(store: PeptimeStore, edited: DoseLog): PeptimeStore {
  const previous = store.logs.find(log => log.id === edited.id);
  if (!previous) return store;

  const peptide = store.peptides.find(item => item.id === edited.peptideId);
  const actualDose = Number.isFinite(edited.actualDose) ? Math.max(0, edited.actualDose) : previous.actualDose;
  const doseMcg = edited.unit === "mg" ? actualDose * 1000 : actualDose;
  const nextLog = {
    ...edited,
    actualDose,
    computedIu: peptide ? syringeUnits(doseMcg, peptide.vialMg, peptide.waterMl) : edited.computedIu,
  };
  const inventoryDeltaMg = doseLogMg(previous) - doseLogMg(nextLog);

  return {
    ...store,
    logs: store.logs.map(log => log.id === edited.id ? nextLog : log),
    peptides: peptide && inventoryDeltaMg !== 0
      ? store.peptides.map(item => item.id === peptide.id
        ? { ...item, remainingMg: clampInventoryMg(item.remainingMg + inventoryDeltaMg, item.vialMg) }
        : item)
      : store.peptides,
  };
}
