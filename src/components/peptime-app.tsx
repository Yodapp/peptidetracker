"use client";

import { useEffect, useRef, useState } from "react";
import {
  Archive, BarChart3, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight,
  FlaskConical, History, House, MoreHorizontal, Pencil, Plus, RotateCcw,
  Search, Settings, ShieldCheck, ShoppingCart, Sparkles, Syringe, Trash2, TriangleAlert, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PurchasePlanner } from "@/components/purchase-planner";
import { ManualLogDialog } from "@/components/manual-log-dialog";
import { ScheduleSharing } from "@/components/schedule-sharing";
import { InsightsView, PeptideInsights } from "@/components/insights";
import { PageHeader, SectionHeading, Surface as Card } from "@/components/peptime-ui";
import { SettingsView } from "@/components/settings-view";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { defaultInjectionSites, syringeCapacity, syringeUnits, type DailyNote, type DailyTagId, type DoseLog, type MixGroupSchedule, type Peptide, type PeptimeStore, type Schedule, type Slot, type WellbeingMetric } from "@/lib/types";
import { addDays, displayLogDate, logScheduledDate, previousDate, stockholmDate, stockholmDateTimeInput, stockholmHour, stockholmLocalToIso } from "@/lib/log-day";
import { groupKey, isDueOn, peptideSchedule, resolvedSchedule, scheduleTargetKey } from "@/lib/schedule";
import { changeInventory, deleteDoseLog, openNewVial, replaceDoseLog } from "@/lib/inventory";
import { usePeptimeStore } from "@/lib/use-peptime-store";

const CHECKIN_LATER_KEY = "peptime-checkin-later";
const cloudAvailable = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const slotNames: Record<Slot, string> = { morning: "Morgon", lunch: "Lunch", evening: "Kväll", as_needed: "Vid behov" };
const routeNames: Record<Peptide["route"], string> = { subcutaneous: "Subkutan", intranasal: "Intranasal", oral: "Oral", topical: "Topikal" };
const disclaimer = "Log what you want. Peptime contains no medical advice.";

function uid() { return crypto.randomUUID(); }
function n(value: number) { return new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 2 }).format(value); }
function massN(value: number) { return new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 4 }).format(value); }
function haptic() { if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(10); }
function peptideCode(peptide: Peptide) { return (peptide.shortCode || peptide.name.slice(0, 3)).slice(0, 4).toLocaleUpperCase("sv-SE"); }
const compoundColors: Record<string, string> = { teal: "#72b7aa", gold: "#c4a66a", stone: "#a1a1aa", blue: "#7f9fca", rose: "#c9828b" };
const compoundColorLabels: Record<string, string> = { teal: "Teal", gold: "Guld", stone: "Neutral", blue: "Blå", rose: "Rosé" };
const dailyTags: { id: DailyTagId; label: string }[] = [
  { id: "irritable", label: "Irriterad" },
  { id: "flushing", label: "Rodnad" },
  { id: "headache", label: "Huvudvärk" },
  { id: "site_soreness", label: "Öm injektionsplats" },
  { id: "nausea", label: "Illamående" },
  { id: "restless", label: "Oro/rastlöshet" },
];
const legacyTagLabels: Record<string, string> = { great_sleep: "Sov bra", high_energy: "Hög energi" };
const tagLabel = (tag: string) => dailyTags.find(value => value.id === tag)?.label ?? legacyTagLabels[tag] ?? tag;
const wellbeingScales: { key: WellbeingMetric; title: string; low: string; high: string; description: string }[] = [
  { key: "sleepQuality", title: "Sömnkvalitet", low: "Mycket dålig", high: "Mycket bra", description: "Natten till idag" },
  { key: "brainFatigue", title: "Hjärntrötthet", low: "Ingen", high: "Extrem", description: "Hur mentalt trött du känt dig idag" },
  { key: "physicalFatigue", title: "Fysisk trötthet", low: "Ingen", high: "Extrem", description: "Hur trött kroppen känts idag" },
  { key: "painLevel", title: "Värk", low: "Ingen värk", high: "Mycket värk", description: "Hur mycket värk du känt idag" },
  { key: "activityLevel", title: "Aktivitetsnivå", low: "Mycket låg", high: "Mycket hög", description: "Dagens rörelse och träning" },
];

function hasWellbeingData(note?: DailyNote) {
  return Boolean(note?.note.trim() || note?.tags.length || wellbeingScales.some(scale => note?.[scale.key] !== undefined));
}

function WellbeingScale({ scale, value, onChange }: { scale: typeof wellbeingScales[number]; value?: number; onChange: (value: number) => void }) {
  return <fieldset className="rounded-2xl bg-muted/70 p-4"><legend className="sr-only">{scale.title}</legend><div className="mb-3"><p className="text-[15px] font-semibold">{scale.title}</p><p className="mt-0.5 text-[13px] text-muted-foreground">{scale.description}</p></div><div className="grid grid-cols-5 gap-2">{[1,2,3,4,5].map(step => <button type="button" key={step} aria-label={`${scale.title}: ${step} av 5`} aria-pressed={value === step} onClick={() => { haptic(); onChange(step); }} className={`grid min-h-11 place-items-center rounded-xl text-[15px] font-semibold transition-colors ${value === step ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground shadow-[0_1px_2px_rgba(0,0,0,.05)]"}`}>{step}</button>)}</div><div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>{scale.low}</span><span>{scale.high}</span></div></fieldset>;
}

function vialDaysLeft(peptide: Peptide) {
  if (!peptide.reconstitutedAt) return null;
  const expiresAt = new Date(peptide.reconstitutedAt).getTime() + peptide.beyondUseDays * 86400000;
  return Math.ceil((expiresAt - Date.now()) / 86400000);
}

function inventoryDaysLeft(peptide: Peptide, store: PeptimeStore) {
  const schedule = resolvedSchedule(peptide, store.mixGroups);
  const doseMg = peptide.doseMcg / 1000;
  if (schedule.paused || schedule.frequency === "as_needed" || doseMg <= 0 || peptide.remainingMg < 0) return null;
  const availableDoses = Math.floor((peptide.remainingMg + 0.000001) / doseMg);
  if (availableDoses <= 0) return 0;
  const today = stockholmDate();
  let dueDoses = 0;
  for (let offset = 0; offset <= 730; offset += 1) {
    if (!isDueOn(peptide, store, addDays(today, offset))) continue;
    dueDoses += 1;
    if (dueDoses >= availableDoses) return offset + 1;
  }
  return null;
}

function consecutiveLoggedDays(logs: DoseLog[], today: string, dayBoundaryHour: number) {
  const dates = new Set(logs.filter(log => log.status === "taken").map(log => logScheduledDate(log, dayBoundaryHour)));
  let date = dates.has(today) ? today : previousDate(today);
  let count = 0;
  while (dates.has(date)) { count += 1; date = previousDate(date); }
  return count;
}

function ChemicalBadge({ items }: { items: Peptide[] }) {
  const color = compoundColors[items[0]?.color] ?? compoundColors.teal;
  return <div style={{ borderColor: `${color}55`, backgroundColor: `${color}18`, color }} className="grid size-11 shrink-0 place-items-center rounded-xl border font-mono text-xs font-semibold tracking-[.06em]">{items.length > 1 ? "MIX" : peptideCode(items[0])}</div>;
}

function FastedBadge() {
  return <span className="inline-flex min-h-7 items-center rounded-full border border-amber-700/20 bg-amber-500/10 px-2.5 text-sm font-medium text-amber-800 dark:border-amber-300/20 dark:text-amber-200">Fastande</span>;
}

function SyringeDrawBar({ items }: { items: Peptide[] }) {
  const values = items.map(item => syringeUnits(item.doseMcg, item.vialMg, item.waterMl));
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return null;
  const stops = values.map((_, index) => values.slice(0, index + 1).reduce((sum, value) => sum + value, 0));
  return <div className="px-4 pb-3 pt-3" aria-label={`Sprutvisualisering, totalt ${n(total)} IU`}>
    <div className="flex h-5 overflow-hidden rounded-md border border-border bg-background/70">
      {items.map((item, index) => <span key={item.id} style={{ width: `${(values[index] / total) * 100}%`, backgroundColor: compoundColors[item.color] ?? compoundColors.teal }} className="border-r border-black/30 last:border-r-2 last:border-r-foreground" />)}
    </div>
    <div className="relative mt-1.5 h-5 text-xs tabular-nums text-muted-foreground"><span className="absolute left-0">0</span>{stops.map((stop,index)=><span key={`${items[index].id}-stop`} style={{ left: `${(stop / total) * 100}%` }} className={`absolute ${index === stops.length - 1 ? "-translate-x-full" : "-translate-x-1/2"}`}>{n(stop)}</span>)}</div>
  </div>;
}

