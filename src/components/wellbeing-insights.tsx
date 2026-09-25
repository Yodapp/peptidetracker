"use client";

import { useState } from "react";
import { Activity } from "lucide-react";
import { SegmentedControl } from "@/components/peptime-ui";
import { compareMetric, exposureForSelection, metricDefinitions, periodStart, type InsightPeriod, type InsightWindow } from "@/lib/insight-analysis";
import { displayLogDate, logScheduledDate, stockholmDate } from "@/lib/log-day";
import type { PeptimeStore, WellbeingMetric } from "@/lib/types";

const dayNumber = (date: string) => Math.floor(Date.parse(`${date}T12:00:00Z`) / 86400000);
const number = (value: number | null) => value === null ? "–" : value.toLocaleString("sv-SE", { maximumFractionDigits: 1 });
const windowLabel = (window: InsightWindow) => window === "next_day" ? "Dagen efter" : "Dosdagen";

export function WellbeingInsights({ store, period, peptideId }: { store: PeptimeStore; period: InsightPeriod; peptideId?: string }) {
  const [metricKey, setMetricKey] = useState<WellbeingMetric>("sleepQuality");
  const [window, setWindow] = useState<InsightWindow>("next_day");
  const [selectedPeptideId, setSelectedPeptideId] = useState("all");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const activePeptideId = peptideId ?? selectedPeptideId;
  const metric = metricDefinitions.find(value => value.key === metricKey)!;
  const today = stockholmDate();
  const start = periodStart(today, period);
  const exposure = exposureForSelection(store, activePeptideId, period, today);
  const comparison = compareMetric(store, exposure, metricKey, window, period, today);
  const points = store.dailyNotes
    .filter(note => note.date >= start && note.date <= today && typeof note[metricKey] === "number")
    .map(note => ({ date: note.date, value: note[metricKey] as number }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const trend = points.flatMap(point => {
    const values = points.filter(candidate => candidate.date <= point.date && dayNumber(point.date) - dayNumber(candidate.date) <= 6).map(candidate => candidate.value);
    return values.length >= 3 ? [{ date: point.date, value: values.reduce((sum, value) => sum + value, 0) / values.length }] : [];
  });
  const x = (date: string) => 34 + (dayNumber(date) - dayNumber(start)) / Math.max(1, period - 1) * 276;
  const y = (value: number) => 150 - (value - 1) / 4 * 116;
  const trendPath = trend.map((point, index) => `${index ? "L" : "M"}${x(point.date)},${y(point.value)}`).join(" ");
  const selectedNote = selectedDate ? store.dailyNotes.find(note => note.date === selectedDate) : undefined;
  const selectedLogs = selectedDate ? store.logs.filter(log => logScheduledDate(log, store.settings.dayBoundaryHour) === selectedDate) : [];
  const changeMetric = (key: WellbeingMetric) => {
    setMetricKey(key);
    setWindow(metricDefinitions.find(value => value.key === key)!.defaultWindow);
    setSelectedDate(null);
  };
  const context = activePeptideId === "all" ? "alla doser" : exposure.label;

  return <section className="mb-7 rounded-[18px] bg-card p-5">
    <div className="mb-4 flex items-center gap-2"><Activity className="size-4 text-primary"/><div><h2 className="text-[17px] font-semibold">Mående efter dos</h2><p className="mt-0.5 text-xs text-muted-foreground">Jämför dina svar på dosdagar och andra dagar</p></div></div>

    <div className="grid grid-cols-2 gap-2">{metricDefinitions.map(value => <button type="button" key={value.key} aria-pressed={metricKey === value.key} onClick={() => changeMetric(value.key)} className={`min-h-10 rounded-full px-3 text-[15px] transition-colors ${metricKey === value.key ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground/80"}`}>{value.label}</button>)}</div>

    {!peptideId && <label className="mt-4 block text-xs text-muted-foreground">Peptid<select value={selectedPeptideId} onChange={event => { setSelectedPeptideId(event.target.value); setSelectedDate(null); }} className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-base text-foreground"><option value="all">Alla doser</option>{store.peptides.filter(peptide => !peptide.archived).map(peptide => <option key={peptide.id} value={peptide.id}>{peptide.name}</option>)}</select></label>}

    <div className="mt-4"><SegmentedControl label="Tidskoppling" value={window} onChange={value => { setWindow(value); setSelectedDate(null); }} values={[{ value: "same_day", label: "Dosdagen" }, { value: "next_day", label: "Dagen efter" }]}/></div>
    {metricKey === "sleepQuality" && window === "same_day" && <p className="mt-2 text-xs leading-5 text-muted-foreground">Sömnsvaret gäller natten fram till dosdagen. För sömn efter dosen, välj “Dagen efter”.</p>}

    <div className="mt-4 grid grid-cols-2 gap-2">
      <div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">{windowLabel(window)} · {context}</p><p className="mt-1 text-xl font-semibold tabular-nums">{comparison.sufficient ? number(comparison.exposedAverage) : "–"}</p><p className="mt-1 text-[11px] text-muted-foreground">{comparison.exposedCount} svar av {comparison.eligibleDoseDays} möjliga</p></div>
      <div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Övriga dagar</p><p className="mt-1 text-xl font-semibold tabular-nums">{comparison.sufficient ? number(comparison.baselineAverage) : "–"}</p><p className="mt-1 text-[11px] text-muted-foreground">{comparison.baselineCount} svar</p></div>
    </div>
    {comparison.sufficient
      ? <p className="mt-3 rounded-xl border border-border px-3 py-2 text-sm"><span className="text-muted-foreground">Skillnad i dina svar: </span><strong className="tabular-nums">{comparison.difference! > 0 ? "+" : ""}{number(comparison.difference)}</strong></p>
      : <p className="mt-3 rounded-xl border border-dashed border-border px-3 py-2 text-xs leading-5 text-muted-foreground">För en jämförelse behövs minst 4 svar för {window === "next_day" ? "dagar efter dos" : "dosdagar"} och 4 svar för övriga dagar. Nu finns {comparison.exposedCount} respektive {comparison.baselineCount}.</p>}
    {exposure.coDose && <p className="mt-2 text-xs leading-5 text-muted-foreground">{exposure.coDose.label} togs också på {exposure.coDose.count} av {exposure.coDose.total} dosdagar.</p>}

    {points.length === 0 ? <p className="grid h-32 place-items-center text-center text-sm text-muted-foreground">Logga dagens mående för att se en kurva här.</p> : <svg viewBox="0 0 330 196" role="img" aria-label={`${metric.label} under ${period} dagar med doseringstillfällen markerade`} className="mt-4 w-full overflow-visible">
      {[1, 3, 5].map(value => <g key={value}><line x1="34" x2="310" y1={y(value)} y2={y(value)} stroke="currentColor" className="text-border"/><text x="27" y={y(value) + 3} textAnchor="end" className="fill-muted-foreground text-[9px]">{value}</text></g>)}
      {exposure.doseDates.map(date => <g key={date} role="button" tabIndex={0} aria-label={`Dos ${date}`} onClick={() => setSelectedDate(date)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") setSelectedDate(date); }}><line x1={x(date)} x2={x(date)} y1="158" y2="169" stroke="currentColor" strokeWidth="2" className="text-muted-foreground"/><rect x={x(date) - 5} y="154" width="10" height="19" fill="transparent"/></g>)}
      {trendPath && <path d={trendPath} fill="none" stroke={metric.color} strokeWidth="2" strokeDasharray="4 4" strokeLinejoin="round"/>}
      {points.map(point => <g key={point.date} role="button" tabIndex={0} aria-label={`${point.date}: ${point.value} av 5`} onClick={() => setSelectedDate(point.date)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") setSelectedDate(point.date); }}><circle cx={x(point.date)} cy={y(point.value)} r={selectedDate === point.date ? 5 : 3.5} fill={metric.color}/><circle cx={x(point.date)} cy={y(point.value)} r="10" fill="transparent"/></g>)}
      <text x="34" y="192" className="fill-muted-foreground text-[9px]">{displayLogDate(start, { day: "numeric", month: "short" })}</text><text x="310" y="192" textAnchor="end" className="fill-muted-foreground text-[9px]">Idag</text>
    </svg>}
    {points.length > 0 && <><div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-2"><span className="size-3 rounded-full" style={{ background: metric.color }}/>Dagsvärde</span>{trend.length > 0 && <span className="flex items-center gap-2"><span className="w-4 border-t-2 border-dashed" style={{ borderColor: metric.color }}/>7-dagarssnitt</span>}<span className="flex items-center gap-2"><span className="h-3 border-l-2 border-muted-foreground"/>Dos</span></div>
    <div className="mt-3 flex justify-between text-xs text-muted-foreground"><span>1 · {metric.low}</span><span>5 · {metric.high}</span></div></>}

    {selectedDate && <div className="mt-4 rounded-xl border border-border p-3 text-xs">
      <div className="flex items-center justify-between gap-3"><strong>{displayLogDate(selectedDate, { weekday: "short", day: "numeric", month: "short" })}</strong><button type="button" className="text-primary" onClick={() => setSelectedDate(null)}>Stäng</button></div>
      {selectedLogs.length > 0 && <p className="mt-2 text-muted-foreground">Doser: {selectedLogs.map(log => `${log.peptideName}${log.status === "skipped" ? " (överhoppad)" : ""}`).join(", ")}</p>}
      {selectedNote && <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">{metricDefinitions.filter(value => typeof selectedNote[value.key] === "number").map(value => <span key={value.key}>{value.label}: <strong className="text-foreground">{selectedNote[value.key]} / 5</strong></span>)}</div>}
      {selectedNote?.tags.length ? <p className="mt-2 text-muted-foreground">Taggar: {selectedNote.tags.join(", ")}</p> : null}
      {!selectedLogs.length && !selectedNote && <p className="mt-2 text-muted-foreground">Ingen registrerad data denna dag.</p>}
    </div>}
    <p className="mt-3 text-xs leading-5 text-muted-foreground">Visar samband i dina loggar, inte att en peptid har orsakat en förändring. Dagar utan svar ingår inte i medelvärden.</p>
  </section>;
}
