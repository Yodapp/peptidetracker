"use client";

import { useState } from "react";
import { Bell, Download, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PageHeader, SectionHeading, Surface } from "@/components/peptime-ui";
import { logScheduledDate } from "@/lib/log-day";
import { syringeCapacity, type PeptimeStore } from "@/lib/types";
import { clearOfflineData, type EntityKind, type SyncConflict } from "@/lib/offline-store";
import type { SyncState } from "@/lib/use-peptime-store";
import { normalizeStoreIds } from "@/lib/supabase/store";

const disclaimer = "Log what you want. Peptime contains no medical advice.";

function Row({ label, detail, children }: { label: string; detail?: string; children: React.ReactNode }) {
  return <div className="flex min-h-[58px] items-center justify-between gap-4 px-4 py-2.5"><span className="min-w-0"><span className="block text-[15px]">{label}</span>{detail&&<span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span>}</span><span className="shrink-0">{children}</span></div>;
}

const conflictNames: Record<EntityKind, string> = { peptides: "Peptid", vials: "Vial", mixGroups: "Mixgrupp", logs: "Logg", dailyNotes: "Dagens mående", purchasePlans: "Inköpsplan", todayAdditions: "Tillagd idag", settings: "Inställningar", onboarding: "Introduktion" };
function valueFields(value: unknown): Record<string, unknown> { return value && typeof value === "object" ? value as Record<string, unknown> : {}; }
function displayValue(value: unknown) { return value == null ? "Borttagen" : typeof value === "object" ? JSON.stringify(value) : String(value); }

function ConflictCard({ conflict }: { conflict: SyncConflict }) {
  const local = valueFields(conflict.localValue);
  const remote = valueFields(conflict.remoteValue);
  const fields = [...new Set([...Object.keys(local), ...Object.keys(remote)])].filter(key => JSON.stringify(local[key]) !== JSON.stringify(remote[key]));
  const title = String(local.name ?? local.peptideName ?? remote.name ?? remote.peptideName ?? conflict.id);
  return <div className="rounded-xl border border-border p-3"><h3 className="font-semibold">{conflictNames[conflict.kind]} · {title}</h3><div className="mt-3 max-h-56 overflow-auto rounded-xl border border-border text-xs"><div className="grid grid-cols-[minmax(70px,1fr)_2fr_2fr] gap-2 border-b border-border bg-muted p-2 font-semibold"><span>Fält</span><span>Den här enheten</span><span>Kontot</span></div>{fields.map(key=><div key={key} className="grid grid-cols-[minmax(70px,1fr)_2fr_2fr] gap-2 border-b border-border p-2 last:border-0"><span className="break-all text-muted-foreground">{key}</span><span className="break-words">{displayValue(local[key])}</span><span className="break-words">{displayValue(remote[key])}</span></div>)}</div></div>;
}

