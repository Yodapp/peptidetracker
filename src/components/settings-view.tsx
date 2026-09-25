"use client";

import { useEffect, useState } from "react";
import { Download, FileJson, FileSpreadsheet, Moon, RotateCcw, ShieldCheck, Syringe, Weight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconTile, ListRow, ListSection, PageHeader, Surface } from "@/components/peptime-ui";
import { logScheduledDate } from "@/lib/log-day";
import { syringeCapacity, type PeptimeStore } from "@/lib/types";
import { readLocalRecovery, type LocalRecovery } from "@/lib/local-recovery";
import type { RecoveryCounts } from "@/lib/recovery-store";
import { ReminderSettings } from "@/components/reminder-settings";
import { saveFile } from "@/lib/save-file";
import { applyThemeMode, THEME_KEY } from "@/lib/theme";

const disclaimer = "Log what you want. Peptime contains no medical advice.";

function SelectRow({ icon, iconClassName, label, detail, children }: { icon: React.ReactNode; iconClassName: string; label: string; detail?: string; children: React.ReactNode }) {
  return <label className="flex min-h-[52px] items-center gap-3 px-4 py-2"><IconTile className={iconClassName}>{icon}</IconTile><span className="min-w-0 flex-1"><span className="block text-[17px]">{label}</span>{detail&&<span className="mt-0.5 block text-[13px] text-muted-foreground">{detail}</span>}</span><span className="shrink-0">{children}</span></label>;
}
const selectClass = "max-w-[46vw] appearance-none bg-transparent text-right text-[17px] text-muted-foreground outline-none [text-align-last:right]";

