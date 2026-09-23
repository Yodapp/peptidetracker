import { syringeUnits, type DoseLog, type PeptimeStore } from "@/lib/types";

export function doseLogMg(log: Pick<DoseLog, "actualDose" | "unit" | "status">) {
  if (log.status !== "taken") return 0;
  return log.unit === "mg" ? log.actualDose : log.actualDose / 1000;
}

export function clampInventoryMg(value: number, vialMg: number) {
  return Math.min(vialMg, Math.max(0, Number(value.toFixed(9))));
}

export function changeInventory(store: PeptimeStore, peptideId: string, vialId: string | undefined, deltaMg: number): PeptimeStore {
  if (!deltaMg) return store;
  const peptide = store.peptides.find(item => item.id === peptideId);
  if (!peptide) return store;
  const targetId = vialId ?? peptide.currentVialId ?? peptide.id;
  const vial = store.vials.find(item => item.id === targetId);
  const remainingMg = vial ? clampInventoryMg(vial.remainingMg + deltaMg, vial.initialMg) : clampInventoryMg(peptide.remainingMg + deltaMg, peptide.vialMg);
  return {
    ...store,
    vials: vial ? store.vials.map(item => item.id === targetId ? { ...item, remainingMg } : item) : store.vials,
    peptides: peptide.currentVialId === targetId || (!peptide.currentVialId && peptide.id === targetId)
      ? store.peptides.map(item => item.id === peptideId ? { ...item, remainingMg } : item)
      : store.peptides,
  };
}

export function openNewVial(store: PeptimeStore, peptideId: string, openedAt = new Date().toISOString()): PeptimeStore {
  const peptide = store.peptides.find(item => item.id === peptideId);
  if (!peptide) return store;
  const id = crypto.randomUUID();
  const previousId = peptide.currentVialId ?? peptide.id;
  return {
    ...store,
    peptides: store.peptides.map(item => item.id === peptideId ? { ...item, currentVialId: id, remainingMg: item.vialMg, reconstitutedAt: openedAt } : item),
    vials: [...store.vials.map(vial => vial.id === previousId ? { ...vial, closedAt: openedAt } : vial), { id, peptideId, initialMg: peptide.vialMg, remainingMg: peptide.vialMg, waterMl: peptide.waterMl, openedAt, reconstitutedAt: openedAt, beyondUseDays: peptide.beyondUseDays }],
  };
}

export function deleteDoseLog(store: PeptimeStore, logId: string): PeptimeStore {
  const removed = store.logs.find(log => log.id === logId);
  if (!removed) return store;

  const restoredMg = doseLogMg(removed);
  const next: PeptimeStore = {
    ...store,
    logs: store.logs.filter(log => log.id !== logId),
  };
  return changeInventory(next, removed.peptideId, removed.vialId, restoredMg);
}

export function replaceDoseLog(store: PeptimeStore, edited: DoseLog): PeptimeStore {
  const previous = store.logs.find(log => log.id === edited.id);
  if (!previous) return store;

  const peptide = store.peptides.find(item => item.id === edited.peptideId);
  const vial = store.vials.find(item => item.id === (previous.vialId ?? peptide?.currentVialId));
  const actualDose = Number.isFinite(edited.actualDose) ? Math.max(0, edited.actualDose) : previous.actualDose;
  const doseMcg = edited.unit === "mg" ? actualDose * 1000 : actualDose;
  const nextLog = {
    ...edited,
    actualDose,
    computedIu: peptide?.route === "subcutaneous" ? syringeUnits(doseMcg, vial?.initialMg ?? peptide.vialMg, vial?.waterMl ?? peptide.waterMl) : 0,
  };
  const inventoryDeltaMg = doseLogMg(previous) - doseLogMg(nextLog);

  const next: PeptimeStore = {
    ...store,
    logs: store.logs.map(log => log.id === edited.id ? nextLog : log),
  };
  return peptide ? changeInventory(next, peptide.id, previous.vialId, inventoryDeltaMg) : next;
}
