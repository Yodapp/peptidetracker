"use client";

import { useState } from "react";
import { ArrowLeft, CalendarDays, ChevronRight, MapPin, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WellbeingInsights } from "@/components/wellbeing-insights";
import { PageHeader, SegmentedControl } from "@/components/peptime-ui";
import { exposureGroups, hasDailyEntry, metricDefinitions, periodStart, topPatterns, type InsightPattern, type InsightPeriod } from "@/lib/insight-analysis";
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
  { name: "Buk mitten", side: "front", x: 72, y: 109 },
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
  return <svg viewBox="0 0 144 218" className="mx-auto block w-full" aria-hidden="true">
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
    <div className="grid grid-cols-2 gap-2 text-center">
      {(["front", "back"] as const).map(side => <div key={side} className="relative min-w-0 rounded-2xl border border-border/60 bg-muted/30 py-3 text-muted-foreground">
        <div className="relative mx-auto w-36 max-w-full">
          <BodyShape side={side} />
          {known.filter(site => site.side === side).map(site => {
            const count = events.filter(event => event[0].site?.toLocaleLowerCase("sv-SE") === site.name.toLocaleLowerCase("sv-SE")).length;
            const active = focus === site.name;
            return <button key={site.name} type="button" aria-label={`Visa historik för ${site.name}: ${count} ${count === 1 ? "injektionstillfälle" : "injektionstillfällen"}`} aria-pressed={active} onClick={() => showHistory(site.name)} title={site.name} style={{ left: `${site.x / 144 * 100}%`, top: `${site.y / 218 * 100}%` }} className={`absolute grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 text-[11px] font-semibold shadow-sm transition-transform hover:scale-110 ${active ? "border-foreground bg-primary text-primary-foreground" : count ? "border-background bg-primary text-primary-foreground" : "border-primary bg-card text-primary"}`}>{count || <span className="size-2 rounded-full bg-primary" />}</button>;
          })}
        </div>
        <p className="mt-1 text-xs font-medium text-foreground/80">{side === "front" ? "Framsida" : "Baksida"}</p>
      </div>)}
    </div>
    <p className="mt-3 text-center text-xs text-muted-foreground">Tryck på en markering för att se historik.</p>
    {other.length > 0 && <div className="mt-4 divide-y divide-border border-t border-border">{other.map(name => {
      const count = events.filter(event => event[0].site?.toLocaleLowerCase("sv-SE") === name.toLocaleLowerCase("sv-SE")).length;
      return <button type="button" key={name} onClick={() => showHistory(name)} aria-pressed={focus === name} className="flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left text-sm"><span className={focus === name ? "font-medium text-primary" : "text-muted-foreground"}>{name}</span><span className="flex items-center gap-1 text-muted-foreground"><span className="tabular-nums">{count}</span><ChevronRight className="size-4"/></span></button>;
    })}</div>}
    {focus && <div className="mt-5 border-t border-border pt-4"><p className="font-medium">{focus}</p><p className="mt-1 text-xs text-muted-foreground">{focusEvents.length} {focusEvents.length === 1 ? "loggat injektionstillfälle" : "loggade injektionstillfällen"}</p>{focusEvents.length > 0 && <div className="mt-3 space-y-2">{focusEvents.slice(0, 5).map(event => <div key={event[0].id} className="flex justify-between gap-3 text-xs"><span className="truncate">{event.map(log => log.peptideName).join(" + ")}</span><span className="shrink-0 text-muted-foreground">{displayLogDate(stockholmDate(event[0].takenAt), { day: "numeric", month: "short", year: "numeric" })}</span></div>)}</div>}</div>}
  </div>;
}

