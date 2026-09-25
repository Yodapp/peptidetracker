import { resolvedSchedule } from "./schedule";
import type { MixGroupSchedule, Peptide } from "./types";

export type SharedScheduleItem = Omit<Peptide, "id" | "remainingMg" | "currentVialId" | "reconstitutedAt" | "lastSite" | "archived" | "example">;

export function scheduleItemFromPeptide(peptide: Peptide, groups: MixGroupSchedule[]): SharedScheduleItem {
  return {
    ...resolvedSchedule(peptide, groups),
    name: peptide.name,
    shortCode: peptide.shortCode,
    color: peptide.color,
    doseMcg: peptide.doseMcg,
    vialMg: peptide.vialMg,
    waterMl: peptide.waterMl,
    route: peptide.route,
    fasted: peptide.fasted,
    fastedNote: peptide.fastedNote,
    mixGroupId: peptide.mixGroupId,
    beyondUseDays: peptide.beyondUseDays,
    sites: [...peptide.sites],
    notes: peptide.notes,
  };
}
