"use client";

import { useEffect, useState } from "react";
import {
  Archive, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3,
  Download, FlaskConical, History, House, MoreHorizontal, Pencil, Plus, RotateCcw,
  Search, Settings, ShieldCheck, Sparkles, Syringe, Trash2, TriangleAlert, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { initialStore } from "@/lib/demo-data";
import { syringeUnits, type DoseLog, type Peptide, type PeptimeStore, type Slot } from "@/lib/types";

const STORAGE_KEY = "peptime-demo-v1";
const APP_OPENED_AT = Date.now();
const slotNames: Record<Slot, string> = { morning: "Morgon", lunch: "Lunch", evening: "Kväll", as_needed: "Vid behov" };
const disclaimer = "Research log only. Not medical advice. Not for human-use claims.";

function stockholmDate(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function uid() { return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`; }
function n(value: number) { return new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 2 }).format(value); }

function useStore() {
  const [store, setStore] = useState<PeptimeStore>(initialStore);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      // Local storage hydration is intentionally client-only.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setStore(JSON.parse(saved));
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => { if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); }, [ready, store]);
  return [store, setStore, ready] as const;
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
  const finish = () => update(s => ({ ...s, peptides: examples ? s.peptides : [], onboardingComplete: true }));
  return <div className="fixed inset-0 z-50 grid place-items-center bg-background p-5"><div className="w-full max-w-[430px]">
    <div className="mb-10 flex items-center justify-between"><span className="text-sm font-semibold tracking-[0.16em]">PEPTIME</span><span className="text-xs text-muted-foreground">{step + 1} / 4</span></div>
    <div className="mb-8 flex gap-1.5">{[0,1,2,3].map(i => <span key={i} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />)}</div>
    {step === 0 && <><div className="mb-6 grid size-14 place-items-center rounded-2xl bg-accent text-accent-foreground"><ShieldCheck className="size-7" /></div><h1 className="text-3xl font-medium tracking-[-.04em]">Din privata forskningslogg</h1><p className="mt-4 leading-7 text-muted-foreground">Peptime lagrar det du själv anger och räknar bara på dina värden. Inga rekommendationer, inga protokoll.</p><Card className="mt-7 p-4"><p className="text-sm leading-6">{disclaimer}</p></Card></>}
    {step === 1 && <><p className="text-xs font-semibold uppercase tracking-[.17em] text-accent-foreground">Spruta</p><h1 className="mt-2 text-3xl font-medium tracking-[-.04em]">Vad använder du?</h1><p className="mt-3 text-muted-foreground">IU visas alltid för injicerbara poster.</p><div className="mt-7 grid gap-3">{["U-100 1 ml", "U-100 0.5 ml"].map(s => <button key={s} onClick={() => update(v => ({...v, settings: {...v.settings, syringe: s as PeptimeStore["settings"]["syringe"]}}))} className={`flex min-h-16 items-center justify-between rounded-2xl border px-5 text-left ${store.settings.syringe === s ? "border-primary bg-accent/40" : "border-border bg-card"}`}><span>{s}</span>{store.settings.syringe === s && <CheckCircle2 className="size-5 text-primary" />}</button>)}</div></>}
    {step === 2 && <><p className="text-xs font-semibold uppercase tracking-[.17em] text-accent-foreground">Vialmatematik</p><h1 className="mt-2 text-3xl font-medium tracking-[-.04em]">Dina värden, tydligt</h1><Card className="mt-7 overflow-hidden"><div className="grid grid-cols-2 divide-x divide-border"><div className="p-4"><span className="text-xs text-muted-foreground">Vial</span><p className="mt-1 text-xl tabular-nums">10 mg</p></div><div className="p-4"><span className="text-xs text-muted-foreground">BAC-vatten</span><p className="mt-1 text-xl tabular-nums">2 ml</p></div></div><div className="border-t border-border bg-muted/50 p-5"><p className="text-sm text-muted-foreground">10 mg + 2 ml = 50 mcg per IU</p><p className="mt-3 text-2xl font-medium tabular-nums">100 mcg = {n(sampleUnits)} IU</p></div></Card><label className="mt-6 flex min-h-14 items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4"><span><span className="block text-sm">Lägg till exempelpeptider</span><span className="text-xs text-muted-foreground">Tydligt märkta och lätta att ta bort</span></span><Switch checked={examples} onCheckedChange={setExamples} /></label></>}
    {step === 3 && <><div className="mb-6 grid size-14 place-items-center rounded-2xl bg-accent text-accent-foreground"><Sparkles className="size-7" /></div><h1 className="text-3xl font-medium tracking-[-.04em]">Redo när du är</h1><p className="mt-4 leading-7 text-muted-foreground">Öppna appen och tryck Ta dos. Du kan välja plats direkt efteråt eller hoppa över platsen.</p><Card className="mt-7 p-5"><p className="text-sm text-muted-foreground">Standard</p><p className="mt-2">{store.settings.syringe} · Europe/Stockholm · Mörkt tema</p></Card></>}
    <div className="mt-10 flex gap-3">{step > 0 && <Button variant="outline" className="h-14 flex-1 rounded-2xl" onClick={() => setStep(step - 1)}>Tillbaka</Button>}<Button className="h-14 flex-[2] rounded-2xl text-base" onClick={() => step < 3 ? setStep(step + 1) : finish()}>{step < 3 ? "Fortsätt" : "Öppna Peptime"}</Button></div>
  </div></div>;
}

function TodayView({ store, update }: { store: PeptimeStore; update: React.Dispatch<React.SetStateAction<PeptimeStore>> }) {
  const today = stockholmDate();
  const [siteTarget, setSiteTarget] = useState<Peptide[] | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<Peptide[] | null>(null);
  const [adjustDose, setAdjustDose] = useState(0);
  const [undoIds, setUndoIds] = useState<string[]>([]);
  const note = store.dailyNotes.find(v => v.date === today)?.note ?? "";
  const active = store.peptides.filter(p => !p.archived && (!p.cycleStart || p.cycleStart <= today));
  const loggedIds = new Set(store.logs.filter(l => l.takenAt.slice(0,10) === today).map(l => l.peptideId));
  const due = active.filter(p => !loggedIds.has(p.id));
  const done = active.filter(p => loggedIds.has(p.id));
  const groups = (() => {
    const map = new Map<string, Peptide[]>();
    due.forEach(p => { const key = p.mixGroupId ? `${p.slot}-${p.time}-${p.mixGroupId}` : p.id; map.set(key, [...(map.get(key) ?? []), p]); });
    return [...map.values()];
  })();
  const saveLogs = (items: Peptide[], status: "taken" | "skipped", site?: string, actual?: number) => {
    const now = new Date().toISOString();
    const newLogs: DoseLog[] = items.map(p => ({ id: uid(), peptideId: p.id, peptideName: p.name, plannedDose: p.doseMcg, actualDose: actual ?? p.doseMcg, unit: "mcg", computedIu: syringeUnits(actual ?? p.doseMcg, p.vialMg, p.waterMl), slot: p.slot, takenAt: now, status, site, mixGroupId: p.mixGroupId, note: "" }));
    update(s => ({ ...s, logs: [...newLogs, ...s.logs], peptides: s.peptides.map(p => items.some(i => i.id === p.id) && status === "taken" ? {...p, remainingMg: Math.max(0, p.remainingMg - ((actual ?? p.doseMcg) / 1000)), lastSite: site ?? p.lastSite } : p) }));
    setUndoIds(newLogs.map(l => l.id)); window.setTimeout(() => setUndoIds([]), 30000);
  };
  const undo = () => { update(s => ({...s, logs: s.logs.filter(l => !undoIds.includes(l.id))})); setUndoIds([]); };
  const dateText = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const saveNote = (value: string) => update(s => ({...s, dailyNotes: [...s.dailyNotes.filter(v => v.date !== today), {date: today, note: value}]}));
  return <>
    <PageHeader eyebrow="Peptime" title="Idag" action={<div className="rounded-full border border-border bg-card px-3 py-2 text-xs text-muted-foreground"><span className="mr-1 text-foreground">5</span> dagar loggade</div>} />
    <p className="-mt-6 mb-8 text-sm capitalize text-muted-foreground">{dateText}</p>
    {groups.length === 0 && done.length === 0 && <Card className="p-7 text-center"><CheckCircle2 className="mx-auto size-7 text-primary"/><p className="mt-4 font-medium">Inget planerat idag</p><p className="mt-2 text-sm text-muted-foreground">Dagens schema är tomt.</p></Card>}
    <div className="space-y-7">{groups.map(items => { const first = items[0]; const totalIu = items.reduce((sum,p) => sum + syringeUnits(p.doseMcg,p.vialMg,p.waterMl),0); const isMix = items.length > 1; const expired = first.reconstitutedAt ? (APP_OPENED_AT - new Date(first.reconstitutedAt).getTime()) / 86400000 > first.beyondUseDays : false; return <section key={items.map(i=>i.id).join("-")}>
      <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-medium">{slotNames[first.slot]}</h2><span className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground"><Clock3 className="size-3.5" /> {first.time}</span></div>
      <Card className="overflow-hidden p-5 shadow-[0_12px_36px_rgba(0,0,0,.12)]">
        <div className="mb-5 flex items-start gap-3"><div className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-xs font-semibold text-accent-foreground">{isMix ? items.map(i=>i.shortCode[0]).join("+") : first.shortCode}</div><div className="min-w-0 flex-1"><p className="font-medium">{items.map(i=>i.name).join(" + ")}</p><p className="mt-1 text-sm text-muted-foreground">{items.map(i=><span key={i.id} className="mr-2 text-foreground">{n(i.doseMcg)} mcg</span>)}</p></div><span className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">Kommande</span></div>
        {expired && <div className="mb-4 flex gap-2 rounded-xl bg-destructive/10 p-3 text-xs text-destructive"><TriangleAlert className="size-4 shrink-0" /> Bortom angiven användningstid. Kontrollera dina vialuppgifter.</div>}
        <div className="mb-4 flex items-center justify-between rounded-2xl bg-muted/70 px-4 py-3.5"><span className="flex items-center gap-2 text-sm text-muted-foreground"><Syringe className="size-4" /> {isMix ? "En spruta" : "U-100"}</span><strong className="text-right text-lg font-medium tabular-nums">{isMix ? `${items.map(i=>`${n(syringeUnits(i.doseMcg,i.vialMg,i.waterMl))} IU`).join(" + ")} → ${n(totalIu)} IU` : `${n(totalIu)} IU`}</strong></div>
        <p className="mb-4 flex items-center gap-2 text-xs text-muted-foreground"><FlaskConical className="size-3.5" /> Kvar: {items.map(i=>`${i.shortCode} ${n(i.remainingMg)} mg`).join(" · ")}</p>
        <Button className="h-14 w-full rounded-2xl text-base font-semibold" onClick={() => first.route === "subcutaneous" ? setSiteTarget(items) : saveLogs(items,"taken")}><Check className="size-5" /> Ta dos</Button>
        <div className="mt-2 grid grid-cols-2 gap-2"><Button className="h-11 rounded-xl text-muted-foreground" variant="ghost" onClick={() => saveLogs(items,"skipped")}>Hoppa över</Button><Button className="h-11 rounded-xl text-muted-foreground" variant="ghost" onClick={() => {setAdjustTarget(items);setAdjustDose(first.doseMcg)}}>Justera en gång</Button></div>
      </Card>
    </section>})}</div>
    {done.length > 0 && <section className="mt-8"><h2 className="mb-3 text-sm font-medium text-muted-foreground">Klart</h2><Card className="divide-y divide-border">{done.map(p => { const log = store.logs.find(l=>l.peptideId===p.id && l.takenAt.slice(0,10)===today); return <div key={p.id} className="flex min-h-14 items-center gap-3 px-4 text-sm"><CheckCircle2 className="size-5 text-primary"/><span className="flex-1 text-muted-foreground">{p.name}</span><span className="tabular-nums text-muted-foreground">{log?.status === "skipped" ? "Överhoppad" : `${n(log?.computedIu ?? 0)} IU`}</span></div>})}</Card></section>}
    {undoIds.length > 0 && <button onClick={undo} className="fixed bottom-24 left-1/2 z-40 flex min-h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-5 text-sm text-background shadow-xl"><RotateCcw className="size-4"/> Ångra</button>}
    <section className="mt-9"><label htmlFor="daily-note" className="mb-3 block text-sm font-medium">Dagens anteckning</label><Textarea id="daily-note" value={note} onChange={e=>saveNote(e.target.value)} placeholder="Sömn, energi, humör, biverkningar…" className="min-h-28 resize-none rounded-2xl bg-card p-4 text-base"/><p className="mt-2 text-right text-[11px] text-muted-foreground">Sparas automatiskt</p></section>
    <Dialog open={!!siteTarget} onOpenChange={open=>!open&&setSiteTarget(null)}><DialogContent className="bottom-0 top-auto max-w-[480px] translate-y-0 rounded-b-none rounded-t-[26px] p-5"><DialogHeader><DialogTitle>Injektionsplats</DialogTitle><DialogDescription>Valfritt. Senast använd: {siteTarget?.[0]?.lastSite ?? "ingen"}</DialogDescription></DialogHeader><div className="grid grid-cols-2 gap-2">{(siteTarget?.[0]?.sites ?? ["Buk vänster","Buk höger","Lår vänster","Lår höger","Annat"]).map(site=><Button key={site} variant="outline" className="h-13 rounded-xl" onClick={()=>{if(siteTarget)saveLogs(siteTarget,"taken",site);setSiteTarget(null)}}>{site}</Button>)}</div><Button variant="ghost" className="h-12" onClick={()=>{if(siteTarget)saveLogs(siteTarget,"taken");setSiteTarget(null)}}>Ingen plats</Button></DialogContent></Dialog>
    <Dialog open={!!adjustTarget} onOpenChange={open=>!open&&setAdjustTarget(null)}><DialogContent><DialogHeader><DialogTitle>Justera endast denna dos</DialogTitle><DialogDescription>Detta ändrar inte protokollet.</DialogDescription></DialogHeader><label className="text-xs text-muted-foreground">Faktisk dos (mcg)<Input className="mt-2 h-12" type="number" value={adjustDose} onChange={e=>setAdjustDose(Number(e.target.value))}/></label><div className="rounded-xl bg-muted p-3 text-sm">{n(adjustDose)} mcg = {n(syringeUnits(adjustDose,adjustTarget?.[0]?.vialMg??1,adjustTarget?.[0]?.waterMl??1))} IU per post</div><Button className="h-12" onClick={()=>{if(adjustTarget)saveLogs(adjustTarget,"taken",undefined,adjustDose);setAdjustTarget(null)}}>Logga justerad dos</Button></DialogContent></Dialog>
  </>;
}

function LogView({ store, update }: { store: PeptimeStore; update: React.Dispatch<React.SetStateAction<PeptimeStore>> }) {
  const [query,setQuery]=useState(""); const [date,setDate]=useState(""); const [edit,setEdit]=useState<DoseLog|null>(null);
  const logs=store.logs.filter(l=>(!query||l.peptideName.toLowerCase().includes(query.toLowerCase()))&&(!date||l.takenAt.slice(0,10)===date)).sort((a,b)=>b.takenAt.localeCompare(a.takenAt));
  return <><PageHeader eyebrow="Historik" title="Logg"/><div className="mb-6 grid grid-cols-[1fr_142px] gap-2"><div className="relative"><Search className="absolute left-3 top-3.5 size-4 text-muted-foreground"/><Input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Peptid" className="h-11 pl-9"/></div><Input type="date" value={date} onChange={e=>setDate(e.target.value)} className="h-11"/></div>{logs.length===0?<Card className="p-7 text-center"><History className="mx-auto size-7 text-muted-foreground"/><p className="mt-4 font-medium">Ingen historik ännu</p><p className="mt-2 text-sm text-muted-foreground">Loggade och överhoppade doser visas här.</p></Card>:<div className="space-y-3">{logs.map(log=><Card key={log.id} className="p-4"><div className="flex items-start gap-3"><div className={`mt-0.5 grid size-9 place-items-center rounded-full ${log.status==="taken"?"bg-accent text-accent-foreground":"bg-muted text-muted-foreground"}`}>{log.status==="taken"?<Check className="size-4"/>:<X className="size-4"/>}</div><div className="min-w-0 flex-1"><div className="flex justify-between gap-3"><p className="font-medium">{log.peptideName}</p><span className="text-xs tabular-nums text-muted-foreground">{new Intl.DateTimeFormat("sv-SE",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(log.takenAt))}</span></div><p className="mt-1 text-sm text-muted-foreground">{log.status==="taken"?`${n(log.actualDose)} ${log.unit} · ${n(log.computedIu)} IU${log.site?` · ${log.site}`:""}`:"Överhoppad"}</p></div><Button variant="ghost" size="icon" aria-label="Redigera logg" onClick={()=>setEdit(log)}><MoreHorizontal/></Button></div></Card>)}</div>}
    <Dialog open={!!edit} onOpenChange={open=>!open&&setEdit(null)}><DialogContent><DialogHeader><DialogTitle>Redigera logg</DialogTitle><DialogDescription>{edit?.peptideName}</DialogDescription></DialogHeader><label className="text-xs text-muted-foreground">Faktisk dos<Input type="number" className="mt-2 h-11" value={edit?.actualDose??0} onChange={e=>setEdit(v=>v?{...v,actualDose:Number(e.target.value)}:v)}/></label><label className="text-xs text-muted-foreground">Anteckning<Textarea className="mt-2" value={edit?.note??""} onChange={e=>setEdit(v=>v?{...v,note:e.target.value}:v)}/></label><Button className="h-11" onClick={()=>{if(edit)update(s=>({...s,logs:s.logs.map(l=>l.id===edit.id?edit:l)}));setEdit(null)}}><Pencil/> Spara</Button><Button variant="destructive" className="h-11" onClick={()=>{if(edit)update(s=>({...s,logs:s.logs.filter(l=>l.id!==edit.id)}));setEdit(null)}}><Trash2/> Ta bort</Button></DialogContent></Dialog>
  </>;
}

const emptyPeptide: Omit<Peptide,"id"> = { name:"",shortCode:"",color:"teal",doseMcg:100,vialMg:10,waterMl:2,remainingMg:10,route:"subcutaneous",slot:"evening",time:"21:00",frequency:"daily",weekdays:[1,2,3,4,5,6,0],fasted:false,fastedNote:"",beyondUseDays:28,sites:["Buk vänster","Buk höger","Lår vänster","Lår höger","Annat"],notes:"",archived:false,example:false };

function PeptidesView({ store, update }: { store: PeptimeStore; update: React.Dispatch<React.SetStateAction<PeptimeStore>> }) {
  const [editing,setEditing]=useState<Peptide|null>(null); const [adding,setAdding]=useState(false); const active=store.peptides.filter(p=>!p.archived); const draft=editing??({...emptyPeptide,id:""} as Peptide); const units=syringeUnits(draft.doseMcg,draft.vialMg,draft.waterMl); const set=(part:Partial<Peptide>)=>setEditing({...draft,...part});
  const save=()=>{const item={...draft,id:draft.id||uid(),shortCode:draft.shortCode||draft.name.slice(0,3),remainingMg:draft.id?draft.remainingMg:draft.vialMg};update(s=>({...s,peptides:draft.id?s.peptides.map(p=>p.id===draft.id?item:p):[...s.peptides,item]}));setEditing(null);setAdding(false)};
  return <><PageHeader eyebrow="Dina ämnen" title="Peptider" action={<Button size="icon" className="size-11 rounded-full" onClick={()=>{setEditing({...emptyPeptide,id:""} as Peptide);setAdding(true)}} aria-label="Lägg till peptid"><Plus/></Button>}/>{active.length===0?<Card className="p-7 text-center"><FlaskConical className="mx-auto size-7 text-muted-foreground"/><p className="mt-4 font-medium">Inga peptider ännu</p><Button className="mt-5 h-11 rounded-xl" onClick={()=>{setEditing({...emptyPeptide,id:""} as Peptide);setAdding(true)}}>Lägg till peptid</Button></Card>:<div className="space-y-3">{active.map(p=><button key={p.id} onClick={()=>setEditing(p)} className="flex min-h-[84px] w-full items-center gap-4 rounded-[20px] border border-border bg-card p-4 text-left"><div className="grid size-11 place-items-center rounded-xl bg-accent text-xs font-semibold text-accent-foreground">{p.shortCode}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="font-medium">{p.name}</p>{p.example&&<span className="rounded bg-muted px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">Exempel</span>}</div><p className="mt-1 text-sm text-muted-foreground">{n(p.doseMcg)} mcg · {n(syringeUnits(p.doseMcg,p.vialMg,p.waterMl))} IU · {slotNames[p.slot]}</p></div><ChevronRight className="size-5 text-muted-foreground"/></button>)}</div>}
    <Dialog open={!!editing} onOpenChange={open=>{if(!open){setEditing(null);setAdding(false)}}}><DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>{adding?"Lägg till peptid":"Peptidinställningar"}</DialogTitle><DialogDescription>Alla värden är dina egna logguppgifter.</DialogDescription></DialogHeader><div className="grid grid-cols-2 gap-3"><label className="col-span-2 text-xs text-muted-foreground">Namn<Input className="mt-1.5 h-11" value={draft.name} onChange={e=>set({name:e.target.value})} placeholder="Fritextnamn"/></label><label className="text-xs text-muted-foreground">Kortkod<Input className="mt-1.5 h-11" value={draft.shortCode} onChange={e=>set({shortCode:e.target.value})}/></label><label className="text-xs text-muted-foreground">Dos (mcg)<Input className="mt-1.5 h-11" type="number" value={draft.doseMcg} onChange={e=>set({doseMcg:Number(e.target.value)})}/></label><label className="text-xs text-muted-foreground">Vial (mg)<Input className="mt-1.5 h-11" type="number" value={draft.vialMg} onChange={e=>set({vialMg:Number(e.target.value)})}/></label><label className="text-xs text-muted-foreground">BAC-vatten (ml)<Input className="mt-1.5 h-11" type="number" value={draft.waterMl} onChange={e=>set({waterMl:Number(e.target.value)})}/></label><label className="text-xs text-muted-foreground">Tid<select className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3" value={draft.slot} onChange={e=>set({slot:e.target.value as Slot})}>{Object.entries(slotNames).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label className="text-xs text-muted-foreground">Klockslag<Input className="mt-1.5 h-11" type="time" value={draft.time} onChange={e=>set({time:e.target.value})}/></label><label className="text-xs text-muted-foreground">Administrering<select className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3" value={draft.route} onChange={e=>set({route:e.target.value as Peptide["route"]})}><option value="subcutaneous">Subkutan</option><option value="intranasal">Intranasal</option><option value="oral">Oral</option><option value="topical">Topikal</option></select></label><label className="text-xs text-muted-foreground">Mixgrupp<Input className="mt-1.5 h-11" value={draft.mixGroupId??""} onChange={e=>set({mixGroupId:e.target.value||undefined})} placeholder="Valfritt"/></label></div><div className="rounded-2xl bg-muted p-4"><p className="text-xs text-muted-foreground">Automatisk vialmatematik</p><p className="mt-2 text-lg font-medium tabular-nums">{n(draft.vialMg/draft.waterMl)} mg/ml · {n((draft.vialMg/draft.waterMl)*10)} mcg/IU</p><p className="mt-1 text-sm text-accent-foreground">{n(draft.doseMcg)} mcg = {n(units)} IU</p></div><label className="flex min-h-12 items-center justify-between"><span className="text-sm">Fastande flagga</span><Switch checked={draft.fasted} onCheckedChange={v=>set({fasted:v})}/></label><label className="text-xs text-muted-foreground">Peptidanteckning<Textarea className="mt-1.5" value={draft.notes} onChange={e=>set({notes:e.target.value})} placeholder="Rekonstituering, egen påminnelse…"/></label><Button disabled={!draft.name.trim()} className="h-12" onClick={save}>Spara peptid</Button>{draft.id&&<><Button variant="outline" className="h-11" onClick={()=>set({remainingMg:draft.vialMg,reconstitutedAt:new Date().toISOString()})}><RotateCcw/> Öppnade ny vial</Button><Button variant="ghost" className="h-11 text-muted-foreground" onClick={()=>{update(s=>({...s,peptides:s.peptides.map(p=>p.id===draft.id?{...p,archived:true}:p)}));setEditing(null)}}><Archive/> Arkivera</Button></>}</DialogContent></Dialog>
  </>;
}

function CalendarView({ store }: { store: PeptimeStore }) {
  const [cursor,setCursor]=useState(new Date()); const [selected,setSelected]=useState(stockholmDate()); const year=cursor.getFullYear(),month=cursor.getMonth(); const first=new Date(year,month,1); const blanks=(first.getDay()+6)%7; const days=new Date(year,month+1,0).getDate(); const cells=[...Array(blanks).fill(null),...Array.from({length:days},(_,i)=>i+1)]; const iso=(day:number)=>`${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`; const dayLogs=store.logs.filter(l=>l.takenAt.slice(0,10)===selected); const dayNote=store.dailyNotes.find(v=>v.date===selected)?.note;
  return <><PageHeader eyebrow="Översikt" title="Kalender"/><Card className="p-4"><div className="mb-5 flex items-center justify-between"><Button variant="ghost" size="icon" onClick={()=>setCursor(new Date(year,month-1,1))}><ChevronLeft/></Button><p className="font-medium capitalize">{new Intl.DateTimeFormat("sv-SE",{month:"long",year:"numeric"}).format(cursor)}</p><Button variant="ghost" size="icon" onClick={()=>setCursor(new Date(year,month+1,1))}><ChevronRight/></Button></div><div className="grid grid-cols-7 text-center text-[11px] text-muted-foreground">{"M T O T F L S".split(" ").map((d,i)=><span key={i} className="py-2">{d}</span>)}{cells.map((day,i)=>day?<button key={i} onClick={()=>setSelected(iso(day))} className={`relative mx-auto grid size-11 place-items-center rounded-full text-sm ${selected===iso(day)?"bg-primary text-primary-foreground":""}`}>{day}{store.logs.some(l=>l.takenAt.slice(0,10)===iso(day))&&<span className={`absolute bottom-1 size-1 rounded-full ${selected===iso(day)?"bg-primary-foreground":"bg-primary"}`}/>}</button>:<span key={i}/>)}</div></Card><section className="mt-6"><h2 className="mb-3 text-sm font-medium">{selected}</h2>{dayLogs.length===0&&!dayNote?<p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Inga poster denna dag.</p>:<Card className="divide-y divide-border">{dayLogs.map(l=><div key={l.id} className="flex min-h-14 items-center justify-between px-4 text-sm"><span>{l.peptideName}</span><span className="text-muted-foreground">{l.status==="taken"?`${n(l.actualDose)} mcg · ${n(l.computedIu)} IU`:"Överhoppad"}</span></div>)}{dayNote&&<div className="p-4"><p className="mb-2 text-xs text-muted-foreground">Dagens anteckning</p><p className="text-sm leading-6">{dayNote}</p></div>}</Card>}</section></>;
}

function SettingsView({ store, update }: { store: PeptimeStore; update: React.Dispatch<React.SetStateAction<PeptimeStore>> }) {
  const download=(type:"json"|"csv")=>{let body:string,mime:string,name:string;if(type==="json"){body=JSON.stringify({logs:store.logs,daily_notes:store.dailyNotes},null,2);mime="application/json";name="peptime-export.json"}else{const rows=[["peptide","planned_dose","actual_dose","unit","computed_iu","slot","taken_at","status","site","note"],...store.logs.map(l=>[l.peptideName,l.plannedDose,l.actualDose,l.unit,l.computedIu,l.slot,l.takenAt,l.status,l.site??"",l.note])];body=rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");mime="text/csv";name="peptime-logs.csv"}const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([body],{type:mime}));a.download=name;a.click();URL.revokeObjectURL(a.href)};
  const setTheme=(dark:boolean)=>{document.documentElement.classList.toggle("dark",dark);update(s=>({...s,settings:{...s.settings,theme:dark?"dark":"light"}}))};
  return <><PageHeader eyebrow="Peptime" title="Inställningar"/><div className="space-y-5"><Card className="divide-y divide-border"><SettingRow label="Spruta"><select className="bg-transparent text-right text-sm" value={store.settings.syringe} onChange={e=>update(s=>({...s,settings:{...s.settings,syringe:e.target.value as PeptimeStore["settings"]["syringe"]}}))}><option>U-100 1 ml</option><option>U-100 0.5 ml</option></select></SettingRow><SettingRow label="Tidszon"><span className="text-sm text-muted-foreground">Europe/Stockholm</span></SettingRow><SettingRow label="Språk"><select className="bg-transparent text-sm" value={store.settings.language} onChange={e=>update(s=>({...s,settings:{...s.settings,language:e.target.value as "sv"|"en"}}))}><option value="sv">Svenska</option><option value="en">English</option></select></SettingRow><SettingRow label="Mörkt tema"><Switch checked={store.settings.theme==="dark"} onCheckedChange={setTheme}/></SettingRow></Card><section><h2 className="mb-3 text-sm font-medium">Export</h2><Card className="grid grid-cols-2 gap-2 p-3"><Button variant="outline" className="h-12" onClick={()=>download("csv")}><Download/> CSV</Button><Button variant="outline" className="h-12" onClick={()=>download("json")}><Download/> JSON</Button></Card></section><Card className="p-5"><div className="flex gap-3"><ShieldCheck className="size-5 shrink-0 text-accent-foreground"/><div><p className="font-medium">Om Peptime</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{disclaimer}</p><p className="mt-3 text-xs text-muted-foreground">Demoläge · Data sparas lokalt på den här enheten.</p></div></div></Card><form action="/auth/signout" method="post"><Button type="submit" variant="outline" className="h-12 w-full">Logga ut</Button></form></div></>;
}

function SettingRow({label,children}:{label:string;children:React.ReactNode}) { return <div className="flex min-h-14 items-center justify-between gap-4 px-4"><span className="text-sm">{label}</span>{children}</div> }

export function PeptimeApp() {
  const [store,update,ready]=useStore(); const [view,setView]=useState("today");
  useEffect(()=>{document.documentElement.classList.toggle("dark",store.settings.theme!=="light")},[store.settings.theme]);
  useEffect(()=>{if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js").catch(()=>undefined)},[]);
  if(!ready)return <div className="min-h-dvh bg-background"/>;
  if(!store.onboardingComplete)return <Onboarding store={store} update={update}/>;
  return <main className="mx-auto min-h-dvh w-full max-w-[500px] bg-background px-5 pb-28 pt-7 shadow-2xl shadow-black/10 sm:px-6">{view==="today"&&<TodayView store={store} update={update}/>} {view==="log"&&<LogView store={store} update={update}/>} {view==="peptides"&&<PeptidesView store={store} update={update}/>} {view==="calendar"&&<CalendarView store={store}/>} {view==="settings"&&<SettingsView store={store} update={update}/>}<BottomNav view={view} setView={setView}/></main>;
}