function Chart({ logs, store, color, period }: { logs: DoseLog[]; store: PeptimeStore; color: string; period: InsightPeriod }) {
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
  const [period, setPeriod] = useState<InsightPeriod>(90);
  const logs = store.logs.filter(log => log.peptideId === peptide.id);
  const start = periodStart(stockholmDate(), period);
  const periodLogs = logs.filter(log => dayOf(log, store) >= start);
  const taken = periodLogs.filter(log => log.status === "taken");
  const skipped = periodLogs.length - taken.length;
  const totalMcg = taken.reduce((sum, log) => sum + massMcg(log, log.actualDose), 0);
  const usedSites = [...new Set(taken.map(log => log.site).filter(Boolean))];
  const color = colors[peptide.color] ?? colors.teal;
  return <>
    <header className="mb-6 flex items-center gap-3 pt-8"><Button variant="ghost" size="icon" className="size-11 shrink-0 rounded-full" onClick={onBack} aria-label="Tillbaka"><ArrowLeft /></Button><div><p className="text-xs font-semibold text-primary">Peptidens historik</p><h1 className="mt-1 text-[32px] font-bold tracking-tight">{peptide.name}</h1></div></header>
    <div className="mb-5"><SegmentedControl label="Tidsperiod" value={period} onChange={setPeriod} values={[{ value: 30, label: "30 dagar" }, { value: 90, label: "90 dagar" }, { value: 365, label: "1 år" }]}/></div>
    <div className="mb-5 grid grid-cols-3 gap-2">{[["Tagna", String(taken.length)], ["Överhoppade", String(skipped)], ["Total dos", `${formatNumber(totalMcg / 1000)} mg`]].map(([label, value]) => <div key={label} className="rounded-2xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-lg font-semibold tabular-nums">{value}</p></div>)}</div>
    <WellbeingInsights store={store} period={period} peptideId={peptide.id}/>
    <section className={`${card} mb-5`}><h2 className="mb-5 text-lg font-medium">Dos över tid</h2><Chart logs={logs} store={store} color={color} period={period}/></section>
    <section className={`${card} mb-5`}><div className="mb-4 flex items-center gap-2"><MapPin className="size-4 text-primary" /><h2 className="text-lg font-medium">Injektionsställen</h2></div>{usedSites.length ? <BodyMap logs={taken} /> : <p className="text-sm text-muted-foreground">Inga injektionsställen har loggats för den här peptiden.</p>}</section>
    <section className={card}><h2 className="mb-4 text-lg font-medium">Senaste loggarna</h2>{logs.length ? <div className="divide-y divide-border">{[...logs].sort((a, b) => b.takenAt.localeCompare(a.takenAt)).slice(0, 10).map(log => <div key={log.id} className="flex justify-between gap-3 py-3 text-sm"><span className="min-w-0 truncate">{log.status === "taken" ? `${formatNumber(log.actualDose)} ${log.unit}${log.site ? ` · ${log.site}` : ""}` : "Överhoppad"}</span><span className="shrink-0 text-xs text-muted-foreground">{displayLogDate(dayOf(log, store), { day: "numeric", month: "short" })}</span></div>)}</div> : <p className="text-sm text-muted-foreground">Ingen historik ännu.</p>}</section>
  </>;
}

const patternNumber = (value: number) => value.toLocaleString("sv-SE", { maximumFractionDigits: 1 });
const tagLabel = (tag: string) => tagLabels[tag] ?? tag;

