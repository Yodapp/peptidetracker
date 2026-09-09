"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Download, Plus, Save, ShoppingCart, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Peptide, PurchasePlan, PurchasePlanItem } from "@/lib/types";
import { planDoseIu, projectPurchase } from "@/lib/purchase-plan";

function uid() { return crypto.randomUUID(); }
function n(value: number, digits = 2) { return new Intl.NumberFormat("sv-SE", { maximumFractionDigits: digits }).format(value); }

function emptyItem(): PurchasePlanItem {
  return { id: uid(), name: "", vialMg: 10, doseMcg: 100, doseEntryUnit: "mcg", frequency: "daily", everyNDays: 2, timesPerWeek: 2, bacWaterMl: 2 };
}

function emptyPlan(): PurchasePlan {
  const now = new Date().toISOString();
  return { id: uid(), name: "Ny inköpsplan", items: [emptyItem()], createdAt: now, updatedAt: now };
}

function clonePlan(plan: PurchasePlan) {
  return { ...plan, items: plan.items.map(item => ({ ...item })) };
}

function wholeIuOption(item: PurchasePlanItem) {
  const currentIu = planDoseIu(item);
  if (currentIu <= 0 || item.doseMcg <= 0 || item.vialMg <= 0) return null;
  const targetIu = Math.max(1, Math.round(currentIu));
  return { targetIu, waterMl: (targetIu * item.vialMg * 10) / item.doseMcg };
}

function frequencyLabel(item: PurchasePlanItem) {
  if (item.frequency === "every_n_days") return `Var ${item.everyNDays}:e dag`;
  if (item.frequency === "times_per_week") return `${item.timesPerWeek} dagar per vecka`;
  return "Varje dag";
}

function doseLabel(item: PurchasePlanItem) {
  const mg = item.doseMcg / 1000;
  return item.doseEntryUnit === "mg" ? `${n(mg, 4)} mg (${n(item.doseMcg)} mcg)` : `${n(item.doseMcg)} mcg (${n(mg, 4)} mg)`;
}

function downloadBlob(blob: Blob, name: string) {
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
}

async function exportPlanImage(plan: PurchasePlan) {
  const validItems = plan.items.filter(item => item.name.trim() && item.vialMg > 0 && item.doseMcg > 0);
  const width = 1200;
  const height = 390 + validItems.length * 170;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.fillStyle = "#000000";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#72b7aa";
  context.font = "600 24px ui-monospace, monospace";
  context.fillText("PEPTIME · INKÖPSPLAN", 72, 76);
  context.fillStyle = "#f4f4f5";
  context.font = "600 52px Inter, system-ui, sans-serif";
  context.fillText(plan.name || "Inköpsplan", 72, 145, width - 144);
  context.fillStyle = "#a1a1aa";
  context.font = "24px Inter, system-ui, sans-serif";
  context.fillText("30 och 60 dagar · U-100 · avrundat uppåt till hela vialer", 72, 190);
  let y = 260;
  validItems.forEach(item => {
    const month = projectPurchase(item, 30);
    const twoMonths = projectPurchase(item, 60);
    context.strokeStyle = "rgba(255,255,255,.12)";
    context.beginPath(); context.moveTo(72, y - 28); context.lineTo(width - 72, y - 28); context.stroke();
    context.fillStyle = "#f4f4f5";
    context.font = "600 30px Inter, system-ui, sans-serif";
    context.fillText(item.name, 72, y, 420);
    context.fillStyle = "#a1a1aa";
    context.font = "600 22px Inter, system-ui, sans-serif";
    context.fillText(`Dos: ${doseLabel(item)} · ${n(planDoseIu(item))} IU`, 72, y + 42, 470);
    context.fillStyle = "#71717a";
    context.font = "20px Inter, system-ui, sans-serif";
    context.fillText(frequencyLabel(item), 72, y + 76, 460);
    context.fillStyle = "#f4f4f5";
    context.font = "600 28px ui-monospace, monospace";
    context.fillText(`${month.vials} vial${month.vials === 1 ? "" : "er"}`, 610, y);
    context.fillText(`${twoMonths.vials} vial${twoMonths.vials === 1 ? "" : "er"}`, 910, y);
    context.fillStyle = "#a1a1aa";
    context.font = "20px Inter, system-ui, sans-serif";
    context.fillText(`30 dagar · ${n(month.bacWaterMl)} ml BAC`, 610, y + 42);
    context.fillText(`60 dagar · ${n(twoMonths.bacWaterMl)} ml BAC`, 910, y + 42);
    y += 170;
  });
  const monthBac = validItems.reduce((sum, item) => sum + projectPurchase(item, 30).bacWaterMl, 0);
  const twoMonthBac = validItems.reduce((sum, item) => sum + projectPurchase(item, 60).bacWaterMl, 0);
  context.fillStyle = "#72b7aa";
  context.font = "600 28px Inter, system-ui, sans-serif";
  context.fillText(`BAC totalt: ${n(monthBac)} ml / 30 dagar · ${n(twoMonthBac)} ml / 60 dagar`, 72, height - 86);
  context.fillStyle = "#71717a";
  context.font = "20px Inter, system-ui, sans-serif";
  context.fillText("Beräkning från dina egna värden. Ingen medicinsk rådgivning.", 72, height - 42);
  canvas.toBlob(async blob => {
    if (!blob) return;
    const file = new File([blob], `${(plan.name || "peptime-plan").replace(/[^a-z0-9åäö-]+/gi, "-").toLowerCase()}.png`, { type: "image/png" });
    try {
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: plan.name }); return; }
    } catch {}
    downloadBlob(blob, file.name);
  }, "image/png");
}