function BottomNav({ view, setView }: { view: string; setView: (view: string) => void }) {
  const items = [[House, "today", "Idag"], [History, "log", "Logg"], [FlaskConical, "peptides", "Peptider"], [BarChart3, "insights", "Insikter"], [Settings, "settings", "Inställningar"]] as const;
  const activeView = view === "planner" || view === "schedule-sharing" || view === "peptide-insights" ? "peptides" : view;
  return <nav aria-label="Huvudnavigering" className="fixed inset-x-0 bottom-0 z-30 mx-auto flex h-[calc(76px+env(safe-area-inset-bottom))] max-w-[500px] items-start justify-around border-t border-border/70 bg-background/88 px-2 pt-2 backdrop-blur-2xl lg:inset-x-auto lg:bottom-0 lg:left-0 lg:top-0 lg:mx-0 lg:h-dvh lg:w-[220px] lg:max-w-none lg:flex-col lg:items-stretch lg:justify-start lg:gap-2 lg:border-r lg:border-t-0 lg:px-3 lg:pt-9 xl:left-[calc(50%-540px)]">
    <div className="hidden px-4 pb-8 text-lg font-bold tracking-tight text-primary lg:block">Peptime</div>
    {items.map(([Icon, key, label]) => <button key={key} aria-current={activeView === key ? "page" : undefined} onClick={() => setView(key)} className={`flex min-h-14 min-w-[56px] flex-col items-center justify-center gap-1 rounded-xl text-[12px] font-medium transition-colors lg:flex-row lg:justify-start lg:gap-3 lg:px-4 lg:text-sm ${activeView === key ? "text-primary lg:bg-accent" : "text-muted-foreground"}`}><Icon className="size-[22px]" strokeWidth={activeView === key ? 2.4 : 1.8} />{label}</button>)}
  </nav>;
}

function Onboarding({ store, update }: { store: PeptimeStore; update: React.Dispatch<React.SetStateAction<PeptimeStore>> }) {
  const [step, setStep] = useState(0);
  const [examples, setExamples] = useState(true);
  const sampleUnits = syringeUnits(100, 10, 2);
  const finish = () => update(s => ({ ...s, peptides: examples ? s.peptides : [], vials: examples ? s.vials : [], mixGroups: examples ? s.mixGroups : [], onboardingComplete: true }));
  return <div className="fixed inset-0 z-50 grid place-items-center bg-background p-5"><div className="w-full max-w-[430px]">
    <div className="mb-10 flex items-center justify-between"><span className="text-sm font-semibold tracking-[0.16em]">PEPTIME</span><span className="text-xs text-muted-foreground">{step + 1} / 4</span></div>
    <div className="mb-8 flex gap-1.5">{[0,1,2,3].map(i => <span key={i} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />)}</div>
    {step === 0 && <><div className="mb-6 grid size-14 place-items-center rounded-2xl bg-accent text-accent-foreground"><ShieldCheck className="size-7" /></div><h1 className="text-3xl font-medium tracking-[-.04em]">Din privata forskningslogg</h1><p className="mt-4 leading-7 text-muted-foreground">Peptime hjälper dig hålla koll på dina peptider!</p><Card className="mt-7 p-4"><p className="text-sm leading-6">{disclaimer}</p></Card></>}
    {step === 1 && <><p className="text-xs font-semibold uppercase tracking-[.17em] text-accent-foreground">Spruta</p><h1 className="mt-2 text-3xl font-medium tracking-[-.04em]">Vad använder du?</h1><p className="mt-3 text-muted-foreground">På U-100 motsvarar 1 IU-markering alltid 0,01 ml. Storleken anger sprutans maxkapacitet.</p><div className="mt-7 grid gap-3">{(["U-100 0.3 ml", "U-100 0.5 ml", "U-100 1 ml"] as const).map(s => <button key={s} onClick={() => update(v => ({...v, settings: {...v.settings, syringe: s}}))} className={`flex min-h-16 items-center justify-between rounded-2xl border px-5 text-left ${store.settings.syringe === s ? "border-primary bg-accent/40" : "border-border bg-card"}`}><span>{s}<span className="ml-2 text-xs text-muted-foreground">· {syringeCapacity(s)} IU</span></span>{store.settings.syringe === s && <CheckCircle2 className="size-5 text-primary" />}</button>)}</div></>}
    {step === 2 && <><p className="text-xs font-semibold uppercase tracking-[.17em] text-accent-foreground">Vialmatematik</p><h1 className="mt-2 text-3xl font-medium tracking-[-.04em]">Dina värden, tydligt</h1><Card className="mt-7 overflow-hidden"><div className="grid grid-cols-2 divide-x divide-border"><div className="p-4"><span className="text-xs text-muted-foreground">Vial</span><p className="mt-1 text-xl tabular-nums">10 mg</p></div><div className="p-4"><span className="text-xs text-muted-foreground">BAC-vatten</span><p className="mt-1 text-xl tabular-nums">2 ml</p></div></div><div className="border-t border-border bg-muted/50 p-5"><p className="text-sm text-muted-foreground">10 mg + 2 ml = 50 mcg per IU</p><p className="mt-3 text-2xl font-medium tabular-nums">100 mcg = {n(sampleUnits)} IU</p></div></Card><label className="mt-6 flex min-h-14 items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4"><span><span className="block text-sm">Lägg till exempelpeptider</span><span className="text-xs text-muted-foreground">Tydligt märkta och lätta att ta bort</span></span><Switch checked={examples} onCheckedChange={setExamples} /></label></>}
    {step === 3 && <><div className="mb-6 grid size-14 place-items-center rounded-2xl bg-accent text-accent-foreground"><Sparkles className="size-7" /></div><h1 className="text-3xl font-bold tracking-[-.04em]">Redo när du är</h1><p className="mt-4 leading-7 text-muted-foreground">Öppna appen och tryck Ta dos. Injektionsplats kan väljas direkt på kortet när du vill logga den.</p><Card className="mt-7 p-5"><p className="text-sm text-muted-foreground">Standard</p><p className="mt-2">{store.settings.syringe} · Europe/Stockholm · Följer systemets utseende</p></Card></>}
    <div className="mt-10 flex gap-3">{step > 0 && <Button variant="outline" className="h-14 flex-1 rounded-2xl" onClick={() => setStep(step - 1)}>Tillbaka</Button>}<Button className="h-14 flex-[2] rounded-2xl text-base" onClick={() => step < 3 ? setStep(step + 1) : finish()}>{step < 3 ? "Fortsätt" : "Öppna Peptime"}</Button></div>
  </div></div>;
}

