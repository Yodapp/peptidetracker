"use client";

import { useState } from "react";
import { Activity } from "lucide-react";
import { SegmentedControl } from "@/components/peptime-ui";
import { addDays, displayLogDate, logScheduledDate, stockholmDate } from "@/lib/log-day";
import type { DailyNote, PeptimeStore, WellbeingMetric } from "@/lib/types";

const metrics: { key: WellbeingMetric; label: string; low: string; high: string; color: string }[] = [
  { key: "sleepQuality", label: "Sömn", low: "Mycket dålig", high: "Mycket bra", color: "#72b7aa" },
  { key: "brainFatigue", label: "Hjärntrötthet", low: "Ingen", high: "Extrem", color: "#7f9fca" },
  { key: "physicalFatigue", label: "Fysisk trötthet", low: "Ingen", high: "Extrem", color: "#c9828b" },
  { key: "painLevel", label: "Värk", low: "Ingen värk", high: "Mycket värk", color: "#b48a9e" },
  { key: "activityLevel", label: "Aktivitetsnivå", low: "Mycket låg", high: "Mycket hög", color: "#c4a66a" },
];

const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const dayNumber = (date: string) => Math.floor(Date.parse(`${date}T12:00:00Z`) / 86400000);

export function WellbeingInsights({ store }: { store: PeptimeStore }) {
  const [metricKey, setMetricKey] = useState<WellbeingMetric>("sleepQuality");
  const [period, setPeriod] = useState<7 | 30 | 90>(30);
  const [peptideId, setPeptideId] = useState("all");
  const metric = metrics.find(value => value.key === metricKey)!;
  const today = stockholmDate();
  const start = addDays(today, 1 - period);
  const previousStart = addDays(start, -period);
  const previousEnd = addDays(start, -1);
  const inRange = (note: DailyNote, from: string, to: string) => note.date >= from && note.date <= to && typeof note[metricKey] === "number";
  const points = store.dailyNotes.filter(note => inRange(note, start, today)).map(note => ({ date: note.date, value: note[metricKey] as number })).sort((a,b) => a.date.localeCompare(b.date));
  const currentAverage = average(points.map(point => point.value));
  const previousAverage = average(store.dailyNotes.filter(note => inRange(note, previousStart, previousEnd)).map(note => note[metricKey] as number));
  const change = currentAverage !== null && previousAverage !== null ? currentAverage - previousAverage : null;
  const trend = points.map(point => ({ date: point.date, value: average(points.filter(candidate => candidate.date <= point.date && dayNumber(point.date) - dayNumber(candidate.date) <= 6).map(candidate => candidate.value))! }));
  const x = (date: string) => 34 + (dayNumber(date) - dayNumber(start)) / Math.max(1, period - 1) * 276;
  const y = (value: number) => 150 - (value - 1) / 4 * 116;
  const path = (values: {date:string;value:number}[]) => values.map((point,index) => `${index && dayNumber(point.date) - dayNumber(values[index-1].date) === 1 ? "L" : "M"}${x(point.date)},${y(point.value)}`).join(" ");
  const doseDates = [...new Set(store.logs.filter(log => log.status === "taken" && (peptideId === "all" || log.peptideId === peptideId)).map(log => logScheduledDate(log, store.settings.dayBoundaryHour)).filter(date => date >= start && date <= today))];
  return <section className="mb-5 rounded-[20px] border border-border bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,.025)]">
    <div className="mb-4 flex items-center gap-2"><Activity className="size-4 text-primary"/><div><h2 className="text-lg font-medium">Mående och aktivitet</h2><p className="mt-0.5 text-xs text-muted-foreground">Dina dagliga uppföljningar över tid</p></div></div>
    <div className="grid grid-cols-2 gap-2">{metrics.map(value => <button type="button" key={value.key} aria-pressed={metricKey === value.key} onClick={() => setMetricKey(value.key)} className={`min-h-10 rounded-xl border px-3 text-xs ${metricKey === value.key ? "border-primary bg-accent text-accent-foreground" : "border-border text-muted-foreground"}`}>{value.label}</button>)}</div>
    <div className="mt-3"><SegmentedControl label="Period för mående" value={period} onChange={setPeriod} values={[{value:7,label:"7 dagar"},{value:30,label:"30 dagar"},{value:90,label:"90 dagar"}]}/></div>
    <label className="mt-4 block text-xs text-muted-foreground">Dosmarkörer<select value={peptideId} onChange={event => setPeptideId(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"><option value="all">Alla peptider</option>{store.peptides.filter(peptide => !peptide.archived).map(peptide => <option key={peptide.id} value={peptide.id}>{peptide.name}</option>)}</select></label>
    <div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Genomsnitt</p><p className="mt-1 text-xl font-semibold tabular-nums">{currentAverage === null ? "–" : currentAverage.toLocaleString("sv-SE", {maximumFractionDigits:1})}</p></div><div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Mot föregående period</p><p className="mt-1 text-xl font-semibold tabular-nums">{change === null ? "–" : `${change > 0 ? "+" : ""}${change.toLocaleString("sv-SE", {maximumFractionDigits:1})}`}</p></div></div>
    {points.length === 0 ? <p className="grid h-48 place-items-center text-center text-sm text-muted-foreground">Logga dagens mående för att se en kurva här.</p> : <svg viewBox="0 0 330 196" role="img" aria-label={`${metric.label} under ${period} dagar med doseringstillfällen markerade`} className="mt-4 w-full overflow-visible">
      {[1,3,5].map(value => <g key={value}><line x1="34" x2="310" y1={y(value)} y2={y(value)} stroke="currentColor" className="text-border"/><text x="27" y={y(value)+3} textAnchor="end" className="fill-muted-foreground text-[9px]">{value}</text></g>)}
      {doseDates.map(date => <line key={date} x1={x(date)} x2={x(date)} y1="158" y2="169" stroke="currentColor" strokeWidth="2" className="text-muted-foreground"/>)}
      <path d={path(trend)} fill="none" stroke={metric.color} strokeWidth="2.5" strokeLinejoin="round"/>
      {points.map(point => <circle key={point.date} cx={x(point.date)} cy={y(point.value)} r="3.5" fill={metric.color}/>) }
      <text x="34" y="192" className="fill-muted-foreground text-[9px]">{displayLogDate(start,{day:"numeric",month:"short"})}</text><text x="310" y="192" textAnchor="end" className="fill-muted-foreground text-[9px]">Idag</text>
    </svg>}
    <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-2"><span className="size-3 rounded-full" style={{background:metric.color}}/>Värde och 7-dagarstrend</span><span className="flex items-center gap-2"><span className="h-3 border-l-2 border-muted-foreground"/>Dos</span></div>
    <div className="mt-3 flex justify-between text-xs text-muted-foreground"><span>1 · {metric.low}</span><span>5 · {metric.high}</span></div>
    <p className="mt-3 text-xs leading-5 text-muted-foreground">Doseringar och värden visas på samma tidslinje. Det visar tidsmässiga mönster, inte att en peptid har orsakat en förändring. Dagar utan svar lämnas tomma.</p>
  </section>;
}