export function SettingsView({ store, update, back, syncState, retrySync, syncError, userEmail, userId, preserveLocal, recoveryCounts, restoreMissingRecords }: { store: PeptimeStore; update: React.Dispatch<React.SetStateAction<PeptimeStore>>; back: { label: string; onClick: () => void }; syncState: "local"|"syncing"|"synced"|"error"; retrySync: () => void; syncError: string | null; userEmail?: string; userId?: string | null; preserveLocal?: boolean; recoveryCounts?: RecoveryCounts | null; restoreMissingRecords?: () => Promise<void> }) {
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
      // Clear this before any network request so a stalled sign-out cannot
      // leave recovery data visible on the next unauthenticated launch.
      localStorage.removeItem("peptime-demo-v1:last-user");
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
  const syncDot=preserveLocal||syncState==="error"?"bg-amber-500":syncState==="synced"?"bg-green-500":"bg-muted-foreground";
  const initial=userEmail?.trim().charAt(0).toLocaleUpperCase("sv-SE");
  return <><PageHeader title="Inställningar" back={back}/>
    <Surface className="mb-7 p-4">
      <div className="flex items-center gap-3.5"><span className="grid size-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#8fd0c3] to-[#147d70] text-[22px] font-semibold text-white">{initial||"P"}</span><div className="min-w-0"><p className="truncate text-[20px] font-semibold">{userEmail??"Peptime"}</p><p className="mt-0.5 flex items-center gap-1.5 text-[15px] text-muted-foreground"><span className={`size-2 rounded-full ${syncDot}`}/>{syncText}</p></div></div>
      {syncState==="error"&&syncError&&<details className="mt-3 text-[15px] text-muted-foreground"><summary className="cursor-pointer py-1 font-medium text-primary">Visa felorsak</summary><p className="mt-2 break-words rounded-xl bg-secondary p-3 text-[13px] leading-5 text-foreground">{syncError}</p></details>}
      {syncState==="error"&&(!preserveLocal||missingCount===0)&&<button type="button" className="mt-3 flex min-h-11 items-center gap-2 text-[17px] font-semibold text-primary" onClick={retrySync}><RotateCcw className="size-5"/>Försök igen</button>}
    </Surface>
    {preserveLocal && missingCount > 0 && <ListSection title="Återställ kontosynk" footer="Återställningen läser kontot på nytt och lägger bara till poster vars ID fortfarande saknas. Befintliga kontoposter behålls. Ladda ned en fullständig JSON-kopia först."><div className="space-y-3 p-4"><p className="text-[15px] leading-6">Vid senaste kontrollen saknades {recoveryCounts?.logs ?? 0} loggar, {recoveryCounts?.dailyNotes ?? 0} daganteckningar, {recoveryCounts?.peptides ?? 0} peptider, {recoveryCounts?.mixGroups ?? 0} grupper och {recoveryCounts?.purchasePlans ?? 0} inköpsplaner i kontot.</p><Button type="button" className="h-11 w-full rounded-[12px]" disabled={restoring} onClick={restore}>{restoring ? "Återställer…" : "Lägg till saknade poster i kontot"}</Button></div></ListSection>}
    <ListSection title="Dosering" footer="På U-100 motsvarar 1 IU-markering alltid 0,01 ml.">
      <SelectRow icon={<Syringe/>} iconClassName="bg-primary" label="Spruta" detail={`Max ${syringeCapacity(store.settings.syringe)} IU`}><select className={selectClass} value={store.settings.syringe} onChange={e=>update(s=>({...s,settings:{...s.settings,syringe:e.target.value as PeptimeStore["settings"]["syringe"]}}))}><option>U-100 0.3 ml</option><option>U-100 0.5 ml</option><option>U-100 1 ml</option></select></SelectRow>
      <SelectRow icon={<Weight/>} iconClassName="bg-orange-500" label="Viktenhet"><select className={selectClass} value={store.settings.massDisplayUnit} onChange={e=>update(s=>({...s,settings:{...s.settings,massDisplayUnit:e.target.value as "mcg"|"mg"}}))}><option value="mcg">mcg</option><option value="mg">mg</option></select></SelectRow>
    </ListSection>
    <ListSection title="Utseende" footer="Alla tider visas i svensk tid.">
      <SelectRow icon={<Moon/>} iconClassName="bg-indigo-500" label="Tema"><select aria-label="Utseende" className={selectClass} value={store.settings.themeMode} onChange={e=>setThemeMode(e.target.value as PeptimeStore["settings"]["themeMode"])}><option value="system">Automatiskt</option><option value="light">Ljust</option><option value="dark">Mörkt</option></select></SelectRow>
    </ListSection>
    <section className="mb-7"><h2 className="mb-1.5 px-4 text-[13px] uppercase tracking-[.02em] text-muted-foreground">Påminnelser</h2><ReminderSettings available={Boolean(userId) && !preserveLocal}/></section>
    <ListSection title="Data" footer={`En lokal kopia sparas okrypterad i webbläsaren. ${preserveLocal ? "Under återställning sparas den även efter utloggning." : "Den rensas när du loggar ut."}`}>
      <ListRow icon={<FileSpreadsheet/>} iconClassName="bg-green-600" title="Exportera loggar" subtitle="CSV för Numbers eller Excel" onClick={()=>download("csv")} trailing={<Download className="size-5 text-muted-foreground/60"/>}/>
      <ListRow icon={<FileJson/>} iconClassName="bg-blue-500" title="Exportera allt" subtitle="JSON med all data" onClick={()=>download("json")} trailing={<Download className="size-5 text-muted-foreground/60"/>}/>
      {recovery && <ListRow icon={<RotateCcw/>} iconClassName="bg-[#8e8e93]" title="Lokal återställningskopia" subtitle={`${recovery.store.logs.length} loggar · ${recovery.store.peptides.length} peptider från tidigare version`} onClick={downloadRecovery} trailing={<Download className="size-5 text-muted-foreground/60"/>}/>}
    </ListSection>
    <form action="/auth/signout" method="post" onSubmit={signOut} className="mb-7 overflow-hidden rounded-[14px] bg-card"><button type="submit" className="min-h-[52px] w-full text-[17px] text-destructive active:bg-muted">Logga ut</button></form>
    <p className="mb-4 flex items-center justify-center gap-1.5 px-4 text-center text-[13px] text-muted-foreground"><ShieldCheck className="size-4 shrink-0"/>{disclaimer}</p>
  </>;
}