function PatternCards({ store, period, today }: { store: PeptimeStore; period: 30 | 90; today: string }) {
  const patterns = topPatterns(store, period, today);
  const groups = exposureGroups(store, period, today);
  const noteDays = store.dailyNotes.filter(note => note.date >= periodStart(today, period) && note.date <= today && hasDailyEntry(note)).length;
  const enoughForComparison = groups.some(group => group.doseDates.length >= 4) && noteDays >= 8;
  const title = (pattern: InsightPattern) => {
    const comparison = pattern.comparison;
    const subject = comparison.kind === "metric" ? metricDefinitions.find(metric => metric.key === comparison.metricKey)!.label : tagLabel(comparison.tag);
    return `${subject} ${pattern.window === "next_day" ? "dagen efter" : "på dosdagen"} ${pattern.exposure.label}`;
  };
  return <section className={`${card} mb-5`}>
    <div className="mb-4 flex items-center gap-2"><Sparkles className="size-4 text-primary"/><div><h2 className="text-lg font-medium">Mönster i dina loggar</h2><p className="mt-0.5 text-xs text-muted-foreground">De största skillnaderna med tillräckligt underlag</p></div></div>
    {patterns.length > 0 ? <div className="divide-y divide-border">{patterns.map(pattern => {
      const comparison = pattern.comparison;
      return <div key={`${pattern.exposure.id}:${comparison.kind === "metric" ? comparison.metricKey : comparison.tag}:${pattern.window}`} className="py-4 first:pt-0 last:pb-0">
        <p className="font-medium leading-5">{title(pattern)}</p>
        {comparison.kind === "metric"
          ? <p className="mt-1 text-sm leading-6 text-muted-foreground"><strong className="font-semibold text-foreground">{patternNumber(comparison.exposedAverage!)} av 5</strong> på {comparison.exposedCount} svar, jämfört med <strong className="font-semibold text-foreground">{patternNumber(comparison.baselineAverage!)}</strong> på {comparison.baselineCount} andra dagar.</p>
          : <p className="mt-1 text-sm leading-6 text-muted-foreground">Loggat <strong className="font-semibold text-foreground">{comparison.exposedOccurrences} av {comparison.exposedCount} dagar</strong>, jämfört med {comparison.baselineOccurrences} av {comparison.baselineCount} andra dagar.</p>}
        {pattern.exposure.coDose && <p className="mt-1 text-xs leading-5 text-muted-foreground">{pattern.exposure.coDose.label} togs också på {pattern.exposure.coDose.count} av {pattern.exposure.coDose.total} dosdagar.</p>}
      </div>;
    })}</div> : <div className="rounded-xl border border-dashed border-border p-4 text-sm leading-6 text-muted-foreground">{groups.length === 0 ? "Mönster visas när du har loggat doser och mående." : enoughForComparison ? "Inga större skillnader syns i den valda perioden." : "Fortsätt fylla i mående. En jämförelse visas när minst fyra dosdagar och fyra andra dagar har svar."}</div>}
  </section>;
}

