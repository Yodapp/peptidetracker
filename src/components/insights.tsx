"use client";

import { useState } from "react";
import { ArrowLeft, BarChart3, CalendarDays, ChevronRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WellbeingInsights } from "@/components/wellbeing-insights";
import { PageHeader, SegmentedControl } from "@/components/peptime-ui";
import { addDays, displayLogDate, logScheduledDate, stockholmDate } from "@/lib/log-day";
import type { DailyTagId, DoseLog, Peptide, PeptimeStore } from "@/lib/types";

const colors: Record<string, string> = { teal: "#72b7aa", gold: "#c4a66a", stone: "#a1a1aa", blue: "#7f9fca", rose: "#c9828b" };
const tagLabels: Record<string, string> = { great_sleep: "Sov bra", high_energy: "Hög energi", irritable: "Irriterad", flushing: "Rodnad", headache: "Huvudvärk", site_soreness: "Öm injektionsplats", nausea: "Illamående", restless: "Oro/rastlöshet" };
const formatNumber = (value: number) => new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 2 }).format(value);
const massMcg = (log: DoseLog, value: number) => value * (log.unit === "mg" ? 1000 : 1);
const dayOf = (log: DoseLog, store: PeptimeStore) => logScheduledDate(log, store.settings.dayBoundaryHour);
const card = "rounded-[22px] border border-border/80 bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,.025)]";

type BodySite = { name: string; side: "front" | "back"; x: number; y: number };
const bodySites: BodySite[] = [
  { name: "Buk vänster", side: "front", x: 55, y: 86 },
  { name: "Buk höger", side: "front", x: 89, y: 86 },
  { name: "Lår vänster", side: "front", x: 56, y: 153 },
  { name: "Lår höger", side: "front", x: 88, y: 153 },
  { name: "Arm vänster", side: "front", x: 24, y: 67 },
  { name: "Arm höger", side: "front", x: 120, y: 67 },
  { name: "Säte vänster", side: "back", x: 55, y: 112 },
  { name: "Säte höger", side: "back", x: 89, y: 112 },
];

function knownSite(name: string) {
  return bodySites.find(site => site.name.toLocaleLowerCase("sv-SE") === name.trim().toLocaleLowerCase("sv-SE"));
}

function BodyShape({ side }: { side: "front" | "back" }) {
  return <svg viewBox="0 0 144 218" className="mx-auto h-56 w-36" aria-hidden="true">
    <circle cx="72" cy="19" r="15" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M 57 37 L 45 45 L 30 45 L 15 99 L 25 104 L 46 63 L 49 111 L 52 126 L 55 201 L 66 201 L 72 135 L 78 201 L 89 201 L 92 126 L 95 111 L 98 63 L 119 104 L 129 99 L 114 45 L 99 45 L 87 37 Z" fill="currentColor" fillOpacity=".08" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    <path d={side === "front" ? "M 72 43 L 72 119 M 49 116 Q 72 126 95 116" : "M 45 48 Q 72 77 99 48 M 72 43 L 72 115"} fill="none" stroke="currentColor" strokeOpacity=".35" strokeWidth="1.5" />
  </svg>;
}

