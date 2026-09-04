"use client";

import { useEffect, useRef, useState } from "react";
import {
  Archive, Bell, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3,
  Download, FlaskConical, History, House, MoreHorizontal, Pencil, Plus, RotateCcw,
  Search, Settings, ShieldCheck, Sparkles, Syringe, Trash2, TriangleAlert, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { initialStore } from "@/lib/demo-data";
import { syringeUnits, type DoseLog, type MixGroupSchedule, type Peptide, type PeptimeStore, type Schedule, type Slot } from "@/lib/types";
import { displayLogDate, logScheduledDate, previousDate, stockholmDate, stockholmDateTimeInput, stockholmHour, stockholmLocalToIso } from "@/lib/log-day";
import { groupKey, isDueOn, peptideSchedule, resolvedSchedule, scheduleTargetKey } from "@/lib/schedule";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { loadRemoteStore, mergeStores, normalizeStoreIds, saveRemoteStore } from "@/lib/supabase/store";

const STORAGE_KEY = "peptime-demo-v1";
const APP_OPENED_AT = Date.now();
const slotNames: Record<Slot, string> = { morning: "Morgon", lunch: "Lunch", evening: "Kväll", as_needed: "Vid behov" };
const disclaimer = "Log what you want. Peptime contains no medical advice.";

function uid() { return crypto.randomUUID(); }
function n(value: number) { return new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 2 }).format(value); }
function massN(value: number) { return new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 4 }).format(value); }

function useStore() {
  const [store, setStore] = useState<PeptimeStore>(() => normalizeStoreIds(initialStore));
  const [ready, setReady] = useState(false);
  const [syncState, setSyncState] = useState<"local" | "syncing" | "synced" | "error">("local");
  const [hydrateAttempt, setHydrateAttempt] = useState(0);
  const [saveAttempt, setSaveAttempt] = useState(0);
  const clientRef = useRef<ReturnType<typeof createSupabaseBrowserClient> | null>(null);
  const userIdRef = useRef<string | null>(null);
  const skipFirstSync = useRef(false);
  const hydrateFailures = useRef(0);
  const saveFailures = useRef(0);
  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;
    async function hydrate() {
      const hasRemote = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
      if (!hasRemote) {
        try { const saved = localStorage.getItem(STORAGE_KEY); if (saved && !cancelled) setStore(normalizeStoreIds(JSON.parse(saved))); } catch {}
        if (!cancelled) setReady(true);
        return;
      }
      let cached: PeptimeStore | null = null;
      try {
        setSyncState("syncing");
        const client = createSupabaseBrowserClient();
        const { data } = await client.auth.getUser();
        if (!data.user) throw new Error("No authenticated Supabase user");
        clientRef.current = client;
        userIdRef.current = data.user.id;
        const scopedKey = `${STORAGE_KEY}:${data.user.id}`;
        const saved = localStorage.getItem(scopedKey) ?? localStorage.getItem(STORAGE_KEY);
        const local = saved ? normalizeStoreIds(JSON.parse(saved)) : normalizeStoreIds(initialStore);
        cached = saved ? local : null;
        const remote = await loadRemoteStore(client, local);
        let next = remote.store;
        const merged = mergeStores(remote.store, local);
        const hasLocalAdditions = merged.peptides.length > remote.store.peptides.length || merged.logs.length > remote.store.logs.length || merged.dailyNotes.length > remote.store.dailyNotes.length;
        if (saved && local.onboardingComplete && (!remote.hasData || hasLocalAdditions)) {
          setSyncState("syncing");
          next = await saveRemoteStore(client, data.user.id, remote.hasData ? merged : local);
          localStorage.removeItem(STORAGE_KEY);
          setSyncState("synced");
        } else {
          setSyncState(remote.hasData ? "synced" : "local");
        }
        if (!cancelled) {
          hydrateFailures.current = 0;
          skipFirstSync.current = true;
          setStore(next);
          setReady(true);
        }
      } catch (error) {
        console.error("Peptime Supabase hydration error", error);
        clientRef.current = null;
        userIdRef.current = null;
        if (!cancelled) {
          if (cached?.onboardingComplete) { setStore(cached); setReady(true); }
          else setReady(false);
          setSyncState("error");
          hydrateFailures.current += 1;
          const delay = Math.min(30000, 3000 * hydrateFailures.current);
          retryTimer = window.setTimeout(() => setHydrateAttempt(value => value + 1), delay);
        }
      }
    }
    hydrate();
    return () => { cancelled = true; if (retryTimer) window.clearTimeout(retryTimer); };
  }, [hydrateAttempt]);
  useEffect(() => {
    if (!ready) return;
    let retryTimer: number | undefined;
    const key = userIdRef.current ? `${STORAGE_KEY}:${userIdRef.current}` : STORAGE_KEY;
    localStorage.setItem(key, JSON.stringify(store));
    if (!clientRef.current || !userIdRef.current) return;
    if (skipFirstSync.current) { skipFirstSync.current = false; return; }
    const client = clientRef.current;
    const userId = userIdRef.current;
    const timer = window.setTimeout(async () => {
      try { setSyncState("syncing"); await saveRemoteStore(client, userId, store); saveFailures.current = 0; setSyncState("synced"); }
      catch (error) {
        console.error("Peptime Supabase sync error", error);
        setSyncState("error");
        saveFailures.current += 1;
        const delay = Math.min(30000, 3000 * saveFailures.current);
        retryTimer = window.setTimeout(() => setSaveAttempt(value => value + 1), delay);
      }
    }, 650);
    return () => { window.clearTimeout(timer); if (retryTimer) window.clearTimeout(retryTimer); };
  }, [ready, store, saveAttempt]);
  const retrySync = () => {
    if (clientRef.current && userIdRef.current && ready) setSaveAttempt(value => value + 1);
    else setHydrateAttempt(value => value + 1);
  };
  return [store, setStore, ready, syncState, retrySync] as const;
}

function PageHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: React.ReactNode }) {
  return <header className="mb-7 flex min-h-14 items-end justify-between gap-4"><div>{eyebrow && <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-foreground">{eyebrow}</p>}<h1 className="text-[30px] font-medium tracking-[-0.045em]">{title}</h1></div>{action}</header>;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-[20px] border border-border bg-card ${className}`}>{children}</div>;
}

function BottomNav({ view, setView }: { view: string; setView: (view: string) => void }) {
  const items = [[House, "today", "Idag"], [History, "log", "Logg"], [FlaskConical, "peptides", "Peptider"], [CalendarDays, "calendar", "Kalender"], [Settings, "settings", "Inställningar"]] as const;
  return <nav aria-label="Huvudnavigering" className="fixed inset-x-0 bottom-0 z-30 mx-auto flex h-[84px] max-w-[500px] items-start justify-around border-t border-border bg-background/95 px-1 pt-3 backdrop-blur-xl">
    {items.map(([Icon, key, label]) => <button key={key} aria-current={view === key ? "page" : undefined} onClick={() => setView(key)} className={`flex min-h-12 min-w-[58px] flex-col items-center justify-center gap-1 text-[10px] transition-colors ${view === key ? "text-foreground" : "text-muted-foreground"}`}><Icon className="size-[19px]" strokeWidth={view === key ? 2.3 : 1.7} />{label}</button>)}
  </nav>;
}

function Onboarding({ store, update }: { store: PeptimeStore; update: React.Dispatch<React.SetStateAction<PeptimeStore>> }) {
  const [step, setStep] = useState(0);
  const [examples, setExamples] = useState(true);
  const sampleUnits = syringeUnits(100, 10, 2);
  const finish = () => update(s => ({ ...s, peptides: examples ? s.peptides : [], mixGroups: examples ? s.mixGroups : [], onboardingComplete: true }));
  return <div className="fixed inset-0 z-50 grid place-items-center bg-background p-5"><div className="w-full max-w-[430px]">
    <div className="mb-10 flex items-center justify-between"><span className="text-sm font-semibold tracking-[0.16em]">PEPTIME</span><span className="text-xs text-muted-foreground">{step + 1} / 4</span></div>
    <div className="mb-8 flex gap-1.5">{[0,1,2,3].map(i => <span key={i} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />)}</div>
    {step === 0 && <><div className="mb-6 grid size-14 place-items-center rounded-2xl bg-accent text-accent-foreground"><ShieldCheck className="size-7" /></div><h1 className="text-3xl font-medium tracking-[-.04em]">Din privata forskningslogg</h1><p className="mt-4 leading-7 text-muted-foreground">Peptime hjälper dig hålla koll på dina peptider!</p><Card className="mt-7 p-4"><p className="text-sm leading-6">{disclaimer}</p></Card></>}
    {step === 1 && <><p className="text-xs font-semibold uppercase tracking-[.17em] text-accent-foreground">Spruta</p><h1 className="mt-2 text-3xl font-medium tracking-[-.04em]">Vad använder du?</h1><p className="mt-3 text-muted-foreground">IU visas alltid för injicerbara poster.</p><div className="mt-7 grid gap-3">{["U-100 1 ml", "U-100 0.5 ml"].map(s => <button key={s} onClick={() => update(v => ({...v, settings: {...v.settings, syringe: s as PeptimeStore["settings"]["syringe"]}}))} className={`flex min-h-16 items-center justify-between rounded-2xl border px-5 text-left ${store.settings.syringe === s ? "border-primary bg-accent/40" : "border-border bg-card"}`}><span>{s}</span>{store.settings.syringe === s && <CheckCircle2 className="size-5 text-primary" />}</button>)}</div></>}
    {step === 2 && <><p className="text-xs font-semibold uppercase tracking-[.17em] text-accent-foreground">Vialmatematik</p><h1 className="mt-2 text-3xl font-medium tracking-[-.04em]">Dina värden, tydligt</h1><Card className="mt-7 overflow-hidden"><div className="grid grid-cols-2 divide-x divide-border"><div className="p-4"><span className="text-xs text-muted-foreground">Vial</span><p className="mt-1 text-xl tabular-nums">10 mg</p></div><div className="p-4"><span className="text-xs text-muted-foreground">BAC-vatten</span><p className="mt-1 text-xl tabular-nums">2 ml</p></div></div><div className="border-t border-border bg-muted/50 p-5"><p className="text-sm text-muted-foreground">10 mg + 2 ml = 50 mcg per IU</p><p className="mt-3 text-2xl font-medium tabular-nums">100 mcg = {n(sampleUnits)} IU</p></div></Card><label className="mt-6 flex min-h-14 items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4"><span><span className="block text-sm">Lägg till exempelpeptider</span><span className="text-xs text-muted-foreground">Tydligt märkta och lätta att ta bort</span></span><Switch checked={examples} onCheckedChange={setExamples} /></label></>}
    {step === 3 && <><div className="mb-6 grid size-14 place-items-center rounded-2xl bg-accent text-accent-foreground"><Sparkles className="size-7" /></div><h1 className="text-3xl font-medium tracking-[-.04em]">Redo när du är</h1><p className="mt-4 leading-7 text-muted-foreground">Öppna appen och tryck Ta dos. Du kan välja plats direkt efteråt eller hoppa över platsen.</p><Card className="mt-7 p-5"><p className="text-sm text-muted-foreground">Standard</p><p className="mt-2">{store.settings.syringe} · Europe/Stockholm · Mörkt tema</p></Card></>}
    <div className="mt-10 flex gap-3">{step > 0 && <Button variant="outline" className="h-14 flex-1 rounded-2xl" onClick={() => setStep(step - 1)}>Tillbaka</Button>}<Button className="h-14 flex-[2] rounded-2xl text-base" onClick={() => step < 3 ? setStep(step + 1) : finish()}>{step < 3 ? "Fortsätt" : "Öppna Peptime"}</Button></div>
  </div></div>;
}

function TodayView({ store, update }: { store: PeptimeStore; update: React.Dispatch<React.SetStateAction<PeptimeStore>> }) {
  type LogTarget = { items: Peptide[]; scheduledDate: string; carryover: boolean };
  const today = stockholmDate();
  const yesterday = previousDate(today);
  const [siteTarget, setSiteTarget] = useState<LogTarget | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<LogTarget | null>(null);
  const [adjustDose, setAdjustDose] = useState(0);
  const [undoIds, setUndoIds] = useState<string[]>([]);
  const note = store.dailyNotes.find(v => v.date === today)?.note ?? "";
  const loggedIdsFor = (date:string) => new Set(store.logs.filter(log => logScheduledDate(log,store.settings.dayBoundaryHour)===date).map(log=>log.peptideId));
  const loggedToday = loggedIdsFor(today);
  const done = store.peptides.filter(p => !p.archived && loggedToday.has(p.id));
  const groupsFor = (date:string,carryover:boolean) => {
    const loggedIds=loggedIdsFor(date);
    const due=store.peptides.filter(peptide=>isDueOn(peptide,store,date)&&!loggedIds.has(peptide.id));
    const map = new Map<string, Peptide[]>();
    due.forEach(p => { const group = groupKey(p.mixGroupId); const key = group ? `group:${group}` : p.id; map.set(key, [...(map.get(key) ?? []), p]); });
    return [...map.values()].sort((a,b) => {const aSchedule=resolvedSchedule(a[0],store.mixGroups),bSchedule=resolvedSchedule(b[0],store.mixGroups);return (aSchedule.frequency==="as_needed"?"99:99":aSchedule.time).localeCompare(bSchedule.frequency==="as_needed"?"99:99":bSchedule.time)}).map(items=>({items,scheduledDate:date,carryover}));
  };
  const groups = [...(stockholmHour()<12?groupsFor(yesterday,true):[]),...groupsFor(today,false)];
  const saveLogs = (target: LogTarget, status: "taken" | "skipped", site?: string, actual?: number) => {
    const {items,scheduledDate}=target;
    const now = new Date().toISOString();
    const newLogs: DoseLog[] = items.map(p => ({ id: uid(), peptideId: p.id, peptideName: p.name, plannedDose: p.doseMcg, actualDose: actual ?? p.doseMcg, unit: "mcg", computedIu: syringeUnits(actual ?? p.doseMcg, p.vialMg, p.waterMl), slot: resolvedSchedule(p,store.mixGroups).slot, takenAt: now, scheduledDate, status, site, mixGroupId: p.mixGroupId, note: "" }));
    update(s => ({ ...s, logs: [...newLogs, ...s.logs], peptides: s.peptides.map(p => items.some(i => i.id === p.id) && status === "taken" ? {...p, remainingMg: Math.max(0, p.remainingMg - ((actual ?? p.doseMcg) / 1000)), lastSite: site ?? p.lastSite } : p) }));
    setUndoIds(newLogs.map(l => l.id)); window.setTimeout(() => setUndoIds([]), 30000);
  };
  const undo = () => { update(s => {const removed=s.logs.filter(log=>undoIds.includes(log.id)&&log.status==="taken");return {...s,logs:s.logs.filter(log=>!undoIds.includes(log.id)),peptides:s.peptides.map(peptide=>{const restored=removed.filter(log=>log.peptideId===peptide.id).reduce((sum,log)=>sum+(log.unit==="mg"?log.actualDose:log.actualDose/1000),0);return restored?{...peptide,remainingMg:Math.min(peptide.vialMg,peptide.remainingMg+restored)}:peptide})}}); setUndoIds([]); };
  const dateText = displayLogDate(today, { weekday: "long", day: "numeric", month: "long" });
  const nowTime = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(".",":");
  const saveNote = (value: string) => update(s => ({...s, dailyNotes: [...s.dailyNotes.filter(v => v.date !== today), {date: today, note: value}]}));
  return <>
    <PageHeader eyebrow="Peptime" title="Idag" action={<div className="rounded-full border border-border bg-card px-3 py-2 text-xs text-muted-foreground"><span className="mr-1 text-foreground">5</span> dagar loggade</div>} />
    <p className="-mt-6 mb-8 text-sm capitalize text-muted-foreground">{dateText}</p>
    {groups.length === 0 && done.length === 0 && <Card className="p-7 text-center"><CheckCircle2 className="mx-auto size-7 text-primary"/><p className="mt-4 font-medium">Inget planerat idag</p><p className="mt-2 text-sm text-muted-foreground">Dagens schema är tomt.</p></Card>}
    <div className="space-y-7">{groups.map(target => { const {items,carryover,scheduledDate}=target; const first = items[0]; const schedule=resolvedSchedule(first,store.mixGroups); const late=carryover||(schedule.frequency!=="as_needed"&&nowTime>schedule.time); const totalIu = items.reduce((sum,p) => sum + syringeUnits(p.doseMcg,p.vialMg,p.waterMl),0); const isMix = items.length > 1; const massUnit=store.settings.massDisplayUnit; const massDose=(peptide:Peptide)=>`${massN(massUnit==="mg"?peptide.doseMcg/1000:peptide.doseMcg)} ${massUnit}`; const massDoseLine=isMix?items.map(massDose).join(" + "):massDose(first); const expired = first.reconstitutedAt ? (APP_OPENED_AT - new Date(first.reconstitutedAt).getTime()) / 86400000 > first.beyondUseDays : false; return <section key={`${scheduledDate}-${items.map(i=>i.id).join("-")}`}>
      <div className="mb-3 flex items-center justify-between"><h2 className={`text-sm font-medium ${carryover?"text-accent-foreground":""}`}>{carryover?`Från igår · ${slotNames[schedule.slot]}`:slotNames[schedule.slot]}</h2><span className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground"><Clock3 className="size-3.5" /> {schedule.frequency==="as_needed"?"Manuell":schedule.time}</span></div>
      <Card className="overflow-hidden p-5 shadow-[0_12px_36px_rgba(0,0,0,.12)]">
        <div className="mb-5 flex items-start gap-3"><div className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-xs font-semibold text-accent-foreground">{isMix ? items.map(i=>i.shortCode[0]).join("+") : first.shortCode}</div><div className="min-w-0 flex-1"><p className="font-medium">{items.map(i=>i.name).join(" + ")}</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] ${late?"bg-destructive/10 text-destructive":"bg-muted text-muted-foreground"}`}>{late?"Sen":"Kommande"}</span></div>
        {expired && <div className="mb-4 flex gap-2 rounded-xl bg-destructive/10 p-3 text-xs text-destructive"><TriangleAlert className="size-4 shrink-0" /> Bortom angiven användningstid. Kontrollera dina vialuppgifter.</div>}
        <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-muted/70 px-4 py-4"><span className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground"><Syringe className="size-4" /> {isMix ? "En spruta" : "U-100"}</span><span className="min-w-0 text-right tabular-nums"><strong className="block text-2xl font-medium leading-none">{isMix ? `${items.map(i=>`${n(syringeUnits(i.doseMcg,i.vialMg,i.waterMl))} IU`).join(" + ")} → ${n(totalIu)} IU` : `${n(totalIu)} IU`}</strong><span className="mt-2 block text-base font-medium leading-none text-foreground/85">{massDoseLine}</span></span></div>
        <p className="mb-4 flex items-center gap-2 text-xs text-muted-foreground"><FlaskConical className="size-3.5" /> Kvar: {items.map(i=>`${i.shortCode} ${n(i.remainingMg)} mg`).join(" · ")}</p>
        <Button className="h-14 w-full rounded-2xl text-base font-semibold" onClick={() => first.route === "subcutaneous" ? setSiteTarget(target) : saveLogs(target,"taken")}><Check className="size-5" /> Ta dos</Button>
        <div className="mt-2 grid grid-cols-2 gap-2"><Button className="h-11 rounded-xl text-muted-foreground" variant="ghost" onClick={() => saveLogs(target,"skipped")}>Hoppa över</Button><Button className="h-11 rounded-xl text-muted-foreground" variant="ghost" onClick={() => {setAdjustTarget(target);setAdjustDose(first.doseMcg)}}>Justera en gång</Button></div>
      </Card>
    </section>})}</div>
    {done.length > 0 && <section className="mt-8"><h2 className="mb-3 text-sm font-medium text-muted-foreground">Klart</h2><Card className="divide-y divide-border">{done.map(p => { const log = store.logs.find(l=>l.peptideId===p.id && logScheduledDate(l,store.settings.dayBoundaryHour)===today); return <div key={p.id} className="flex min-h-14 items-center gap-3 px-4 text-sm"><CheckCircle2 className="size-5 text-primary"/><span className="flex-1 text-muted-foreground">{p.name}</span><span className="tabular-nums text-muted-foreground">{log?.status === "skipped" ? "Överhoppad" : `${n(log?.computedIu ?? 0)} IU`}</span></div>})}</Card></section>}
    {undoIds.length > 0 && <button onClick={undo} className="fixed bottom-24 left-1/2 z-40 flex min-h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-5 text-sm text-background shadow-xl"><RotateCcw className="size-4"/> Ångra</button>}
    <section className="mt-9"><label htmlFor="daily-note" className="mb-3 block text-sm font-medium">Dagens anteckning</label><Textarea id="daily-note" value={note} onChange={e=>saveNote(e.target.value)} placeholder="Sömn, energi, humör, biverkningar…" className="min-h-28 resize-none rounded-2xl bg-card p-4 text-base"/><p className="mt-2 text-right text-[11px] text-muted-foreground">Sparas automatiskt</p></section>
    <Dialog open={!!siteTarget} onOpenChange={open=>!open&&setSiteTarget(null)}><DialogContent className="bottom-0 top-auto max-w-[480px] translate-y-0 rounded-b-none rounded-t-[26px] p-5"><DialogHeader><DialogTitle>Injektionsplats</DialogTitle><DialogDescription>Valfritt. Senast använd: {siteTarget?.items[0]?.lastSite ?? "ingen"}</DialogDescription></DialogHeader><div className="grid grid-cols-2 gap-2">{(siteTarget?.items[0]?.sites ?? ["Buk vänster","Buk höger","Lår vänster","Lår höger","Annat"]).map(site=><Button key={site} variant="outline" className="h-13 rounded-xl" onClick={()=>{if(siteTarget)saveLogs(siteTarget,"taken",site);setSiteTarget(null)}}>{site}</Button>)}</div><Button variant="ghost" className="h-12" onClick={()=>{if(siteTarget)saveLogs(siteTarget,"taken");setSiteTarget(null)}}>Ingen plats</Button></DialogContent></Dialog>
    <Dialog open={!!adjustTarget} onOpenChange={open=>!open&&setAdjustTarget(null)}><DialogContent><DialogHeader><DialogTitle>Justera endast denna dos</DialogTitle><DialogDescription>Detta ändrar inte protokollet.</DialogDescription></DialogHeader><label className="text-xs text-muted-foreground">Faktisk dos (mcg)<Input className="mt-2 h-12" type="number" value={adjustDose} onChange={e=>setAdjustDose(Number(e.target.value))}/></label><div className="rounded-xl bg-muted p-3 text-sm">{n(adjustDose)} mcg = {n(syringeUnits(adjustDose,adjustTarget?.items[0]?.vialMg??1,adjustTarget?.items[0]?.waterMl??1))} IU per post</div><Button className="h-12" onClick={()=>{if(adjustTarget)saveLogs(adjustTarget,"taken",undefined,adjustDose);setAdjustTarget(null)}}>Logga justerad dos</Button></DialogContent></Dialog>
  </>;
}

function LogView({ store, update }: { store: PeptimeStore; update: React.Dispatch<React.SetStateAction<PeptimeStore>> }) {
  const [query,setQuery]=useState(""); const [date,setDate]=useState(""); const [edit,setEdit]=useState<DoseLog|null>(null);
  const logs=store.logs.filter(l=>(!query||l.peptideName.toLowerCase().includes(query.toLowerCase()))&&(!date||logScheduledDate(l,store.settings.dayBoundaryHour)===date)).sort((a,b)=>b.takenAt.localeCompare(a.takenAt));
  return <><PageHeader eyebrow="Historik" title="Logg"/><div className="mb-6 grid grid-cols-[1fr_142px] gap-2"><div className="relative"><Search className="absolute left-3 top-3.5 size-4 text-muted-foreground"/><Input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Peptid" className="h-11 pl-9"/></div><Input type="date" value={date} onChange={e=>setDate(e.target.value)} className="h-11"/></div>{logs.length===0?<Card className="p-7 text-center"><History className="mx-auto size-7 text-muted-foreground"/><p className="mt-4 font-medium">Ingen historik ännu</p><p className="mt-2 text-sm text-muted-foreground">Loggade och överhoppade doser visas här.</p></Card>:<div className="space-y-3">{logs.map(log=>{const scheduledDate=logScheduledDate(log,store.settings.dayBoundaryHour);const takenDate=stockholmDate(log.takenAt);return <Card key={log.id} className="p-4"><div className="flex items-start gap-3"><div className={`mt-0.5 grid size-9 place-items-center rounded-full ${log.status==="taken"?"bg-accent text-accent-foreground":"bg-muted text-muted-foreground"}`}>{log.status==="taken"?<Check className="size-4"/>:<X className="size-4"/>}</div><div className="min-w-0 flex-1"><div className="flex justify-between gap-3"><p className="font-medium">{log.peptideName}</p><span className="text-xs tabular-nums text-muted-foreground">{new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Stockholm",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(log.takenAt))}</span></div><p className="mt-1 text-sm text-muted-foreground">{log.status==="taken"?`${n(log.actualDose)} ${log.unit} · ${n(log.computedIu)} IU${log.site?` · ${log.site}`:""}`:"Överhoppad"}</p>{scheduledDate!==takenDate&&<p className="mt-1 text-xs text-accent-foreground">Hör till schemat {scheduledDate}</p>}</div><Button variant="ghost" size="icon" aria-label="Redigera logg" onClick={()=>setEdit({...log,scheduledDate})}><MoreHorizontal/></Button></div></Card>})}</div>}
    <Dialog open={!!edit} onOpenChange={open=>!open&&setEdit(null)}><DialogContent><DialogHeader><DialogTitle>Redigera logg</DialogTitle><DialogDescription>{edit?.peptideName}</DialogDescription></DialogHeader><div className="grid grid-cols-2 gap-3"><label className="text-xs text-muted-foreground">Schemalagd dag<Input type="date" className="mt-2 h-11" value={edit?.scheduledDate??""} onChange={e=>{if(e.target.value)setEdit(v=>v?{...v,scheduledDate:e.target.value}:v)}}/></label><label className="text-xs text-muted-foreground">Faktisk tid<Input type="datetime-local" className="mt-2 h-11" value={edit?stockholmDateTimeInput(edit.takenAt):""} onChange={e=>{if(e.target.value)setEdit(v=>v?{...v,takenAt:stockholmLocalToIso(e.target.value)}:v)}}/></label></div><label className="text-xs text-muted-foreground">Faktisk dos<Input type="number" className="mt-2 h-11" value={edit?.actualDose??0} onChange={e=>setEdit(v=>v?{...v,actualDose:Number(e.target.value)}:v)}/></label><label className="text-xs text-muted-foreground">Anteckning<Textarea className="mt-2" value={edit?.note??""} onChange={e=>setEdit(v=>v?{...v,note:e.target.value}:v)}/></label><Button className="h-11" onClick={()=>{if(edit)update(s=>({...s,logs:s.logs.map(l=>l.id===edit.id?edit:l)}));setEdit(null)}}><Pencil/> Spara</Button><Button variant="destructive" className="h-11" onClick={()=>{if(edit)update(s=>({...s,logs:s.logs.filter(l=>l.id!==edit.id)}));setEdit(null)}}><Trash2/> Ta bort</Button></DialogContent></Dialog>
  </>;
}

