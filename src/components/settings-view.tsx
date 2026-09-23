"use client";

import { useEffect, useState } from "react";
import { Bell, Download, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PageHeader, SectionHeading, Surface } from "@/components/peptime-ui";
import { logScheduledDate } from "@/lib/log-day";
import { syringeCapacity, type PeptimeStore } from "@/lib/types";
import { readLocalRecovery, type LocalRecovery } from "@/lib/local-recovery";

const disclaimer = "Log what you want. Peptime contains no medical advice.";

function Row({ label, detail, children }: { label: string; detail?: string; children: React.ReactNode }) {
  return <div className="flex min-h-[58px] items-center justify-between gap-4 px-4 py-2.5"><span className="min-w-0"><span className="block text-[15px]">{label}</span>{detail&&<span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span>}</span><span className="shrink-0">{children}</span></div>;
}

export function SettingsView({ store, update, syncState, retrySync, syncError, userEmail, userId, preserveLocal }: { store: PeptimeStore; update: React.Dispatch<React.SetStateAction<PeptimeStore>>; syncState: "local"|"syncing"|"synced"|"error"; retrySync: () => void; syncError: string | null; userEmail?: string; userId?: string | null; preserveLocal?: boolean }) {
  const [recovery, setRecovery] = useState<LocalRecovery>();
  useEffect(() => {
    if (!userId) return;
    let active = true;
    void readLocalRecovery(userId).then(value => { if (active) setRecovery(value); });
    return () => { active = false; };
  }, [userId]);
  const downloadRecovery = () => {
    if (!recovery) return;
    const body = JSON.stringify({ format: "peptime-local-recovery-v1", exportedAt: new Date().toISOString(), snapshot: recovery }, null, 2);
    const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "peptime-local-recovery.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  const download=(type:"json"|"csv")=>{let body:string,mime:string,name:string;if(type==="json"){body=JSON.stringify({format:"peptime-full-export-v2",exportedAt:new Date().toISOString(),store},null,2);mime="application/json";name="peptime-full-export.json"}else{const rows=[["peptide","planned_dose","actual_dose","unit","computed_iu","slot","scheduled_date","taken_at","status","site","note"],...store.logs.map(l=>[l.peptideName,l.plannedDose,l.actualDose,l.unit,l.computedIu,l.slot,logScheduledDate(l,store.settings.dayBoundaryHour),l.takenAt,l.status,l.site??"",l.note])];body=rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");mime="text/csv";name="peptime-logs.csv"}const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([body],{type:mime}));a.download=name;a.click();URL.revokeObjectURL(a.href)};
  const setThemeMode=(mode:PeptimeStore["settings"]["themeMode"])=>{const resolved=mode==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):mode;document.documentElement.classList.toggle("dark",resolved==="dark");update(s=>({...s,settings:{...s.settings,theme:resolved,themeMode:mode}}))};
  const signOut = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      if (!preserveLocal) Object.keys(localStorage).filter(key => key.startsWith("peptime-demo-v1")).forEach(key => localStorage.removeItem(key));
      sessionStorage.removeItem("peptime-checkin-later");
      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.all(names.filter(name => name.startsWith("peptime-")).map(name => caches.delete(name)));
      }
    } finally {
      form.submit();
    }
  };
  const syncText=syncState==="synced"?"Synkad med ditt konto":syncState==="syncing"?"Synkar…":syncState==="error"?"Synkfel · sparat på den här enheten":"Sparas på den här enheten";
  return <><PageHeader eyebrow="Peptime" title="Inställningar"/>
    <div className="space-y-7">
      <section><SectionHeading title="Dosering"/><Surface className="divide-y divide-border"><Row label="Spruta" detail={`Max ${syringeCapacity(store.settings.syringe)} IU`}><select className="bg-transparent text-[15px] text-primary" value={store.settings.syringe} onChange={e=>update(s=>({...s,settings:{...s.settings,syringe:e.target.value as PeptimeStore["settings"]["syringe"]}}))}><option>U-100 0.3 ml</option><option>U-100 0.5 ml</option><option>U-100 1 ml</option></select></Row><Row label="Visad viktenhet"><select className="bg-transparent text-[15px] text-primary" value={store.settings.massDisplayUnit} onChange={e=>update(s=>({...s,settings:{...s.settings,massDisplayUnit:e.target.value as "mcg"|"mg"}}))}><option value="mcg">mcg</option><option value="mg">mg</option></select></Row></Surface><p className="mt-2 px-1 text-xs leading-5 text-muted-foreground">På U-100 motsvarar 1 IU-markering alltid 0,01 ml.</p></section>
      <section><SectionHeading title="Utseende"/><Surface className="divide-y divide-border"><Row label="Utseende"><select aria-label="Utseende" className="bg-transparent text-[15px] text-primary" value={store.settings.themeMode} onChange={e=>setThemeMode(e.target.value as PeptimeStore["settings"]["themeMode"])}><option value="system">Följ systemet</option><option value="light">Ljust</option><option value="dark">Mörkt</option></select></Row><Row label="Tidszon"><span className="text-[15px] text-muted-foreground">Stockholm</span></Row></Surface></section>
      <section><SectionHeading title="Påminnelser"/><Surface><Row label="Notiser" detail="Kommer snart"><Switch aria-label="Påminnelser kommer snart" checked={false} disabled/></Row><div className="flex gap-2 border-t border-border px-4 py-3 text-xs leading-5 text-muted-foreground"><Bell className="mt-0.5 size-4 shrink-0"/>Påminnelser aktiveras när säker leverans och prenumeration är färdigbyggda.</div></Surface></section>
      <section><SectionHeading title="Data"/><Surface className="grid grid-cols-2 gap-2 p-3"><Button variant="outline" onClick={()=>download("csv")}><Download/>CSV</Button><Button variant="outline" onClick={()=>download("json")}><Download/>JSON</Button></Surface><p className="mt-2 px-1 text-xs leading-5 text-muted-foreground">En lokal kopia sparas okrypterad i webbläsaren. {preserveLocal ? "Under återställning sparas den även efter utloggning." : "Den rensas när du loggar ut."}</p></section>
      {recovery && <section><SectionHeading title="Lokal återställningskopia"/><Surface className="space-y-3 p-4"><p className="text-sm leading-6">En kopia från den tidigare offline-versionen finns kvar på den här enheten: {recovery.store.logs.length} loggar och {recovery.store.peptides.length} peptider. Den ändras inte när du laddar ned den.</p><Button type="button" variant="outline" className="w-full" onClick={downloadRecovery}><Download/>Ladda ned lokal kopia</Button></Surface></section>}
      <section><SectionHeading title="Konto"/><Surface className="p-5"><div className="flex gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary"/><div className="min-w-0"><p className="font-semibold">Peptime</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{disclaimer}</p>{userEmail&&<p className="mt-3 truncate text-xs text-muted-foreground">{userEmail}</p>}<p className={`mt-1 text-xs ${syncState==="error"?"text-destructive":"text-muted-foreground"}`}>{syncText}</p>{syncState==="error"&&syncError&&<details className="mt-2 text-sm text-muted-foreground"><summary className="cursor-pointer py-2 font-medium text-primary">Visa felorsak</summary><p className="break-words rounded-xl bg-muted p-3 font-mono text-xs leading-5 text-foreground">{syncError}</p></details>}{syncState==="error"&&<Button variant="outline" className="mt-3" onClick={retrySync}><RotateCcw/>Försök igen</Button>}</div></div></Surface><form action="/auth/signout" method="post" onSubmit={signOut}><Button type="submit" variant="outline" className="mt-3 w-full text-destructive">Logga ut</Button></form></section>
    </div>
  </>;
}