export function BodyMap({ logs }: { logs: DoseLog[] }) {
  const [focusedSite, setFocusedSite] = useState<string | null>(null);
  const eventMap = new Map<string, DoseLog[]>();
  for (const log of logs.filter(value => value.status === "taken" && value.site)) {
    const key = log.mixGroupId ? `${log.mixGroupId}:${log.takenAt}:${log.site}` : log.id;
    eventMap.set(key, [...(eventMap.get(key) ?? []), log]);
  }
  const events = [...eventMap.values()];
  const sites = [...new Set(events.map(event => event[0].site!))];
  const known = bodySites.filter(site => sites.some(name => knownSite(name)?.name === site.name));
  const other = sites.filter(name => !knownSite(name));
  const focus = focusedSite;
  const focusEvents = events.filter(event => event[0].site?.toLocaleLowerCase("sv-SE") === focus?.toLocaleLowerCase("sv-SE")).sort((a, b) => b[0].takenAt.localeCompare(a[0].takenAt));
  const showHistory = (name: string) => setFocusedSite(value => value === name ? null : name);
  return <div>
    <div className="grid grid-cols-2 gap-1 text-center">
      {(["front", "back"] as const).map(side => <div key={side} className="relative mx-auto w-36 text-muted-foreground">
        <BodyShape side={side} />
        {known.filter(site => site.side === side).map(site => {
          const count = events.filter(event => event[0].site?.toLocaleLowerCase("sv-SE") === site.name.toLocaleLowerCase("sv-SE")).length;
          const active = focus === site.name;
          return <button key={site.name} type="button" aria-label={`Visa historik för ${site.name}: ${count} ${count === 1 ? "injektionstillfälle" : "injektionstillfällen"}`} aria-pressed={active} onClick={() => showHistory(site.name)} title={site.name} style={{ left: `${site.x / 144 * 100}%`, top: `${site.y / 218 * 100}%` }} className={`absolute grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 text-[11px] font-semibold shadow-sm transition-transform hover:scale-110 ${active ? "border-foreground bg-primary text-primary-foreground" : count ? "border-background bg-primary text-primary-foreground" : "border-primary bg-card text-primary"}`}>{count || <span className="size-2 rounded-full bg-primary" />}</button>;
        })}
        <p className="mt-1 text-xs font-medium text-muted-foreground">{side === "front" ? "Framsida" : "Baksida"}</p>
      </div>)}
    </div>
    {other.length > 0 && <div className="mt-4 flex flex-wrap gap-2"><span className="w-full text-xs text-muted-foreground">Övriga platser</span>{other.map(name => <button type="button" key={name} onClick={() => showHistory(name)} aria-pressed={focus === name} className={`min-h-9 rounded-full border px-3 text-xs ${focus === name ? "border-primary bg-accent text-accent-foreground" : "border-border"}`}>{name}</button>)}</div>}
    {focus && <div className="mt-5 border-t border-border pt-4"><p className="font-medium">{focus}</p><p className="mt-1 text-xs text-muted-foreground">{focusEvents.length} {focusEvents.length === 1 ? "loggat injektionstillfälle" : "loggade injektionstillfällen"}</p>{focusEvents.length > 0 && <div className="mt-3 space-y-2">{focusEvents.slice(0, 5).map(event => <div key={event[0].id} className="flex justify-between gap-3 text-xs"><span className="truncate">{event.map(log => log.peptideName).join(" + ")}</span><span className="shrink-0 text-muted-foreground">{displayLogDate(stockholmDate(event[0].takenAt), { day: "numeric", month: "short", year: "numeric" })}</span></div>)}</div>}</div>}
  </div>;
}

