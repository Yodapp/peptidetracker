"use client";

import { useEffect, useState } from "react";
import { Download, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, SectionHeading, Surface } from "@/components/peptime-ui";
import { logScheduledDate } from "@/lib/log-day";
import { syringeCapacity, type PeptimeStore } from "@/lib/types";
import { readLocalRecovery, type LocalRecovery } from "@/lib/local-recovery";
import type { RecoveryCounts } from "@/lib/recovery-store";
import { ReminderSettings } from "@/components/reminder-settings";
import { saveFile } from "@/lib/save-file";
import { applyThemeMode, THEME_KEY } from "@/lib/theme";

const disclaimer = "Log what you want. Peptime contains no medical advice.";

function Row({ label, detail, children }: { label: string; detail?: string; children: React.ReactNode }) {
  return <div className="flex min-h-[58px] items-center justify-between gap-4 px-4 py-2.5"><span className="min-w-0"><span className="block text-[15px]">{label}</span>{detail&&<span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span>}</span><span className="shrink-0">{children}</span></div>;
}

export function SettingsView({ store, update, syncState, retrySync, syncError, userEmail, userId, preserveLocal, recoveryCounts, restoreMissingRecords }: { store: PeptimeStore; update: React.Dispatch<React.SetStateAction<PeptimeStore>>; syncState: "local"|"syncing"|"synced"|"error"; retrySync: () => void; syncError: string | null; userEmail?: string; userId?: string | null; preserveLocal?: boolean; recoveryCounts?: RecoveryCounts | null; restoreMissingRecords?: () => Promise<void> }) {
  const [recovery, setRecovery] = useState<LocalRecovery>();
  const [restoring, setRestoring] = useState(false);
  const missingCount = recoveryCounts ? Object.values(recoveryCounts).reduce((sum, count) => sum + count, 0) : 0;
  useEffect(() => {
    if (!userId) return;
    let active = true;
    void readLocalRecovery(userId).then(value => { if (active) setRecovery(value); });
    return () => { active = false; };
  }, [userId]);
  const downloadRecovery = () => {
    if (!recovery) return;
    const body = JSON.stringify({ format: "peptime-local-recovery-v1", exportedAt: new Date().toISOString(), snapshot: recovery }, null, 2);
    void saveFile(body, "peptime-local-recovery.json", "application/json");
  };
  const restore = async () => {
    if (!restoreMissingRecords || restoring) return;
    setRestoring(true);
    try { await restoreMissingRecords(); } finally { setRestoring(false); }
  };
  const download=(type:"json"|"csv")=>{let body:string,mime:string,name:string;if(type==="json"){body=JSON.stringify({format:"peptime-full-export-v2",exportedAt:new Date().toISOString(),store},null,2);mime="application/json";name="peptime-full-export.json"}else{const rows=[["peptide","planned_dose","actual_dose","unit","computed_iu","slot","scheduled_date","taken_at","status","site","note"],...store.logs.map(l=>[l.peptideName,l.plannedDose,l.actualDose,l.unit,l.computedIu,l.slot,logScheduledDate(l,store.settings.dayBoundaryHour),l.takenAt,l.status,l.site??"",l.note])];body=rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");mime="text/csv";name="peptime-logs.csv"}void saveFile(type==="csv"?`\uFEFF${body}`:body,name,mime)};
  const setThemeMode=(mode:PeptimeStore["settings"]["themeMode"])=>{const resolved=applyThemeMode(mode);update(s=>({...s,settings:{...s.settings,theme:resolved,themeMode:mode}}))};
  const signOut = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      if ("serviceWorker" in navigator) {
        const subscription = await navigator.serviceWorker.getRegistration("/").then(registration => registration?.pushManager.getSubscription());
        if (subscription) {
          await fetch("/api/reminders", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) }).catch(() => undefined);
          await subscription.unsubscribe().catch(() => undefined);
        }
      }
      if (!preserveLocal) Object.keys(localStorage).filter(key => key.startsWith("peptime-demo-v1")).forEach(key => localStorage.removeItem(key));
      sessionStorage.removeItem("peptime-checkin-later");
      localStorage.removeItem(THEME_KEY);
      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.all(names.filter(name => name.startsWith("peptime-")).map(name => caches.delete(name)));
      }
    } finally {
      form.submit();
    }
  };
  const syncText=preserveLocal?"Återställningsläge · kontosynk pausad":syncState==="synced"?"Synkad med ditt konto":syncState==="syncing"?"Synkar…":syncState==="error"?"Synkfel · sparat på den här enheten":"Sparas på den här enheten";
  return <><PageHeader eyebrow="Peptime" title="Inställningar"/>
    <div className="space-y-7">
      <section><SectionHeading title="Dosering"/><Surface className="divide-y divide-border"><Row label="Spruta" detail={`Max ${syringeCapacity(store.settings.syringe)} IU`}><select className="bg-transparent text-base text-primary" value={store.settings.syringe} onChange={e=>update(s=>({...s,settings:{...s.settings,syringe:e.target.value as PeptimeStore["settings"]["syringe"]}}))}><option>U-100 0.3 ml</option><option>U-100 0.5 ml</option><option>U-100 1 ml</option></select></Row><Row label="Visad viktenhet"><select className="bg-transparent text-base text-primary" value={store.settings.massDisplayUnit} onChange={e=>update(s=>({...s,settings:{...s.settings,massDisplayUnit:e.target.value as "mcg"|"mg"}}))}><option value="mcg">mcg</option><option value="mg">mg</option></select></Row></Surface><p className="mt-2 px-1 text-xs leading-5 text-muted-foreground">På U-100 motsvarar 1 IU-markering alltid 0,01 ml.</p></section>
      <section><SectionHeading title="Utseende"/><Surface className="divide-y divide-border"><Row label="Utseende"><select aria-label="Utseende" className="bg-transparent text-base text-primary" value={store.settings.themeMode} onChange={e=>setThemeMode(e.target.value as PeptimeStore["settings"]["themeMode"])}><option value="system">Följ systemet</option><option value="light">Ljust</option><option value="dark">Mörkt</option></select></Row><Row label="Tidszon"><span className="text-[15px] text-muted-foreground">Stockholm</span></Row></Surface></section>
      <section><SectionHeading title="Påminnelser"/><ReminderSettings available={Boolean(userId) && !preserveLocal && syncState === "synced"}/></section>
      <section><SectionHeading title="Data"/><Surface className="grid grid-cols-2 gap-2 p-3"><Button variant="outline" onClick={()=>download("csv")}><Download/>CSV</Button><Button variant="outline" onClick={()=>download("json")}><Download/>JSON</Button></Surface><p className="mt-2 px-1 text-xs leading-5 text-muted-foreground">En lokal kopia sparas okrypterad i webbläsaren. {preserveLocal ? "Under återställning sparas den även efter utloggning." : "Den rensas när du loggar ut."}</p></section>
      {recovery && <section><SectionHeading title="Lokal återställningskopia"/><Surface className="space-y-3 p-4"><p className="text-sm leading-6">En kopia från den tidigare offline-versionen finns kvar på den här enheten: {recovery.store.logs.length} loggar och {recovery.store.peptides.length} peptider. Den ändras inte när du laddar ned den.</p><Button type="button" variant="outline" className="w-full" onClick={downloadRecovery}><Download/>Ladda ned lokal kopia</Button></Surface></section>}
      {preserveLocal && missingCount > 0 && <section><SectionHeading title="Återställ kontosynk"/><Surface className="space-y-3 p-4"><p className="text-sm leading-6">Vid senaste kontrollen saknades {recoveryCounts?.logs ?? 0} loggar, {recoveryCounts?.dailyNotes ?? 0} daganteckningar, {recoveryCounts?.peptides ?? 0} peptider, {recoveryCounts?.mixGroups ?? 0} grupper och {recoveryCounts?.purchasePlans ?? 0} inköpsplaner i kontot.</p><p className="text-xs leading-5 text-muted-foreground">Återställningen läser kontot på nytt och lägger bara till poster vars ID fortfarande saknas. Befintliga kontoposter behålls. Ladda ned en fullständig JSON-kopia först.</p><Button type="button" className="w-full" disabled={restoring} onClick={restore}>{restoring ? "Återställer…" : "Lägg till saknade poster i kontot"}</Button></Surface></section>}
      <section><SectionHeading title="Konto"/><Surface className="p-5"><div className="flex gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary"/><div className="min-w-0"><p className="font-semibold">Peptime</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{disclaimer}</p>{userEmail&&<p className="mt-3 truncate text-xs text-muted-foreground">{userEmail}</p>}<p className={`mt-1 text-xs ${syncState==="error"?"text-destructive":"text-muted-foreground"}`}>{syncText}</p>{syncState==="error"&&syncError&&<details className="mt-2 text-sm text-muted-foreground"><summary className="cursor-pointer py-2 font-medium text-primary">Visa felorsak</summary><p className="break-words rounded-xl bg-muted p-3 font-mono text-xs leading-5 text-foreground">{syncError}</p></details>}{syncState==="error"&&(!preserveLocal||missingCount===0)&&<Button variant="outline" className="mt-3" onClick={retrySync}><RotateCcw/>Försök igen</Button>}</div></div></Surface><form action="/auth/signout" method="post" onSubmit={signOut}><Button type="submit" variant="outline" className="mt-3 w-full text-destructive">Logga ut</Button></form></section>
    </div>
  </>;
}