const emptyPeptide: Omit<Peptide,"id"> = { name:"",shortCode:"",color:"teal",doseMcg:100,vialMg:10,waterMl:2,remainingMg:10,route:"subcutaneous",slot:"evening",time:"21:00",frequency:"daily",weekdays:[0,1,2,3,4,5,6],paused:false,fasted:false,fastedNote:"",beyondUseDays:28,sites:["Buk vänster","Buk höger","Lår vänster","Lår höger","Annat"],notes:"",archived:false,example:false };

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

function PeptidesView({ store, update }: { store: PeptimeStore; update: React.Dispatch<React.SetStateAction<PeptimeStore>> }) {
  const [editing,setEditing]=useState<Peptide|null>(null); const [editingGroup,setEditingGroup]=useState<MixGroupSchedule|null>(null); const [adding,setAdding]=useState(false); const active=store.peptides.filter(p=>!p.archived); const draft=editing??({...emptyPeptide,id:""} as Peptide); const units=syringeUnits(draft.doseMcg,draft.vialMg,draft.waterMl); const set=(part:Partial<Peptide>)=>setEditing({...draft,...part});
  const existingGroups = [...new Map([...store.mixGroups.map(group=>group.name),...store.peptides.flatMap(peptide=>peptide.mixGroupId?[peptide.mixGroupId]:[])].map(name=>[groupKey(name),name])).values()];
  const groupForDraft=store.mixGroups.find(group=>groupKey(group.name)===groupKey(draft.mixGroupId));
  const save=()=>{const typedGroup=draft.mixGroupId?.trim();const canonicalGroup=existingGroups.find(group=>groupKey(group)===groupKey(typedGroup))??typedGroup;const item={...draft,id:draft.id||uid(),shortCode:draft.shortCode||draft.name.slice(0,3),remainingMg:draft.id?draft.remainingMg:draft.vialMg,mixGroupId:canonicalGroup||undefined};update(s=>{const hasGroup=canonicalGroup&&s.mixGroups.some(group=>groupKey(group.name)===groupKey(canonicalGroup));const mixGroups=canonicalGroup&&!hasGroup?[...s.mixGroups,{name:canonicalGroup,...peptideSchedule(item)}]:s.mixGroups;return {...s,mixGroups,peptides:draft.id?s.peptides.map(p=>p.id===draft.id?item:p):[...s.peptides,item]}});setEditing(null);setAdding(false)};
  const addToday=(peptide:Peptide)=>{const date=stockholmDate();const key=`${date}:${scheduleTargetKey(peptide)}`;update(s=>({...s,todayAdditions:[...new Set([...s.todayAdditions,key])]}))};
  return <><PageHeader eyebrow="Dina ämnen" title="Peptider" action={<Button size="icon" className="size-11 rounded-full" onClick={()=>{setEditing({...emptyPeptide,id:""} as Peptide);setAdding(true)}} aria-label="Lägg till peptid"><Plus/></Button>}/>{active.length===0?<Card className="p-7 text-center"><FlaskConical className="mx-auto size-7 text-muted-foreground"/><p className="mt-4 font-medium">Inga peptider ännu</p><Button className="mt-5 h-11 rounded-xl" onClick={()=>{setEditing({...emptyPeptide,id:""} as Peptide);setAdding(true)}}>Lägg till peptid</Button></Card>:<div className="space-y-3">{active.map(p=>{const schedule=resolvedSchedule(p,store.mixGroups);return <Card key={p.id} className="flex min-h-[84px] items-center gap-2 p-3"><button onClick={()=>setEditing(p)} className="flex min-h-[60px] min-w-0 flex-1 items-center gap-4 text-left"><div className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-xs font-semibold text-accent-foreground">{p.shortCode}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate font-medium">{p.name}</p>{p.example&&<span className="rounded bg-muted px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">Exempel</span>}</div><p className="mt-1 truncate text-sm text-muted-foreground">{n(p.doseMcg)} mcg · {n(syringeUnits(p.doseMcg,p.vialMg,p.waterMl))} IU · {schedule.paused?"Pausad":schedule.frequency==="as_needed"?"Vid behov":`${slotNames[schedule.slot]} ${schedule.time}`}</p></div><ChevronRight className="size-5 shrink-0 text-muted-foreground"/></button>{schedule.frequency==="as_needed"&&!schedule.paused&&<Button variant="outline" className="h-11 shrink-0 px-3 text-xs" onClick={()=>addToday(p)}>Lägg till idag</Button>}</Card>})}</div>}
    <Dialog open={!!editing} onOpenChange={open=>{if(!open){setEditing(null);setAdding(false)}}}><DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>{adding?"Lägg till peptid":"Peptidinställningar"}</DialogTitle><DialogDescription>Alla värden är dina egna logguppgifter.</DialogDescription></DialogHeader><div className="grid grid-cols-2 gap-3"><label className="col-span-2 text-xs text-muted-foreground">Namn<Input className="mt-1.5 h-11" value={draft.name} onChange={e=>set({name:e.target.value})} placeholder="Fritextnamn"/></label><label className="text-xs text-muted-foreground">Kortkod<Input className="mt-1.5 h-11" value={draft.shortCode} onChange={e=>set({shortCode:e.target.value})}/></label><label className="text-xs text-muted-foreground">Dos (mcg)<Input className="mt-1.5 h-11" type="number" value={draft.doseMcg} onChange={e=>set({doseMcg:Number(e.target.value)})}/></label><label className="text-xs text-muted-foreground">Vial (mg)<Input className="mt-1.5 h-11" type="number" value={draft.vialMg} onChange={e=>set({vialMg:Number(e.target.value)})}/></label><label className="text-xs text-muted-foreground">BAC-vatten (ml)<Input className="mt-1.5 h-11" type="number" value={draft.waterMl} onChange={e=>set({waterMl:Number(e.target.value)})}/></label><label className="text-xs text-muted-foreground">Administrering<select className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3" value={draft.route} onChange={e=>set({route:e.target.value as Peptide["route"]})}><option value="subcutaneous">Subkutan</option><option value="intranasal">Intranasal</option><option value="oral">Oral</option><option value="topical">Topikal</option></select></label><div className="text-xs text-muted-foreground"><label>Mixgrupp<Input className="mt-1.5 h-11" value={draft.mixGroupId??""} onChange={e=>set({mixGroupId:e.target.value||undefined})} placeholder="Valfritt"/></label>{existingGroups.length>0&&<div className="mt-2 flex flex-wrap gap-1.5">{existingGroups.map(group=><button type="button" key={group} onClick={()=>set({mixGroupId:group})} className={`min-h-8 rounded-full border px-2.5 text-[11px] ${groupKey(draft.mixGroupId)===groupKey(group)?"border-primary bg-accent text-accent-foreground":"border-border text-muted-foreground"}`}>{group}</button>)}</div>}</div></div><div className="rounded-2xl bg-muted p-4"><p className="text-xs text-muted-foreground">Automatisk vialmatematik</p><p className="mt-2 text-lg font-medium tabular-nums">{n(draft.vialMg/draft.waterMl)} mg/ml · {n((draft.vialMg/draft.waterMl)*10)} mcg/IU</p><p className="mt-1 text-sm text-accent-foreground">{n(draft.doseMcg)} mcg = {n(units)} IU</p></div>{draft.mixGroupId?<div className="rounded-2xl border border-border p-4"><p className="text-sm">Schemat styrs av mixgruppen {draft.mixGroupId}</p><Button type="button" variant="outline" className="mt-3 h-11 w-full" onClick={()=>setEditingGroup(groupForDraft??{name:draft.mixGroupId!,...peptideSchedule(draft)})}>Redigera gruppens schema</Button></div>:<ScheduleFields value={peptideSchedule(draft)} set={part=>set(part)}/>}<label className="flex min-h-12 items-center justify-between"><span className="text-sm">Fastande flagga</span><Switch checked={draft.fasted} onCheckedChange={v=>set({fasted:v})}/></label><label className="text-xs text-muted-foreground">Peptidanteckning<Textarea className="mt-1.5" value={draft.notes} onChange={e=>set({notes:e.target.value})} placeholder="Rekonstituering, egen påminnelse…"/></label><Button disabled={!draft.name.trim()} className="h-12" onClick={save}>Spara peptid</Button>{draft.id&&<><Button variant="outline" className="h-11" onClick={()=>set({remainingMg:draft.vialMg,reconstitutedAt:new Date().toISOString()})}><RotateCcw/> Öppnade ny vial</Button><Button variant="ghost" className="h-11 text-muted-foreground" onClick={()=>{update(s=>({...s,peptides:s.peptides.map(p=>p.id===draft.id?{...p,archived:true}:p)}));setEditing(null)}}><Archive/> Arkivera</Button></>}</DialogContent></Dialog>
    <Dialog open={!!editingGroup} onOpenChange={open=>!open&&setEditingGroup(null)}><DialogContent className="max-h-[88dvh] overflow-y-auto"><DialogHeader><DialogTitle>Mixgrupp {editingGroup?.name}</DialogTitle><DialogDescription>Ett schema och en Ta dos för hela gruppen.</DialogDescription></DialogHeader>{editingGroup&&<ScheduleFields value={editingGroup} set={part=>setEditingGroup({...editingGroup,...part})}/>}<Button className="h-12" onClick={()=>{if(editingGroup)update(s=>({...s,mixGroups:[...s.mixGroups.filter(group=>groupKey(group.name)!==groupKey(editingGroup.name)),editingGroup]}));setEditingGroup(null)}}>Spara gruppschema</Button></DialogContent></Dialog>
  </>;
}