function TodayView({ store, update, openCalendar }: { store: PeptimeStore; update: React.Dispatch<React.SetStateAction<PeptimeStore>>; openCalendar: () => void }) {
  type LogTarget = { items: Peptide[]; scheduledDate: string; carryover: boolean };
  const today = stockholmDate();
  const yesterday = previousDate(today);
  const [siteSelections, setSiteSelections] = useState<Record<string, string>>({});
  const [adjustTarget, setAdjustTarget] = useState<LogTarget | null>(null);
  const [adjustDoses, setAdjustDoses] = useState<Record<string, number>>({});
  const [review, setReview] = useState<{ target: LogTarget; site?: string; doses?: Record<string, number>; warnings: string[] } | null>(null);
  const [undoIds, setUndoIds] = useState<string[]>([]);
  const [checkinOpen, setCheckinOpen] = useState<boolean | null>(null);
  const [checkinDeferredDate, setCheckinDeferredDate] = useState<string | null>(() => {
    try { return typeof window === "undefined" ? null : window.sessionStorage.getItem(CHECKIN_LATER_KEY); }
    catch { return null; }
  });
  const [customTag, setCustomTag] = useState("");
  const checkinRef = useRef<HTMLElement>(null);
  const noteEntry: DailyNote = store.dailyNotes.find(v => v.date === today) ?? { date: today, note: "", tags: [] };
  const note = noteEntry.note;
  const loggedIdsFor = (date:string) => new Set(store.logs.filter(log => logScheduledDate(log,store.settings.dayBoundaryHour)===date).map(log=>log.peptideId));
  const loggedToday = loggedIdsFor(today);
  const done = store.peptides.filter(p => !p.archived && loggedToday.has(p.id));
  const streak = consecutiveLoggedDays(store.logs, today, store.settings.dayBoundaryHour);
  const groupsFor = (date:string,carryover:boolean) => {
    const loggedIds=loggedIdsFor(date);
    const due=store.peptides.filter(peptide=>isDueOn(peptide,store,date)&&!loggedIds.has(peptide.id));
    const map = new Map<string, Peptide[]>();
    due.forEach(p => { const group = groupKey(p.mixGroupId); const key = group ? `group:${group}:${p.route}` : p.id; map.set(key, [...(map.get(key) ?? []), p]); });
    return [...map.values()].sort((a,b) => {const aSchedule=resolvedSchedule(a[0],store.mixGroups),bSchedule=resolvedSchedule(b[0],store.mixGroups);return (aSchedule.frequency==="as_needed"?"99:99":aSchedule.time).localeCompare(bSchedule.frequency==="as_needed"?"99:99":bSchedule.time)}).map(items=>({items,scheduledDate:date,carryover}));
  };
  const groups = [...(stockholmHour()<12?groupsFor(yesterday,true):[]),...groupsFor(today,false)];
  const scheduledToday = store.peptides.filter(peptide => isDueOn(peptide, store, today));
  const hasCheckinData = hasWellbeingData(noteEntry);
  const isCheckinExpanded = checkinOpen ?? hasCheckinData;
  const showCheckinPrompt = scheduledToday.length > 0 && groups.every(group => group.carryover) && store.logs.some(log => log.status === "taken" && logScheduledDate(log, store.settings.dayBoundaryHour) === today) && !hasCheckinData && checkinDeferredDate !== today;
  const saveLogs = (target: LogTarget, status: "taken" | "skipped", site?: string, actualDoses?: Record<string, number>) => {
    const {items,scheduledDate}=target;
    const completesToday = scheduledDate === today && groups.filter(group => !group.carryover).length === 1;
    const now = new Date().toISOString();
    const newLogs: DoseLog[] = items.map(p => {
      const actualDose = status === "skipped" ? 0 : actualDoses?.[p.id] ?? p.doseMcg;
      return { id: uid(), peptideId: p.id, peptideName: p.name, plannedDose: p.doseMcg, actualDose, unit: "mcg", computedIu: p.route === "subcutaneous" ? syringeUnits(actualDose, p.vialMg, p.waterMl) : 0, slot: resolvedSchedule(p,store.mixGroups).slot, takenAt: now, scheduledDate, status, site, mixGroupId: p.mixGroupId, vialId: p.currentVialId ?? p.id, note: "" };
    });
    update(s => {
      let next = { ...s, logs: [...newLogs, ...s.logs] };
      if (status === "taken") {
        for (const log of newLogs) next = changeInventory(next, log.peptideId, log.vialId, -log.actualDose / 1000);
        next = { ...next, peptides: next.peptides.map(p => items.some(item => item.id === p.id) ? { ...p, lastSite: site ?? p.lastSite } : p) };
      }
      return next;
    });
    setUndoIds(newLogs.map(l => l.id)); window.setTimeout(() => setUndoIds([]), 30000);
    if (completesToday && status === "taken" && !hasCheckinData) {
      setCheckinOpen(false);
      window.setTimeout(() => checkinRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    }
  };
  const beginTake = (target: LogTarget, site?: string, doses?: Record<string, number>) => {
    const warnings: string[] = [];
    const totalIu = target.items.reduce((sum, item) => sum + (item.route === "subcutaneous" ? syringeUnits(doses?.[item.id] ?? item.doseMcg, item.vialMg, item.waterMl) : 0), 0);
    if (totalIu > syringeCapacity(store.settings.syringe)) warnings.push(`Totalt ${n(totalIu)} IU ryms inte i din valda spruta.`);
    for (const item of target.items) {
      const dose = doses?.[item.id] ?? item.doseMcg;
      if (dose > item.doseMcg * 2) warnings.push(`${item.name}: dosen är mer än dubbelt så stor som din planerade dos.`);
      if (dose > item.remainingMg * 1000) warnings.push(`${item.name}: angivet lager räcker inte till dosen.`);
      if ((vialDaysLeft(item) ?? 1) <= 0) warnings.push(`${item.name}: din angivna vialgräns har passerat.`);
    }
    if (warnings.length) setReview({ target, site, doses, warnings });
    else saveLogs(target, "taken", site, doses);
  };
  const undo = () => { update(s => undoIds.reduce((next, id) => deleteDoseLog(next, id), s)); setUndoIds([]); };
  const dateText = displayLogDate(today, { weekday: "long", day: "numeric", month: "long" });
  const nowTime = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(".",":");
  const saveNote = (changes: Partial<DailyNote>) => update(s => ({...s, dailyNotes: [...s.dailyNotes.filter(v => v.date !== today), {...noteEntry, ...changes, date: today}]}));
  const toggleTag = (tag: DailyTagId) => { haptic(); saveNote({ tags: noteEntry.tags.includes(tag) ? noteEntry.tags.filter(value => value !== tag) : [...noteEntry.tags, tag] }); };
  const addCustomTag = () => { const value = customTag.trim().slice(0, 40); if (!value) return; update(s => ({...s, settings: {...s.settings, customDailyTags: [...new Set([...s.settings.customDailyTags, value])]}, dailyNotes: [...s.dailyNotes.filter(v => v.date !== today), {...noteEntry, tags: [...new Set([...noteEntry.tags, value])]}]})); setCustomTag(""); };
  const removeCustomTag = (tag: string) => update(s => ({...s, settings: {...s.settings, customDailyTags: s.settings.customDailyTags.filter(value => value !== tag)}}));
  const openCheckin = () => { setCheckinOpen(true); window.setTimeout(() => checkinRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); };
  const deferCheckin = () => { try { window.sessionStorage.setItem(CHECKIN_LATER_KEY, today); } catch {} setCheckinDeferredDate(today); };
  const adjustedItems = adjustTarget?.items.map(item => ({ ...item, doseMcg: adjustDoses[item.id] ?? item.doseMcg })) ?? [];
  const adjustedTotalIu = adjustedItems.reduce((sum, item) => sum + (item.route === "subcutaneous" ? syringeUnits(item.doseMcg, item.vialMg, item.waterMl) : 0), 0);
  const adjustedDosesValid = adjustedItems.length > 0 && adjustedItems.every(item => Number.isFinite(item.doseMcg) && item.doseMcg > 0);
  return <>
    <PageHeader eyebrow="Peptime" title="Idag" action={streak > 0 ? <div className="rounded-full bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground">{streak} {streak === 1 ? "dag" : "dagar"}</div> : undefined} />
    <button type="button" onClick={openCalendar} className="-mt-3 mb-7 flex min-h-12 items-center gap-2 rounded-xl px-1 text-[17px] font-medium capitalize text-primary"><CalendarDays className="size-5"/>{dateText}<ChevronRight className="size-4"/></button>
    {groups.length === 0 && done.length === 0 && <Card className="p-7 text-center"><CheckCircle2 className="mx-auto size-7 text-primary"/><p className="mt-4 font-medium">Inget planerat idag</p><p className="mt-2 text-sm text-muted-foreground">Dagens schema är tomt.</p></Card>}
    <div className="space-y-5">{groups.map((target,index) => { const {items,carryover,scheduledDate}=target; const first = items[0]; const schedule=resolvedSchedule(first,store.mixGroups); const previous=groups[index-1]; const showHeading=!previous||previous.carryover!==carryover||resolvedSchedule(previous.items[0],store.mixGroups).slot!==schedule.slot; const late=carryover||(schedule.frequency!=="as_needed"&&nowTime>schedule.time); const totalIu = items.reduce((sum,p) => sum + syringeUnits(p.doseMcg,p.vialMg,p.waterMl),0); const totalDoseMcg=items.reduce((sum,p)=>sum+p.doseMcg,0); const isMix = items.length > 1; const isInjectable = items.every(item => item.route === "subcutaneous"); const massUnit=store.settings.massDisplayUnit; const massDoseLine=`${massN(massUnit==="mg"?totalDoseMcg/1000:totalDoseMcg)} ${massUnit}`; const targetKey=`${scheduledDate}:${items.map(i=>i.id).join(",")}`; const selectedSite=siteSelections[targetKey]; const expired=items.some(item=>(vialDaysLeft(item)??1)<=0); const lowInventory=items.map(item=>({item,days:inventoryDaysLeft(item,store)})).filter(value=>value.days!==null&&value.days<=15); return <section key={`${scheduledDate}-${items.map(i=>i.id).join("-")}`}>
      {showHeading&&<h2 className={`mb-3 text-lg font-semibold ${carryover?"text-accent-foreground":""}`}>{carryover?`Från igår · ${slotNames[schedule.slot]}`:slotNames[schedule.slot]}</h2>}
      <Card className="overflow-hidden p-5">
        <div className="mb-4 flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xl font-semibold leading-snug">{items.map(i=>i.name).join(" + ")}</p>{!isMix&&first.fasted&&<div className="mt-2"><FastedBadge/></div>}</div><span className={`shrink-0 text-[15px] tabular-nums ${late?"font-medium text-destructive":"text-muted-foreground"}`}>{schedule.frequency==="as_needed"?"Vid behov":schedule.time}</span></div>
        {expired && <div className="mb-4 flex gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive"><TriangleAlert className="mt-0.5 size-4 shrink-0" /> Angiven användningstid för vialen har passerat. Kontrollera uppgifterna.</div>}
        {!isInjectable?<div className="mb-4 flex items-center justify-between rounded-2xl border border-border bg-muted/40 px-4 py-4"><span className="text-base text-muted-foreground">{routeNames[first.route]} · dos</span><strong className="text-2xl font-semibold tabular-nums">{massDoseLine}</strong></div>:isMix?<div className="mb-4 overflow-hidden rounded-2xl border border-border bg-muted/40 tabular-nums dark:bg-black/25"><div className="flex items-center gap-2 px-4 pb-2 pt-3 text-sm font-medium text-muted-foreground"><Syringe className="size-4" /> Dra upp från varje vial</div><div className="grid grid-cols-2 border-y border-border">{items.map((i,index)=><div key={i.id} className={`min-w-0 px-4 py-3 ${index%2?"border-l border-border":""}`}><div className="min-h-[68px]"><p className="text-base font-medium leading-tight">{i.name}</p>{i.fasted&&<div className="mt-2"><FastedBadge/></div>}</div><strong className="mt-2 block text-2xl font-semibold leading-none tracking-tight">{n(syringeUnits(i.doseMcg,i.vialMg,i.waterMl))} IU</strong><span className="mt-1.5 block text-base font-medium leading-none text-foreground/70">{massN(massUnit==="mg"?i.doseMcg/1000:i.doseMcg)} {massUnit}</span></div>)}</div><SyringeDrawBar items={items}/><div className="flex min-h-14 items-center justify-between gap-3 border-t border-border bg-muted/40 px-4 py-2.5 dark:bg-white/[.025]"><span className="text-base font-semibold">Totalt i sprutan</span><span className="shrink-0 text-right"><strong className="block text-2xl font-semibold leading-none tracking-tight">{n(totalIu)} IU</strong><span className="mt-1.5 block text-base font-medium leading-none text-foreground/75">{massDoseLine}</span></span></div></div>:<div className="mb-4 flex items-center justify-between gap-4 rounded-2xl border border-border bg-muted/40 px-4 py-4 tabular-nums dark:bg-black/25"><span className="flex items-center gap-2 text-base text-muted-foreground"><Syringe className="size-5" /> U-100</span><span className="text-right"><strong className="block text-[30px] font-semibold leading-none">{n(totalIu)} IU</strong><span className="mt-2 block text-base font-medium leading-none text-foreground/75">{massDoseLine}</span></span></div>}
        {isInjectable && totalIu > syringeCapacity(store.settings.syringe) && <div className="mb-4 flex gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive"><TriangleAlert className="mt-0.5 size-4 shrink-0"/>Dosen är {n(totalIu)} IU och ryms inte i din valda {store.settings.syringe}-spruta ({syringeCapacity(store.settings.syringe)} IU).</div>}
        {lowInventory.length>0&&<div className="mb-4 flex flex-wrap gap-2" aria-label="Lågt lager">{lowInventory.map(({item,days})=><span key={item.id} className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-amber-500/10 px-3 text-sm font-medium text-amber-800 dark:text-amber-200"><TriangleAlert className="size-4"/>{peptideCode(item)} · {days===0?"lagret slut":"ca "+days+" dagar kvar"}</span>)}</div>}
        {first.route==="subcutaneous"&&first.sites.length>0&&<div className="mb-5"><div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><p className="text-base font-semibold">Injektionsplats <span className="font-normal text-muted-foreground">(valfritt)</span></p>{first.lastSite&&<span className="text-sm text-muted-foreground">Senast: {first.lastSite}</span>}</div><div className="flex flex-wrap gap-2">{first.sites.map(site=><button type="button" key={site} aria-pressed={selectedSite===site} onClick={()=>{haptic();setSiteSelections(value=>({...value,[targetKey]:value[targetKey]===site?"":site}))}} className={`min-h-11 rounded-full border px-4 text-[15px] font-medium transition-colors ${selectedSite===site?"border-primary bg-accent text-accent-foreground":"border-border bg-background/60 text-muted-foreground dark:bg-black/20"}`}>{site}</button>)}</div></div>}
        <Button className="h-14 w-full rounded-2xl text-base font-semibold" onClick={() => {haptic();beginTake(target,selectedSite||undefined)}}><Check className="size-5" /> Ta dos</Button>
        <div className="mt-2 grid grid-cols-2 gap-2"><Button className="h-12 rounded-xl text-[15px] text-muted-foreground" variant="ghost" onClick={() => {haptic();saveLogs(target,"skipped")}}>Hoppa över</Button><Button className="h-12 rounded-xl text-[15px] text-muted-foreground" variant="ghost" onClick={() => {setAdjustTarget(target);setAdjustDoses(Object.fromEntries(items.map(item => [item.id, item.doseMcg])))}}>Justera dos</Button></div>
        <details className="group mt-2 border-t border-border/70 pt-1 text-sm text-muted-foreground"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 py-2 [&::-webkit-details-marker]:hidden"><FlaskConical className="size-4"/><span className="flex-1">Vial och lager</span><ChevronRight className="size-4 transition-transform group-open:rotate-90"/></summary><div className="space-y-1 pb-2 pl-6">{items.map(item=>{const days=vialDaysLeft(item);return <p key={item.id}>{item.name}: {n(item.remainingMg)} mg kvar{days!==null?` · ${Math.max(0,days)} dagar enligt din vialgräns`:""}</p>})}</div></details>
      </Card>
    </section>})}</div>
    {showCheckinPrompt && !isCheckinExpanded && <section ref={checkinRef} className="mt-7 scroll-mt-24"><Card className="border-primary/30 bg-accent/40 p-5"><div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><CheckCircle2 className="size-6"/></span><div><h2 className="text-xl font-semibold leading-tight">Klart för idag</h2><p className="mt-2 text-[15px] leading-6 text-muted-foreground">Dagens doser är hanterade. Hur har du mått?</p></div></div><Button type="button" onClick={openCheckin} className="mt-5 h-14 w-full rounded-2xl text-base font-semibold">Logga dagens mående <ChevronRight className="size-5"/></Button><button type="button" onClick={deferCheckin} className="mt-2 flex min-h-11 w-full items-center justify-center text-sm font-medium text-muted-foreground">Senare</button></Card></section>}
    {done.length > 0 && <section className="mt-7"><h2 className="mb-3 text-lg font-semibold">Klart</h2><Card className="divide-y divide-border">{done.map(p => { const log = store.logs.find(l=>l.peptideId===p.id && logScheduledDate(l,store.settings.dayBoundaryHour)===today); return <div key={p.id} className="flex min-h-14 items-center gap-3 px-4 py-2 text-base"><CheckCircle2 className="size-5 text-primary"/><span className="min-w-0 flex-1 text-muted-foreground"><span className="block truncate">{p.name}</span>{p.fasted&&<span className="mt-1 block"><FastedBadge/></span>}</span><span className="tabular-nums text-muted-foreground">{log?.status === "skipped" ? "Överhoppad" : `${n(log?.computedIu ?? 0)} IU`}</span></div>})}</Card></section>}
    {undoIds.length > 0 && <button onClick={undo} className="fixed bottom-24 left-1/2 z-40 flex min-h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-5 text-sm text-background shadow-xl"><RotateCcw className="size-4"/> Ångra</button>}
    {(!showCheckinPrompt || isCheckinExpanded) && <section ref={checkinRef} className="mt-7 scroll-mt-24"><SectionHeading title="Dagens mående" detail="Sömn, trötthet, värk och aktivitet"/><Card className="overflow-hidden"><button type="button" className="flex min-h-14 w-full items-center justify-between gap-4 px-5 text-left" onClick={() => setCheckinOpen(value => !(value ?? hasCheckinData))} aria-expanded={isCheckinExpanded}><span className="text-[15px] text-muted-foreground">{hasCheckinData?"Dagens svar":"Inte ifylld"}</span><span className="flex items-center gap-1 text-[13px] font-medium text-primary">{isCheckinExpanded ? "Dölj" : "Fyll i"}<ChevronRight className={`size-4 transition-transform ${isCheckinExpanded ? "-rotate-90" : ""}`}/></span></button>{isCheckinExpanded && <div className="space-y-4 border-t border-border p-4">{wellbeingScales.filter(scale=>["sleepQuality","brainFatigue","painLevel"].includes(scale.key)).map(scale => <WellbeingScale key={scale.key} scale={scale} value={noteEntry[scale.key]} onChange={value => saveNote({ [scale.key]: value })}/>) }<details className="rounded-2xl border border-border p-4"><summary className="min-h-9 cursor-pointer font-medium">Fler frågor · valfritt</summary><div className="mt-3 space-y-3">{wellbeingScales.filter(scale=>["physicalFatigue","activityLevel"].includes(scale.key)).map(scale=><WellbeingScale key={scale.key} scale={scale} value={noteEntry[scale.key]} onChange={value=>saveNote({[scale.key]:value})}/>)}</div></details><div><p className="mb-2 text-[15px] font-semibold">Hur har dagen känts?</p><div className="flex flex-wrap gap-2">{dailyTags.map(tag=><button type="button" key={tag.id} aria-pressed={noteEntry.tags.includes(tag.id)} onClick={()=>toggleTag(tag.id)} className={`min-h-11 rounded-full px-3 text-[13px] transition-colors ${noteEntry.tags.includes(tag.id)?"bg-primary text-primary-foreground":"bg-muted text-muted-foreground"}`}>{tag.label}</button>)}{store.settings.customDailyTags.map(tag=><span key={tag} className="inline-flex overflow-hidden rounded-full bg-muted"><button type="button" aria-pressed={noteEntry.tags.includes(tag)} onClick={()=>toggleTag(tag)} className={`min-h-11 px-3 text-[13px] ${noteEntry.tags.includes(tag)?"bg-primary text-primary-foreground":"text-muted-foreground"}`}>{tag}</button><button type="button" onClick={()=>removeCustomTag(tag)} aria-label={`Ta bort taggen ${tag}`} className="min-h-11 border-l border-border px-2 text-muted-foreground"><X className="size-3.5"/></button></span>)}</div><div className="mt-3 flex gap-2"><Input value={customTag} onChange={event=>setCustomTag(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();addCustomTag();}}} maxLength={40} placeholder="Skapa egen tagg"/><Button type="button" variant="outline" className="shrink-0" onClick={addCustomTag}><Plus/> Lägg till</Button></div></div><div><label htmlFor="daily-note" className="mb-2 block text-[15px] font-semibold">Anteckning <span className="font-normal text-muted-foreground">· valfritt</span></label><Textarea id="daily-note" value={note} onChange={e=>saveNote({ note: e.target.value })} placeholder="Något mer du vill komma ihåg?" className="resize-none"/></div><p className="text-right text-xs text-muted-foreground">Sparas automatiskt</p></div>}</Card></section>}
    <Dialog open={!!review} onOpenChange={open=>!open&&setReview(null)}><DialogContent><DialogHeader><DialogTitle>Kontrollera innan du loggar</DialogTitle><DialogDescription>Följande skiljer sig från dina sparade uppgifter.</DialogDescription></DialogHeader><ul className="list-disc space-y-2 pl-5 text-sm">{review?.warnings.map(warning=><li key={warning}>{warning}</li>)}</ul><div className="grid grid-cols-2 gap-2"><Button type="button" variant="outline" onClick={()=>setReview(null)}>Avbryt</Button><Button type="button" onClick={()=>{if(review)saveLogs(review.target,"taken",review.site,review.doses);setReview(null)}}>Logga ändå</Button></div></DialogContent></Dialog>
    <Dialog open={!!adjustTarget} onOpenChange={open=>!open&&setAdjustTarget(null)}><DialogContent><DialogHeader><DialogTitle>Justera endast denna dos</DialogTitle><DialogDescription>Detta ändrar inte protokollet. Varje peptid räknas med sin egen vialstyrka.</DialogDescription></DialogHeader><div className="space-y-3">{adjustTarget?.items.map(item => {const dose=adjustDoses[item.id]??item.doseMcg;return <label key={item.id} className="block text-xs text-muted-foreground">{item.name} · faktisk dos (mcg)<Input className="mt-2 h-12" min="0.01" step="any" type="number" value={dose} onChange={e=>setAdjustDoses(values=>({...values,[item.id]:Number(e.target.value)}))}/><span className="mt-1.5 block text-sm text-foreground">{n(dose)} mcg{item.route==="subcutaneous"?` = ${n(syringeUnits(dose,item.vialMg,item.waterMl))} IU`:""}</span></label>})}</div>{adjustedItems.length>1&&adjustedItems.every(item=>item.route==="subcutaneous")&&<div className="rounded-xl bg-muted p-3 text-sm"><SyringeDrawBar items={adjustedItems}/><p className="px-4 pb-2 text-right font-semibold">Totalt {n(adjustedTotalIu)} IU</p></div>}<Button disabled={!adjustedDosesValid} className="h-12" onClick={()=>{if(adjustTarget){const key=`${adjustTarget.scheduledDate}:${adjustTarget.items.map(item=>item.id).join(",")}`;beginTake(adjustTarget,siteSelections[key]||undefined,adjustDoses)}setAdjustTarget(null)}}>Logga justerad dos</Button></DialogContent></Dialog>
  </>;
}

function LogView({ store, update }: { store: PeptimeStore; update: React.Dispatch<React.SetStateAction<PeptimeStore>> }) {
  const [query,setQuery]=useState(""); const [date,setDate]=useState(""); const [edit,setEdit]=useState<DoseLog|null>(null); const [visibleCount,setVisibleCount]=useState(50);
  const filteredLogs=store.logs.filter(l=>(!query||l.peptideName.toLowerCase().includes(query.toLowerCase()))&&(!date||logScheduledDate(l,store.settings.dayBoundaryHour)===date)).sort((a,b)=>b.takenAt.localeCompare(a.takenAt));
  const logs=filteredLogs.slice(0,visibleCount);
  return <><PageHeader eyebrow="Historik" title="Logg"/><div className="mb-6 grid grid-cols-[1fr_142px] gap-2"><div className="relative"><Search className="absolute left-3 top-3.5 size-4 text-muted-foreground"/><Input value={query} onChange={e=>{setQuery(e.target.value);setVisibleCount(50)}} placeholder="Peptid" className="h-11 pl-9"/></div><Input type="date" value={date} onChange={e=>{setDate(e.target.value);setVisibleCount(50)}} className="h-11"/></div>{logs.length===0?<Card className="p-7 text-center"><History className="mx-auto size-7 text-muted-foreground"/><p className="mt-4 font-medium">Ingen historik ännu</p><p className="mt-2 text-sm text-muted-foreground">Loggade och överhoppade doser visas här.</p></Card>:<div className="space-y-3">{logs.map(log=>{const scheduledDate=logScheduledDate(log,store.settings.dayBoundaryHour);const takenDate=stockholmDate(log.takenAt);return <Card key={log.id} className="p-4"><div className="flex items-start gap-3"><div className={`mt-0.5 grid size-9 place-items-center rounded-full ${log.status==="taken"?"bg-accent text-accent-foreground":"bg-muted text-muted-foreground"}`}>{log.status==="taken"?<Check className="size-4"/>:<X className="size-4"/>}</div><div className="min-w-0 flex-1"><div className="flex justify-between gap-3"><p className="font-medium">{log.peptideName}</p><span className="text-xs tabular-nums text-muted-foreground">{new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Stockholm",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(log.takenAt))}</span></div><p className="mt-1 text-sm text-muted-foreground">{log.status==="taken"?`${n(log.actualDose)} ${log.unit} · ${n(log.computedIu)} IU${log.site?` · ${log.site}`:""}`:"Överhoppad"}</p>{scheduledDate!==takenDate&&<p className="mt-1 text-xs text-accent-foreground">Hör till schemat {scheduledDate}</p>}</div><Button variant="ghost" size="icon" aria-label="Redigera logg" onClick={()=>setEdit({...log,scheduledDate})}><MoreHorizontal/></Button></div></Card>})}{filteredLogs.length>logs.length&&<Button variant="outline" className="h-12 w-full" onClick={()=>setVisibleCount(count=>count+50)}>Visa fler</Button>}</div>}
    <Dialog open={!!edit} onOpenChange={open=>!open&&setEdit(null)}><DialogContent><DialogHeader><DialogTitle>Redigera logg</DialogTitle><DialogDescription>{edit?.peptideName}</DialogDescription></DialogHeader><div className="grid grid-cols-2 gap-3"><label className="text-xs text-muted-foreground">Schemalagd dag<Input type="date" className="mt-2 h-11" value={edit?.scheduledDate??""} onChange={e=>{if(e.target.value)setEdit(v=>v?{...v,scheduledDate:e.target.value}:v)}}/></label><label className="text-xs text-muted-foreground">Faktisk tid<Input type="datetime-local" className="mt-2 h-11" value={edit?stockholmDateTimeInput(edit.takenAt):""} onChange={e=>{if(e.target.value)setEdit(v=>v?{...v,takenAt:stockholmLocalToIso(e.target.value)}:v)}}/></label></div><label className="text-xs text-muted-foreground">Faktisk dos<Input min="0" step="any" type="number" className="mt-2 h-11" value={edit?.actualDose??0} onChange={e=>setEdit(v=>v?{...v,actualDose:Number(e.target.value)}:v)}/></label><label className="text-xs text-muted-foreground">Anteckning<Textarea className="mt-2" value={edit?.note??""} onChange={e=>setEdit(v=>v?{...v,note:e.target.value}:v)}/></label><Button disabled={!edit||!Number.isFinite(edit.actualDose)||edit.actualDose<0} className="h-11" onClick={()=>{if(edit)update(s=>replaceDoseLog(s,edit));setEdit(null)}}><Pencil/> Spara</Button><Button variant="destructive" className="h-11" onClick={()=>{if(edit)update(s=>deleteDoseLog(s,edit.id));setEdit(null)}}><Trash2/> Ta bort och återställ lager</Button></DialogContent></Dialog>
  </>;
}

const emptyPeptide: Omit<Peptide,"id"> = { name:"",shortCode:"",color:"teal",doseMcg:100,vialMg:10,waterMl:2,remainingMg:10,route:"subcutaneous",slot:"evening",time:"21:00",frequency:"daily",weekdays:[0,1,2,3,4,5,6],paused:false,fasted:false,fastedNote:"",beyondUseDays:28,sites:[...defaultInjectionSites],notes:"",archived:false,example:false };

function DecimalInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [editingValue, setEditingValue] = useState<string | null>(null);
  return <Input
    className="mt-1.5 h-11"
    type="text"
    inputMode="decimal"
    autoComplete="off"
    value={editingValue ?? (value > 0 ? String(value) : "")}
    placeholder="Ange"
    aria-invalid={value <= 0}
    onFocus={event => { setEditingValue(event.currentTarget.value); event.currentTarget.select(); }}
    onChange={event => {
      const input = event.currentTarget.value;
      if (!/^\d*(?:[.,]\d*)?$/.test(input)) return;
      setEditingValue(input);
      const parsed = Number(input.replace(",", "."));
      onChange(input && Number.isFinite(parsed) ? parsed : 0);
    }}
    onBlur={() => setEditingValue(null)}
  />;
}

function ScheduleFields({ value, set }: { value: Schedule; set: (part: Partial<Schedule>) => void }) {
  const weekdayNames=["Mån","Tis","Ons","Tor","Fre","Lör","Sön"];
  return <div className="space-y-4 rounded-2xl border border-border p-4">
    <div className="flex items-center justify-between"><div><p className="font-medium">Schema</p><p className="mt-1 text-xs text-muted-foreground">Visas på Idag när schemat gäller.</p></div><label className="flex items-center gap-2 text-sm">Pausad <Switch checked={value.paused} onCheckedChange={paused=>set({paused})}/></label></div>
    <label className="block text-xs text-muted-foreground">Frekvens<select className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3" value={value.frequency} onChange={e=>{const frequency=e.target.value as Schedule["frequency"];set({frequency,slot:frequency==="as_needed"?"as_needed":value.slot==="as_needed"?"evening":value.slot})}}><option value="daily">Varje dag</option><option value="weekdays">Valda veckodagar</option><option value="every_n_days">Var N:e dag</option><option value="as_needed">Vid behov</option></select></label>
    {value.frequency==="weekdays"&&<div className="flex flex-wrap gap-1.5">{weekdayNames.map((label,index)=><button type="button" key={label} onClick={()=>set({weekdays:value.weekdays.includes(index)?value.weekdays.filter(day=>day!==index):[...value.weekdays,index].sort()})} className={`min-h-9 rounded-full border px-3 text-xs ${value.weekdays.includes(index)?"border-primary bg-accent text-accent-foreground":"border-border text-muted-foreground"}`}>{label}</button>)}</div>}
    {value.frequency==="every_n_days"&&<div className="grid grid-cols-2 gap-3"><label className="text-xs text-muted-foreground">Var N:e dag<Input min={2} className="mt-1.5 h-11" type="number" value={value.everyNDays??2} onChange={e=>set({everyNDays:Math.max(2,Number(e.target.value))})}/></label><label className="text-xs text-muted-foreground">Startdatum<Input className="mt-1.5 h-11" type="date" value={value.anchorDate??""} onChange={e=>set({anchorDate:e.target.value||undefined})}/></label></div>}
    {value.frequency!=="as_needed"&&<div className="grid grid-cols-2 gap-3"><label className="text-xs text-muted-foreground">Tidsdel<select className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3" value={value.slot} onChange={e=>set({slot:e.target.value as Slot})}>{Object.entries(slotNames).filter(([key])=>key!=="as_needed").map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label className="text-xs text-muted-foreground">Klockslag<Input className="mt-1.5 h-11" type="time" value={value.time} onChange={e=>set({time:e.target.value})}/></label></div>}
    <details><summary className="min-h-11 cursor-pointer py-3 text-sm">Cykel <span className="text-muted-foreground">(valfritt)</span></summary><div className="grid grid-cols-3 gap-2"><label className="col-span-3 text-xs text-muted-foreground">Startdatum<Input className="mt-1.5 h-11" type="date" value={value.cycleStart??""} onChange={e=>set({cycleStart:e.target.value||undefined})}/></label><label className="text-xs text-muted-foreground">Veckor på<Input min={1} className="mt-1.5 h-11" type="number" value={value.weeksOn??""} onChange={e=>set({weeksOn:e.target.value?Number(e.target.value):undefined})}/></label><label className="text-xs text-muted-foreground">Veckor av<Input min={0} className="mt-1.5 h-11" type="number" value={value.weeksOff??""} onChange={e=>set({weeksOff:e.target.value?Number(e.target.value):undefined})}/></label></div></details>
  </div>;
}

function PeptidesView({ store, update, openPlanner, openSchedules, openInsights, canShare }: { store: PeptimeStore; update: React.Dispatch<React.SetStateAction<PeptimeStore>>; openPlanner: () => void; openSchedules: () => void; openInsights: (id: string) => void; canShare: boolean }) {
  const [editing,setEditing]=useState<Peptide|null>(null); const [editingGroup,setEditingGroup]=useState<MixGroupSchedule|null>(null); const [adding,setAdding]=useState(false); const active=store.peptides.filter(p=>!p.archived); const draft=editing??({...emptyPeptide,id:""} as Peptide); const validAmounts=draft.doseMcg>0&&draft.vialMg>0&&draft.waterMl>0; const units=validAmounts?syringeUnits(draft.doseMcg,draft.vialMg,draft.waterMl):0; const set=(part:Partial<Peptide>)=>setEditing({...draft,...part});
  const existingGroups = [...new Map([...store.mixGroups.map(group=>group.name),...store.peptides.flatMap(peptide=>peptide.mixGroupId?[peptide.mixGroupId]:[])].map(name=>[groupKey(name),name])).values()];
  const groupForDraft=store.mixGroups.find(group=>groupKey(group.name)===groupKey(draft.mixGroupId));
  const save=()=>{
    const typedGroup=draft.mixGroupId?.trim();
    const canonicalGroup=existingGroups.find(group=>groupKey(group)===groupKey(typedGroup))??typedGroup;
    const id=draft.id||uid();
    const vialId=draft.currentVialId||id;
    const item={...draft,id,currentVialId:vialId,shortCode:draft.shortCode||draft.name.slice(0,3),remainingMg:draft.id?draft.remainingMg:draft.vialMg,mixGroupId:canonicalGroup||undefined};
    update(s=>{
      const hasGroup=canonicalGroup&&s.mixGroups.some(group=>groupKey(group.name)===groupKey(canonicalGroup));
      const mixGroups=canonicalGroup&&!hasGroup?[...s.mixGroups,{name:canonicalGroup,...peptideSchedule(item)}]:s.mixGroups;
      const existingVial=s.vials.some(vial=>vial.id===vialId);
      const vials=existingVial?s.vials.map(vial=>vial.id===vialId?{...vial,initialMg:item.vialMg,remainingMg:item.remainingMg,waterMl:item.waterMl,beyondUseDays:item.beyondUseDays}:vial):[...s.vials,{id:vialId,peptideId:id,initialMg:item.vialMg,remainingMg:item.remainingMg,waterMl:item.waterMl,openedAt:new Date().toISOString(),reconstitutedAt:item.reconstitutedAt,beyondUseDays:item.beyondUseDays}];
      return {...s,mixGroups,vials,peptides:draft.id?s.peptides.map(p=>p.id===draft.id?item:p):[...s.peptides,item]};
    });
    setEditing(null);setAdding(false);
  };
  const addToday=(peptide:Peptide)=>{const date=stockholmDate();const key=`${date}:${scheduleTargetKey(peptide)}`;update(s=>({...s,todayAdditions:[...new Set([...s.todayAdditions,key])]}))};
  return <><PageHeader eyebrow="Dina ämnen" title="Peptider" action={<div className="flex gap-2"><Button size="icon" variant="outline" className="size-11 rounded-full" onClick={openSchedules} disabled={!canShare} title={canShare?"Öppna scheman":"Kräver uppkopplat konto"} aria-label="Öppna scheman"><CalendarDays/></Button><Button size="icon" variant="outline" className="size-11 rounded-full" onClick={openPlanner} aria-label="Öppna inköpsplan"><ShoppingCart/></Button><Button size="icon" className="size-11 rounded-full" onClick={()=>{setEditing({...emptyPeptide,id:""} as Peptide);setAdding(true)}} aria-label="Lägg till peptid"><Plus/></Button></div>}/>{active.length===0?<Card className="p-7 text-center"><FlaskConical className="mx-auto size-7 text-muted-foreground"/><p className="mt-4 font-medium">Inga peptider ännu</p><Button className="mt-5 h-11 rounded-xl" onClick={()=>{setEditing({...emptyPeptide,id:""} as Peptide);setAdding(true)}}>Lägg till peptid</Button></Card>:<div className="space-y-3">{active.map(p=>{const schedule=resolvedSchedule(p,store.mixGroups);const days=vialDaysLeft(p);const inventoryDays=inventoryDaysLeft(p,store);return <Card key={p.id} className="flex min-h-[84px] items-center gap-2 p-3"><button onClick={()=>setEditing(p)} className="flex min-h-[60px] min-w-0 flex-1 items-center gap-4 text-left"><ChemicalBadge items={[p]}/><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate font-medium">{p.name}</p>{p.example&&<span className="rounded bg-muted px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">Exempel</span>}</div><p className="mt-1 truncate text-sm text-muted-foreground">{n(p.doseMcg)} mcg · {p.route==="subcutaneous"?`${n(syringeUnits(p.doseMcg,p.vialMg,p.waterMl))} IU`:routeNames[p.route]} · {schedule.paused?"Pausad":schedule.frequency==="as_needed"?"Vid behov":`${slotNames[schedule.slot]} ${schedule.time}`}</p>{inventoryDays!==null&&inventoryDays<=15?<p className="mt-1 flex items-center gap-1 font-medium text-amber-700 dark:text-amber-200"><TriangleAlert className="size-3.5"/><span className="text-xs">Lågt lager · {inventoryDays===0?"slut":`ca ${inventoryDays} dagar kvar`}</span></p>:days!==null&&<p className={`mt-1 font-mono text-xs ${days<=0?"text-destructive":"text-muted-foreground"}`}>{days>0?`Vial · ${days} d kvar enligt din gräns`:"Vial · angiven gräns passerad"}</p>}</div><ChevronRight className="size-5 shrink-0 text-muted-foreground"/></button><Button variant="ghost" size="icon" className="size-11 shrink-0" onClick={()=>openInsights(p.id)} aria-label={`Visa kurvor för ${p.name}`}><BarChart3/></Button>{schedule.frequency==="as_needed"&&!schedule.paused&&<Button variant="outline" className="h-11 shrink-0 px-3 text-xs" onClick={()=>addToday(p)}>Lägg till idag</Button>}</Card>})}</div>}
    <Dialog open={!!editing} onOpenChange={open=>{if(!open){setEditing(null);setAdding(false)}}}><DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>{adding?"Lägg till peptid":"Peptidinställningar"}</DialogTitle><DialogDescription>Alla värden är dina egna logguppgifter.</DialogDescription></DialogHeader><div className="grid grid-cols-2 gap-3"><label className="col-span-2 text-xs text-muted-foreground">Namn<Input className="mt-1.5 h-11" value={draft.name} onChange={e=>set({name:e.target.value})} placeholder="Fritextnamn"/></label><label className="text-xs text-muted-foreground">Kortkod<Input className="mt-1.5 h-11 uppercase" maxLength={4} value={draft.shortCode} onChange={e=>set({shortCode:e.target.value.toLocaleUpperCase("sv-SE")})}/></label><label className="text-xs text-muted-foreground">Dos (mcg)<DecimalInput value={draft.doseMcg} onChange={doseMcg=>set({doseMcg})}/></label><div className="col-span-2"><p className="text-xs text-muted-foreground">Accentfärg</p><div className="mt-2 flex gap-2">{Object.entries(compoundColors).map(([color,value])=><button key={color} type="button" aria-label={compoundColorLabels[color]} aria-pressed={draft.color===color} onClick={()=>set({color})} style={{backgroundColor:value}} className={`size-11 rounded-full border-2 ${draft.color===color?"border-foreground":"border-transparent"}`}/>)}</div></div><label className="text-xs text-muted-foreground">Vial (mg)<DecimalInput value={draft.vialMg} onChange={vialMg=>set({vialMg})}/></label><label className="text-xs text-muted-foreground">BAC-vatten (ml)<DecimalInput value={draft.waterMl} onChange={waterMl=>set({waterMl})}/></label><label className="text-xs text-muted-foreground">Administrering<select className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3" value={draft.route} onChange={e=>set({route:e.target.value as Peptide["route"]})}><option value="subcutaneous">Subkutan</option><option value="intranasal">Intranasal</option><option value="oral">Oral</option><option value="topical">Topikal</option></select></label><div className="text-xs text-muted-foreground"><label>Mixgrupp<Input className="mt-1.5 h-11" value={draft.mixGroupId??""} onChange={e=>set({mixGroupId:e.target.value||undefined})} placeholder="Valfritt"/></label>{existingGroups.length>0&&<div className="mt-2 flex flex-wrap gap-1.5">{existingGroups.map(group=><button type="button" key={group} onClick={()=>set({mixGroupId:group})} className={`min-h-8 rounded-full border px-2.5 text-xs ${groupKey(draft.mixGroupId)===groupKey(group)?"border-primary bg-accent text-accent-foreground":"border-border text-muted-foreground"}`}>{group}</button>)}</div>}</div></div><div className="rounded-2xl bg-muted p-4"><p className="text-xs text-muted-foreground">Automatisk vialmatematik</p>{validAmounts?<><p className="mt-2 text-lg font-medium tabular-nums">{n(draft.vialMg/draft.waterMl)} mg/ml{draft.route==="subcutaneous"?` · ${n((draft.vialMg/draft.waterMl)*10)} mcg/IU`:""}</p><p className="mt-1 text-sm text-accent-foreground">{n(draft.doseMcg)} mcg{draft.route==="subcutaneous"?` = ${n(units)} IU`:" per dos"}</p></>:<p className="mt-2 text-sm text-muted-foreground">Fyll i dos, vial och BAC-vatten för att se uträkningen.</p>}</div>{draft.mixGroupId?<div className="rounded-2xl border border-border p-4"><p className="text-sm">Schemat styrs av mixgruppen {draft.mixGroupId}</p><Button type="button" variant="outline" className="mt-3 h-11 w-full" onClick={()=>setEditingGroup(groupForDraft??{name:draft.mixGroupId!,...peptideSchedule(draft)})}>Redigera gruppens schema</Button></div>:<ScheduleFields value={peptideSchedule(draft)} set={part=>set(part)}/>}<label className="flex min-h-12 items-center justify-between"><span className="text-sm">Fastande flagga</span><Switch checked={draft.fasted} onCheckedChange={v=>set({fasted:v})}/></label><label className="text-xs text-muted-foreground">Peptidanteckning<Textarea className="mt-1.5" value={draft.notes} onChange={e=>set({notes:e.target.value})} placeholder="Rekonstituering, egen påminnelse…"/></label>{draft.id&&<details className="rounded-2xl border border-border p-4"><summary className="cursor-pointer text-sm font-medium">Vialhistorik · {store.vials.filter(vial=>vial.peptideId===draft.id).length}</summary><div className="mt-3 space-y-2">{store.vials.filter(vial=>vial.peptideId===draft.id).sort((a,b)=>b.openedAt.localeCompare(a.openedAt)).map(vial=><div key={vial.id} className="flex justify-between gap-3 border-t border-border pt-2 text-xs"><span>{new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Stockholm",dateStyle:"medium"}).format(new Date(vial.openedAt))}{vial.closedAt?" · stängd":" · aktuell"}</span><span className="tabular-nums">{n(vial.remainingMg)} / {n(vial.initialMg)} mg</span></div>)}</div></details>}<Button disabled={!draft.name.trim()||!validAmounts} className="h-12" onClick={save}>Spara peptid</Button>{draft.id&&<><Button variant="outline" className="h-11" onClick={()=>{update(current=>openNewVial(current,draft.id));setEditing(null)}}><RotateCcw/> Öppna ny vial</Button><Button variant="ghost" className="h-11 text-muted-foreground" onClick={()=>{update(s=>({...s,peptides:s.peptides.map(p=>p.id===draft.id?{...p,archived:true}:p)}));setEditing(null)}}><Archive/> Arkivera</Button></>}</DialogContent></Dialog>
    <Dialog open={!!editingGroup} onOpenChange={open=>!open&&setEditingGroup(null)}><DialogContent className="max-h-[88dvh] overflow-y-auto"><DialogHeader><DialogTitle>Mixgrupp {editingGroup?.name}</DialogTitle><DialogDescription>Ett schema och en Ta dos för hela gruppen.</DialogDescription></DialogHeader>{editingGroup&&<ScheduleFields value={editingGroup} set={part=>setEditingGroup({...editingGroup,...part})}/>}<Button className="h-12" onClick={()=>{if(editingGroup)update(s=>({...s,mixGroups:[...s.mixGroups.filter(group=>groupKey(group.name)!==groupKey(editingGroup.name)),editingGroup]}));setEditingGroup(null)}}>Spara gruppschema</Button></DialogContent></Dialog>
  </>;
}

function CalendarView({ store, update, onBack }: { store: PeptimeStore; update: React.Dispatch<React.SetStateAction<PeptimeStore>>; onBack: () => void }) {
  const initialDate=stockholmDate();
  const [cursor,setCursor]=useState(new Date(`${initialDate}T12:00:00`));
  const [selected,setSelected]=useState(initialDate);
  const [retrospectiveNote,setRetrospectiveNote]=useState<DailyNote|null>(null);
  const [manualLogOpen,setManualLogOpen]=useState(false);
  const year=cursor.getFullYear(),month=cursor.getMonth();
  const first=new Date(year,month,1);
  const blanks=(first.getDay()+6)%7;
  const days=new Date(year,month+1,0).getDate();
  const cells=[...Array(blanks).fill(null),...Array.from({length:days},(_,i)=>i+1)];
  const iso=(day:number)=>`${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  const logsForDate=(date:string)=>store.logs.filter(log=>logScheduledDate(log,store.settings.dayBoundaryHour)===date);
  const dayLogs=logsForDate(selected);
  const dayNote=store.dailyNotes.find(value=>value.date===selected);
  const hasDayNote=hasWellbeingData(dayNote);
  const retrospectiveDates=[previousDate(initialDate),previousDate(previousDate(initialDate))];
  const canAddRetrospectiveNote=retrospectiveDates.includes(selected)&&!hasDayNote;
  const hasDayContent=dayLogs.length>0||hasDayNote;
  const statusForDate=(date:string)=>{const logs=logsForDate(date);const note=store.dailyNotes.find(value=>value.date===date);const due=store.peptides.filter(peptide=>isDueOn(peptide,store,date));return {complete:due.length>0&&due.every(peptide=>logs.some(log=>log.peptideId===peptide.id&&log.status==="taken")),skipped:logs.some(log=>log.status==="skipped"),noted:hasWellbeingData(note)}};
  const toggleRetrospectiveTag=(tag:string)=>setRetrospectiveNote(note=>note?{...note,tags:note.tags.includes(tag)?note.tags.filter(value=>value!==tag):[...note.tags,tag]}:note);
  const saveRetrospectiveNote=()=>{if(!retrospectiveNote||!hasWellbeingData(retrospectiveNote))return;update(s=>({...s,dailyNotes:[...s.dailyNotes.filter(note=>note.date!==retrospectiveNote.date),retrospectiveNote]}));setRetrospectiveNote(null)};
  return <><PageHeader eyebrow="Historik" title="Kalender" action={<Button variant="ghost" onClick={onBack}>Klar</Button>}/><Card className="p-4"><div className="mb-5 flex items-center justify-between"><Button variant="ghost" size="icon" onClick={()=>setCursor(new Date(year,month-1,1))}><ChevronLeft/></Button><p className="font-medium capitalize">{new Intl.DateTimeFormat("sv-SE",{month:"long",year:"numeric"}).format(cursor)}</p><Button variant="ghost" size="icon" onClick={()=>setCursor(new Date(year,month+1,1))}><ChevronRight/></Button></div><div className="grid grid-cols-7 text-center font-mono text-xs text-muted-foreground">{"M T O T F L S".split(" ").map((d,i)=><span key={i} className="py-2">{d}</span>)}{cells.map((day,i)=>{if(!day)return <span key={i}/>;const date=iso(day);const status=statusForDate(date);return <button key={i} aria-label={`${date}${status.complete?", alla planerade doser tagna":""}${status.skipped?", överhoppad dos":""}${status.noted?", mående registrerat":""}`} aria-pressed={selected===date} onClick={()=>setSelected(date)} className={`relative mx-auto grid size-11 place-items-center rounded-full border text-sm transition-colors ${selected===date?"border-primary bg-accent text-foreground":"border-transparent"}`}>{day}<span className="absolute bottom-0.5 flex gap-0.5">{status.complete&&<span className="size-1.5 rounded-full bg-primary"/>}{status.noted&&<span className="size-1.5 rounded-full bg-[#7f9fca]"/>}{status.skipped&&<span className="size-1.5 rounded-full bg-zinc-500"/>}</span></button>})}</div><div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-3 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-primary"/>Klart</span><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-[#7f9fca]"/>Anteckning</span><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-zinc-500"/>Överhoppat</span></div></Card><section className="mt-6"><h2 className="mb-3 font-mono text-xs font-medium">{selected}</h2>{!hasDayContent&&!canAddRetrospectiveNote?<p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Inga poster denna dag.</p>:hasDayContent?<Card className="divide-y divide-border">{dayLogs.map(l=><div key={l.id} className="flex min-h-14 items-center justify-between gap-3 px-4 text-sm"><span>{l.peptideName}</span><span className="text-right text-muted-foreground">{l.status==="taken"?`${n(l.actualDose)} ${l.unit}${l.computedIu>0?` · ${n(l.computedIu)} IU`:""}`:"Överhoppad"}<span className="ml-2 tabular-nums">{new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Stockholm",hour:"2-digit",minute:"2-digit"}).format(new Date(l.takenAt))}</span></span></div>)}{dayNote&&hasDayNote&&<div className="p-4"><p className="mb-2 text-xs font-semibold text-muted-foreground">Dagens mående</p>{wellbeingScales.some(scale=>dayNote[scale.key]!==undefined)&&<div className="mb-3 grid grid-cols-2 gap-2">{wellbeingScales.filter(scale=>dayNote[scale.key]!==undefined).map(scale=><div key={scale.key} className="rounded-xl bg-muted/50 p-2 text-xs"><span className="block text-muted-foreground">{scale.title}</span><strong className="mt-1 block">{dayNote[scale.key]} / 5</strong></div>)}</div>}{dayNote.tags.length>0&&<div className="mb-3 flex flex-wrap gap-1.5">{dayNote.tags.map(tag=><span key={tag} className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs">{tagLabel(tag)}</span>)}</div>}{dayNote.note&&<p className="text-sm leading-6">{dayNote.note}</p>}</div>}</Card>:null}{selected<=initialDate&&store.peptides.some(peptide=>!peptide.archived)&&<Button type="button" variant="outline" className="mt-3 h-12 w-full" onClick={()=>setManualLogOpen(true)}><Plus/> Logga dos i efterhand</Button>}{canAddRetrospectiveNote&&<Card className="mt-3 p-4"><div className="flex items-center justify-between gap-4"><div><p className="font-medium">Dagens mående saknas</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Kan fyllas i upp till två dagar efteråt.</p></div><Button variant="outline" className="shrink-0" onClick={()=>setRetrospectiveNote({date:selected,note:"",tags:[]})}>Fyll i</Button></div></Card>}</section>
    {manualLogOpen&&<ManualLogDialog open date={selected} store={store} update={update} onOpenChange={setManualLogOpen}/>}
    <Dialog open={!!retrospectiveNote} onOpenChange={open=>!open&&setRetrospectiveNote(null)}><DialogContent className="max-h-[88dvh] overflow-y-auto"><DialogHeader><DialogTitle>Hur mådde du?</DialogTitle><DialogDescription>{retrospectiveNote?.date} · fylls i i efterhand</DialogDescription></DialogHeader>{retrospectiveNote&&<div className="space-y-4">{wellbeingScales.map(scale=><WellbeingScale key={scale.key} scale={scale} value={retrospectiveNote[scale.key]} onChange={value=>setRetrospectiveNote(note=>note?{...note,[scale.key]:value}:note)}/>) }<div><p className="mb-2 text-[15px] font-semibold">Hur kändes dagen?</p><div className="flex flex-wrap gap-2">{[...dailyTags.map(tag=>tag.id),...store.settings.customDailyTags].map(tag=><button type="button" key={tag} aria-pressed={retrospectiveNote.tags.includes(tag)} onClick={()=>toggleRetrospectiveTag(tag)} className={`min-h-11 rounded-full px-3 text-[13px] transition-colors ${retrospectiveNote.tags.includes(tag)?"bg-primary text-primary-foreground":"bg-muted text-muted-foreground"}`}>{tagLabel(tag)}</button>)}</div></div><label className="text-sm font-medium">Anteckning <span className="font-normal text-muted-foreground">· valfritt</span><Textarea className="mt-2 resize-none" value={retrospectiveNote.note} onChange={event=>setRetrospectiveNote(note=>note?{...note,note:event.target.value}:note)} placeholder="Något du vill komma ihåg?"/></label><Button disabled={!hasWellbeingData(retrospectiveNote)} className="h-12 w-full" onClick={saveRetrospectiveNote}>Spara mående</Button></div>}</DialogContent></Dialog>
  </>;
}

export function PeptimeApp({ userEmail }: { userEmail?: string }) {
  const { store, update, ready, syncState, retrySync, syncError, pendingCount, conflicts, resolveConflict } = usePeptimeStore(); const [view,setView]=useState("today");
  const [, setClockDay] = useState(() => stockholmDate());
  const [insightPeptideId,setInsightPeptideId]=useState<string|null>(null);
  const [insightReturnView,setInsightReturnView]=useState<"peptides"|"insights">("peptides");
  const [calendarReturnView,setCalendarReturnView]=useState<"today"|"insights">("today");
  const openCalendar=(from:"today"|"insights")=>{setCalendarReturnView(from);setView("calendar")};
  const openPeptideInsights=(id:string,from:"peptides"|"insights")=>{setInsightPeptideId(id);setInsightReturnView(from);setView("peptide-insights")};
  useEffect(()=>{const media=window.matchMedia("(prefers-color-scheme: dark)");const apply=()=>{const mode=store.settings.themeMode??"system";document.documentElement.classList.toggle("dark",mode==="dark"||(mode==="system"&&media.matches))};apply();media.addEventListener("change",apply);return()=>media.removeEventListener("change",apply)},[store.settings.themeMode]);
  useEffect(()=>{const refresh=()=>setClockDay(previous=>{const next=stockholmDate();return next===previous?previous:next});const timer=window.setInterval(refresh,30_000);document.addEventListener("visibilitychange",refresh);return()=>{window.clearInterval(timer);document.removeEventListener("visibilitychange",refresh)}},[]);
  if(!ready)return syncState==="error"?<main className="grid min-h-dvh place-items-center bg-background p-5"><Card className="w-full max-w-[430px] p-6 text-center"><RotateCcw className="mx-auto size-7 text-muted-foreground"/><h1 className="mt-4 text-xl font-medium">Kunde inte hämta ditt konto</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Dina uppgifter är kvar. Peptime försöker ansluta igen automatiskt.</p>{syncError&&<p className="mt-3 break-words text-sm text-destructive">{syncError}</p>}<Button className="mt-5 h-12 w-full" onClick={retrySync}>Försök igen</Button></Card></main>:<div className="min-h-dvh bg-background"/>;
  if(!store.onboardingComplete)return <Onboarding store={store} update={update}/>;
  return <main className="mx-auto min-h-dvh w-full max-w-[500px] bg-background px-5 pb-24 sm:px-6 lg:max-w-[1080px] lg:pl-[260px] lg:pr-10 lg:pb-12">{cloudAvailable&&(syncState==="offline"||syncState==="error"||conflicts.length>0||pendingCount>0)&&<button type="button" onClick={()=>setView("settings")} className="relative z-10 mt-3 flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 text-left text-sm font-medium text-foreground"><span>{conflicts.length>0?`${conflicts.length} synkkonflikt${conflicts.length===1?"":"er"}`:syncState==="offline"?"Offline · sparat på enheten":syncState==="error"?"Synkfel · se inställningar":`${pendingCount} ändring${pendingCount===1?"":"ar"} väntar på synk`}</span><ChevronRight className="size-4 shrink-0"/></button>}{view==="today"&&<TodayView store={store} update={update} openCalendar={()=>openCalendar("today")}/>} {view==="log"&&<LogView store={store} update={update}/>} {view==="peptides"&&<PeptidesView store={store} update={update} openPlanner={()=>setView("planner")} openSchedules={()=>setView("schedule-sharing")} openInsights={id=>openPeptideInsights(id,"peptides")} canShare={cloudAvailable&&syncState!=="offline"}/>} {view==="peptide-insights"&&insightPeptideId&&store.peptides.find(peptide=>peptide.id===insightPeptideId)&&<PeptideInsights store={store} peptide={store.peptides.find(peptide=>peptide.id===insightPeptideId)!} onBack={()=>setView(insightReturnView)}/>} {view==="insights"&&<InsightsView store={store} onOpenPeptide={id=>openPeptideInsights(id,"insights")} onOpenCalendar={()=>openCalendar("insights")}/>} {view==="planner"&&<PurchasePlanner peptides={store.peptides} plans={store.purchasePlans} onChange={purchasePlans=>update(s=>({...s,purchasePlans}))} onBack={()=>setView("peptides")}/>} {view==="schedule-sharing"&&cloudAvailable&&<ScheduleSharing store={store} update={update} onBack={()=>setView("peptides")}/>} {view==="calendar"&&<CalendarView store={store} update={update} onBack={()=>setView(calendarReturnView)}/>} {view==="settings"&&<SettingsView store={store} update={update} syncState={syncState} retrySync={retrySync} syncError={syncError} pendingCount={pendingCount} conflicts={conflicts} resolveConflict={resolveConflict} userEmail={userEmail}/>}<BottomNav view={view==="peptide-insights"?insightReturnView:view==="calendar"?calendarReturnView:view} setView={setView}/></main>;
}