function Chart({ logs, store, color }: { logs: DoseLog[]; store: PeptimeStore; color: string }) {
  const [period, setPeriod] = useState<30 | 90 | 365>(90);
  const today = stockholmDate();
  const start = addDays(today, 1 - period);
  const relevant = logs.filter(log => dayOf(log, store) >= start && dayOf(log, store) <= today);
  const byDay = new Map<string, { actual: number; planned: number; skipped: boolean }>();
  for (const log of relevant) {
    const date = dayOf(log, store);
    const row = byDay.get(date) ?? { actual: 0, planned: 0, skipped: false };
    row.planned += massMcg(log, log.plannedDose);
    if (log.status === "taken") row.actual += massMcg(log, log.actualDose);
    else row.skipped = true;
    byDay.set(date, row);
  }
  const points = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  const max = Math.max(1, ...points.flatMap(([, row]) => [row.actual, row.planned]));
  const x = (date: string) => 34 + Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86400000) / (period - 1) * 276;
  const y = (value: number) => 152 - value / max * 120;
  const adjacent = (previous: string, next: string) => addDays(previous, 1) === next;
  const plannedPath = points.map(([date, row], index) => `${index && adjacent(points[index - 1][0], date) ? "L" : "M"}${x(date)},${y(row.planned)}`).join(" ");
  const actualPoints = points.filter(([, row]) => row.actual > 0);
  const actualPath = actualPoints.map(([date, row], index) => `${index && adjacent(actualPoints[index - 1][0], date) ? "L" : "M"}${x(date)},${y(row.actual)}`).join(" ");
  return <div>
    <div className="mb-4 flex gap-2" aria-label="Diagramperiod">{([30, 90, 365] as const).map(value => <button type="button" key={value} aria-pressed={period === value} onClick={() => setPeriod(value)} className={`min-h-9 rounded-full border px-3 text-xs ${period === value ? "border-primary bg-accent text-accent-foreground" : "border-border text-muted-foreground"}`}>{value === 365 ? "1 år" : `${value} dagar`}</button>)}</div>
    {points.length === 0 ? <p className="grid h-44 place-items-center text-center text-sm text-muted-foreground">Inga loggningar under perioden.</p> : <svg viewBox="0 0 330 185" role="img" aria-label={`Faktisk och planerad dos per loggad dag under ${period} dagar`} className="w-full overflow-visible">
      {[32, 92, 152].map(value => <line key={value} x1="34" x2="310" y1={value} y2={value} stroke="currentColor" className="text-border" />)}
      <text x="29" y="36" textAnchor="end" className="fill-muted-foreground text-[9px]">{formatNumber(max)}</text>
      <text x="29" y="155" textAnchor="end" className="fill-muted-foreground text-[9px]">0</text>
      <path d={plannedPath} fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" className="text-muted-foreground" />
      <path d={actualPath} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
      {points.map(([date, row]) => <g key={date}><circle cx={x(date)} cy={y(row.planned)} r="3" fill="currentColor" className="text-muted-foreground" />{row.actual > 0 && <circle cx={x(date)} cy={y(row.actual)} r="4" fill={color} />}{row.skipped && <path d={`M${x(date)-4},164 l8,8 m0,-8 l-8,8`} stroke="currentColor" className="text-muted-foreground" strokeWidth="1.5" />}</g>)}
      <text x="34" y="183" className="fill-muted-foreground text-[9px]">{displayLogDate(start, { day: "numeric", month: "short" })}</text><text x="310" y="183" textAnchor="end" className="fill-muted-foreground text-[9px]">Idag</text>
    </svg>}
    <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-2"><span className="size-3 rounded-full" style={{ background: color }} />Faktisk dos</span><span className="flex items-center gap-2"><span className="w-4 border-t-2 border-dashed border-muted-foreground" />Planerad i loggen</span><span>× Överhoppad</span></div>
    <p className="mt-3 text-xs text-muted-foreground">Visar registrerade dagar i mcg. Dagar utan logg saknar datapunkt.</p>
  </div>;
}

export function PeptideInsights({ store, peptide, onBack }: { store: PeptimeStore; peptide: Peptide; onBack: () => void }) {
  const logs = store.logs.filter(log => log.peptideId === peptide.id);
  const taken = logs.filter(log => log.status === "taken");
  const skipped = logs.length - taken.length;
  const last30 = taken.filter(log => dayOf(log, store) >= addDays(stockholmDate(), -29));
  const totalMcg = last30.reduce((sum, log) => sum + massMcg(log, log.actualDose), 0);
  const usedSites = [...new Set(taken.map(log => log.site).filter(Boolean))];
  const color = colors[peptide.color] ?? colors.teal;
  return <>
    <header className="mb-6 flex items-center gap-3 pt-8"><Button variant="ghost" size="icon" className="size-11 shrink-0 rounded-full" onClick={onBack} aria-label="Tillbaka"><ArrowLeft /></Button><div><p className="text-xs font-semibold text-primary">Peptidens historik</p><h1 className="mt-1 text-[32px] font-bold tracking-tight">{peptide.name}</h1></div></header>
    <div className="mb-5 grid grid-cols-3 gap-2">{[["Loggade", String(taken.length)], ["Överhoppade", String(skipped)], ["30 dagar", `${formatNumber(totalMcg / 1000)} mg`]].map(([label, value]) => <div key={label} className="rounded-2xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-lg font-semibold tabular-nums">{value}</p></div>)}</div>
    <section className={`${card} mb-5`}><h2 className="mb-5 text-lg font-medium">Dos över tid</h2><Chart logs={logs} store={store} color={color} /></section>
    <section className={`${card} mb-5`}><div className="mb-4 flex items-center gap-2"><MapPin className="size-4 text-primary" /><h2 className="text-lg font-medium">Injektionsställen</h2></div>{usedSites.length ? <BodyMap logs={taken} /> : <p className="text-sm text-muted-foreground">Inga injektionsställen har loggats för den här peptiden.</p>}</section>
    <section className={card}><h2 className="mb-4 text-lg font-medium">Senaste loggarna</h2>{logs.length ? <div className="divide-y divide-border">{[...logs].sort((a, b) => b.takenAt.localeCompare(a.takenAt)).slice(0, 10).map(log => <div key={log.id} className="flex justify-between gap-3 py-3 text-sm"><span className="min-w-0 truncate">{log.status === "taken" ? `${formatNumber(log.actualDose)} ${log.unit}${log.site ? ` · ${log.site}` : ""}` : "Överhoppad"}</span><span className="shrink-0 text-xs text-muted-foreground">{displayLogDate(dayOf(log, store), { day: "numeric", month: "short" })}</span></div>)}</div> : <p className="text-sm text-muted-foreground">Ingen historik ännu.</p>}</section>
  </>;
}