function CalendarView({ store }: { store: PeptimeStore }) {
  const initialDate=stockholmDate(); const [cursor,setCursor]=useState(new Date(`${initialDate}T12:00:00`)); const [selected,setSelected]=useState(initialDate); const year=cursor.getFullYear(),month=cursor.getMonth(); const first=new Date(year,month,1); const blanks=(first.getDay()+6)%7; const days=new Date(year,month+1,0).getDate(); const cells=[...Array(blanks).fill(null),...Array.from({length:days},(_,i)=>i+1)]; const iso=(day:number)=>`${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`; const dayLogs=store.logs.filter(l=>logScheduledDate(l,store.settings.dayBoundaryHour)===selected); const dayNote=store.dailyNotes.find(v=>v.date===selected)?.note;
  return <><PageHeader eyebrow="Översikt" title="Kalender"/><Card className="p-4"><div className="mb-5 flex items-center justify-between"><Button variant="ghost" size="icon" onClick={()=>setCursor(new Date(year,month-1,1))}><ChevronLeft/></Button><p className="font-medium capitalize">{new Intl.DateTimeFormat("sv-SE",{month:"long",year:"numeric"}).format(cursor)}</p><Button variant="ghost" size="icon" onClick={()=>setCursor(new Date(year,month+1,1))}><ChevronRight/></Button></div><div className="grid grid-cols-7 text-center text-[11px] text-muted-foreground">{"M T O T F L S".split(" ").map((d,i)=><span key={i} className="py-2">{d}</span>)}{cells.map((day,i)=>day?<button key={i} onClick={()=>setSelected(iso(day))} className={`relative mx-auto grid size-11 place-items-center rounded-full text-sm ${selected===iso(day)?"bg-primary text-primary-foreground":""}`}>{day}{store.logs.some(l=>logScheduledDate(l,store.settings.dayBoundaryHour)===iso(day))&&<span className={`absolute bottom-1 size-1 rounded-full ${selected===iso(day)?"bg-primary-foreground":"bg-primary"}`}/>}</button>:<span key={i}/>)}</div></Card><section className="mt-6"><h2 className="mb-3 text-sm font-medium">{selected}</h2>{dayLogs.length===0&&!dayNote?<p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Inga poster denna dag.</p>:<Card className="divide-y divide-border">{dayLogs.map(l=><div key={l.id} className="flex min-h-14 items-center justify-between gap-3 px-4 text-sm"><span>{l.peptideName}</span><span className="text-right text-muted-foreground">{l.status==="taken"?`${n(l.actualDose)} mcg · ${n(l.computedIu)} IU`:"Överhoppad"}<span className="ml-2 tabular-nums">{new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Stockholm",hour:"2-digit",minute:"2-digit"}).format(new Date(l.takenAt))}</span></span></div>)}{dayNote&&<div className="p-4"><p className="mb-2 text-xs text-muted-foreground">Dagens anteckning</p><p className="text-sm leading-6">{dayNote}</p></div>}</Card>}</section></>;
}

function SettingsView({ store, update, syncState, retrySync, userEmail }: { store: PeptimeStore; update: React.Dispatch<React.SetStateAction<PeptimeStore>>; syncState: "local" | "syncing" | "synced" | "error"; retrySync: () => void; userEmail?: string }) {
  const download=(type:"json"|"csv")=>{let body:string,mime:string,name:string;if(type==="json"){body=JSON.stringify({logs:store.logs,daily_notes:store.dailyNotes},null,2);mime="application/json";name="peptime-export.json"}else{const rows=[["peptide","planned_dose","actual_dose","unit","computed_iu","slot","scheduled_date","taken_at","status","site","note"],...store.logs.map(l=>[l.peptideName,l.plannedDose,l.actualDose,l.unit,l.computedIu,l.slot,logScheduledDate(l,store.settings.dayBoundaryHour),l.takenAt,l.status,l.site??"",l.note])];body=rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");mime="text/csv";name="peptime-logs.csv"}const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([body],{type:mime}));a.download=name;a.click();URL.revokeObjectURL(a.href)};
  const setTheme=(dark:boolean)=>{document.documentElement.classList.toggle("dark",dark);update(s=>({...s,settings:{...s.settings,theme:dark?"dark":"light"}}))};
  const setReminders=async(enabled:boolean)=>{if(!enabled){update(s=>({...s,settings:{...s.settings,remindersEnabled:false}}));return}try{if(!("Notification" in window))return;const permission=await Notification.requestPermission();if(permission==="granted")update(s=>({...s,settings:{...s.settings,remindersEnabled:true}}))}catch{}}
  const syncText = syncState === "synced" ? "Synkad med ditt konto" : syncState === "syncing" ? "Synkar…" : syncState === "error" ? "Synkfel · kontrollera anslutningen" : "Sparas på den här enheten";
  return <><PageHeader eyebrow="Peptime" title="Inställningar"/><div className="space-y-5"><Card className="divide-y divide-border"><SettingRow label="Spruta"><select className="bg-transparent text-right text-sm" value={store.settings.syringe} onChange={e=>update(s=>({...s,settings:{...s.settings,syringe:e.target.value as PeptimeStore["settings"]["syringe"]}}))}><option>U-100 1 ml</option><option>U-100 0.5 ml</option></select></SettingRow><SettingRow label="Vikt per IU"><select aria-label="Viktenhet för jämförelse per IU" className="bg-transparent text-right text-sm" value={store.settings.massDisplayUnit} onChange={e=>update(s=>({...s,settings:{...s.settings,massDisplayUnit:e.target.value as "mcg"|"mg"}}))}><option value="mcg">mcg</option><option value="mg">mg</option></select></SettingRow><SettingRow label="Tidszon"><span className="text-sm text-muted-foreground">Europe/Stockholm</span></SettingRow><SettingRow label="Språk"><select className="bg-transparent text-sm" value={store.settings.language} onChange={e=>update(s=>({...s,settings:{...s.settings,language:e.target.value as "sv"|"en"}}))}><option value="sv">Svenska</option><option value="en">English</option></select></SettingRow><SettingRow label="Mörkt tema"><Switch checked={store.settings.theme==="dark"} onCheckedChange={setTheme}/></SettingRow></Card><section><h2 className="mb-3 text-sm font-medium">Påminnelser</h2><Card><SettingRow label="Påminnelser"><Switch aria-label="Påminnelser" checked={store.settings.remindersEnabled} onCheckedChange={setReminders}/></SettingRow><div className="border-t border-border px-4 py-3 text-xs leading-5 text-muted-foreground"><p className="flex gap-2"><Bell className="mt-0.5 size-4 shrink-0"/>Lägg till på hemskärmen, slå sedan på notiser.</p><p className="mt-2">Notiser kan levereras med Web Push men har inte samma leveransgaranti som en native-app.</p></div></Card></section><section><h2 className="mb-3 text-sm font-medium">Export</h2><Card className="grid grid-cols-2 gap-2 p-3"><Button variant="outline" className="h-12" onClick={()=>download("csv")}><Download/> CSV</Button><Button variant="outline" className="h-12" onClick={()=>download("json")}><Download/> JSON</Button></Card></section><Card className="p-5"><div className="flex gap-3"><ShieldCheck className="size-5 shrink-0 text-accent-foreground"/><div className="min-w-0"><p className="font-medium">Om Peptime</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{disclaimer}</p>{userEmail&&<p className="mt-3 truncate text-xs text-muted-foreground">Inloggad som {userEmail}</p>}<p className={`mt-1 text-xs ${syncState==="error"?"text-destructive":"text-muted-foreground"}`}>{syncText}</p>{syncState==="error"&&<Button variant="outline" className="mt-3 h-10" onClick={retrySync}><RotateCcw/> Försök igen</Button>}</div></div></Card><form action="/auth/signout" method="post"><Button type="submit" variant="outline" className="h-12 w-full">Logga ut</Button></form></div></>;
}

function SettingRow({label,children}:{label:string;children:React.ReactNode}) { return <div className="flex min-h-14 items-center justify-between gap-4 px-4"><span className="text-sm">{label}</span>{children}</div> }

export function PeptimeApp({ userEmail }: { userEmail?: string }) {
  const [store,update,ready,syncState,retrySync]=useStore(); const [view,setView]=useState("today");
  useEffect(()=>{document.documentElement.classList.toggle("dark",store.settings.theme!=="light")},[store.settings.theme]);
  useEffect(()=>{if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js").catch(()=>undefined)},[]);
  if(!ready)return syncState==="error"?<main className="grid min-h-dvh place-items-center bg-background p-5"><Card className="w-full max-w-[430px] p-6 text-center"><RotateCcw className="mx-auto size-7 text-muted-foreground"/><h1 className="mt-4 text-xl font-medium">Kunde inte hämta ditt konto</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Dina uppgifter är kvar. Peptime försöker ansluta igen automatiskt.</p><Button className="mt-5 h-12 w-full" onClick={retrySync}>Försök igen</Button></Card></main>:<div className="min-h-dvh bg-background"/>;
  if(!store.onboardingComplete)return <Onboarding store={store} update={update}/>;
  return <main className="mx-auto min-h-dvh w-full max-w-[500px] bg-background px-5 pb-28 pt-7 shadow-2xl shadow-black/10 sm:px-6">{view==="today"&&<TodayView store={store} update={update}/>} {view==="log"&&<LogView store={store} update={update}/>} {view==="peptides"&&<PeptidesView store={store} update={update}/>} {view==="calendar"&&<CalendarView store={store}/>} {view==="settings"&&<SettingsView store={store} update={update} syncState={syncState} retrySync={retrySync} userEmail={userEmail}/>}<BottomNav view={view} setView={setView}/></main>;
}
