export type Slot = "morning" | "lunch" | "evening" | "as_needed";
export type Route = "subcutaneous" | "intranasal" | "oral" | "topical";
export type DoseStatus = "taken" | "skipped";

export interface Peptide {
  id: string;
  name: string;
  shortCode: string;
  color: string;
  doseMcg: number;
  vialMg: number;
  waterMl: number;
  remainingMg: number;
  route: Route;
  slot: Slot;
  time: string;
  frequency: "daily" | "weekdays" | "interval" | "weekly";
  weekdays: number[];
  intervalDays?: number;
  fasted: boolean;
  fastedNote: string;
  mixGroupId?: string;
  cycleStart?: string;
  weeksOn?: number;
  weeksOff?: number;
  reconstitutedAt?: string;
  beyondUseDays: number;
  sites: string[];
  lastSite?: string;
  notes: string;
  archived: boolean;
  example: boolean;
}

export interface DoseLog {
  id: string;
  peptideId: string;
  peptideName: string;
  plannedDose: number;
  actualDose: number;
  unit: "mcg" | "mg";
  computedIu: number;
  slot: Slot;
  takenAt: string;
  status: DoseStatus;
  site?: string;
  mixGroupId?: string;
  vialId?: string;
  note: string;
}

export interface DailyNote { date: string; note: string }
export interface AppSettings {
  syringe: "U-100 1 ml" | "U-100 0.5 ml";
  timezone: string;
  language: "sv" | "en";
  theme: "dark" | "light";
  dayBoundaryHour: number;
}

export interface PeptimeStore {
  peptides: Peptide[];
  logs: DoseLog[];
  dailyNotes: DailyNote[];
  settings: AppSettings;
  onboardingComplete: boolean;
}

export const syringeUnits = (doseMcg: number, vialMg: number, waterMl: number) => {
  const concentration = vialMg / waterMl;
  if (!doseMcg || !concentration) return 0;
  return (doseMcg / (concentration * 1000)) * 100;
};
