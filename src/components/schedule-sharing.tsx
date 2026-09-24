"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Clipboard, Download, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { PageHeader, Surface } from "@/components/peptime-ui";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { scheduleItemFromPeptide, type SharedScheduleItem } from "@/lib/schedule-import";
import { defaultInjectionSites, syringeUnits, type MixGroupSchedule, type Peptide, type PeptimeStore, type ScheduleFrequency, type Slot } from "@/lib/types";

type Item = SharedScheduleItem;
type Saved = { id: string; code: string; name: string; items: Item[]; groups: MixGroupSchedule[]; createdAt: string; updatedAt: string };
type Preview = { name: string; items: Item[]; groups: MixGroupSchedule[] };

const slotNames: Record<Slot, string> = { morning: "Morgon", lunch: "Lunch", evening: "Kväll", as_needed: "Vid behov" };
const weekdayNames = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];
const key = (value?: string) => value?.trim().toLocaleLowerCase("sv-SE") ?? "";
const number = (value: number, maximumFractionDigits = 1) => new Intl.NumberFormat("sv-SE", { maximumFractionDigits }).format(value);
const newCode = () => `P${Array.from(crypto.getRandomValues(new Uint8Array(5)), value => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[value % 32]).join("")}`;
const emptyItem = (): Item => ({ name: "", shortCode: "", color: "teal", doseMcg: 100, vialMg: 10, waterMl: 2, route: "subcutaneous", slot: "evening", time: "21:00", frequency: "daily", weekdays: [0,1,2,3,4,5,6], paused: false, fasted: false, fastedNote: "", beyondUseDays: 28, sites: [...defaultInjectionSites], notes: "" });
const normalizeItem = (item: Partial<Item>): Item => ({ ...emptyItem(), ...item, fasted: Boolean(item.fasted), fastedNote: item.fastedNote ?? "", notes: item.notes ?? "" });
const emptySaved = (): Saved => { const now = new Date().toISOString(); return { id: crypto.randomUUID(), code: "", name: "", items: [emptyItem()], groups: [], createdAt: now, updatedAt: now }; };
const fromRow = (row: Record<string, unknown>): Saved => ({ id: String(row.id), code: String(row.code), name: String(row.name), items: (row.items as Item[]).map(normalizeItem), groups: (row.groups ?? []) as MixGroupSchedule[], createdAt: String(row.created_at), updatedAt: String(row.updated_at) });

const routeNames: Record<Item["route"], string> = { subcutaneous: "Subkutan", intranasal: "Intranasal", oral: "Oral", topical: "Topikal" };
function scheduleLabel(item: Item) {
  if (item.frequency === "as_needed") return "Vid behov";
  const frequency = item.frequency === "daily" ? "Varje dag" : item.frequency === "weekdays" ? item.weekdays.map(index => weekdayNames[index]).filter(Boolean).join(", ") : `Var ${item.everyNDays ?? 2}:e dag${item.anchorDate ? ` från ${item.anchorDate}` : ""}`;
  const cycle = item.cycleStart && item.weeksOn ? ` · ${item.weeksOn} v på / ${item.weeksOff ?? 0} v av` : "";
  return `${frequency} · ${slotNames[item.slot]} ${item.time}${cycle}`;
}
function downloadedImage(blob: Blob, filename: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
async function exportScheduleImage(draft: Saved) {
  const items = draft.items.filter(item => item.name.trim());
  const width = 1200;
  const rowHeight = 224;
  const height = 320 + items.length * rowHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Kunde inte skapa bilden på den här enheten.");
  context.fillStyle = "#080909";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#72b7aa";
  context.font = "600 24px system-ui, sans-serif";
  context.fillText("PEPTIME · SCHEMA", 72, 70);
  context.fillStyle = "#f4f4f5";
  context.font = "600 52px system-ui, sans-serif";
  context.fillText(draft.name.trim() || "Mitt schema", 72, 143, width - 144);
  context.fillStyle = "#a1a1aa";
  context.font = "24px system-ui, sans-serif";
  context.fillText(`${items.length} ${items.length === 1 ? "peptid" : "peptider"} · U-100`, 72, 188);
  items.forEach((item, index) => {
    const y = 245 + index * rowHeight;
    context.strokeStyle = "#353638";
    context.beginPath(); context.moveTo(72, y - 28); context.lineTo(width - 72, y - 28); context.stroke();
    context.fillStyle = "#f4f4f5";
    context.font = "600 34px system-ui, sans-serif";
    context.fillText(item.name.trim(), 72, y + 8, width - 144);
    context.fillStyle = "#72b7aa";
    context.font = "600 25px system-ui, sans-serif";
    context.fillText(`${number(item.doseMcg)} mcg · ${number(syringeUnits(item.doseMcg, item.vialMg, item.waterMl))} IU`, 72, y + 50, width - 144);
    context.fillStyle = "#d4d4d8";
    context.font = "23px system-ui, sans-serif";
    context.fillText(scheduleLabel(item), 72, y + 89, width - 144);
    context.fillStyle = "#a1a1aa";
    context.font = "21px system-ui, sans-serif";
    context.fillText(`${routeNames[item.route]} · Vial ${number(item.vialMg)} mg · BAC ${number(item.waterMl)} ml${item.fasted ? " · Fastande" : ""}${item.paused ? " · Pausad" : ""}`, 72, y + 125, width - 144);
    if (item.mixGroupId) context.fillText(`Mixgrupp: ${item.mixGroupId}`, 72, y + 158, width - 144);
    if (item.notes.trim()) context.fillText(item.notes.trim(), 72, y + 187, width - 144);
  });
  context.fillStyle = "#71717a";
  context.font = "19px system-ui, sans-serif";
  context.fillText("Dina egna schemavärden · Ingen medicinsk rådgivning", 72, height - 35);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Kunde inte skapa bilden på den här enheten.");
  const filename = `${(draft.name.trim() || "peptime-schema").replace(/[^a-z0-9åäö-]+/gi, "-").toLowerCase()}.png`;
  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: draft.name.trim() || "Peptime schema" }); return; }
    catch (reason) { if ((reason as DOMException)?.name === "AbortError") return; }
  }
  downloadedImage(blob, filename);
}