function ActivityCalendar({ store, period, today, onOpenCalendar }: { store: PeptimeStore; period: 30 | 90; today: string; onOpenCalendar: () => void }) {
  const [selectedTag, setSelectedTag] = useState<DailyTagId | "all">("all");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const start = periodStart(today, period);
  const days = Array.from({ length: period }, (_, index) => addDays(start, index));
  const notes = new Map(store.dailyNotes.map(note => [note.date, note]));
  const logs = store.logs.filter(log => dayOf(log, store) >= start && dayOf(log, store) <= today);
  const offset = (new Date(`${start}T12:00:00Z`).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [...Array.from({ length: offset }, () => null), ...days];
  while (cells.length % 7) cells.push(null);
  const tags = [...new Set(days.flatMap(date => notes.get(date)?.tags ?? []))].map(id => ({ id, count: days.filter(date => notes.get(date)?.tags.includes(id)).length })).sort((a, b) => b.count - a.count || tagLabel(a.id).localeCompare(tagLabel(b.id), "sv-SE"));
  const dayLogs = selectedDate ? logs.filter(log => dayOf(log, store) === selectedDate) : [];
  const dayNote = selectedDate ? notes.get(selectedDate) : undefined;

  if (!logs.length && !days.some(date => hasDailyEntry(notes.get(date)))) return <section className={`${card} mb-5`}>
    <div className="flex items-start gap-2"><CalendarDays className="mt-0.5 size-4 text-primary"/><div><h2 className="text-lg font-medium">Doser och mående per dag</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Din aktivitet visas här när du har loggat en dos eller dagens mående.</p></div></div>
    <div className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Ingen aktivitet under de senaste {period} dagarna.</div>
    <button type="button" onClick={onOpenCalendar} className="mt-4 flex min-h-12 w-full items-center justify-between border-t border-border pt-4 text-left text-sm font-medium"><span>Öppna hela kalendern</span><ChevronRight className="size-4 text-muted-foreground"/></button>
  </section>;

  return <section className={`${card} mb-5`}>
    <div className="flex items-start gap-2"><CalendarDays className="mt-0.5 size-4 text-primary"/><div><h2 className="text-lg font-medium">Doser och mående per dag</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Mörkare ruta betyder fler tagna doser. Blå prick visar mående eller vald tagg.</p></div></div>
    <div className="mt-5 grid grid-cols-7 gap-1 text-center font-mono text-[10px] text-muted-foreground">{"M T O T F L S".split(" ").map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
    <div className="mt-2 grid grid-cols-7 gap-1.5">{cells.map((date, index) => {
      if (!date) return <span key={`empty-${index}`}/>;
      const count = logs.filter(log => log.status === "taken" && dayOf(log, store) === date).length;
      const hasMarker = selectedTag === "all" ? hasDailyEntry(notes.get(date)) : Boolean(notes.get(date)?.tags.includes(selectedTag));
      return <button type="button" key={date} onClick={() => setSelectedDate(date)} aria-label={`${date}: ${count} tagna doser${hasMarker ? ", mående registrerat" : ""}`} className={`relative aspect-square min-h-9 rounded-lg border text-[11px] tabular-nums ${selectedDate === date ? "border-foreground" : "border-transparent"} ${count === 0 ? "bg-muted/70" : count === 1 ? "bg-primary/45" : count === 2 ? "bg-primary/70 text-primary-foreground" : "bg-primary text-primary-foreground"}`}>{Number(date.slice(-2))}{hasMarker && <span className="absolute bottom-1 right-1 size-1.5 rounded-full bg-[#7f9fca] ring-1 ring-card"/>}</button>;
    })}</div>

    {tags.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5"><button type="button" onClick={() => setSelectedTag("all")} aria-pressed={selectedTag === "all"} className={`min-h-9 rounded-full border px-2.5 text-xs ${selectedTag === "all" ? "border-primary bg-accent text-accent-foreground" : "border-border"}`}>Allt mående</button>{tags.map(tag => <button type="button" key={tag.id} onClick={() => setSelectedTag(tag.id)} aria-pressed={selectedTag === tag.id} className={`min-h-9 rounded-full border px-2.5 text-xs ${selectedTag === tag.id ? "border-primary bg-accent text-accent-foreground" : "border-border"}`}>{tagLabel(tag.id)} · {tag.count}</button>)}</div>}

    {selectedDate && <div className="mt-4 rounded-xl border border-border p-3 text-xs">
      <p className="font-semibold">{displayLogDate(selectedDate, { weekday: "long", day: "numeric", month: "long" })}</p>
      {dayLogs.length > 0 ? <div className="mt-2 space-y-1 text-muted-foreground">{dayLogs.map(log => <p key={log.id}>{log.peptideName}: <span className="text-foreground">{log.status === "taken" ? `${formatNumber(log.actualDose)} ${log.unit}` : "Överhoppad"}</span></p>)}</div> : <p className="mt-2 text-muted-foreground">Inga doser registrerade.</p>}
      {dayNote && <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">{metricDefinitions.filter(metric => typeof dayNote[metric.key] === "number").map(metric => <span key={metric.key}>{metric.label}: <strong className="text-foreground">{dayNote[metric.key]} / 5</strong></span>)}</div>}
      {dayNote?.tags.length ? <p className="mt-2 text-muted-foreground">Taggar: {dayNote.tags.map(tagLabel).join(", ")}</p> : null}
    </div>}

    <button type="button" onClick={onOpenCalendar} className="mt-4 flex min-h-12 w-full items-center justify-between border-t border-border pt-4 text-left text-sm font-medium"><span>Öppna hela kalendern</span><ChevronRight className="size-4 text-muted-foreground"/></button>
  </section>;
}

export function InsightsView({ store, onOpenPeptide, onOpenCalendar }: { store: PeptimeStore; onOpenPeptide: (id: string) => void; onOpenCalendar: () => void }) {
  const [period, setPeriod] = useState<30 | 90>(90);
  const today = stockholmDate();
  const start = periodStart(today, period);
  const logs = store.logs.filter(log => dayOf(log, store) >= start && dayOf(log, store) <= today);
  const taken = logs.filter(log => log.status === "taken");
  const skipped = logs.length - taken.length;
  const loggedDays = new Set(taken.map(log => dayOf(log, store)));
  const noteDays = store.dailyNotes.filter(note => note.date >= start && note.date <= today && hasDailyEntry(note)).length;
  const siteLogs = taken.filter(log => log.site);
  return <>
    <PageHeader eyebrow="Din egen data" title="Insikter" subtitle="Mönster i det du har loggat"/>
    <div className="mb-5"><SegmentedControl label="Tidsperiod" value={period} onChange={setPeriod} values={[{ value: 30, label: "30 dagar" }, { value: 90, label: "90 dagar" }]}/></div>
    <div className="mb-5 grid grid-cols-2 gap-2">{[["Tagna doser", String(taken.length)], ["Dosdagar", String(loggedDays.size)], ["Måendedagar", `${noteDays} av ${period}`], ["Överhoppade", String(skipped)]].map(([label, value]) => <div key={label} className="rounded-2xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-xl font-semibold tabular-nums">{value}</p></div>)}</div>
    <PatternCards store={store} period={period} today={today}/>
    <WellbeingInsights store={store} period={period}/>
    <ActivityCalendar store={store} period={period} today={today} onOpenCalendar={onOpenCalendar}/>
    <section className={`${card} mb-5`}><div className="mb-4 flex items-center gap-2"><MapPin className="size-4 text-primary"/><div><h2 className="text-lg font-medium">Injektionsställen</h2><p className="mt-0.5 text-xs text-muted-foreground">Antal injektionstillfällen under {period} dagar</p></div></div>{siteLogs.length ? <BodyMap logs={siteLogs}/> : <p className="text-sm text-muted-foreground">Inga injektionsställen har loggats under perioden.</p>}</section>
    <section className={card}><h2 className="mb-3 text-lg font-medium">Peptider</h2><div className="divide-y divide-border">{store.peptides.map(peptide => {
      const peptideLogs = taken.filter(log => log.peptideId === peptide.id);
      const doseDays = new Set(peptideLogs.map(log => dayOf(log, store))).size;
      const latest = [...peptideLogs].sort((a, b) => b.takenAt.localeCompare(a.takenAt))[0];
      return <button type="button" key={peptide.id} onClick={() => onOpenPeptide(peptide.id)} className="flex min-h-16 w-full items-center justify-between gap-3 text-left"><span className="min-w-0"><span className="block truncate text-sm font-medium">{peptide.name}{peptide.archived ? " · arkiverad" : ""}</span><span className="mt-1 block text-xs text-muted-foreground">{latest ? `${doseDays} ${doseDays === 1 ? "dosdag" : "dosdagar"} · senast ${displayLogDate(dayOf(latest, store), { day: "numeric", month: "short" })}` : "Ingen dos under perioden"}</span></span><ChevronRight className="size-4 shrink-0 text-muted-foreground"/></button>;
    })}</div>{store.peptides.length === 0 && <p className="text-sm text-muted-foreground">Lägg till en peptid för att se dess historik.</p>}</section>
  </>;
}