export function InsightsView({ store, onOpenPeptide, onOpenCalendar }: { store: PeptimeStore; onOpenPeptide: (id: string) => void; onOpenCalendar: () => void }) {
  const [period, setPeriod] = useState<30 | 90>(90);
  const [selectedTag, setSelectedTag] = useState<DailyTagId | "all">("all");
  const today = stockholmDate();
  const start = addDays(today, 1 - period);
  const logs = store.logs.filter(log => dayOf(log, store) >= start && dayOf(log, store) <= today);
  const taken = logs.filter(log => log.status === "taken");
  const skipped = logs.length - taken.length;
  const loggedDays = new Set(taken.map(log => dayOf(log, store)));
  const siteLogs = taken.filter(log => log.site);
  const days = Array.from({ length: period }, (_, index) => addDays(start, index));
  const notes = new Map(store.dailyNotes.map(note => [note.date, note]));
  const tagCounts = [...new Set([...Object.keys(tagLabels), ...days.flatMap(date => notes.get(date)?.tags ?? [])])].map(tag => ({ id: tag as DailyTagId, count: days.filter(date => notes.get(date)?.tags.includes(tag)).length })).filter(tag => tag.count > 0 || ["irritable","flushing","headache","site_soreness","nausea","restless"].includes(tag.id));
  const weeks = Array.from({ length: Math.ceil(period / 7) }, (_, index) => {
    const weekDays = days.slice(index * 7, index * 7 + 7);
    return { start: weekDays[0], count: taken.filter(log => weekDays.includes(dayOf(log, store))).length, skipped: logs.filter(log => log.status === "skipped" && weekDays.includes(dayOf(log, store))).length };
  });
  const maxWeek = Math.max(1, ...weeks.map(week => week.count + week.skipped));
  return <>
    <PageHeader eyebrow="Din egen data" title="Insikter" subtitle="Mönster i loggningar och mående"/>
    <div className="mb-5"><SegmentedControl label="Tidsperiod" value={period} onChange={setPeriod} values={[{value:30,label:"30 dagar"},{value:90,label:"90 dagar"}]}/></div>
    <div className="mb-5 grid grid-cols-3 gap-2">{[["Loggade", String(taken.length)], ["Dagar", String(loggedDays.size)], ["Överhoppade", String(skipped)]].map(([label, value]) => <div key={label} className="rounded-2xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p></div>)}</div>
    <section className={`${card} mb-5`}><div className="mb-4 flex items-center gap-2"><BarChart3 className="size-4 text-primary" /><h2 className="text-lg font-medium">Loggningar per 7 dagar</h2></div><div className="flex h-40 items-end gap-1.5" role="img" aria-label="Antal loggade och överhoppade doser per sjudagarsperiod">{weeks.map(week => <div key={week.start} className="flex min-w-0 flex-1 flex-col items-center gap-1"><div className="flex h-32 w-full max-w-8 flex-col justify-end overflow-hidden rounded-t-md bg-muted/40" title={`${week.start}: ${week.count} loggade, ${week.skipped} överhoppade`}><div style={{ height: `${week.skipped / maxWeek * 100}%` }} className="bg-zinc-500/60" /><div style={{ height: `${week.count / maxWeek * 100}%` }} className="bg-primary" /></div><span className="text-[9px] text-muted-foreground">{displayLogDate(week.start, { day: "numeric", month: "numeric" })}</span></div>)}</div><div className="mt-3 flex gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-primary" />Loggade</span><span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-zinc-500/60" />Överhoppade</span></div></section>
    <section className={`${card} mb-5`}><h2 className="text-lg font-medium">Aktivitet per dag</h2><p className="mt-1 text-xs text-muted-foreground">Mörkare ruta betyder fler loggade doser. Blå prick visar en dagstagg.</p><div className="mt-5 grid grid-flow-col grid-rows-7 gap-1.5 overflow-x-auto pb-2">{days.map(date => { const count = taken.filter(log => dayOf(log, store) === date).length; const hasTag = selectedTag === "all" ? Boolean(notes.get(date)?.tags.length) : Boolean(notes.get(date)?.tags.includes(selectedTag)); return <div key={date} title={`${date}: ${count} loggade doser${hasTag ? ", dagstagg" : ""}`} className={`relative size-3.5 rounded-[3px] ${count === 0 ? "bg-muted" : count === 1 ? "bg-primary/50" : count === 2 ? "bg-primary/75" : "bg-primary"}`}>{hasTag && <span className="absolute -bottom-0.5 -right-0.5 size-1.5 rounded-full bg-[#7f9fca] ring-1 ring-card" />}</div>; })}</div><div className="mt-4 flex flex-wrap gap-1.5"><button type="button" onClick={() => setSelectedTag("all")} aria-pressed={selectedTag === "all"} className={`min-h-9 rounded-full border px-2.5 text-xs ${selectedTag === "all" ? "border-primary bg-accent text-accent-foreground" : "border-border"}`}>Alla taggar</button>{tagCounts.map(tag => <button type="button" key={tag.id} onClick={() => setSelectedTag(tag.id)} aria-pressed={selectedTag === tag.id} className={`min-h-9 rounded-full border px-2.5 text-xs ${selectedTag === tag.id ? "border-primary bg-accent text-accent-foreground" : "border-border"}`}>{tagLabels[tag.id] ?? tag.id} · {tag.count}</button>)}</div><p className="mt-3 text-xs text-muted-foreground">Taggar och doser visas samma dag; diagrammet visar inget orsakssamband.</p></section>
    <WellbeingInsights store={store}/>
    <button type="button" onClick={onOpenCalendar} className="mb-5 flex min-h-[76px] w-full items-center gap-4 rounded-[22px] border border-border/80 bg-card px-5 text-left"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground"><CalendarDays className="size-5"/></span><span className="min-w-0 flex-1"><span className="block text-[17px] font-semibold">Kalender</span><span className="mt-1 block text-[13px] text-muted-foreground">Doser och kvällskollar per dag</span></span><ChevronRight className="size-5 text-muted-foreground"/></button>
    <section className={`${card} mb-5`}><div className="mb-4 flex items-center gap-2"><MapPin className="size-4 text-primary" /><h2 className="text-lg font-medium">Injektionsställen</h2></div>{siteLogs.length ? <BodyMap logs={siteLogs} /> : <p className="text-sm text-muted-foreground">Inga injektionsställen har loggats under perioden.</p>}</section>
    <section className={card}><h2 className="mb-3 text-lg font-medium">Peptider</h2><div className="divide-y divide-border">{store.peptides.map(peptide => <button type="button" key={peptide.id} onClick={() => onOpenPeptide(peptide.id)} className="flex min-h-14 w-full items-center justify-between gap-3 text-left"><span className="min-w-0 truncate text-sm">{peptide.name}{peptide.archived ? " · arkiverad" : ""}</span><span className="shrink-0 text-xs text-muted-foreground">Visa kurva →</span></button>)}</div>{store.peptides.length === 0 && <p className="text-sm text-muted-foreground">Lägg till en peptid för att se dess historik.</p>}</section>
  </>;
}