function Decimal({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return <Input className="mt-1.5 h-12 text-base" inputMode="decimal" value={draft ?? String(value)} onFocus={event => { setDraft(event.currentTarget.value); event.currentTarget.select(); }} onChange={event => { const text = event.currentTarget.value; if (!/^\d*(?:[.,]\d*)?$/.test(text)) return; setDraft(text); onChange(Number(text.replace(",", ".")) || 0); }} onBlur={() => setDraft(null)}/>;
}

function DoseSummary({ item }: { item: Item }) {
  const units = syringeUnits(item.doseMcg, item.vialMg, item.waterMl);
  const doses = item.doseMcg > 0 && item.vialMg > 0 ? Math.floor((item.vialMg * 1000) / item.doseMcg) : 0;
  const days = item.frequency === "daily"
    ? doses
    : item.frequency === "weekdays" && item.weekdays.length
      ? doses * 7 / item.weekdays.length
      : item.frequency === "every_n_days"
        ? doses * Math.max(2, item.everyNDays ?? 2)
        : null;
  const duration = days === null
    ? "Tiden beror på hur ofta du tar den"
    : days > 0
      ? `Räcker cirka ${number(days, 0)} dagar${days >= 14 ? ` · ${number(days / 7)} veckor` : ""}`
      : "Fyll i dos, vial och BAC-vatten";

  return <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-border bg-muted/40">
    <div className="p-4">
      <p className="text-xs font-medium text-muted-foreground">U-100 per dos</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{number(units)} <span className="text-base">enheter</span></p>
    </div>
    <div className="border-l border-border p-4">
      <p className="text-xs font-medium text-muted-foreground">En vial</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{number(doses, 0)} <span className="text-base">doser</span></p>
    </div>
    <p className="col-span-2 border-t border-border px-4 py-3 text-sm font-medium">{duration}</p>
  </div>;
}

function ScheduleEditor({ item, set }: { item: Item; set: (part: Partial<Item>) => void }) {
  return <div className="space-y-3 rounded-2xl bg-muted/60 p-4"><p className="font-semibold">Schema</p><label className="block text-sm">Frekvens<select className="mt-1.5 h-12 w-full rounded-xl border bg-card px-3 text-base" value={item.frequency} onChange={event => { const frequency = event.target.value as ScheduleFrequency; set({ frequency, slot: frequency === "as_needed" ? "as_needed" : item.slot === "as_needed" ? "evening" : item.slot }); }}><option value="daily">Varje dag</option><option value="weekdays">Valda veckodagar</option><option value="every_n_days">Var N:e dag</option><option value="as_needed">Vid behov</option></select></label>
    {item.frequency === "weekdays" && <div className="flex flex-wrap gap-2">{weekdayNames.map((day, index) => <button type="button" key={day} onClick={() => set({ weekdays: item.weekdays.includes(index) ? item.weekdays.filter(value => value !== index) : [...item.weekdays, index].sort() })} className={`min-h-11 rounded-full border px-3 text-sm ${item.weekdays.includes(index) ? "border-primary bg-accent" : "bg-card"}`}>{day}</button>)}</div>}
    {item.frequency === "every_n_days" && <div className="grid grid-cols-2 gap-3"><label className="text-sm">Intervall<Decimal value={item.everyNDays ?? 2} onChange={value => set({ everyNDays: Math.max(2, Math.round(value)) })}/></label><label className="text-sm">Startdatum<Input className="mt-1.5 h-12" type="date" value={item.anchorDate ?? ""} onChange={event => set({ anchorDate: event.target.value || undefined })}/></label></div>}
    {item.frequency !== "as_needed" && <div className="grid grid-cols-2 gap-3"><label className="text-sm">Tidsdel<select className="mt-1.5 h-12 w-full rounded-xl border bg-card px-3" value={item.slot} onChange={event => set({ slot: event.target.value as Slot })}>{Object.entries(slotNames).filter(([slot]) => slot !== "as_needed").map(([slot, label]) => <option key={slot} value={slot}>{label}</option>)}</select></label><label className="text-sm">Tid<Input className="mt-1.5 h-12" type="time" value={item.time} onChange={event => set({ time: event.target.value })}/></label></div>}
  </div>;
}

export function ScheduleSharing({ store, update, onBack }: { store: PeptimeStore; update: React.Dispatch<React.SetStateAction<PeptimeStore>>; onBack: () => void }) {
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const [userId, setUserId] = useState("");
  const [saved, setSaved] = useState<Saved[]>([]);
  const [draft, setDraft] = useState<Saved>(emptySaved);
  const [importCode, setImportCode] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { let active = true; (async () => { const auth = await client.auth.getUser(); if (!auth.data.user) throw new Error("Logga in för att använda Scheman."); const result = await client.from("shared_schedules").select("*").order("updated_at", { ascending: false }); if (result.error) throw result.error; if (active) { setUserId(auth.data.user.id); setSaved((result.data ?? []).map(row => fromRow(row))); } })().catch(reason => active && setError(reason.message ?? "Kunde inte hämta scheman.")); return () => { active = false; }; }, [client]);

  const setItem = (index: number, part: Partial<Item>) => setDraft(value => ({ ...value, items: value.items.map((item, position) => position === index ? { ...item, ...part } : item) }));
  const save = async () => {
    const items = draft.items.filter(item => item.name.trim());
    if (!userId || !draft.name.trim() || !items.length || items.some(item => item.doseMcg <= 0 || item.vialMg <= 0 || item.waterMl <= 0)) { setError("Fyll i schemats namn samt namn, dos, vial och BAC för varje peptid."); return; }
    setBusy(true); setError(""); setMessage("");
    const groups = [...new Map(items.filter(item => item.mixGroupId?.trim()).map(item => [key(item.mixGroupId), { name: item.mixGroupId!.trim(), slot: item.slot, time: item.time, frequency: item.frequency, weekdays: item.weekdays, everyNDays: item.everyNDays, anchorDate: item.anchorDate, paused: item.paused, cycleStart: item.cycleStart, weeksOn: item.weeksOn, weeksOff: item.weeksOff }])).values()];
    const exists = saved.some(item => item.id === draft.id);
    let result;
    if (exists) result = await client.from("shared_schedules").update({ name: draft.name.trim(), items, groups }).eq("id", draft.id).eq("user_id", userId).select("*").single();
    else { for (let attempt = 0; attempt < 5; attempt += 1) { result = await client.from("shared_schedules").insert({ id: draft.id, user_id: userId, code: newCode(), name: draft.name.trim(), items, groups }).select("*").single(); if (result.error?.code !== "23505") break; } }
    if (!result || result.error || !result.data) setError(result?.error?.message ?? "Kunde inte spara schemat.");
    else { const next = fromRow(result.data); setSaved(values => [next, ...values.filter(value => value.id !== next.id)]); setDraft(next); setMessage("Schemat är sparat."); }
    setBusy(false);
  };
  const remove = async () => { if (!userId || !saved.some(item => item.id === draft.id) || !window.confirm(`Ta bort ”${draft.name}”?`)) return; setBusy(true); const result = await client.from("shared_schedules").delete().eq("id", draft.id).eq("user_id", userId); if (result.error) setError(result.error.message); else { setSaved(values => values.filter(value => value.id !== draft.id)); setDraft(emptySaved()); setMessage("Schemat är borttaget."); } setBusy(false); };
  const lookup = async () => { setBusy(true); setError(""); setPreview(null); const result = await client.rpc("get_shared_schedule", { p_code: importCode.trim().toUpperCase() }); const value = result.data as Preview | null; if (result.error || !value || !Array.isArray(value.items)) setError("Koden finns inte."); else setPreview({ ...value, items: value.items.map(normalizeItem), groups: Array.isArray(value.groups) ? value.groups : [] }); setBusy(false); };
  const importableItems = preview ? preview.items.filter(item => {
    const name = key(item.name);
    if (!name || store.peptides.some(peptide => key(peptide.name) === name)) return false;
    const firstMatch = preview.items.findIndex(candidate => key(candidate.name) === name);
    return preview.items[firstMatch] === item;
  }) : [];
  const duplicates = preview ? preview.items.length - importableItems.length : 0;
  const approve = () => {
    if (!preview) return;
    const addedItems = importableItems;
    const usedGroups = new Set(addedItems.flatMap(item => item.mixGroupId ? [key(item.mixGroupId)] : []));
    const occupiedGroups = new Set(store.mixGroups.map(group => key(group.name)));
    const groupNames = new Map<string, string>();
    const groups = preview.groups.filter(group => usedGroups.has(key(group.name))).map(group => {
      const original = group.name.trim();
      let name = original;
      let suffix = 2;
      while (occupiedGroups.has(key(name))) name = `${original} (${suffix++})`;
      occupiedGroups.add(key(name));
      groupNames.set(key(original), name);
      return { ...group, name };
    });
    const peptides: Peptide[] = addedItems.map(item => ({ ...item, id: crypto.randomUUID(), name: item.name.trim(), shortCode: item.shortCode || item.name.slice(0, 3), mixGroupId: item.mixGroupId ? groupNames.get(key(item.mixGroupId)) ?? item.mixGroupId : undefined, remainingMg: item.vialMg, notes: item.notes ?? "", archived: false, example: false }));
    update(value => ({ ...value, peptides: [...value.peptides, ...peptides], mixGroups: [...value.mixGroups, ...groups] }));
    setMessage(`${peptides.length} peptider importerades${duplicates ? `. ${duplicates} med samma namn fanns redan och hoppades över.` : "."}`); setPreview(null); setImportCode("");
  };
  const currentPeptides = store.peptides.filter(peptide => !peptide.archived && !peptide.example);
  const importCurrent = () => {
    if (!currentPeptides.length) return;
    if ((draft.name.trim() || draft.items.some(item => item.name.trim())) && !window.confirm("Ersätta det öppna utkastet med ditt nuvarande schema från Peptider? Sparade scheman ändras inte.")) return;
    const items = currentPeptides.map(peptide => scheduleItemFromPeptide(peptide, store.mixGroups));
    const usedGroups = new Set(items.map(item => key(item.mixGroupId)).filter(Boolean));
    const groups = store.mixGroups.filter(group => usedGroups.has(key(group.name))).map(group => ({ ...group, weekdays: [...group.weekdays] }));
    setDraft({ ...emptySaved(), name: "Mitt schema", items, groups });
    setError(""); setMessage(`${items.length} peptider hämtades till ett nytt utkast. Granska och spara när du är nöjd.`);
  };
  const shareImage = async () => {
    setError("");
    try { await exportScheduleImage(draft); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Kunde inte dela bilden."); }
  };
  const exportable = draft.items.some(item => item.name.trim()) && draft.items.filter(item => item.name.trim()).every(item => item.doseMcg > 0 && item.vialMg > 0 && item.waterMl > 0);

  return <><PageHeader eyebrow="Planera och dela" title="Scheman" action={<Button variant="ghost" size="icon" className="size-11 rounded-full" onClick={onBack}><ArrowLeft/></Button>}/>{error && <p className="mb-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}{message && <p className="mb-4 rounded-xl bg-accent p-3 text-sm">{message}</p>}
    <section className="mb-7"><h2 className="mb-3 text-lg font-semibold">Importera schema</h2><Surface className="p-4"><div className="flex gap-2"><Input className="h-12 uppercase" value={importCode} onChange={event => setImportCode(event.target.value.toUpperCase())} placeholder="Kod, t.ex. P7K3MX"/><Button className="h-12" disabled={busy || !importCode.trim()} onClick={lookup}>Visa</Button></div>{preview && <div className="mt-4 border-t pt-4"><p className="text-lg font-semibold">Importera {preview.name}?</p><p className="mt-1 text-sm text-muted-foreground">{preview.items.length} peptider{duplicates ? ` · ${duplicates} dubbletter hoppas över` : ""}</p><div className="mt-4 grid grid-cols-2 gap-2"><Button variant="outline" className="h-12" onClick={() => setPreview(null)}>Avbryt</Button><Button className="h-12" disabled={busy} onClick={approve}><Check/> Godkänn</Button></div></div>}</Surface></section>
    <section><h2 className="mb-3 text-lg font-semibold">Mina scheman</h2><div className="mb-3 grid grid-cols-[1fr_auto] gap-2"><select className="h-12 min-w-0 rounded-xl border bg-card px-3" value={saved.some(item => item.id === draft.id) ? draft.id : ""} onChange={event => { const item = saved.find(value => value.id === event.target.value); if (item) setDraft(structuredClone(item)); }}><option value="">Nytt schema</option>{saved.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><Button variant="outline" className="h-12" onClick={() => setDraft(emptySaved())}><Plus/> Nytt</Button></div><Button type="button" variant="outline" className="mb-5 h-12 w-full" disabled={!currentPeptides.length} onClick={importCurrent}>Importera från Peptider</Button><label className="text-sm font-medium">Namn<Input className="mt-1.5 h-12" value={draft.name} onChange={event => setDraft(value => ({ ...value, name: event.target.value }))} placeholder="Schemats namn"/></label>
      {draft.code && <Surface className="mt-4 flex items-center justify-between p-4"><div><p className="text-sm text-muted-foreground">Delningskod</p><strong className="font-mono text-xl tracking-wider">{draft.code}</strong></div><Button variant="outline" className="h-12" onClick={() => navigator.clipboard.writeText(draft.code).then(() => setMessage("Koden är kopierad."))}><Clipboard/> Kopiera</Button></Surface>}
      <div className="mt-5 space-y-4">{draft.items.map((item, index) => <Surface key={index} className="space-y-4 p-4"><div className="flex items-center justify-between"><strong>Peptid {index + 1}</strong><Button variant="ghost" size="icon" onClick={() => setDraft(value => ({ ...value, items: value.items.filter((_, position) => position !== index) }))}><Trash2/></Button></div><label className="text-sm font-medium">Namn<Input className="mt-1.5 h-12" value={item.name} onChange={event => setItem(index, { name: event.target.value })}/></label><div className="grid grid-cols-2 gap-3"><label className="text-sm">Dos (mcg)<Decimal value={item.doseMcg} onChange={doseMcg => setItem(index, { doseMcg })}/></label><label className="text-sm">Vial (mg)<Decimal value={item.vialMg} onChange={vialMg => setItem(index, { vialMg })}/></label><label className="text-sm">BAC-vatten (ml)<Decimal value={item.waterMl} onChange={waterMl => setItem(index, { waterMl })}/></label><label className="text-sm">Administrering<select className="mt-1.5 h-12 w-full rounded-xl border bg-card px-3" value={item.route} onChange={event => setItem(index, { route: event.target.value as Item["route"] })}><option value="subcutaneous">Subkutan</option><option value="intranasal">Intranasal</option><option value="oral">Oral</option><option value="topical">Topikal</option></select></label></div><DoseSummary item={item}/><label className="flex min-h-14 items-center justify-between rounded-2xl border border-border px-4"><span><span className="block text-sm font-medium">Tas fastande</span><span className="text-xs text-muted-foreground">Visas tydligt när dosen ska tas</span></span><Switch aria-label="Tas fastande" checked={item.fasted} onCheckedChange={fasted => setItem(index, { fasted })}/></label><label className="text-sm">Kort anteckning · valfritt<Input className="mt-1.5 h-12" maxLength={160} value={item.notes} onChange={event => setItem(index, { notes: event.target.value })} placeholder="Exempel: Tas före läggdags"/></label><label className="text-sm">Mixgrupp · valfritt<Input className="mt-1.5 h-12" value={item.mixGroupId ?? ""} onChange={event => setItem(index, { mixGroupId: event.target.value || undefined })}/></label><ScheduleEditor item={item} set={part => setItem(index, part)}/></Surface>)}</div>
      <Button variant="outline" className="mt-4 h-12 w-full" onClick={() => setDraft(value => ({ ...value, items: [...value.items, emptyItem()] }))}><Plus/> Lägg till peptid</Button><div className="mt-5 grid grid-cols-2 gap-2"><Button className="h-12" disabled={busy} onClick={save}><Save/> Spara schema</Button><Button type="button" variant="outline" className="h-12" disabled={!exportable} onClick={shareImage}><Download/> Dela bild</Button></div>{saved.some(item => item.id === draft.id) && <Button variant="ghost" className="mt-2 h-11 w-full text-destructive" onClick={remove}><Trash2/> Ta bort schema</Button>}</section>
  </>;
}