export function PurchasePlanner({ peptides, plans, onChange, onBack }: { peptides: Peptide[]; plans: PurchasePlan[]; onChange: (plans: PurchasePlan[]) => void; onBack: () => void }) {
  const [draft, setDraft] = useState<PurchasePlan>(() => plans[0] ? clonePlan(plans[0]) : emptyPlan());
  const validItems = draft.items.filter(item => item.name.trim() && item.vialMg > 0 && item.doseMcg > 0);
  const totals = useMemo(() => [30, 60].map(days => ({ days, vials: validItems.reduce((sum, item) => sum + projectPurchase(item, days).vials, 0), bac: validItems.reduce((sum, item) => sum + projectPurchase(item, days).bacWaterMl, 0) })), [validItems]);
  const setItem = (id: string, part: Partial<PurchasePlanItem>) => setDraft(plan => ({ ...plan, items: plan.items.map(item => item.id === id ? { ...item, ...part } : item) }));
  const addExisting = (id: string) => {
    const peptide = peptides.find(value => value.id === id);
    if (!peptide) return;
    setDraft(plan => ({ ...plan, items: [...plan.items, { ...emptyItem(), name: peptide.name, vialMg: peptide.vialMg, doseMcg: peptide.doseMcg, bacWaterMl: peptide.waterMl, frequency: peptide.frequency === "every_n_days" ? "every_n_days" : peptide.frequency === "weekdays" ? "times_per_week" : "daily", everyNDays: peptide.everyNDays ?? 2, timesPerWeek: Math.max(1, peptide.weekdays.length || 1) }] }));
  };
  const save = () => {
    if (!draft.name.trim() || !validItems.length) return;
    const now = new Date().toISOString();
    const saved = { ...draft, name: draft.name.trim(), items: validItems, updatedAt: now };
    onChange(plans.some(plan => plan.id === saved.id) ? plans.map(plan => plan.id === saved.id ? saved : plan) : [saved, ...plans]);
    setDraft(clonePlan(saved));
  };
  const removePlan = () => {
    if (!plans.some(plan => plan.id === draft.id) || !window.confirm(`Ta bort inköpsplanen “${draft.name}”?`)) return;
    const next = plans.filter(plan => plan.id !== draft.id);
    onChange(next);
    setDraft(next[0] ? clonePlan(next[0]) : emptyPlan());
  };
  return <>
    <header className="sticky top-0 z-20 -mx-5 mb-6 flex min-h-[86px] items-end gap-3 border-b border-border/40 bg-background/80 px-5 pb-3 pt-6 backdrop-blur-[20px] sm:-mx-6 sm:px-6"><Button type="button" variant="ghost" size="icon" className="-ml-2 size-11 rounded-full" onClick={onBack} aria-label="Tillbaka till Peptider"><ArrowLeft/></Button><div><p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-accent-foreground">Planera framåt</p><h1 className="text-[30px] font-medium tracking-[-0.045em]">Inköpsplan</h1></div></header>
    <CardBlock className="mb-5 p-4"><div className="flex items-start gap-3"><ShoppingCart className="mt-0.5 size-5 shrink-0 text-primary"/><div><p className="font-medium">30 och 60 dagar</p><p className="mt-1 text-sm leading-5 text-muted-foreground">Peptime räknar antal hela vialer och total BAC-mängd från värdena du anger.</p></div></div></CardBlock>
    <div className="mb-5 grid grid-cols-[1fr_auto] gap-2"><select aria-label="Ladda sparad plan" className="h-11 min-w-0 rounded-xl border bg-card px-3 text-sm" value={plans.some(plan => plan.id === draft.id) ? draft.id : ""} onChange={event => { const plan = plans.find(value => value.id === event.target.value); if (plan) setDraft(clonePlan(plan)); }}><option value="">Ny, osparad plan</option>{plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select><Button type="button" variant="outline" className="h-11 px-3" onClick={() => setDraft(emptyPlan())}><Plus/> Ny</Button></div>
    <label className="mb-5 block text-xs text-muted-foreground">Planens namn<Input className="mt-1.5 h-12 text-base" value={draft.name} onChange={event => setDraft(plan => ({ ...plan, name: event.target.value }))}/></label>
    <div className="mb-4 grid grid-cols-[1fr_auto] gap-2"><select aria-label="Lägg till befintlig peptid" className="h-11 min-w-0 rounded-xl border bg-card px-3 text-sm" value="" onChange={event => addExisting(event.target.value)}><option value="">Lägg till från Peptider…</option>{peptides.filter(peptide => !peptide.archived).map(peptide => <option key={peptide.id} value={peptide.id}>{peptide.name}</option>)}</select><Button type="button" variant="outline" className="h-11 px-3" onClick={() => setDraft(plan => ({ ...plan, items: [...plan.items, emptyItem()] }))}><Plus/> Tom rad</Button></div>
    <div className="space-y-4">{draft.items.map((item, index) => {
      const month = projectPurchase(item, 30); const twoMonths = projectPurchase(item, 60); const doseValue = item.doseEntryUnit === "mg" ? item.doseMcg / 1000 : item.doseMcg; const wholeIu = wholeIuOption(item);
      return <CardBlock key={item.id} className="overflow-hidden"><div className="flex items-center gap-2 border-b border-border px-4 py-3"><span className="font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span><Input aria-label="Peptidnamn" className="h-11 flex-1 border-0 bg-transparent px-2 text-base font-medium shadow-none focus-visible:ring-0" value={item.name} onChange={event => setItem(item.id, { name: event.target.value })} placeholder="Peptidnamn"/><Button type="button" variant="ghost" size="icon" className="size-11 text-muted-foreground" onClick={() => setDraft(plan => ({ ...plan, items: plan.items.filter(value => value.id !== item.id) }))} aria-label={`Ta bort ${item.name || "rad"}`}><Trash2/></Button></div><div className="grid grid-cols-2 gap-3 p-4">
        <label className="text-xs text-muted-foreground">Vialstorlek (mg)<Input min={0} step="any" type="number" className="mt-1.5 h-11" value={item.vialMg} onChange={event => setItem(item.id, { vialMg: Number(event.target.value) })}/></label>
        <label className="text-xs text-muted-foreground">BAC per vial (ml)<Input min={0} step="any" type="number" className="mt-1.5 h-11" value={item.bacWaterMl} onChange={event => setItem(item.id, { bacWaterMl: Number(event.target.value) })}/></label>
        <label className="text-xs text-muted-foreground">Dos<Input min={0} step="any" type="number" className="mt-1.5 h-11" value={doseValue} onChange={event => setItem(item.id, { doseMcg: Number(event.target.value) * (item.doseEntryUnit === "mg" ? 1000 : 1) })}/></label>
        <label className="text-xs text-muted-foreground">Enhet<select className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3 text-sm" value={item.doseEntryUnit} onChange={event => setItem(item.id, { doseEntryUnit: event.target.value === "mg" ? "mg" : "mcg" })}><option value="mcg">mcg</option><option value="mg">mg</option></select></label>
        <div className="col-span-2 rounded-xl border border-border bg-muted/40 px-3 py-3"><p className="font-mono text-sm tabular-nums">{n(item.doseMcg)} mcg <span className="text-muted-foreground">=</span> {n(item.doseMcg / 1000, 4)} mg</p><p className="mt-1 text-sm text-accent-foreground">Ditt BAC-val ger {n(planDoseIu(item))} IU per dos på U-100.</p>{wholeIu&&<div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3"><p className="text-xs leading-5 text-muted-foreground">Jämnt sprutstreck: {n(wholeIu.waterMl, 3)} ml ger {wholeIu.targetIu} IU.</p>{Math.abs(wholeIu.waterMl-item.bacWaterMl)>0.001&&<Button type="button" variant="outline" className="h-9 shrink-0 px-3 text-xs" onClick={()=>setItem(item.id,{bacWaterMl:Number(wholeIu.waterMl.toFixed(3))})}>Använd</Button>}</div>}</div>
        <label className="col-span-2 text-xs text-muted-foreground">Frekvens<select className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3 text-sm" value={item.frequency} onChange={event => setItem(item.id, { frequency: event.target.value as PurchasePlanItem["frequency"] })}><option value="daily">Varje dag</option><option value="every_n_days">Var N:e dag</option><option value="times_per_week">X dagar per vecka</option></select></label>
        {item.frequency === "every_n_days" && <label className="col-span-2 text-xs text-muted-foreground">Intervall (dagar)<Input min={2} type="number" className="mt-1.5 h-11" value={item.everyNDays} onChange={event => setItem(item.id, { everyNDays: Math.max(2, Number(event.target.value)) })}/></label>}
        {item.frequency === "times_per_week" && <label className="col-span-2 text-xs text-muted-foreground">Dagar per vecka<Input min={1} max={7} type="number" className="mt-1.5 h-11" value={item.timesPerWeek} onChange={event => setItem(item.id, { timesPerWeek: Math.min(7, Math.max(1, Number(event.target.value))) })}/></label>}
      </div><div className="grid grid-cols-2 divide-x divide-border border-t border-border bg-muted/30"><Projection label="30 dagar" vials={month.vials} bac={month.bacWaterMl} doses={month.doses}/><Projection label="60 dagar" vials={twoMonths.vials} bac={twoMonths.bacWaterMl} doses={twoMonths.doses}/></div></CardBlock>})}</div>
    {draft.items.length === 0 && <CardBlock className="border-dashed p-7 text-center"><p className="text-sm text-muted-foreground">Planen är tom.</p><Button type="button" className="mt-4 h-11" onClick={() => setDraft(plan => ({ ...plan, items: [emptyItem()] }))}><Plus/> Lägg till peptid</Button></CardBlock>}
    <section className="mt-6"><h2 className="mb-3 text-sm font-medium">Sammanfattning</h2><CardBlock className="grid grid-cols-2 divide-x divide-border">{totals.map(total => <div key={total.days} className="p-4"><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{total.days} dagar</p><strong className="mt-2 block text-2xl font-semibold tabular-nums">{total.vials} vialer</strong><p className="mt-1 text-sm text-muted-foreground">{n(total.bac)} ml BAC totalt</p></div>)}</CardBlock><p className="mt-2 text-xs leading-5 text-muted-foreground">Avrundat uppåt till hela vialer. Frekvens per vecka är en 30/60-dagars uppskattning.</p></section>
    <div className="mt-6 grid grid-cols-2 gap-2"><Button type="button" className="h-12" disabled={!draft.name.trim() || !validItems.length} onClick={save}><Save/> Spara plan</Button><Button type="button" variant="outline" className="h-12" disabled={!validItems.length} onClick={() => exportPlanImage({ ...draft, items: validItems })}><Download/> Dela bild</Button></div>
    {plans.some(plan => plan.id === draft.id) && <Button type="button" variant="ghost" className="mt-2 h-11 w-full text-destructive" onClick={removePlan}><Trash2/> Ta bort sparad plan</Button>}
    <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">Endast matematisk planering från dina värden. Ingen medicinsk rådgivning.</p>
  </>;
}

function CardBlock({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-[20px] border border-border bg-card shadow-[0_16px_50px_rgba(0,0,0,.18)] ${className}`}>{children}</div>;
}

function Projection({ label, vials, bac, doses }: { label: string; vials: number; bac: number; doses: number }) {
  return <div className="p-4"><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1.5 text-lg font-semibold tabular-nums">{vials} vial{vials === 1 ? "" : "er"}</p><p className="mt-1 text-xs text-muted-foreground">{doses} doser · {n(bac)} ml BAC</p></div>;
}
