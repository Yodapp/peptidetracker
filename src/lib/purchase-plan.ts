import type { PurchasePlanItem } from "@/lib/types";

export interface PurchaseProjection {
  doses: number;
  totalMg: number;
  vials: number;
  bacWaterMl: number;
}

export function plannedDoses(item: PurchasePlanItem, days: number) {
  if (item.frequency === "daily") return days;
  if (item.frequency === "every_n_days") return Math.ceil(days / Math.max(2, item.everyNDays));
  return Math.ceil((days / 7) * Math.min(7, Math.max(1, item.timesPerWeek)));
}

export function projectPurchase(item: PurchasePlanItem, days: number): PurchaseProjection {
  const doses = plannedDoses(item, days);
  const totalMg = doses * Math.max(0, item.doseMcg) / 1000;
  const vials = item.vialMg > 0 ? Math.ceil(totalMg / item.vialMg) : 0;
  return { doses, totalMg, vials, bacWaterMl: vials * Math.max(0, item.bacWaterMl) };
}

export function planDoseIu(item: PurchasePlanItem) {
  if (item.vialMg <= 0 || item.bacWaterMl <= 0) return 0;
  return (item.doseMcg * item.bacWaterMl) / (item.vialMg * 10);
}
