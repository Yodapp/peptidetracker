"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { changeInventory } from "@/lib/inventory";
import { logScheduledDate, stockholmDate, stockholmDateTimeInput, stockholmLocalToIso } from "@/lib/log-day";
import { resolvedSchedule } from "@/lib/schedule";
import { syringeCapacity, syringeUnits, type PeptimeStore } from "@/lib/types";

export function ManualLogDialog({ open, onOpenChange, date, store, update }: { open: boolean; onOpenChange: (open: boolean) => void; date: string; store: PeptimeStore; update: React.Dispatch<React.SetStateAction<PeptimeStore>> }) {
  const available = store.peptides.filter(peptide => !peptide.archived && !store.logs.some(log => log.peptideId === peptide.id && logScheduledDate(log, store.settings.dayBoundaryHour) === date));
  const [peptideId, setPeptideId] = useState(available[0]?.id ?? "");
  const [status, setStatus] = useState<"taken" | "skipped">("taken");
  const [actualDose, setActualDose] = useState(available[0]?.doseMcg ?? 0);
  const [actualTime, setActualTime] = useState(date === stockholmDate() ? stockholmDateTimeInput(new Date()) : `${date}T12:00`);
  const [site, setSite] = useState("");
  const [vialId, setVialId] = useState("");
  const [reviewSignature, setReviewSignature] = useState("");
  const peptide = available.find(item => item.id === peptideId) ?? available[0];
  const vials = store.vials.filter(item => item.peptideId === peptide?.id).sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(actualTime) ? stockholmLocalToIso(actualTime) : "";
  const matchingVial = vials.find(item => item.openedAt <= timestamp && (!item.closedAt || item.closedAt >= timestamp));
  const vial = vials.find(item => item.id === vialId) ?? matchingVial ?? vials.find(item => item.id === peptide?.currentVialId) ?? vials[0];
  const units = peptide?.route === "subcutaneous" ? syringeUnits(actualDose, vial?.initialMg ?? peptide.vialMg, vial?.waterMl ?? peptide.waterMl) : 0;
  const warnings = status === "taken" && peptide ? [
    ...(actualDose > peptide.doseMcg * 2 ? ["Dosen är mer än dubbelt så stor som den planerade dosen."] : []),
    ...(vial && actualDose > vial.remainingMg * 1000 ? ["Det valda viallagret räcker inte till dosen."] : []),
    ...(units > syringeCapacity(store.settings.syringe) ? ["Dosen ryms inte i den valda sprutan."] : []),
    ...(vial && timestamp && (vial.openedAt > timestamp || Boolean(vial.closedAt && vial.closedAt < timestamp)) ? ["Den valda vialen var inte öppen vid den angivna tiden."] : []),
  ] : [];
  const signature = `${peptide?.id}:${timestamp}:${status}:${actualDose}:${vial?.id}`;

  const validTime = Boolean(timestamp && actualTime.slice(0, 10) <= stockholmDate() && stockholmDateTimeInput(timestamp) === actualTime);
  const valid = Boolean(peptide && validTime && (status === "skipped" || Number.isFinite(actualDose) && actualDose > 0));
  const save = () => {
    if (!valid || !peptide) return;
    const now = stockholmLocalToIso(actualTime);
    update(current => {
      const chosenVialId = vial?.id ?? peptide.currentVialId ?? peptide.id;
      let next = { ...current, logs: [{ id: crypto.randomUUID(), peptideId: peptide.id, peptideName: peptide.name, plannedDose: peptide.doseMcg, actualDose: status === "taken" ? actualDose : 0, unit: "mcg" as const, computedIu: status === "taken" ? units : 0, slot: resolvedSchedule(peptide, current.mixGroups).slot, takenAt: now, scheduledDate: date, status, site: status === "taken" && peptide.route === "subcutaneous" ? site || undefined : undefined, mixGroupId: peptide.mixGroupId, vialId: chosenVialId, note: "" }, ...current.logs] };
      if (status === "taken") {
        next = changeInventory(next, peptide.id, chosenVialId, -actualDose / 1000);
        next = { ...next, peptides: next.peptides.map(item => item.id === peptide.id ? { ...item, lastSite: site || item.lastSite } : item) };
      }
      return next;
    });
    onOpenChange(false);
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[88dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>Logga dos i efterhand</DialogTitle><DialogDescription>Schemalagd dag: {date}. Ange när det faktiskt hände.</DialogDescription></DialogHeader>
      {available.length ? <div className="space-y-4">
        <label className="block text-sm">Peptid<select className="mt-1.5 h-12 w-full rounded-xl border bg-card px-3" value={peptide?.id ?? ""} onChange={event => { const selected = available.find(item => item.id === event.target.value); setPeptideId(event.target.value); setActualDose(selected?.doseMcg ?? 0); setVialId(""); setSite(""); }}>
          {available.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label className="block text-sm">Faktisk tid<Input className="mt-1.5 h-12" type="datetime-local" max={stockholmDateTimeInput(new Date())} value={actualTime} onChange={event => setActualTime(event.target.value)}/></label>
        {actualTime && !validTime && <p className="text-sm text-destructive">Välj en giltig tid som inte ligger i framtiden.</p>}
        <div className="grid grid-cols-2 gap-2"><Button type="button" variant={status === "taken" ? "default" : "outline"} onClick={() => setStatus("taken")}>Tagen</Button><Button type="button" variant={status === "skipped" ? "default" : "outline"} onClick={() => setStatus("skipped")}>Överhoppad</Button></div>
        {status === "taken" && <>
          <label className="block text-sm">Faktisk dos (mcg)<Input className="mt-1.5 h-12" type="number" min="0.01" step="any" value={actualDose} onChange={event => setActualDose(Number(event.target.value))}/></label>
          {vials.length > 0 && <label className="block text-sm">Vial<select className="mt-1.5 h-12 w-full rounded-xl border bg-card px-3" value={vial?.id ?? ""} onChange={event => setVialId(event.target.value)}>{vials.map(item => <option key={item.id} value={item.id}>{new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", dateStyle: "medium" }).format(new Date(item.openedAt))} · {item.remainingMg} mg kvar</option>)}</select></label>}
          {peptide?.route === "subcutaneous" && <><p className="text-sm text-muted-foreground">{new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 2 }).format(units)} IU på U-100</p>{peptide.sites.length > 0 && <label className="block text-sm">Injektionsplats · valfri<select className="mt-1.5 h-12 w-full rounded-xl border bg-card px-3" value={site} onChange={event => setSite(event.target.value)}><option value="">Inte angiven</option>{peptide.sites.map(value => <option key={value}>{value}</option>)}</select></label>}</>}
        </>}
        {warnings.length > 0 && <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm"><p className="font-semibold">Kontrollera dosen</p><ul className="mt-1 list-disc pl-5">{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div>}
        <Button type="button" disabled={!valid} className="h-12 w-full" onClick={() => { if (warnings.length && reviewSignature !== signature) setReviewSignature(signature); else save(); }}>{warnings.length && reviewSignature !== signature ? "Granska och fortsätt" : warnings.length ? "Logga ändå" : "Spara logg"}</Button>
      </div> : <p className="text-sm text-muted-foreground">Alla aktiva peptider är redan loggade för den här dagen.</p>}
    </DialogContent>
  </Dialog>;
}