export function SettingsView({ store, update, syncState, retrySync, syncError, pendingCount, conflicts, resolveConflict, userEmail }: { store: PeptimeStore; update: React.Dispatch<React.SetStateAction<PeptimeStore>>; syncState: SyncState; retrySync: () => void; syncError: string | null; pendingCount: number; conflicts: SyncConflict[]; resolveConflict: (kind: EntityKind, id: string, choice: "local" | "remote") => void; userEmail?: string }) {
  const [exportedBackupSignature, setExportedBackupSignature] = useState<string | null>(null);
  const [signOutWarning, setSignOutWarning] = useState(false);
  const [importError, setImportError] = useState("");
  const backupExported = exportedBackupSignature === JSON.stringify(store);
  const needsBackup = pendingCount > 0 || conflicts.length > 0 || syncState === "error" || syncState === "syncing";
  const conflictGroups = Object.values(Object.groupBy(conflicts, conflict => conflict.groupId ?? `${conflict.kind}:${conflict.id}`));
  const download=(type:"json"|"csv"|"backup")=>{let body:string,mime:string,name:string;if(type==="backup"){body=JSON.stringify({format:"peptime-backup-v1",exportedAt:new Date().toISOString(),store},null,2);mime="application/json";name="peptime-full-backup.json"}else if(type==="json"){body=JSON.stringify({logs:store.logs,daily_notes:store.dailyNotes},null,2);mime="application/json";name="peptime-export.json"}else{const rows=[["peptide","planned_dose","actual_dose","unit","computed_iu","slot","scheduled_date","taken_at","status","site","note"],...store.logs.map(l=>[l.peptideName,l.plannedDose,l.actualDose,l.unit,l.computedIu,l.slot,logScheduledDate(l,store.settings.dayBoundaryHour),l.takenAt,l.status,l.site??"",l.note])];body=rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");mime="text/csv";name="peptime-logs.csv"}const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([body],{type:mime}));a.download=name;a.click();if(type==="backup")setExportedBackupSignature(JSON.stringify(store));window.setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
  const setThemeMode=(mode:PeptimeStore["settings"]["themeMode"])=>{const resolved=mode==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):mode;document.documentElement.classList.toggle("dark",resolved==="dark");update(s=>({...s,settings:{...s.settings,theme:resolved,themeMode:mode}}))};
  const importBackup = async (file?: File) => {
    if (!file) return;
    try {
      if (needsBackup && !backupExported) throw new Error("Synka eller exportera en fullständig kopia innan du importerar.");
      const value = JSON.parse(await file.text()) as { format?: string; store?: PeptimeStore };
      if (value.format !== "peptime-backup-v1" || !value.store || !Array.isArray(value.store.peptides) || !Array.isArray(value.store.logs) || !value.store.settings) throw new Error("Filen är inte en giltig Peptime-säkerhetskopia.");
      if (!window.confirm("Importera säkerhetskopian till det här kontot? Ändrade poster kan behöva granskas vid synk.")) return;
      update(normalizeStoreIds(value.store));
      setImportError("");
    } catch (error) { setImportError(error instanceof Error ? error.message : "Kunde inte läsa filen."); }
  };
  const signOut = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (needsBackup && !backupExported) { setSignOutWarning(true); return; }
    const form = event.currentTarget;
    try {
      await clearOfflineData();
      Object.keys(localStorage).filter(key => key.startsWith("peptime-demo-v1")).forEach(key => localStorage.removeItem(key));
      sessionStorage.removeItem("peptime-checkin-later");
      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.all(names.filter(name => name.startsWith("peptime-")).map(name => caches.delete(name)));
      }
      form.submit();
    } catch {
      setSignOutWarning(true);
    }
  };
  const syncText=syncState==="synced"?"Synkad med ditt konto":syncState==="syncing"?"Synkar…":syncState==="conflict"?"Ändringar behöver granskas":syncState==="offline"?"Offline · sparat på den här enheten":syncState==="error"?"Synkfel · sparat på den här enheten":"Sparas på den här enheten";
  return <><PageHeader eyebrow="Peptime" title="Inställningar"/>
    <div className="space-y-7">
      <section><SectionHeading title="Dosering"/><Surface className="divide-y divide-border"><Row label="Spruta" detail={`Max ${syringeCapacity(store.settings.syringe)} IU`}><select className="bg-transparent text-[15px] text-primary" value={store.settings.syringe} onChange={e=>update(s=>({...s,settings:{...s.settings,syringe:e.target.value as PeptimeStore["settings"]["syringe"]}}))}><option>U-100 0.3 ml</option><option>U-100 0.5 ml</option><option>U-100 1 ml</option></select></Row><Row label="Visad viktenhet"><select className="bg-transparent text-[15px] text-primary" value={store.settings.massDisplayUnit} onChange={e=>update(s=>({...s,settings:{...s.settings,massDisplayUnit:e.target.value as "mcg"|"mg"}}))}><option value="mcg">mcg</option><option value="mg">mg</option></select></Row></Surface><p className="mt-2 px-1 text-xs leading-5 text-muted-foreground">På U-100 motsvarar 1 IU-markering alltid 0,01 ml.</p></section>
      <section><SectionHeading title="Utseende"/><Surface className="divide-y divide-border"><Row label="Utseende"><select aria-label="Utseende" className="bg-transparent text-[15px] text-primary" value={store.settings.themeMode} onChange={e=>setThemeMode(e.target.value as PeptimeStore["settings"]["themeMode"])}><option value="system">Följ systemet</option><option value="light">Ljust</option><option value="dark">Mörkt</option></select></Row><Row label="Tidszon"><span className="text-[15px] text-muted-foreground">Stockholm</span></Row></Surface></section>
      <section><SectionHeading title="Påminnelser"/><Surface><Row label="Notiser" detail="Kommer snart"><Switch aria-label="Påminnelser kommer snart" checked={false} disabled/></Row><div className="flex gap-2 border-t border-border px-4 py-3 text-xs leading-5 text-muted-foreground"><Bell className="mt-0.5 size-4 shrink-0"/>Påminnelser aktiveras när säker leverans och prenumeration är färdigbyggda.</div></Surface></section>
      <section><SectionHeading title="Data"/><Surface className="grid grid-cols-2 gap-2 p-3"><Button variant="outline" onClick={()=>download("csv")}><Download/>CSV</Button><Button variant="outline" onClick={()=>download("json")}><Download/>JSON</Button><Button variant="outline" onClick={()=>download("backup")}><Download/>Full kopia</Button><label className="flex min-h-10 cursor-pointer items-center justify-center rounded-xl border border-border text-center text-sm font-semibold">Importera kopia<input type="file" accept="application/json,.json" className="sr-only" onChange={event=>{void importBackup(event.target.files?.[0]);event.currentTarget.value=""}}/></label></Surface>{importError&&<p className="mt-2 text-sm text-destructive">{importError}</p>}<p className="mt-2 px-1 text-xs leading-5 text-muted-foreground">En lokal kopia sparas okrypterad i webbläsaren för offline-användning. Den rensas när du loggar ut.</p></section>
      <section><SectionHeading title="Installera och använd offline"/><Surface className="p-4 text-sm leading-6"><p>Öppna Peptime online minst en gång efter installationen. Därefter kan du öppna appen och logga utan nätverk; ändringarna synkas när anslutningen kommer tillbaka.</p><details className="mt-3 border-t border-border pt-2"><summary className="min-h-10 cursor-pointer py-2 font-medium text-primary">Så lägger du till appen</summary><div className="space-y-2 pb-2 text-muted-foreground"><p><strong className="text-foreground">iPhone:</strong> Öppna i Safari, tryck Dela och välj Lägg till på hemskärmen.</p><p><strong className="text-foreground">Android:</strong> Öppna i Chrome och välj Installera appen i webbläsarmenyn.</p></div></details></Surface></section>
      {conflicts.length > 0 && <section><SectionHeading title={`Synkkonflikter · ${conflictGroups.length}`} detail="Inga uppgifter tas bort förrän du väljer."/><div className="space-y-3">{conflictGroups.map(group=>group&&<Surface key={group[0].groupId??`${group[0].kind}:${group[0].id}`} className="space-y-3 p-4"><p className="text-xs text-muted-foreground">{group.length>1?`${group.length} sammanhörande poster ändrades på två enheter. Välj en version för hela ändringen.`:"Samma post ändrades på två enheter. Välj vilka uppgifter som ska sparas."}</p>{group.map(conflict=><ConflictCard key={`${conflict.kind}:${conflict.id}`} conflict={conflict}/>) }<div className="grid grid-cols-2 gap-2"><Button type="button" onClick={()=>resolveConflict(group[0].kind,group[0].id,"local")}>Behåll min</Button><Button type="button" variant="outline" onClick={()=>resolveConflict(group[0].kind,group[0].id,"remote")}>Använd kontots</Button></div></Surface>)}</div></section>}
      <section><SectionHeading title="Konto"/><Surface className="p-5"><div className="flex gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary"/><div className="min-w-0"><p className="font-semibold">Peptime</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{disclaimer}</p>{userEmail&&<p className="mt-3 truncate text-xs text-muted-foreground">{userEmail}</p>}<p className={`mt-1 text-xs ${syncState==="error"?"text-destructive":"text-muted-foreground"}`}>{syncText}</p>{pendingCount>0&&<p className="mt-1 text-xs text-muted-foreground">{pendingCount} ändring{pendingCount===1?"":"ar"} väntar på synk</p>}{syncState==="error"&&syncError&&<details className="mt-2 text-sm text-muted-foreground"><summary className="cursor-pointer py-2 font-medium text-primary">Visa felorsak</summary><p className="break-words rounded-xl bg-muted p-3 font-mono text-xs leading-5 text-foreground">{syncError}</p></details>}{syncState==="error"&&<Button variant="outline" className="mt-3" onClick={retrySync}><RotateCcw/>Försök igen</Button>}</div></div></Surface>{needsBackup&&<div className="mt-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm"><p>Synken är inte bekräftad. Synka eller exportera en fullständig kopia innan du loggar ut.</p><Button type="button" variant="outline" className="mt-3 w-full" onClick={()=>download("backup")}><Download/> Exportera fullständig kopia</Button>{backupExported&&<p className="mt-2 text-xs">Kopian har laddats ned. Du kan nu logga ut och rensa den lokala datan.</p>}{signOutWarning&&!backupExported&&<p className="mt-2 text-xs text-destructive">Exportera kopian eller synka först.</p>}</div>}<form action="/auth/signout" method="post" onSubmit={signOut}><Button type="submit" variant="outline" disabled={syncState==="offline"} className="mt-3 w-full text-destructive">Logga ut</Button></form>{syncState==="offline"&&<p className="mt-2 text-xs text-muted-foreground">Anslut till internet för att logga ut från kontot.</p>}</section>
    </div>
  </>;
}
