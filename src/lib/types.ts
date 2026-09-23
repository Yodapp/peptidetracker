export type Slot = "morning" | "lunch" | "evening" | "as_needed";
export type Route = "subcutaneous" | "intranasal" | "oral" | "topical";
export type DoseStatus = "taken" | "skipped";
export type ScheduleFrequency = "daily" | "weekdays" | "every_n_days" | "as_needed";

export const defaultInjectionSites = ["Buk vänster", "Buk mitten", "Buk höger", "Lår vänster", "Lår höger"];

export function normalizeInjectionSites(sites: string[]): string[] {
  const oldFull = ["Buk vänster", "Buk höger", "Lår vänster", "Lår höger"];
  const matches = (expected: string[]) => sites.length === expected.length && expected.every(site => sites.includes(site));
  if (matches([...oldFull, "Annat"]) || matches(oldFull)) return [...defaultInjectionSites];
  if (matches(["Buk vänster", "Buk höger"])) return defaultInjectionSites.slice(0, 3);
  return sites;
}

export interface Schedule {
  slot: Slot;
  time: string;
  frequency: ScheduleFrequency;
  weekdays: number[];
  everyNDays?: number;
  anchorDate?: string;
  paused: boolean;
  cycleStart?: string;
  weeksOn?: number;
  weeksOff?: number;
}

export interface MixGroupSchedule extends Schedule {
  name: string;
}

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
  frequency: ScheduleFrequency;
  weekdays: number[];
  everyNDays?: number;
  anchorDate?: string;
  paused: boolean;
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
  scheduledDate?: string;
  status: DoseStatus;
  site?: string;
  mixGroupId?: string;
  vialId?: string;
  note: string;
}

export type DailyTagId = string;
export type WellbeingMetric = "sleepQuality" | "brainFatigue" | "physicalFatigue" | "painLevel" | "activityLevel";
export interface DailyNote {
  date: string;
  note: string;
  tags: DailyTagId[];
  sleepQuality?: number;
  brainFatigue?: number;
  physicalFatigue?: number;
  painLevel?: number;
  activityLevel?: number;
}

export type PurchaseFrequency = "daily" | "every_n_days" | "times_per_week";

export interface PurchasePlanItem {
  id: string;
  name: string;
  vialMg: number;
  doseMcg: number;
  doseEntryUnit: "mcg" | "mg";
  frequency: PurchaseFrequency;
  everyNDays: number;
  timesPerWeek: number;
  bacWaterMl: number;
}

export interface PurchasePlan {
  id: string;
  name: string;
  items: PurchasePlanItem[];
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  syringe: "U-100 0.3 ml" | "U-100 0.5 ml" | "U-100 1 ml";
  customDailyTags: string[];
  massDisplayUnit: "mcg" | "mg";
  timezone: string;
  language: "sv" | "en";
  theme: "dark" | "light";
  themeMode: "system" | "dark" | "light";
  dayBoundaryHour: number;
  remindersEnabled: boolean;
}

export interface PeptimeStore {
  peptides: Peptide[];
  mixGroups: MixGroupSchedule[];
  logs: DoseLog[];
  dailyNotes: DailyNote[];
  purchasePlans: PurchasePlan[];
  todayAdditions: string[];
  settings: AppSettings;
  onboardingComplete: boolean;
}

export const syringeUnits = (doseMcg: number, vialMg: number, waterMl: number) => {
  const concentration = vialMg / waterMl;
  if (!doseMcg || !concentration) return 0;
  return (doseMcg / (concentration * 1000)) * 100;
};

export const syringeCapacity = (syringe: AppSettings["syringe"]) => syringe === "U-100 0.3 ml" ? 30 : syringe === "U-100 0.5 ml" ? 50 : 100;
