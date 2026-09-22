import { defaultInjectionSites, type PeptimeStore, type Peptide } from "@/lib/types";

const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export const examplePeptides: Peptide[] = [
  { id: "selank", name: "Selank", shortCode: "Sel", color: "teal", doseMcg: 250, vialMg: 5, waterMl: 2, remainingMg: 4.5, route: "intranasal", slot: "morning", time: "08:00", frequency: "daily", weekdays: [0,1,2,3,4,5,6], paused: false, fasted: false, fastedNote: "", beyondUseDays: 28, sites: [], notes: "Exempelrad — ersätt med dina egna uppgifter.", archived: false, example: true },
  { id: "cjc", name: "CJC", shortCode: "CJC", color: "teal", doseMcg: 100, vialMg: 10, waterMl: 2, remainingMg: 7.8, route: "subcutaneous", slot: "evening", time: "21:00", frequency: "daily", weekdays: [0,1,2,3,4,5,6], paused: false, fasted: true, fastedNote: "Egen anteckning", mixGroupId: "evening-mix", reconstitutedAt: `${today}T18:00:00+02:00`, beyondUseDays: 28, sites: [...defaultInjectionSites], lastSite: "Buk höger", notes: "Exempelrad — ersätt med dina egna uppgifter.", archived: false, example: true },
  { id: "ipa", name: "Ipamorelin", shortCode: "Ipa", color: "gold", doseMcg: 100, vialMg: 10, waterMl: 2, remainingMg: 7.8, route: "subcutaneous", slot: "evening", time: "21:00", frequency: "daily", weekdays: [0,1,2,3,4,5,6], paused: false, fasted: true, fastedNote: "", mixGroupId: "evening-mix", reconstitutedAt: `${today}T18:00:00+02:00`, beyondUseDays: 28, sites: [...defaultInjectionSites], lastSite: "Buk höger", notes: "Exempelrad — ersätt med dina egna uppgifter.", archived: false, example: true },
  { id: "dsip", name: "DSIP", shortCode: "DSI", color: "stone", doseMcg: 100, vialMg: 5, waterMl: 2, remainingMg: 5, route: "subcutaneous", slot: "evening", time: "22:00", frequency: "daily", weekdays: [0,1,2,3,4,5,6], paused: false, fasted: false, fastedNote: "", cycleStart: "2026-09-14", weeksOn: 4, weeksOff: 2, beyondUseDays: 28, sites: defaultInjectionSites.slice(0, 3), notes: "Startar senare — exempelrad.", archived: false, example: true },
];

export const initialStore: PeptimeStore = {
  peptides: examplePeptides,
  mixGroups: [{ name: "evening-mix", slot: "evening", time: "21:00", frequency: "daily", weekdays: [0,1,2,3,4,5,6], paused: false }],
  logs: [],
  dailyNotes: [],
  purchasePlans: [],
  todayAdditions: [],
  settings: { syringe: "U-100 1 ml", customDailyTags: [], massDisplayUnit: "mcg", timezone: "Europe/Stockholm", language: "sv", theme: "dark", themeMode: "system", dayBoundaryHour: 4, remindersEnabled: false },
  onboardingComplete: false,
};
