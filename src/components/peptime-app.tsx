"use client";

import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Archive, BarChart3, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, Flame,
  FlaskConical, Heart, History, House, Plus, RotateCcw,
  Search, Share2, ShieldCheck, ShoppingCart, Sparkles, Syringe, TriangleAlert, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PurchasePlanner } from "@/components/purchase-planner";
import { ScheduleSharing } from "@/components/schedule-sharing";
import { InsightsView, PeptideInsights } from "@/components/insights";
import { HeaderButton, IconTile, ListRow, ListSection, PageHeader, ProfileButton, ProgressRing, SectionHeading, SegmentedControl, SheetBar, Surface as Card, Toast } from "@/components/peptime-ui";
import { SettingsView } from "@/components/settings-view";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { initialStore } from "@/lib/demo-data";
import { defaultInjectionSites, syringeCapacity, syringeUnits, type DailyNote, type DailyTagId, type DoseLog, type MixGroupSchedule, type Peptide, type PeptimeStore, type Schedule, type Slot, type WellbeingMetric } from "@/lib/types";
import { addDays, displayLogDate, logScheduledDate, previousDate, stockholmDate, stockholmDateTimeInput, stockholmHour, stockholmLocalToIso } from "@/lib/log-day";
import { groupKey, isDueOn, peptideSchedule, resolvedSchedule, scheduleTargetKey } from "@/lib/schedule";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { loadRemoteStore, normalizeStoreIds, rebaseStore, saveRemoteStore } from "@/lib/supabase/store";
import { readLocalRecovery } from "@/lib/local-recovery";
import { missingRecoveryCounts, storeFromSyncEntities, visibleRecoveryStore, type RecoveryCounts } from "@/lib/recovery-store";
import { clampInventoryMg, deleteDoseLog, replaceDoseLog, restoreDoseLog } from "@/lib/inventory";
import { applyThemeMode } from "@/lib/theme";

const STORAGE_KEY = "peptime-demo-v1";
const CHECKIN_LATER_KEY = "peptime-checkin-later";
const LAST_USER_KEY = `${STORAGE_KEY}:last-user`;
const slotNames: Record<Slot, string> = { morning: "Morgon", lunch: "Lunch", evening: "Kväll", as_needed: "Vid behov" };
const disclaimer = "Log what you want. Peptime contains no medical advice.";

function uid() { return crypto.randomUUID(); }
function syncErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") return "Okänt synkfel";
  const value = error as { code?: unknown; message?: unknown };
  const code = typeof value.code === "string" ? value.code : "";
  const message = typeof value.message === "string" ? value.message : "Okänt synkfel";
  return `${code ? `${code} · ` : ""}${message}`.slice(0, 240);
}
function n(value: number) { return new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 2 }).format(value); }
function massN(value: number) { return new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 4 }).format(value); }
function haptic() { if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(10); }
function peptideCode(peptide: Peptide) { return (peptide.shortCode || peptide.name.slice(0, 3)).slice(0, 4).toLocaleUpperCase("sv-SE"); }
const compoundColors: Record<string, string> = { teal: "#72b7aa", gold: "#c4a66a", stone: "#a1a1aa", blue: "#7f9fca", rose: "#c9828b" };
const compoundColorLabels: Record<string, string> = { teal: "Teal", gold: "Guld", stone: "Neutral", blue: "Blå", rose: "Rosé" };
const dailyTags: { id: DailyTagId; label: string }[] = [
  { id: "irritable", label: "Irriterad" },
  { id: "flushing", label: "Rodnad" },
  { id: "headache", label: "Huvudvärk" },
  { id: "site_soreness", label: "Öm injektionsplats" },
  { id: "nausea", label: "Illamående" },
  { id: "restless", label: "Oro/rastlöshet" },
];
const legacyTagLabels: Record<string, string> = { great_sleep: "Sov bra", high_energy: "Hög energi" };
const tagLabel = (tag: string) => dailyTags.find(value => value.id === tag)?.label ?? legacyTagLabels[tag] ?? tag;
const wellbeingScales: { key: WellbeingMetric; title: string; short: string; low: string; high: string; description: string }[] = [
  { key: "sleepQuality", title: "Sömnkvalitet", short: "Sömn", low: "Mycket dålig", high: "Mycket bra", description: "Natten till idag" },
  { key: "brainFatigue", title: "Hjärntrötthet", short: "Hjärntrött", low: "Ingen", high: "Extrem", description: "Hur mentalt trött du känt dig idag" },
  { key: "physicalFatigue", title: "Fysisk trötthet", short: "Kroppstrött", low: "Ingen", high: "Extrem", description: "Hur trött kroppen känts idag" },
  { key: "painLevel", title: "Värk", short: "Värk", low: "Ingen värk", high: "Mycket värk", description: "Hur mycket värk du känt idag" },
  { key: "activityLevel", title: "Aktivitetsnivå", short: "Aktivitet", low: "Mycket låg", high: "Mycket hög", description: "Dagens rörelse och träning" },
];

function hasWellbeingData(note?: DailyNote) {
  return Boolean(note?.note.trim() || note?.tags.length || wellbeingScales.some(scale => note?.[scale.key] !== undefined));
}

function WellbeingScale({ scale, value, onChange }: { scale: typeof wellbeingScales[number]; value?: number; onChange: (value: number) => void }) {
  return <fieldset className="rounded-[14px] bg-card p-4"><legend className="sr-only">{scale.title}</legend><div className="mb-3"><p className="text-[15px] font-semibold">{scale.title}</p><p className="mt-0.5 text-[13px] text-muted-foreground">{scale.description}</p></div><div className="grid grid-cols-5 gap-2">{[1,2,3,4,5].map(step => <button type="button" key={step} aria-label={`${scale.title}: ${step} av 5`} aria-pressed={value === step} onClick={() => { haptic(); onChange(step); }} className={`grid min-h-11 place-items-center rounded-[12px] text-[17px] font-semibold transition-colors ${value === step ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground/75"}`}>{step}</button>)}</div><div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>{scale.low}</span><span>{scale.high}</span></div></fieldset>;
}

function vialDaysLeft(peptide: Peptide) {
  if (!peptide.reconstitutedAt) return null;
  const expiresAt = new Date(peptide.reconstitutedAt).getTime() + peptide.beyondUseDays * 86400000;
  return Math.ceil((expiresAt - Date.now()) / 86400000);
}

function inventoryDaysLeft(peptide: Peptide, store: PeptimeStore) {
  const schedule = resolvedSchedule(peptide, store.mixGroups);
  const doseMg = peptide.doseMcg / 1000;
  if (schedule.paused || schedule.frequency === "as_needed" || doseMg <= 0 || peptide.remainingMg < 0) return null;
  const availableDoses = Math.floor((peptide.remainingMg + 0.000001) / doseMg);
  if (availableDoses <= 0) return 0;
  const today = stockholmDate();
  let dueDoses = 0;
  for (let offset = 0; offset <= 730; offset += 1) {
    if (!isDueOn(peptide, store, addDays(today, offset))) continue;
    dueDoses += 1;
    if (dueDoses >= availableDoses) return offset + 1;
  }
  return null;
}

function consecutiveLoggedDays(logs: DoseLog[], today: string, dayBoundaryHour: number) {
  const dates = new Set(logs.filter(log => log.status === "taken").map(log => logScheduledDate(log, dayBoundaryHour)));
  let date = dates.has(today) ? today : previousDate(today);
  let count = 0;
  while (dates.has(date)) { count += 1; date = previousDate(date); }
  return count;
}

function SyringeDrawBar({ items }: { items: Peptide[] }) {
  const values = items.map(item => syringeUnits(item.doseMcg, item.vialMg, item.waterMl));
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return null;
  const stops = values.map((_, index) => values.slice(0, index + 1).reduce((sum, value) => sum + value, 0));
  return <div className="px-4 pb-3 pt-3" aria-label={`Sprutvisualisering, totalt ${n(total)} IU`}>
    <div className="flex h-5 overflow-hidden rounded-md border border-border bg-background/70">
      {items.map((item, index) => <span key={item.id} style={{ width: `${(values[index] / total) * 100}%`, backgroundColor: compoundColors[item.color] ?? compoundColors.teal }} className="border-r border-black/30 last:border-r-2 last:border-r-foreground" />)}
    </div>
    <div className="relative mt-1.5 h-5 text-xs tabular-nums text-muted-foreground"><span className="absolute left-0">0</span>{stops.map((stop,index)=><span key={`${items[index].id}-stop`} style={{ left: `${(stop / total) * 100}%` }} className={`absolute ${index === stops.length - 1 ? "-translate-x-full" : "-translate-x-1/2"}`}>{n(stop)}</span>)}</div>
  </div>;
}

function readStorage(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeStorage(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch (error) { console.warn("Peptime could not write local storage", error); }
}
function readStoredStore(key: string) {
  const saved = readStorage(key);
  if (!saved) return null;
  try { return normalizeStoreIds(JSON.parse(saved)); } catch { return null; }
}
function persistSynced(userId: string, store: PeptimeStore) { writeStorage(`${STORAGE_KEY}:${userId}:synced`, JSON.stringify(store)); }
function isOffline() { return typeof navigator !== "undefined" && navigator.onLine === false; }
const offlineMessage = "Offline · ändringarna sparas på den här enheten och synkas när du är ansluten igen.";
function withTimeout<T>(promise: Promise<T>, ms: number) {
  return Promise.race([promise, new Promise<null>(resolve => window.setTimeout(() => resolve(null), ms))]);
}

function useStore() {
  const [store, setStore] = useState<PeptimeStore>(() => normalizeStoreIds(initialStore));
  const [ready, setReady] = useState(false);
  const [syncState, setSyncState] = useState<"local" | "syncing" | "synced" | "error">("local");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [hydrateAttempt, setHydrateAttempt] = useState(0);
  const [saveAttempt, setSaveAttempt] = useState(0);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [recoveryActive, setRecoveryActive] = useState(false);
  const [recoveryCounts, setRecoveryCounts] = useState<RecoveryCounts | null>(null);
  const clientRef = useRef<ReturnType<typeof createSupabaseBrowserClient> | null>(null);
  const userIdRef = useRef<string | null>(null);
  const skipFirstSync = useRef(false);
  const recoveryMode = useRef(false);
  const lastSyncedStore = useRef<PeptimeStore | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const syncEpoch = useRef(0);
  const hydrateFailures = useRef(0);
  const saveFailures = useRef(0);
  const readyRef = useRef(false);
  const lastHydratedAt = useRef(0);
  const pendingSave = useRef<(() => void) | null>(null);
  useEffect(() => { readyRef.current = ready; }, [ready]);
  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;
    async function hydrate() {
      const hasRemote = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
      if (!hasRemote) {
        const saved = readStoredStore(STORAGE_KEY);
        if (saved && !cancelled) setStore(saved);
        if (!cancelled) setReady(true);
        return;
      }
      // When the app is already showing data this is a refresh after resume.
      let showingLocal = readyRef.current;
      let fallback: PeptimeStore | null = null;
      try {
        setSyncState("syncing");
        const client = clientRef.current ?? createSupabaseBrowserClient();
        if (!showingLocal) {
          // Show this device's copy before any network request so the app
          // also opens offline. The session is read from local cookies; if
          // that stalls (an expired token refreshing offline), fall back to
          // the last signed-in user on this device.
          const session = await withTimeout(client.auth.getSession().catch(() => null), 1500);
          const localUserId = session && !session.error ? session.data.session?.user.id ?? null : readStorage(LAST_USER_KEY);
          const local = localUserId ? readStoredStore(`${STORAGE_KEY}:${localUserId}`) : null;
          if (!cancelled && localUserId && local?.onboardingComplete) {
            userIdRef.current = localUserId;
            setActiveUserId(localUserId);
            setStore(local);
            setReady(true);
            showingLocal = true;
          }
        }
        const { data, error: userError } = await client.auth.getUser();
        if (!data.user) throw userError ?? new Error("No authenticated Supabase user");
        if (cancelled) return;
        const userId = data.user.id;
        if (showingLocal && userIdRef.current && userIdRef.current !== userId) {
          // A cached copy belongs to another account. Hide it before loading
          // this account's own data, including while its network request runs.
          setReady(false);
          setStore(normalizeStoreIds(initialStore));
          showingLocal = false;
        }
        clientRef.current = client;
        userIdRef.current = userId;
        setActiveUserId(userId);
        writeStorage(LAST_USER_KEY, userId);
        // Stop queued saves and let a running one finish. Unsent edits are in
        // local storage and are replayed against the last synced copy below.
        syncEpoch.current += 1;
        await saveQueue.current.catch(() => undefined);
        const scopedKey = `${STORAGE_KEY}:${userId}`;
        const scopedLocal = readStoredStore(scopedKey);
        const legacyLocal = scopedLocal ? null : readStoredStore(STORAGE_KEY);
        const local = scopedLocal ?? legacyLocal ?? normalizeStoreIds(initialStore);
        fallback = scopedLocal ?? legacyLocal;
        const baseline = recoveryMode.current ? null : readStoredStore(`${scopedKey}:synced`);
        const remote = await loadRemoteStore(client, local);
        if (baseline && remote.hasData && remote.orphanLogCount === 0) {
          // This device has synced before, so its unsent edits are exactly the
          // difference from the last synced copy. Records missing from the
          // account without a local edit were deleted on another device.
          await saveRemoteStore(client, userId, local, baseline);
          const synced = rebaseStore(remote.store, baseline, local);
          if (cancelled) return;
          recoveryMode.current = false;
          setRecoveryActive(false);
          setRecoveryCounts(null);
          lastSyncedStore.current = synced;
          persistSynced(userId, synced);
          // Edits made while this ran are replayed too; the save effect then
          // uploads whatever still differs from the synced copy.
          skipFirstSync.current = false;
          const replayOver = showingLocal;
          setStore(current => rebaseStore(remote.store, baseline, replayOver ? current : local));
          setSyncError(null);
          setSyncState("synced");
          hydrateFailures.current = 0;
          lastHydratedAt.current = Date.now();
          setReady(true);
          return;
        }
        const [syncSnapshot, deviceSnapshot] = await Promise.all([
          client.from("sync_state").select("entities").eq("user_id", userId).maybeSingle(),
          readLocalRecovery(userId),
        ]);
        if (cancelled) return;
        if (syncSnapshot.error) console.warn("Peptime recovery snapshot unavailable", syncSnapshot.error.code);
        const serverCopy = storeFromSyncEntities(syncSnapshot.data?.entities, remote.store);
        const scopedCopy = scopedLocal ?? (!remote.hasData && legacyLocal ? legacyLocal : undefined);
        const recovered = visibleRecoveryStore(remote.store, remote.hasData, serverCopy, deviceSnapshot?.store, scopedCopy);
        // The retired sync client generated false conflicts when it compared
        // differently normalized copies of the same records. Keep its snapshot
        // available for export, but pause writes only for records actually
        // missing from the original tables or logs without a peptide row.
        // Once this device has a synced copy, this check is no longer needed.
        recoveryMode.current = recovered.recovered || remote.orphanLogCount > 0;
        setRecoveryActive(recoveryMode.current);
        const remoteBaseline = remote.hasData ? remote.store : { ...remote.store, peptides: [], mixGroups: [], logs: [], dailyNotes: [], purchasePlans: [], todayAdditions: [], onboardingComplete: false };
        setRecoveryCounts(recoveryMode.current ? missingRecoveryCounts(remoteBaseline, recovered.store) : null);
        lastSyncedStore.current = recoveryMode.current ? null : remoteBaseline;
        if (!recoveryMode.current) persistSynced(userId, remoteBaseline);
        const next = recovered.store;
        setSyncError(recoveryMode.current ? "Automatisk kontosynk är pausad för att skydda uppgifterna. Exportera en fullständig kopia i Inställningar." : null);
        setSyncState(recoveryMode.current ? "error" : remote.hasData ? "synced" : "local");
        hydrateFailures.current = 0;
        lastHydratedAt.current = Date.now();
        skipFirstSync.current = true;
        setStore(next);
        setReady(true);
      } catch (error) {
        console.error("Peptime Supabase hydration error", error);
        if (cancelled) return;
        // Keep working from this device's copy. Edits stay local until the
        // next successful hydration replays them against the synced copy.
        clientRef.current = null;
        setSyncError(isOffline() ? offlineMessage : syncErrorMessage(error));
        setSyncState("error");
        if (!showingLocal) {
          if (fallback?.onboardingComplete) { setStore(fallback); setReady(true); }
          else setReady(false);
        }
        hydrateFailures.current += 1;
        const delay = Math.min(30000, 3000 * hydrateFailures.current);
        retryTimer = window.setTimeout(() => setHydrateAttempt(value => value + 1), delay);
      }
    }
    hydrate();
    return () => { cancelled = true; if (retryTimer) window.clearTimeout(retryTimer); };
  }, [hydrateAttempt]);
  useEffect(() => {
    if (!ready) return;
    let retryTimer: number | undefined;
    const key = userIdRef.current ? `${STORAGE_KEY}:${userIdRef.current}` : STORAGE_KEY;
    writeStorage(key, JSON.stringify(store));
    if (recoveryMode.current) return;
    if (!clientRef.current || !userIdRef.current) return;
    if (skipFirstSync.current) { skipFirstSync.current = false; return; }
    const client = clientRef.current;
    const userId = userIdRef.current;
    const epoch = syncEpoch.current;
    let started = false;
    const run = async () => {
      if (started) return;
      started = true;
      if (pendingSave.current === run) pendingSave.current = null;
      try {
        saveQueue.current = saveQueue.current.catch(() => undefined).then(async () => {
          if (recoveryMode.current || epoch !== syncEpoch.current) return;
          setSyncState("syncing");
          const synced = await saveRemoteStore(client, userId, store, lastSyncedStore.current ?? store);
          if (epoch !== syncEpoch.current) return;
          lastSyncedStore.current = synced;
          persistSynced(userId, synced);
          saveFailures.current = 0;
          setSyncError(null);
          setSyncState("synced");
        });
        await saveQueue.current;
      }
      catch (error) {
        console.error("Peptime Supabase sync error", error);
        setSyncError(isOffline() ? offlineMessage : syncErrorMessage(error));
        setSyncState("error");
        saveFailures.current += 1;
        const delay = Math.min(30000, 3000 * saveFailures.current);
        retryTimer = window.setTimeout(() => setSaveAttempt(value => value + 1), delay);
      }
    };
    pendingSave.current = run;
    const timer = window.setTimeout(run, 650);
    return () => { window.clearTimeout(timer); if (pendingSave.current === run) pendingSave.current = null; if (retryTimer) window.clearTimeout(retryTimer); };
  }, [ready, store, saveAttempt]);
  useEffect(() => {
    // Phones keep the app suspended for days: send pending edits right away
    // when it is hidden, and fetch other devices' changes when it returns.
    const flush = () => pendingSave.current?.();
    const refresh = () => {
      if (!readyRef.current || recoveryMode.current || Date.now() - lastHydratedAt.current < 30_000) return;
      setHydrateAttempt(value => value + 1);
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); else refresh(); };
    const onOnline = () => setHydrateAttempt(value => value + 1);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("online", onOnline);
    };
  }, []);
  const retrySync = () => {
    if (recoveryMode.current) { setHydrateAttempt(value => value + 1); return; }
    if (clientRef.current && userIdRef.current && ready) setSaveAttempt(value => value + 1);
    else setHydrateAttempt(value => value + 1);
  };
  const importSharedSchedule = async (code: string) => {
    const client = clientRef.current;
    const userId = userIdRef.current;
    if (!client || !userId || recoveryMode.current || !lastSyncedStore.current) throw new Error("Kontosynk måste fungera innan ett schema kan importeras.");
    syncEpoch.current += 1;
    await saveQueue.current;
    setSyncState("syncing");
    let flushed = false;
    let committed = false;
    try {
      lastSyncedStore.current = await saveRemoteStore(client, userId, store, lastSyncedStore.current);
      persistSynced(userId, lastSyncedStore.current);
      flushed = true;
      const result = await client.rpc("import_shared_schedule", { p_code: code.trim().toUpperCase() });
      if (result.error) throw result.error;
      committed = true;
      const remote = await loadRemoteStore(client, store);
      lastSyncedStore.current = remote.store;
      persistSynced(userId, remote.store);
      skipFirstSync.current = true;
      setStore(remote.store);
      setSyncError(null);
      setSyncState("synced");
      return Number(result.data?.imported ?? 0);
    } catch (reason) {
      if (committed) {
        setSyncError("Schemat sparades i kontot, men appen kunde inte läsa in det igen. Försök ladda om.");
        setSyncState("error");
        throw new Error("Schemat sparades i kontot, men appen kunde inte läsa in det igen. Försök ladda om.");
      }
      if (!flushed) {
        setSyncError(syncErrorMessage(reason));
        setSyncState("error");
      } else setSyncState("synced");
      throw reason;
    }
  };
  const restoreMissingRecords = async () => {
    if (!recoveryMode.current || !clientRef.current || !userIdRef.current) return;
    try {
      setSyncState("syncing");
      const remote = await loadRemoteStore(clientRef.current, store);
      const baseline = remote.hasData ? remote.store : { ...remote.store, peptides: [], mixGroups: [], logs: [], dailyNotes: [], purchasePlans: [], todayAdditions: [], onboardingComplete: false };
      const merged = visibleRecoveryStore(baseline, remote.hasData, undefined, store, undefined).store;
      const ids = new Set(merged.peptides.map(peptide => peptide.id));
      if (merged.logs.some(log => !ids.has(log.peptideId))) throw new Error("En logg saknar sin peptid. Ingen återställning gjordes.");
      const counts = missingRecoveryCounts(baseline, merged);
      setRecoveryCounts(counts);
      if (Object.values(counts).some(count => count > 0) || merged.onboardingComplete !== baseline.onboardingComplete) {
        await saveRemoteStore(clientRef.current, userIdRef.current, merged, baseline);
      }
      setHydrateAttempt(value => value + 1);
    } catch (error) {
      console.error("Peptime account recovery error", error);
      setSyncError(syncErrorMessage(error));
      setSyncState("error");
    }
  };
  return [store, setStore, ready, syncState, retrySync, syncError, activeUserId, recoveryActive, recoveryCounts, restoreMissingRecords, importSharedSchedule] as const;
}

function BottomNav({ tab, onSelect }: { tab: Tab; onSelect: (tab: Tab) => void }) {
  const items = [[House, "today"], [History, "log"], [FlaskConical, "peptides"], [BarChart3, "insights"]] as const;
  return <nav aria-label="Huvudnavigering" className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150">
    <div className="mx-auto grid h-14 max-w-[500px] grid-cols-4">{items.map(([Icon, key]) => <button type="button" key={key} aria-current={tab === key ? "page" : undefined} onClick={() => onSelect(key)} className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors active:opacity-60 ${tab === key ? "text-primary" : "text-muted-foreground"}`}><Icon className="size-6" strokeWidth={tab === key ? 2.3 : 1.8}/>{tabLabels[key]}</button>)}</div>
  </nav>;
}

function Onboarding({ store, update }: { store: PeptimeStore; update: React.Dispatch<React.SetStateAction<PeptimeStore>> }) {
  const [step, setStep] = useState(0);
  const [examples, setExamples] = useState(true);
  const sampleUnits = syringeUnits(100, 10, 2);
  const finish = () => update(s => ({ ...s, peptides: examples ? s.peptides : [], mixGroups: examples ? s.mixGroups : [], onboardingComplete: true }));
  return <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-background"><div className="grid min-h-full place-items-center px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))]"><div className="w-full max-w-[430px]">
    <div className="mb-10 flex items-center justify-between"><span className="text-sm font-semibold tracking-[0.16em]">PEPTIME</span><span className="text-xs text-muted-foreground">{step + 1} / 4</span></div>
    <div className="mb-8 flex gap-1.5">{[0,1,2,3].map(i => <span key={i} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />)}</div>
    {step === 0 && <><div className="mb-6 grid size-14 place-items-center rounded-2xl bg-accent text-accent-foreground"><ShieldCheck className="size-7" /></div><h1 className="text-3xl font-medium tracking-[-.04em]">Din privata forskningslogg</h1><p className="mt-4 leading-7 text-muted-foreground">Peptime hjälper dig hålla koll på dina peptider!</p><Card className="mt-7 p-4"><p className="text-sm leading-6">{disclaimer}</p></Card></>}
    {step === 1 && <><p className="text-xs font-semibold uppercase tracking-[.17em] text-accent-foreground">Spruta</p><h1 className="mt-2 text-3xl font-medium tracking-[-.04em]">Vad använder du?</h1><p className="mt-3 text-muted-foreground">På U-100 motsvarar 1 IU-markering alltid 0,01 ml. Storleken anger sprutans maxkapacitet.</p><div className="mt-7 grid gap-3">{(["U-100 0.3 ml", "U-100 0.5 ml", "U-100 1 ml"] as const).map(s => <button key={s} onClick={() => update(v => ({...v, settings: {...v.settings, syringe: s}}))} className={`flex min-h-16 items-center justify-between rounded-2xl border px-5 text-left ${store.settings.syringe === s ? "border-primary bg-accent/40" : "border-border bg-card"}`}><span>{s}<span className="ml-2 text-xs text-muted-foreground">· {syringeCapacity(s)} IU</span></span>{store.settings.syringe === s && <CheckCircle2 className="size-5 text-primary" />}</button>)}</div></>}
    {step === 2 && <><p className="text-xs font-semibold uppercase tracking-[.17em] text-accent-foreground">Vialmatematik</p><h1 className="mt-2 text-3xl font-medium tracking-[-.04em]">Dina värden, tydligt</h1><Card className="mt-7 overflow-hidden"><div className="grid grid-cols-2 divide-x divide-border"><div className="p-4"><span className="text-xs text-muted-foreground">Vial</span><p className="mt-1 text-xl tabular-nums">10 mg</p></div><div className="p-4"><span className="text-xs text-muted-foreground">BAC-vatten</span><p className="mt-1 text-xl tabular-nums">2 ml</p></div></div><div className="border-t border-border bg-muted/50 p-5"><p className="text-sm text-muted-foreground">10 mg + 2 ml = 50 mcg per IU</p><p className="mt-3 text-2xl font-medium tabular-nums">100 mcg = {n(sampleUnits)} IU</p></div></Card><label className="mt-6 flex min-h-14 items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4"><span><span className="block text-sm">Lägg till exempelpeptider</span><span className="text-xs text-muted-foreground">Tydligt märkta och lätta att ta bort</span></span><Switch checked={examples} onCheckedChange={setExamples} /></label></>}
    {step === 3 && <><div className="mb-6 grid size-14 place-items-center rounded-2xl bg-accent text-accent-foreground"><Sparkles className="size-7" /></div><h1 className="text-3xl font-bold tracking-[-.04em]">Redo när du är</h1><p className="mt-4 leading-7 text-muted-foreground">Öppna appen och tryck Ta dos. Injektionsplats kan väljas direkt på kortet när du vill logga den.</p><Card className="mt-7 p-5"><p className="text-sm text-muted-foreground">Standard</p><p className="mt-2">{store.settings.syringe} · Europe/Stockholm · Följer systemets utseende</p></Card></>}
    <div className="mt-10 flex gap-3">{step > 0 && <Button variant="outline" className="h-14 flex-1 rounded-2xl" onClick={() => setStep(step - 1)}>Tillbaka</Button>}<Button className="h-14 flex-[2] rounded-2xl text-base" onClick={() => step < 3 ? setStep(step + 1) : finish()}>{step < 3 ? "Fortsätt" : "Öppna Peptime"}</Button></div>
  </div></div></div>;
}

type LogTarget = { items: Peptide[]; scheduledDate: string; carryover: boolean };
type DoneRow = { key: string; names: string; status: DoseLog["status"]; takenAt: string; iu: number; site?: string; slot: Slot; logIds: string[] };
const slotOrder: Slot[] = ["morning", "lunch", "evening", "as_needed"];
const clock = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
function minutesBetween(from: string, to: string) {
  const [fromHour, fromMinute] = from.split(":").map(Number);
  const [toHour, toMinute] = to.split(":").map(Number);
  return (toHour * 60 + toMinute) - (fromHour * 60 + fromMinute);
}
function lateLabel(minutes: number) {
  return minutes < 60 ? `${minutes} min sen` : `${Math.floor(minutes / 60)} h ${minutes % 60 ? `${minutes % 60} min ` : ""}sen`;
}

function DoseBadge({ items, size = "md" }: { items: Peptide[]; size?: "md" | "lg" }) {
  const color = compoundColors[items[0]?.color] ?? compoundColors.teal;
  return <span style={{ backgroundColor: `${color}26`, color }} className={`grid shrink-0 place-items-center rounded-full font-semibold tracking-[-.01em] ${size === "lg" ? "size-14 text-[17px]" : "size-11 text-[13px]"}`}>{items.length > 1 ? <Syringe className={size === "lg" ? "size-6" : "size-5"}/> : peptideCode(items[0])}</span>;
}

function WellbeingSheet({ open, onClose, store, noteEntry, saveNote, removeCustomTag }: { open: boolean; onClose: () => void; store: PeptimeStore; noteEntry: DailyNote; saveNote: (changes: Partial<DailyNote>) => void; removeCustomTag: (tag: string) => void }) {
  const [customTag, setCustomTag] = useState("");
  const toggleTag = (tag: DailyTagId) => { haptic(); saveNote({ tags: noteEntry.tags.includes(tag) ? noteEntry.tags.filter(value => value !== tag) : [...noteEntry.tags, tag] }); };
  const addCustomTag = () => { const value = customTag.trim().slice(0, 40); if (!value) return; saveNote({ tags: [...new Set([...noteEntry.tags, value])] }); setCustomTag(""); };
  const chip = (selected: boolean) => `min-h-10 px-3.5 text-[15px] transition-colors ${selected ? "bg-primary text-primary-foreground" : "bg-card text-foreground/80"}`;
  return <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}>
    <DialogContent showCloseButton={false} className="max-h-[92dvh] overflow-y-auto bg-background">
      <SheetBar title="Dagens mående" onDone={onClose}/>
      <DialogHeader className="sr-only"><DialogTitle>Dagens mående</DialogTitle><DialogDescription>Sparas automatiskt</DialogDescription></DialogHeader>
      <div className="space-y-3">{wellbeingScales.map(scale => <WellbeingScale key={scale.key} scale={scale} value={noteEntry[scale.key]} onChange={value => saveNote({ [scale.key]: value })}/>)}</div>
      <div><p className="mb-2 text-[15px] font-semibold">Hur har dagen känts?</p><div className="flex flex-wrap gap-2">{dailyTags.map(tag => <button type="button" key={tag.id} aria-pressed={noteEntry.tags.includes(tag.id)} onClick={() => toggleTag(tag.id)} className={`rounded-full ${chip(noteEntry.tags.includes(tag.id))}`}>{tag.label}</button>)}{store.settings.customDailyTags.map(tag => <span key={tag} className="inline-flex overflow-hidden rounded-full"><button type="button" aria-pressed={noteEntry.tags.includes(tag)} onClick={() => toggleTag(tag)} className={chip(noteEntry.tags.includes(tag))}>{tag}</button><button type="button" onClick={() => removeCustomTag(tag)} aria-label={`Ta bort taggen ${tag}`} className="min-h-10 border-l border-border bg-card px-2.5 text-muted-foreground"><X className="size-3.5"/></button></span>)}</div>
        <div className="mt-3 flex gap-2"><Input value={customTag} onChange={event => setCustomTag(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addCustomTag(); } }} maxLength={40} placeholder="Egen tagg" className="border-0 bg-card"/><Button type="button" variant="secondary" className="shrink-0" onClick={addCustomTag} disabled={!customTag.trim()}><Plus/> Lägg till</Button></div></div>
      <label className="block text-[15px] font-semibold">Anteckning <span className="font-normal text-muted-foreground">· valfritt</span><Textarea value={noteEntry.note} onChange={event => saveNote({ note: event.target.value })} placeholder="Något mer du vill komma ihåg?" className="mt-2 resize-none border-0 bg-card font-normal"/></label>
      <p className="text-center text-[13px] text-muted-foreground">Sparas automatiskt</p>
    </DialogContent>
  </Dialog>;
}

function TodayView({ store, update, openCalendar, headerAction, openCheckinInitially, onCheckinClosed }: { store: PeptimeStore; update: React.Dispatch<React.SetStateAction<PeptimeStore>>; openCalendar: () => void; headerAction: React.ReactNode; openCheckinInitially: boolean; onCheckinClosed: () => void }) {
  const today = stockholmDate();
  const yesterday = previousDate(today);
  const boundary = store.settings.dayBoundaryHour;
  const [siteSelections, setSiteSelections] = useState<Record<string, string>>({});
  const [adjustTarget, setAdjustTarget] = useState<LogTarget | null>(null);
  const [adjustDoses, setAdjustDoses] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState<string | null | undefined>(undefined);
  const [toast, setToast] = useState<{ message: string; logIds: string[] } | null>(null);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(null), 8000); return () => window.clearTimeout(timer); }, [toast]);
  const [checkinOpen, setCheckinOpen] = useState(openCheckinInitially);
  const [checkinDeferredDate, setCheckinDeferredDate] = useState<string | null>(() => {
    try { return typeof window === "undefined" ? null : window.sessionStorage.getItem(CHECKIN_LATER_KEY); }
    catch { return null; }
  });
  const noteEntry: DailyNote = store.dailyNotes.find(v => v.date === today) ?? { date: today, note: "", tags: [] };
  const loggedIdsFor = (date: string) => new Set(store.logs.filter(log => logScheduledDate(log, boundary) === date).map(log => log.peptideId));
  const streak = consecutiveLoggedDays(store.logs, today, boundary);
  const groupsFor = (date: string, carryover: boolean): LogTarget[] => {
    const loggedIds = loggedIdsFor(date);
    const due = store.peptides.filter(peptide => isDueOn(peptide, store, date) && !loggedIds.has(peptide.id));
    const map = new Map<string, Peptide[]>();
    due.forEach(p => { const group = groupKey(p.mixGroupId); const key = group ? `group:${group}` : p.id; map.set(key, [...(map.get(key) ?? []), p]); });
    return [...map.values()].sort((a, b) => { const aSchedule = resolvedSchedule(a[0], store.mixGroups), bSchedule = resolvedSchedule(b[0], store.mixGroups); return (aSchedule.frequency === "as_needed" ? "99:99" : aSchedule.time).localeCompare(bSchedule.frequency === "as_needed" ? "99:99" : bSchedule.time); }).map(items => ({ items, scheduledDate: date, carryover }));
  };
  const carryover = stockholmHour() < 12 ? groupsFor(yesterday, true) : [];
  const pending = groupsFor(today, false);
  const groups = [...carryover, ...pending];
  const doneRows = (() => {
    const rows = new Map<string, DoneRow>();
    for (const log of store.logs.filter(value => logScheduledDate(value, boundary) === today)) {
      const key = `${log.mixGroupId ? groupKey(log.mixGroupId) : log.peptideId}|${log.takenAt}|${log.status}`;
      const row = rows.get(key);
      if (row) { row.names = `${row.names} + ${log.peptideName}`; row.iu += log.computedIu; row.logIds.push(log.id); }
      else rows.set(key, { key, names: log.peptideName, status: log.status, takenAt: log.takenAt, iu: log.computedIu, site: log.site, slot: log.slot, logIds: [log.id] });
    }
    return [...rows.values()].sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  })();
  const keyOf = (target: LogTarget) => `${target.scheduledDate}:${target.items.map(item => item.id).join(",")}`;
  // Open today's next dose by default; yesterday's leftovers stay compact.
  const defaultOpen = pending[0] ?? carryover[0];
  const openKey = expanded === undefined ? (defaultOpen ? keyOf(defaultOpen) : null) : expanded;
  const total = pending.length + doneRows.length;
  const handled = doneRows.length;
  const allDone = total > 0 && pending.length === 0;
  const next = pending.find(target => resolvedSchedule(target.items[0], store.mixGroups).frequency !== "as_needed");
  const scheduledToday = store.peptides.filter(peptide => isDueOn(peptide, store, today));
  const hasCheckinData = hasWellbeingData(noteEntry);
  const showCheckinPrompt = scheduledToday.length > 0 && pending.length === 0 && doneRows.some(row => row.status === "taken") && !hasCheckinData && checkinDeferredDate !== today;
  const nowTime = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(".", ":");
  const recentIds = new Set(toast?.logIds ?? []);

  const showToast = (message: string, logIds: string[]) => setToast({ message, logIds });
  const saveLogs = (target: LogTarget, status: "taken" | "skipped", site?: string, actualDoses?: Record<string, number>) => {
    const { items, scheduledDate } = target;
    const now = new Date().toISOString();
    const newLogs: DoseLog[] = items.map(p => {
      const actualDose = actualDoses?.[p.id] ?? p.doseMcg;
      return { id: uid(), peptideId: p.id, peptideName: p.name, plannedDose: p.doseMcg, actualDose, unit: "mcg", computedIu: syringeUnits(actualDose, p.vialMg, p.waterMl), slot: resolvedSchedule(p, store.mixGroups).slot, takenAt: now, scheduledDate, status, site, mixGroupId: p.mixGroupId, vialId: p.currentVialId ?? p.id, note: "" };
    });
    update(s => ({ ...s, logs: [...newLogs, ...s.logs], peptides: s.peptides.map(p => {
      if (!items.some(item => item.id === p.id) || status !== "taken") return p;
      const actualDose = actualDoses?.[p.id] ?? p.doseMcg;
      return { ...p, remainingMg: clampInventoryMg(p.remainingMg - (actualDose / 1000), p.vialMg), lastSite: site ?? p.lastSite };
    }) }));
    setExpanded(undefined);
    showToast(`${items.map(item => item.name).join(" + ")} ${status === "taken" ? "loggad" : "överhoppad"}`, newLogs.map(log => log.id));
  };
  const undo = () => { const ids = toast?.logIds ?? []; update(s => ids.reduce((next, id) => deleteDoseLog(next, id), s)); setToast(null); };
  const saveNote = (changes: Partial<DailyNote>) => update(s => {
    const current = s.dailyNotes.find(v => v.date === today) ?? { date: today, note: "", tags: [] };
    const customDailyTags = changes.tags ? [...new Set([...s.settings.customDailyTags, ...changes.tags.filter(tag => !dailyTags.some(value => value.id === tag) && !legacyTagLabels[tag])])] : s.settings.customDailyTags;
    return { ...s, settings: { ...s.settings, customDailyTags }, dailyNotes: [...s.dailyNotes.filter(v => v.date !== today), { ...current, ...changes, date: today }] };
  });
  const removeCustomTag = (tag: string) => update(s => ({ ...s, settings: { ...s.settings, customDailyTags: s.settings.customDailyTags.filter(value => value !== tag) } }));
  const closeCheckin = () => { setCheckinOpen(false); onCheckinClosed(); };
  const deferCheckin = () => { try { window.sessionStorage.setItem(CHECKIN_LATER_KEY, today); } catch {} setCheckinDeferredDate(today); };
  const adjustedItems = adjustTarget?.items.map(item => ({ ...item, doseMcg: adjustDoses[item.id] ?? item.doseMcg })) ?? [];
  const adjustedTotalIu = adjustedItems.reduce((sum, item) => sum + syringeUnits(item.doseMcg, item.vialMg, item.waterMl), 0);
  const adjustedDosesValid = adjustedItems.length > 0 && adjustedItems.every(item => Number.isFinite(item.doseMcg) && item.doseMcg > 0);
  const massUnit = store.settings.massDisplayUnit;
  const mass = (mcg: number) => `${massN(massUnit === "mg" ? mcg / 1000 : mcg)} ${massUnit}`;
  const title = displayLogDate(today, { weekday: "long", day: "numeric", month: "long" });

  const renderPending = (target: LogTarget) => {
    const { items, carryover: isCarryover } = target;
    const first = items[0];
    const schedule = resolvedSchedule(first, store.mixGroups);
    const key = keyOf(target);
    const open = openKey === key;
    const asNeeded = schedule.frequency === "as_needed";
    const lateMinutes = !isCarryover && !asNeeded ? minutesBetween(schedule.time, nowTime) : 0;
    const totalIu = items.reduce((sum, p) => sum + syringeUnits(p.doseMcg, p.vialMg, p.waterMl), 0);
    const totalDoseMcg = items.reduce((sum, p) => sum + p.doseMcg, 0);
    const isMix = items.length > 1;
    const selectedSite = siteSelections[key];
    const expired = items.some(item => (vialDaysLeft(item) ?? 1) <= 0);
    const lowInventory = items.map(item => ({ item, days: inventoryDaysLeft(item, store) })).filter(value => value.days !== null && value.days <= 15);
    const overCapacity = totalIu > syringeCapacity(store.settings.syringe);
    const warn = expired || overCapacity || lowInventory.length > 0;
    const timing = isCarryover ? `Igår${asNeeded ? "" : ` ${schedule.time}`}` : asNeeded ? "Vid behov" : lateMinutes >= 15 ? <span className="font-medium text-destructive">{schedule.time} · {lateLabel(lateMinutes)}</span> : schedule.time;
    const take = (site?: string) => { haptic(); saveLogs(target, "taken", site); };
    return <Card key={key} className="overflow-hidden transition-shadow">
      <div className="flex items-center gap-3 p-4">
        <button type="button" onClick={() => setExpanded(open ? null : key)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <DoseBadge items={items}/>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5"><span className="truncate text-[17px] font-semibold leading-snug">{items.map(i => i.name).join(" + ")}</span>{warn && <TriangleAlert aria-label="Kontrollera" className="size-4 shrink-0 text-amber-600 dark:text-amber-300"/>}</span>
            <span className="mt-0.5 block truncate text-[15px] tabular-nums text-muted-foreground">{timing} · {n(totalIu)} IU{items.some(item => item.fasted) ? " · Fastande" : ""}</span>
          </span>
        </button>
        {!open && <button type="button" onClick={() => take(undefined)} className="min-h-9 shrink-0 rounded-full bg-primary px-4 text-[15px] font-semibold text-primary-foreground transition-transform active:scale-95">Ta</button>}
      </div>
      {open && <div className="space-y-4 px-4 pb-4 animate-in fade-in-0 slide-in-from-top-1 duration-200">
        {expired && <p className="flex gap-2 rounded-xl bg-destructive/10 p-3 text-[15px] text-destructive"><TriangleAlert className="mt-0.5 size-4 shrink-0"/>Vialens användningstid har passerat. Kontrollera uppgifterna.</p>}
        {overCapacity && <p className="flex gap-2 rounded-xl bg-destructive/10 p-3 text-[15px] text-destructive"><TriangleAlert className="mt-0.5 size-4 shrink-0"/>{n(totalIu)} IU ryms inte i din {store.settings.syringe}-spruta ({syringeCapacity(store.settings.syringe)} IU).</p>}
        {lowInventory.map(({ item, days }) => <p key={item.id} className="flex gap-2 rounded-xl bg-amber-500/12 p-3 text-[15px] text-amber-800 dark:text-amber-200"><TriangleAlert className="mt-0.5 size-4 shrink-0"/>{item.name}: {days === 0 ? "lagret är slut" : `räcker ca ${days} ${days === 1 ? "dag" : "dagar"} till`}</p>)}
        {isMix
          ? <div className="overflow-hidden rounded-2xl bg-secondary/60 tabular-nums"><p className="flex items-center gap-2 px-4 pb-1 pt-3 text-[13px] font-medium text-muted-foreground"><Syringe className="size-4"/>Dra upp från varje vial</p><div className="grid grid-cols-2">{items.map((item, index) => <div key={item.id} className={`min-w-0 px-4 py-3 ${index % 2 ? "border-l border-border" : ""}`}><p className="truncate text-[15px] font-medium">{item.name}</p><strong className="mt-1 block text-[26px] font-semibold leading-none tracking-tight">{n(syringeUnits(item.doseMcg, item.vialMg, item.waterMl))} IU</strong><span className="mt-1 block text-[13px] text-muted-foreground">{mass(item.doseMcg)}{item.fasted ? " · Fastande" : ""}</span></div>)}</div><SyringeDrawBar items={items}/><div className="flex items-center justify-between border-t border-border px-4 py-3"><span className="text-[15px] font-semibold">Totalt i sprutan</span><span className="text-right"><strong className="block text-[22px] font-semibold leading-none">{n(totalIu)} IU</strong><span className="mt-1 block text-[13px] text-muted-foreground">{mass(totalDoseMcg)}</span></span></div></div>
          : <div className="flex items-end justify-between gap-4 rounded-2xl bg-secondary/60 px-4 py-4 tabular-nums"><span className="text-[15px] text-muted-foreground">Dra upp<span className="mt-0.5 block text-[13px]">U-100 · {mass(totalDoseMcg)}</span></span><strong className="text-[34px] font-semibold leading-none tracking-tight">{n(totalIu)} <span className="text-[22px]">IU</span></strong></div>}
        {first.route === "subcutaneous" && first.sites.length > 0 && <div><div className="mb-2 flex items-baseline justify-between gap-3"><p className="text-[15px] font-semibold">Injektionsplats <span className="font-normal text-muted-foreground">· valfritt</span></p>{first.lastSite && <span className="text-[13px] text-muted-foreground">Senast: {first.lastSite}</span>}</div><div className="flex flex-wrap gap-2">{first.sites.map(site => <button type="button" key={site} aria-pressed={selectedSite === site} onClick={() => { haptic(); setSiteSelections(value => ({ ...value, [key]: value[key] === site ? "" : site })); }} className={`min-h-10 rounded-full px-3.5 text-[15px] transition-colors ${selectedSite === site ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground/80"}`}>{site}</button>)}</div></div>}
        <Button className="h-[52px] w-full rounded-[14px] text-[17px]" onClick={() => take(selectedSite || undefined)}><Check className="size-5" strokeWidth={2.6}/> Ta dos</Button>
        <div className="grid grid-cols-2 gap-2"><Button variant="secondary" className="h-11 rounded-[12px] text-[15px] font-medium" onClick={() => { haptic(); saveLogs(target, "skipped"); }}>Hoppa över</Button><Button variant="secondary" className="h-11 rounded-[12px] text-[15px] font-medium" onClick={() => { setAdjustTarget(target); setAdjustDoses(Object.fromEntries(items.map(item => [item.id, item.doseMcg]))); }}>Justera dos</Button></div>
        <p className="text-[13px] leading-[18px] text-muted-foreground">{items.map(item => { const days = vialDaysLeft(item); return `${item.name}: ${n(item.remainingMg)} mg kvar${days !== null ? ` · vialen ${days > 0 ? `${days} d kvar` : "passerad"}` : ""}`; }).join(" · ")}</p>
      </div>}
    </Card>;
  };

  const renderDone = (row: DoneRow) => <div key={row.key} className="flex items-center gap-3 rounded-[18px] bg-card/70 px-4 py-3">
    <span className={`grid size-11 shrink-0 place-items-center rounded-full ${row.status === "taken" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"} ${row.logIds.some(id => recentIds.has(id)) ? "animate-in zoom-in-50 duration-300" : ""}`}>{row.status === "taken" ? <Check className="size-5" strokeWidth={3}/> : <X className="size-5" strokeWidth={2.6}/>}</span>
    <span className="min-w-0 flex-1"><span className="block truncate text-[17px] text-muted-foreground">{row.names}</span><span className="mt-0.5 block truncate text-[13px] tabular-nums text-muted-foreground">{row.status === "taken" ? `Tagen ${clock(row.takenAt)} · ${n(row.iu)} IU${row.site ? ` · ${row.site}` : ""}` : `Överhoppad ${clock(row.takenAt)}`}</span></span>
  </div>;

  return <>
    <PageHeader title="Idag" subtitle={<span className="capitalize">{title}</span>} action={<><HeaderButton label="Öppna kalendern" onClick={openCalendar}><CalendarDays/></HeaderButton>{headerAction}</>}/>
    {total > 0 && <Card className="mb-7 flex items-center gap-4 p-4">
      <ProgressRing value={handled} total={total} size={64} stroke={7}>{allDone ? <Check className="size-6 text-primary" strokeWidth={3}/> : <span className="text-[15px] font-semibold tabular-nums">{handled}/{total}</span>}</ProgressRing>
      <div className="min-w-0">
        <p className="text-[20px] font-bold leading-tight tracking-[-.01em]">{allDone ? "Klart för idag" : `${handled} av ${total} ${total === 1 ? "dos" : "doser"}`}</p>
        <p className="mt-0.5 truncate text-[15px] text-muted-foreground">{next ? `Nästa: ${next.items.map(item => item.name).join(" + ")} · ${resolvedSchedule(next.items[0], store.mixGroups).time}` : allDone ? "Alla dagens doser är hanterade." : "Vid behov kvar"}</p>
        {streak > 0 && <p className="mt-1 flex items-center gap-1 text-[13px] font-semibold text-orange-600 dark:text-orange-400"><Flame className="size-3.5"/>{streak} {streak === 1 ? "dag" : "dagar"} i rad</p>}
      </div>
    </Card>}
    {groups.length === 0 && doneRows.length === 0 && <Card className="mb-7 px-6 py-8 text-center"><span className="mx-auto grid size-14 place-items-center rounded-full bg-accent text-accent-foreground"><CalendarDays className="size-7"/></span><p className="mt-4 text-[17px] font-semibold">Inget planerat idag</p><p className="mt-1 text-[15px] text-muted-foreground">Dagens schema är tomt.</p></Card>}
    {carryover.length > 0 && <section className="mb-7"><SectionHeading title="Från igår" detail="Hanteras innan kl. 12"/><div className="space-y-2.5">{carryover.map(renderPending)}</div></section>}
    {slotOrder.map(slot => {
      const slotPending = pending.filter(target => resolvedSchedule(target.items[0], store.mixGroups).slot === slot);
      const slotDone = doneRows.filter(row => row.slot === slot);
      if (!slotPending.length && !slotDone.length) return null;
      return <section key={slot} className="mb-7"><SectionHeading title={slotNames[slot]}/><div className="space-y-2.5">{slotPending.map(renderPending)}{slotDone.map(renderDone)}</div></section>;
    })}
    {showCheckinPrompt && <Card className="mb-7 p-5 text-center"><span className="mx-auto grid size-14 place-items-center rounded-full bg-rose-500/12 text-rose-500"><Heart className="size-7"/></span><p className="mt-3 text-[20px] font-bold">Hur har du mått idag?</p><p className="mt-1 text-[15px] text-muted-foreground">Tar under en minut och gör dina insikter bättre.</p><Button className="mt-4 h-[52px] w-full rounded-[14px] text-[17px]" onClick={() => setCheckinOpen(true)}>Fyll i dagens mående</Button><button type="button" onClick={deferCheckin} className="mt-1 min-h-11 w-full text-[15px] text-primary">Senare</button></Card>}
    {!showCheckinPrompt && <section className="mb-7"><SectionHeading title="Mående"/><Card className="overflow-hidden"><ListRow icon={<Heart/>} iconClassName="bg-rose-500" title={hasCheckinData ? "Dagens mående" : "Hur mår du idag?"} subtitle={hasCheckinData ? wellbeingScales.filter(scale => noteEntry[scale.key] !== undefined).map(scale => `${scale.short} ${noteEntry[scale.key]}`).join(" · ") || `${noteEntry.tags.length} taggar` : "Sömn, trötthet, värk och aktivitet"} value={<span className="text-[15px] text-primary">{hasCheckinData ? "Ändra" : "Fyll i"}</span>} chevron onClick={() => setCheckinOpen(true)}/></Card></section>}
    <p className="mb-2 px-1 text-center text-[13px] text-muted-foreground">{disclaimer}</p>
    {toast && <Toast message={toast.message} actionLabel="Ångra" onAction={undo}/>}
    <WellbeingSheet open={checkinOpen} onClose={closeCheckin} store={store} noteEntry={noteEntry} saveNote={saveNote} removeCustomTag={removeCustomTag}/>
    <Dialog open={!!adjustTarget} onOpenChange={open => !open && setAdjustTarget(null)}><DialogContent showCloseButton={false}>
      <SheetBar title="Justera dos" onCancel={() => setAdjustTarget(null)} doneLabel="Logga" doneDisabled={!adjustedDosesValid} onDone={() => { if (adjustTarget) saveLogs(adjustTarget, "taken", siteSelections[keyOf(adjustTarget)] || undefined, adjustDoses); setAdjustTarget(null); }}/>
      <DialogHeader><DialogTitle className="sr-only">Justera dos</DialogTitle><DialogDescription>Gäller bara den här dosen. Schemat ändras inte.</DialogDescription></DialogHeader>
      <div className="space-y-3">{adjustTarget?.items.map(item => { const dose = adjustDoses[item.id] ?? item.doseMcg; return <label key={item.id} className="block text-[13px] text-muted-foreground">{item.name} · dos (mcg)<Input className="mt-1.5 h-12 bg-secondary/60 text-[17px]" min="0.01" step="any" type="number" inputMode="decimal" value={dose} onChange={e => setAdjustDoses(values => ({ ...values, [item.id]: Number(e.target.value) }))}/><span className="mt-1.5 block text-[15px] text-foreground">{n(dose)} mcg = {n(syringeUnits(dose, item.vialMg, item.waterMl))} IU</span></label>; })}</div>
      {adjustedItems.length > 1 && <div className="rounded-xl bg-secondary/60 text-sm"><SyringeDrawBar items={adjustedItems}/><p className="px-4 pb-3 text-right font-semibold">Totalt {n(adjustedTotalIu)} IU</p></div>}
    </DialogContent></Dialog>
  </>;
}

/** A list row that reveals actions when swiped left, like iOS Mail. Tapping opens it. */
function SwipeRow({ children, actions, onTap, label }: { children: React.ReactNode; actions: { label: string; className: string; onClick: () => void }[]; onTap: () => void; label: string }) {
  const width = actions.length * 84;
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; start: number; axis?: "x" | "y" } | null>(null);
  const moved = useRef(false);
  const end = () => { if (drag.current?.axis === "x") setOffset(value => value < -width / 2 ? -width : 0); drag.current = null; setDragging(false); };
  return <div className="relative overflow-hidden">
    <div className="absolute inset-y-0 right-0 flex" style={{ width }} aria-hidden={offset === 0}>{actions.map(action => <button key={action.label} type="button" tabIndex={offset === 0 ? -1 : 0} onClick={() => { setOffset(0); action.onClick(); }} className={`flex-1 text-[15px] font-medium text-white ${action.className}`}>{action.label}</button>)}</div>
    <button type="button" aria-label={label}
      onPointerDown={event => { drag.current = { x: event.clientX, y: event.clientY, start: offset }; moved.current = false; }}
      onPointerMove={event => {
        const state = drag.current;
        if (!state) return;
        const dx = event.clientX - state.x, dy = event.clientY - state.y;
        if (!state.axis && Math.hypot(dx, dy) > 8) state.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (state.axis !== "x") return;
        if (!moved.current) event.currentTarget.setPointerCapture(event.pointerId);
        moved.current = true;
        setDragging(true);
        setOffset(Math.max(-width - 24, Math.min(0, state.start + dx)));
      }}
      onPointerUp={end} onPointerCancel={end}
      onClick={() => { if (moved.current) { moved.current = false; return; } if (offset !== 0) { setOffset(0); return; } onTap(); }}
      style={{ transform: `translateX(${offset}px)` }}
      className={`relative flex w-full touch-pan-y items-center gap-3 bg-card px-4 py-3 text-left active:bg-muted ${dragging ? "" : "transition-transform duration-200 ease-out"}`}>
      {children}
    </button>
  </div>;
}

function dayHeading(date: string, today: string) {
  if (date === today) return "Idag";
  if (date === previousDate(today)) return "Igår";
  return displayLogDate(date, { weekday: "long", day: "numeric", month: "long", ...(date.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}) });
}

function LogView({ store, update, headerAction, openCalendar }: { store: PeptimeStore; update: React.Dispatch<React.SetStateAction<PeptimeStore>>; headerAction: React.ReactNode; openCalendar: () => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "taken" | "skipped">("all");
  const [edit, setEdit] = useState<DoseLog | null>(null);
  const [visibleCount, setVisibleCount] = useState(60);
  const [removed, setRemoved] = useState<DoseLog | null>(null);
  useEffect(() => { if (!removed) return; const timer = window.setTimeout(() => setRemoved(null), 8000); return () => window.clearTimeout(timer); }, [removed]);
  const boundary = store.settings.dayBoundaryHour;
  const today = stockholmDate();
  const filteredLogs = store.logs.filter(log => (!query || log.peptideName.toLocaleLowerCase("sv-SE").includes(query.toLocaleLowerCase("sv-SE"))) && (filter === "all" || log.status === filter)).sort((a, b) => b.takenAt.localeCompare(a.takenAt));
  const logs = filteredLogs.slice(0, visibleCount);
  const days: { date: string; logs: DoseLog[] }[] = [];
  for (const log of logs) {
    const date = logScheduledDate(log, boundary);
    const day = days.find(value => value.date === date);
    if (day) day.logs.push(log); else days.push({ date, logs: [log] });
  }
  const showNotes = filter === "all" && !query;
  const remove = (log: DoseLog) => {
    update(s => deleteDoseLog(s, log.id));
    setRemoved(log);
  };
  const undoRemove = () => { if (removed) update(s => restoreDoseLog(s, removed)); setRemoved(null); };
  return <>
    <PageHeader title="Logg" action={<><HeaderButton label="Öppna kalendern" onClick={openCalendar}><CalendarDays/></HeaderButton>{headerAction}</>}/>
    <div className="relative mb-3"><Search className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"/><Input type="search" value={query} onChange={event => { setQuery(event.target.value); setVisibleCount(60); }} placeholder="Sök peptid" className="h-10 rounded-[10px] border-0 bg-secondary/80 pl-9 text-[17px] dark:bg-secondary"/></div>
    <div className="mb-6"><SegmentedControl label="Visa" value={filter} onChange={value => { setFilter(value); setVisibleCount(60); }} values={[{ value: "all", label: "Alla" }, { value: "taken", label: "Tagna" }, { value: "skipped", label: "Överhoppade" }]}/></div>
    {days.length === 0 ? <Card className="px-6 py-10 text-center"><span className="mx-auto grid size-14 place-items-center rounded-full bg-secondary text-muted-foreground"><History className="size-7"/></span><p className="mt-4 text-[17px] font-semibold">{store.logs.length ? "Inga träffar" : "Ingen historik ännu"}</p><p className="mt-1 text-[15px] text-muted-foreground">{store.logs.length ? "Prova ett annat namn eller filter." : "Doser du loggar på Idag visas här."}</p></Card> : days.map(day => {
      const note = showNotes ? store.dailyNotes.find(value => value.date === day.date) : undefined;
      return <section key={day.date} className="mb-6">
        <h2 className="mb-1.5 px-4 text-[13px] uppercase tracking-[.02em] text-muted-foreground">{dayHeading(day.date, today)}</h2>
        <div className="overflow-hidden rounded-[14px] bg-card [&>*+*]:border-t [&>*+*]:border-border/80">
          {note && hasWellbeingData(note) && <div className="flex items-center gap-3 px-4 py-3"><IconTile className="bg-rose-500"><Heart/></IconTile><span className="min-w-0 flex-1"><span className="block text-[17px]">Mående</span><span className="mt-0.5 block text-[13px] leading-[18px] text-muted-foreground">{[...wellbeingScales.filter(scale => note[scale.key] !== undefined).map(scale => `${scale.short} ${note[scale.key]}/5`), ...note.tags.map(tagLabel)].join(" · ") || note.note}</span></span></div>}
          {day.logs.map(log => {
            const takenDate = stockholmDate(log.takenAt);
            return <SwipeRow key={log.id} label={`${log.peptideName}, ${log.status === "taken" ? "tagen" : "överhoppad"}. Tryck för att redigera.`} onTap={() => setEdit({ ...log, scheduledDate: day.date })} actions={[{ label: "Redigera", className: "bg-[#8e8e93]", onClick: () => setEdit({ ...log, scheduledDate: day.date }) }, { label: "Ta bort", className: "bg-destructive", onClick: () => remove(log) }]}>
              <span className={`grid size-8 shrink-0 place-items-center rounded-full ${log.status === "taken" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>{log.status === "taken" ? <Check className="size-4" strokeWidth={3}/> : <X className="size-4" strokeWidth={2.6}/>}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-[17px]">{log.peptideName}</span><span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{log.status === "taken" ? `${n(log.actualDose)} ${log.unit} · ${n(log.computedIu)} IU${log.site ? ` · ${log.site}` : ""}` : "Överhoppad"}{takenDate !== day.date ? ` · loggad ${displayLogDate(takenDate, { day: "numeric", month: "short" })}` : ""}</span></span>
              <span className="shrink-0 text-[15px] tabular-nums text-muted-foreground">{clock(log.takenAt)}</span>
            </SwipeRow>;
          })}
        </div>
      </section>;
    })}
    {filteredLogs.length > logs.length && <Button variant="secondary" className="mb-6 h-11 w-full" onClick={() => setVisibleCount(count => count + 60)}>Visa fler</Button>}
    {days.length > 0 && <p className="mb-4 text-center text-[13px] text-muted-foreground">Svep åt vänster på en rad för att redigera eller ta bort.</p>}
    {removed && <Toast message={`${removed.peptideName} togs bort`} actionLabel="Ångra" onAction={undoRemove}/>}
    <Dialog open={!!edit} onOpenChange={open => !open && setEdit(null)}><DialogContent showCloseButton={false} className="max-h-[92dvh] overflow-y-auto bg-background">
      <SheetBar title="Redigera logg" onCancel={() => setEdit(null)} doneLabel="Spara" doneDisabled={!edit || !Number.isFinite(edit.actualDose) || edit.actualDose < 0} onDone={() => { if (edit) update(s => replaceDoseLog(s, edit)); setEdit(null); }}/>
      <DialogHeader><DialogTitle className="text-[22px]">{edit?.peptideName}</DialogTitle><DialogDescription>{edit?.status === "skipped" ? "Överhoppad dos" : "Tagen dos"}</DialogDescription></DialogHeader>
      <div className="overflow-hidden rounded-[14px] bg-card [&>*+*]:border-t [&>*+*]:border-border/80">
        <FormRow label="Dos">{edit && <span className="flex items-center justify-end gap-1"><Input min="0" step="any" type="number" inputMode="decimal" className={formInput} value={edit.actualDose} onChange={e => setEdit(v => v ? { ...v, actualDose: Number(e.target.value) } : v)}/><span className="text-[17px] text-muted-foreground">{edit.unit}</span></span>}</FormRow>
        <FormRow label="Tid"><Input type="datetime-local" className={`${formInput} w-auto`} value={edit ? stockholmDateTimeInput(edit.takenAt) : ""} onChange={e => { if (e.target.value) setEdit(v => v ? { ...v, takenAt: stockholmLocalToIso(e.target.value) } : v); }}/></FormRow>
        <FormRow label="Hör till dag"><Input type="date" className={`${formInput} w-auto`} value={edit?.scheduledDate ?? ""} onChange={e => { if (e.target.value) setEdit(v => v ? { ...v, scheduledDate: e.target.value } : v); }}/></FormRow>
      </div>
      <Textarea className="resize-none border-0 bg-card text-[17px]" value={edit?.note ?? ""} onChange={e => setEdit(v => v ? { ...v, note: e.target.value } : v)} placeholder="Anteckning"/>
      <div className="overflow-hidden rounded-[14px] bg-card"><ListRow title={<span className="block text-center">Ta bort logg</span>} destructive onClick={() => { if (edit) { const original = store.logs.find(log => log.id === edit.id); if (original) remove(original); } setEdit(null); }}/></div>
      <p className="-mt-2 px-4 text-[13px] text-muted-foreground">Dosen läggs tillbaka i vialens lager när loggen tas bort.</p>
    </DialogContent></Dialog>
  </>;
}

const emptyPeptide: Omit<Peptide,"id"> = { name:"",shortCode:"",color:"teal",doseMcg:100,vialMg:10,waterMl:2,remainingMg:10,route:"subcutaneous",slot:"evening",time:"21:00",frequency:"daily",weekdays:[0,1,2,3,4,5,6],paused:false,fasted:false,fastedNote:"",beyondUseDays:28,sites:[...defaultInjectionSites],notes:"",archived:false,example:false };
const routeNames: Record<Peptide["route"], string> = { subcutaneous: "Subkutan", intranasal: "Intranasal", oral: "Oral", topical: "Topikal" };
const formInput = "h-11 min-w-0 rounded-none border-0 bg-transparent px-0 text-right text-[17px] shadow-none focus-visible:ring-0 dark:bg-transparent";
const formSelect = "h-11 w-full min-w-0 appearance-none bg-transparent text-right text-[17px] text-muted-foreground outline-none [text-align-last:right]";

function FormRow({ label, children, htmlFor }: { label: string; children: React.ReactNode; htmlFor?: string }) {
  return <div className="flex min-h-12 items-center gap-3 px-4"><label htmlFor={htmlFor} className="shrink-0 text-[17px]">{label}</label><div className="flex min-w-0 flex-1 justify-end">{children}</div></div>;
}
function FormGroup({ title, footer, children }: { title?: string; footer?: React.ReactNode; children: React.ReactNode }) {
  return <div>{title && <p className="mb-1.5 px-4 text-[13px] uppercase tracking-[.02em] text-muted-foreground">{title}</p>}<div className="overflow-hidden rounded-[14px] bg-card [&>*+*]:border-t [&>*+*]:border-border/80">{children}</div>{footer && <div className="mt-1.5 px-4 text-[13px] leading-[18px] text-muted-foreground">{footer}</div>}</div>;
}

function DecimalInput({ value, onChange, className, id, suffix }: { value: number; onChange: (value: number) => void; className?: string; id?: string; suffix?: string }) {
  const [editingValue, setEditingValue] = useState<string | null>(null);
  return <span className="flex min-w-0 items-center justify-end gap-1"><Input
    id={id}
    className={className ?? formInput}
    type="text"
    inputMode="decimal"
    autoComplete="off"
    value={editingValue ?? (value > 0 ? String(value) : "")}
    placeholder="Ange"
    aria-invalid={value <= 0}
    onFocus={event => { setEditingValue(event.currentTarget.value); event.currentTarget.select(); }}
    onChange={event => {
      const input = event.currentTarget.value;
      if (!/^\d*(?:[.,]\d*)?$/.test(input)) return;
      setEditingValue(input);
      const parsed = Number(input.replace(",", "."));
      onChange(input && Number.isFinite(parsed) ? parsed : 0);
    }}
    onBlur={() => setEditingValue(null)}
  />{suffix && <span className="shrink-0 text-[17px] text-muted-foreground">{suffix}</span>}</span>;
}

function ScheduleFields({ value, set }: { value: Schedule; set: (part: Partial<Schedule>) => void }) {
  const weekdayNames = ["M", "T", "O", "T", "F", "L", "S"];
  const weekdayLabels = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"];
  return <FormGroup title="Schema" footer={value.paused ? "Pausad: visas inte på Idag och ger inga påminnelser." : "Visas på Idag de dagar schemat gäller."}>
    <FormRow label="Upprepa"><select className={formSelect} value={value.frequency} onChange={e => { const frequency = e.target.value as Schedule["frequency"]; set({ frequency, slot: frequency === "as_needed" ? "as_needed" : value.slot === "as_needed" ? "evening" : value.slot }); }}><option value="daily">Varje dag</option><option value="weekdays">Vissa veckodagar</option><option value="every_n_days">Var N:e dag</option><option value="as_needed">Vid behov</option></select></FormRow>
    {value.frequency === "weekdays" && <div className="flex justify-between gap-1 px-4 py-3">{weekdayNames.map((label, index) => <button type="button" key={index} aria-label={weekdayLabels[index]} aria-pressed={value.weekdays.includes(index)} onClick={() => set({ weekdays: value.weekdays.includes(index) ? value.weekdays.filter(day => day !== index) : [...value.weekdays, index].sort() })} className={`grid size-10 place-items-center rounded-full text-[15px] font-medium transition-colors ${value.weekdays.includes(index) ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground/80"}`}>{label}</button>)}</div>}
    {value.frequency === "every_n_days" && <><FormRow label="Var N:e dag"><Input min={2} className={formInput} type="number" inputMode="numeric" value={value.everyNDays ?? 2} onChange={e => set({ everyNDays: Math.max(2, Number(e.target.value)) })}/></FormRow><FormRow label="Från"><Input className={`${formInput} w-auto`} type="date" value={value.anchorDate ?? ""} onChange={e => set({ anchorDate: e.target.value || undefined })}/></FormRow></>}
    {value.frequency !== "as_needed" && <><FormRow label="Tid på dagen"><select className={formSelect} value={value.slot} onChange={e => set({ slot: e.target.value as Slot })}>{Object.entries(slotNames).filter(([key]) => key !== "as_needed").map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></FormRow><FormRow label="Klockslag"><Input className={`${formInput} w-auto`} type="time" value={value.time} onChange={e => set({ time: e.target.value })}/></FormRow></>}
    <FormRow label="Pausad"><Switch checked={value.paused} onCheckedChange={paused => set({ paused })}/></FormRow>
    <details className="group"><summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-[17px] [&::-webkit-details-marker]:hidden">Cykel<span className="flex items-center gap-1 text-muted-foreground">{value.cycleStart && value.weeksOn ? `${value.weeksOn} v på / ${value.weeksOff ?? 0} v av` : "Av"}<ChevronRight className="size-5 text-muted-foreground/50 transition-transform group-open:rotate-90"/></span></summary><div className="border-t border-border/80"><FormRow label="Start"><Input className={`${formInput} w-auto`} type="date" value={value.cycleStart ?? ""} onChange={e => set({ cycleStart: e.target.value || undefined })}/></FormRow><FormRow label="Veckor på"><Input min={1} className={formInput} type="number" inputMode="numeric" value={value.weeksOn ?? ""} onChange={e => set({ weeksOn: e.target.value ? Number(e.target.value) : undefined })}/></FormRow><FormRow label="Veckor av"><Input min={0} className={formInput} type="number" inputMode="numeric" value={value.weeksOff ?? ""} onChange={e => set({ weeksOff: e.target.value ? Number(e.target.value) : undefined })}/></FormRow></div></details>
  </FormGroup>;
}

function scheduleText(peptide: Peptide, store: PeptimeStore) {
  const schedule = resolvedSchedule(peptide, store.mixGroups);
  if (schedule.paused) return "Pausad";
  if (schedule.frequency === "as_needed") return "Vid behov";
  const days = schedule.frequency === "daily" ? "Varje dag" : schedule.frequency === "every_n_days" ? `Var ${schedule.everyNDays ?? 2}:e dag` : schedule.weekdays.length === 7 ? "Varje dag" : schedule.weekdays.map(day => ["mån", "tis", "ons", "tor", "fre", "lör", "sön"][day]).join(", ");
  return `${days} · ${schedule.time}`;
}

function StockBar({ peptide, store }: { peptide: Peptide; store: PeptimeStore }) {
  const fraction = peptide.vialMg > 0 ? Math.max(0, Math.min(1, peptide.remainingMg / peptide.vialMg)) : 0;
  const days = inventoryDaysLeft(peptide, store);
  const low = (days !== null && days <= 15) || fraction < .15;
  return <span className="mt-1.5 flex items-center gap-2"><span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-secondary"><span className={`block h-full rounded-full ${low ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${Math.max(fraction * 100, fraction > 0 ? 4 : 0)}%` }}/></span><span className={`truncate text-[13px] ${low ? "font-medium text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>{Math.round(fraction * 100)} % kvar{days !== null ? ` · ${days === 0 ? "slut" : `ca ${days} d`}` : ""}</span></span>;
}

function PeptideEditor({ peptide, adding, store, update, onClose }: { peptide: Peptide | null; adding: boolean; store: PeptimeStore; update: React.Dispatch<React.SetStateAction<PeptimeStore>>; onClose: () => void }) {
  const [draftState, setDraft] = useState<Peptide | null>(peptide);
  const [editingGroup, setEditingGroup] = useState<MixGroupSchedule | null>(null);
  const draft = draftState ?? ({ ...emptyPeptide, id: "" } as Peptide);
  const set = (part: Partial<Peptide>) => setDraft({ ...draft, ...part });
  const validAmounts = draft.doseMcg > 0 && draft.vialMg > 0 && draft.waterMl > 0;
  const units = validAmounts ? syringeUnits(draft.doseMcg, draft.vialMg, draft.waterMl) : 0;
  const existingGroups = [...new Map([...store.mixGroups.map(group => group.name), ...store.peptides.flatMap(item => item.mixGroupId ? [item.mixGroupId] : [])].map(name => [groupKey(name), name])).values()];
  const groupForDraft = store.mixGroups.find(group => groupKey(group.name) === groupKey(draft.mixGroupId));
  const save = () => {
    const typedGroup = draft.mixGroupId?.trim();
    const canonicalGroup = existingGroups.find(group => groupKey(group) === groupKey(typedGroup)) ?? typedGroup;
    const previous = store.peptides.find(item => item.id === draft.id);
    const preparationChanged = Boolean(previous && (previous.vialMg !== draft.vialMg || previous.waterMl !== draft.waterMl));
    const item = { ...draft, id: draft.id || uid(), shortCode: draft.shortCode || draft.name.slice(0, 3), currentVialId: preparationChanged ? uid() : draft.currentVialId, remainingMg: preparationChanged ? 0 : draft.id ? draft.remainingMg : draft.vialMg, mixGroupId: canonicalGroup || undefined };
    update(s => { const hasGroup = canonicalGroup && s.mixGroups.some(group => groupKey(group.name) === groupKey(canonicalGroup)); const mixGroups = canonicalGroup && !hasGroup ? [...s.mixGroups, { name: canonicalGroup, ...peptideSchedule(item) }] : s.mixGroups; return { ...s, mixGroups, peptides: draft.id ? s.peptides.map(p => p.id === draft.id ? item : p) : [...s.peptides, item] }; });
    onClose();
  };
  return <>
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent showCloseButton={false} className="max-h-[94dvh] gap-6 overflow-y-auto bg-background sm:max-w-lg">
      <SheetBar title={adding ? "Ny peptid" : "Redigera"} onCancel={onClose} doneLabel={adding ? "Lägg till" : "Spara"} doneDisabled={!draft.name.trim() || !validAmounts} onDone={save}/>
      <DialogHeader className="sr-only"><DialogTitle>{adding ? "Ny peptid" : "Redigera peptid"}</DialogTitle><DialogDescription>Alla värden är dina egna logguppgifter.</DialogDescription></DialogHeader>
      <FormGroup>
        <div className="px-4"><Input aria-label="Namn" className="h-12 rounded-none border-0 bg-transparent px-0 text-[17px] shadow-none focus-visible:ring-0 dark:bg-transparent" value={draft.name} onChange={e => set({ name: e.target.value })} placeholder="Namn, t.ex. BPC-157" autoFocus={adding}/></div>
        <FormRow label="Dos"><DecimalInput value={draft.doseMcg} onChange={doseMcg => set({ doseMcg })} suffix="mcg"/></FormRow>
        <FormRow label="Administrering"><select className={formSelect} value={draft.route} onChange={e => set({ route: e.target.value as Peptide["route"] })}>{Object.entries(routeNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></FormRow>
        <FormRow label="Tas fastande"><Switch checked={draft.fasted} onCheckedChange={fasted => set({ fasted })}/></FormRow>
      </FormGroup>
      <FormGroup title="Beredning" footer={validAmounts ? <span className="tabular-nums"><strong className="font-semibold text-foreground">{n(draft.doseMcg)} mcg = {n(units)} IU</strong> · {n(draft.vialMg / draft.waterMl)} mg/ml · {n((draft.vialMg / draft.waterMl) * 10)} mcg per IU</span> : "Fyll i dos, vial och BAC-vatten så räknas enheterna ut."}>
        <FormRow label="Vial"><DecimalInput value={draft.vialMg} onChange={vialMg => set({ vialMg })} suffix="mg"/></FormRow>
        <FormRow label="BAC-vatten"><DecimalInput value={draft.waterMl} onChange={waterMl => set({ waterMl })} suffix="ml"/></FormRow>
      </FormGroup>
      {draft.mixGroupId
        ? <FormGroup title="Schema" footer={`Schemat delas av alla i mixgruppen ${draft.mixGroupId}.`}><ListRow title="Gruppens schema" value={groupForDraft ? scheduleText({ ...draft, ...groupForDraft }, store) : undefined} chevron onClick={() => setEditingGroup(groupForDraft ?? { name: draft.mixGroupId!, ...peptideSchedule(draft) })}/></FormGroup>
        : <ScheduleFields value={peptideSchedule(draft)} set={part => set(part)}/>}
      <details className="group">
        <summary className="mb-1.5 flex cursor-pointer list-none items-center gap-1 px-4 text-[13px] uppercase tracking-[.02em] text-muted-foreground [&::-webkit-details-marker]:hidden">Avancerat<ChevronRight className="size-4 transition-transform group-open:rotate-90"/></summary>
        <div className="space-y-6">
          <FormGroup footer="Kortkoden och färgen visas i listor och på Idag.">
            <FormRow label="Kortkod"><Input className={`${formInput} uppercase`} maxLength={4} value={draft.shortCode} placeholder={draft.name.slice(0, 3).toLocaleUpperCase("sv-SE")} onChange={e => set({ shortCode: e.target.value.toLocaleUpperCase("sv-SE") })}/></FormRow>
            <div className="flex min-h-12 items-center justify-between gap-3 px-4"><span className="text-[17px]">Färg</span><span className="flex gap-2">{Object.entries(compoundColors).map(([color, value]) => <button key={color} type="button" aria-label={compoundColorLabels[color]} aria-pressed={draft.color === color} onClick={() => set({ color })} style={{ backgroundColor: value }} className={`size-7 rounded-full ring-offset-2 ring-offset-card ${draft.color === color ? "ring-2 ring-foreground" : ""}`}/>)}</span></div>
          </FormGroup>
          <FormGroup footer={existingGroups.length ? <span className="flex flex-wrap gap-1.5 pt-1">{existingGroups.map(group => <button type="button" key={group} onClick={() => set({ mixGroupId: group })} className={`min-h-8 rounded-full px-3 text-[13px] ${groupKey(draft.mixGroupId) === groupKey(group) ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground/80"}`}>{group}</button>)}</span> : "Peptider i samma mixgrupp dras upp i samma spruta och delar schema."}>
            <FormRow label="Mixgrupp"><Input className={formInput} value={draft.mixGroupId ?? ""} onChange={e => set({ mixGroupId: e.target.value || undefined })} placeholder="Ingen"/></FormRow>
          </FormGroup>
          <Textarea className="resize-none border-0 bg-card text-[17px]" value={draft.notes} onChange={e => set({ notes: e.target.value })} placeholder="Anteckning, t.ex. rekonstituering"/>
        </div>
      </details>
    </DialogContent></Dialog>
    <Dialog open={!!editingGroup} onOpenChange={open => !open && setEditingGroup(null)}><DialogContent showCloseButton={false} className="max-h-[92dvh] gap-6 overflow-y-auto bg-background">
      <SheetBar title={`Mixgrupp ${editingGroup?.name ?? ""}`} onCancel={() => setEditingGroup(null)} doneLabel="Spara" onDone={() => { if (editingGroup) update(s => ({ ...s, mixGroups: [...s.mixGroups.filter(group => groupKey(group.name) !== groupKey(editingGroup.name)), editingGroup] })); setEditingGroup(null); }}/>
      <DialogHeader className="sr-only"><DialogTitle>Mixgrupp</DialogTitle><DialogDescription>Ett schema och en dos för hela gruppen.</DialogDescription></DialogHeader>
      {editingGroup && <ScheduleFields value={editingGroup} set={part => setEditingGroup({ ...editingGroup, ...part })}/>}
    </DialogContent></Dialog>
  </>;
}

function PeptidesView({ store, update, openPlanner, openSchedules, openPeptide, headerAction }: { store: PeptimeStore; update: React.Dispatch<React.SetStateAction<PeptimeStore>>; openPlanner: () => void; openSchedules: () => void; openPeptide: (id: string) => void; headerAction: React.ReactNode }) {
  const [adding, setAdding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const active = store.peptides.filter(p => !p.archived);
  const archived = store.peptides.filter(p => p.archived);
  const examples = active.filter(p => p.example);
  const addToday = (peptide: Peptide) => { haptic(); const key = `${stockholmDate()}:${scheduleTargetKey(peptide)}`; update(s => ({ ...s, todayAdditions: [...new Set([...s.todayAdditions, key])] })); };
  const addedToday = (peptide: Peptide) => store.todayAdditions.includes(`${stockholmDate()}:${scheduleTargetKey(peptide)}`);
  return <>
    <PageHeader title="Peptider" action={<><HeaderButton label="Lägg till peptid" variant="filled" onClick={() => setAdding(true)}><Plus strokeWidth={2.6}/></HeaderButton>{headerAction}</>}/>
    {examples.length > 0 && <Card className="mb-6 flex items-start gap-3 p-4"><Sparkles className="mt-0.5 size-5 shrink-0 text-primary"/><div className="min-w-0 flex-1"><p className="text-[15px] font-semibold">Exempel visas</p><p className="mt-0.5 text-[15px] leading-5 text-muted-foreground">{examples.length} exempelpeptider hjälper dig komma igång.</p><button type="button" onClick={() => update(s => ({ ...s, peptides: s.peptides.map(p => p.example && !p.archived ? { ...p, archived: true } : p) }))} className="mt-2 min-h-9 text-[15px] font-semibold text-primary">Ta bort exempel</button></div></Card>}
    {active.length === 0 ? <Card className="mb-7 px-6 py-10 text-center"><span className="mx-auto grid size-14 place-items-center rounded-full bg-accent text-accent-foreground"><FlaskConical className="size-7"/></span><p className="mt-4 text-[17px] font-semibold">Inga peptider ännu</p><p className="mt-1 text-[15px] text-muted-foreground">Lägg till det du tar, så räknar Peptime ut enheterna.</p><Button className="mt-5 h-11 rounded-[12px]" onClick={() => setAdding(true)}><Plus/> Lägg till peptid</Button></Card>
      : <ListSection>{active.map(p => {
        const schedule = resolvedSchedule(p, store.mixGroups);
        const asNeeded = schedule.frequency === "as_needed" && !schedule.paused;
        return <div key={p.id} className="flex items-center gap-2 pr-3">
          <button type="button" onClick={() => openPeptide(p.id)} className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left transition-colors active:bg-muted">
            <DoseBadge items={[p]}/>
            <span className="min-w-0 flex-1"><span className="flex items-baseline justify-between gap-2"><span className="truncate text-[17px] font-semibold">{p.name}</span><span className="shrink-0 text-[15px] tabular-nums text-muted-foreground">{n(syringeUnits(p.doseMcg, p.vialMg, p.waterMl))} IU</span></span><span className="mt-0.5 block truncate text-[15px] text-muted-foreground">{scheduleText(p, store)}</span><StockBar peptide={p} store={store}/></span>
          </button>
          {asNeeded ? <button type="button" disabled={addedToday(p)} onClick={() => addToday(p)} className="min-h-8 shrink-0 rounded-full bg-secondary px-3 text-[13px] font-semibold text-primary disabled:text-muted-foreground">{addedToday(p) ? "Tillagd" : "+ Idag"}</button> : <ChevronRight className="size-5 shrink-0 text-muted-foreground/50" strokeWidth={2.4}/>}
        </div>;
      })}</ListSection>}
    <ListSection title="Verktyg">
      <ListRow icon={<ShoppingCart/>} iconClassName="bg-orange-500" title="Inköpsplanering" subtitle="Vialer och BAC för 30–60 dagar" chevron onClick={openPlanner}/>
      <ListRow icon={<Share2/>} iconClassName="bg-blue-500" title="Dela och importera schema" subtitle="Bild, kod eller import från vän" chevron onClick={openSchedules}/>
      {archived.length > 0 && <ListRow icon={<Archive/>} iconClassName="bg-[#8e8e93]" title="Arkiverade" value={archived.length} chevron onClick={() => setShowArchived(value => !value)}/>}
    </ListSection>
    {showArchived && archived.length > 0 && <ListSection title="Arkiverade" footer="Återställda peptider visas igen på Idag enligt sitt schema.">{archived.map(p => <ListRow key={p.id} title={p.name} subtitle={`${n(p.doseMcg)} mcg`} trailing={<button type="button" onClick={() => update(s => ({ ...s, peptides: s.peptides.map(item => item.id === p.id ? { ...item, archived: false } : item) }))} className="min-h-8 shrink-0 rounded-full bg-secondary px-3 text-[13px] font-semibold text-primary">Återställ</button>}/>)}</ListSection>}
    {adding && <PeptideEditor peptide={null} adding store={store} update={update} onClose={() => setAdding(false)}/>}
  </>;
}

function PeptideDetail({ store, update, peptide, onBack, openInsights }: { store: PeptimeStore; update: React.Dispatch<React.SetStateAction<PeptimeStore>>; peptide: Peptide; onBack: () => void; openInsights: () => void }) {
  const [editing, setEditing] = useState(false);
  const today = stockholmDate();
  const schedule = resolvedSchedule(peptide, store.mixGroups);
  const units = syringeUnits(peptide.doseMcg, peptide.vialMg, peptide.waterMl);
  const fraction = peptide.vialMg > 0 ? Math.max(0, Math.min(1, peptide.remainingMg / peptide.vialMg)) : 0;
  const days = inventoryDaysLeft(peptide, store);
  const vialDays = vialDaysLeft(peptide);
  const low = (days !== null && days <= 15) || fraction < .15;
  const since = addDays(today, -29);
  const recent = store.logs.filter(log => log.peptideId === peptide.id && logScheduledDate(log, store.settings.dayBoundaryHour) >= since);
  const latest = [...store.logs.filter(log => log.peptideId === peptide.id && log.status === "taken")].sort((a, b) => b.takenAt.localeCompare(a.takenAt))[0];
  const asNeeded = schedule.frequency === "as_needed" && !schedule.paused;
  const todayKey = `${today}:${scheduleTargetKey(peptide)}`;
  const set = (part: Partial<Peptide>) => update(s => ({ ...s, peptides: s.peptides.map(item => item.id === peptide.id ? { ...item, ...part } : item) }));
  return <>
    <PageHeader title={peptide.name} back={{ label: "Peptider", onClick: onBack }} action={<button type="button" onClick={() => setEditing(true)} className="min-h-11 px-1 text-[17px] text-primary active:opacity-50">Redigera</button>}/>
    <Card className="mb-6 flex items-center gap-4 p-4">
      <DoseBadge items={[peptide]} size="lg"/>
      <div className="min-w-0"><p className="text-[28px] font-bold leading-none tracking-tight tabular-nums">{n(units)} IU</p><p className="mt-1.5 text-[15px] text-muted-foreground">{n(peptide.doseMcg)} mcg · {routeNames[peptide.route]}{peptide.fasted ? " · Fastande" : ""}</p><p className="mt-0.5 text-[15px] text-muted-foreground">{peptide.mixGroupId ? `Mixgrupp ${peptide.mixGroupId} · ` : ""}{scheduleText(peptide, store)}</p></div>
    </Card>
    {asNeeded && <Button className="mb-6 h-[52px] w-full rounded-[14px] text-[17px]" disabled={store.todayAdditions.includes(todayKey)} onClick={() => { haptic(); update(s => ({ ...s, todayAdditions: [...new Set([...s.todayAdditions, todayKey])] })); }}>{store.todayAdditions.includes(todayKey) ? "Tillagd på Idag" : "Lägg till på Idag"}</Button>}
    <SectionHeading title="Lager"/>
    <Card className="mb-7 p-4">
      <div className="flex items-baseline justify-between gap-3"><p className="text-[28px] font-bold leading-none tracking-tight tabular-nums">{n(peptide.remainingMg)}<span className="ml-1 text-[17px] font-semibold text-muted-foreground">av {n(peptide.vialMg)} mg</span></p><p className={`text-[15px] font-medium ${low ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>{Math.round(fraction * 100)} %</p></div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-secondary"><div className={`h-full rounded-full transition-[width] duration-500 ${low ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${fraction * 100}%` }}/></div>
      <p className={`mt-3 text-[15px] ${low ? "font-medium text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>{days === null ? "Vid behov – ingen prognos" : days === 0 ? "Lagret är slut" : `Räcker ca ${days} ${days === 1 ? "dag" : "dagar"} enligt schemat`}</p>
      {vialDays !== null && <p className={`mt-0.5 text-[15px] ${vialDays <= 0 ? "font-medium text-destructive" : "text-muted-foreground"}`}>{vialDays > 0 ? `Vialen håller ${vialDays} dagar till enligt din gräns` : "Vialens användningstid har passerat"}</p>}
      <Button variant="secondary" className="mt-4 h-11 w-full rounded-[12px]" onClick={() => { if (window.confirm(`Nollställ lagret till en ny vial på ${n(peptide.vialMg)} mg?`)) set({ currentVialId: uid(), remainingMg: peptide.vialMg, reconstitutedAt: new Date().toISOString() }); }}><RotateCcw/> Öppnade ny vial</Button>
    </Card>
    <ListSection title="Senaste 30 dagarna">
      <ListRow title="Tagna doser" value={recent.filter(log => log.status === "taken").length}/>
      <ListRow title="Överhoppade" value={recent.filter(log => log.status === "skipped").length}/>
      <ListRow title="Senast tagen" value={latest ? `${displayLogDate(logScheduledDate(latest, store.settings.dayBoundaryHour), { day: "numeric", month: "short" })} ${clock(latest.takenAt)}` : "–"}/>
      <ListRow icon={<BarChart3/>} iconClassName="bg-primary" title="Historik och kurvor" chevron onClick={openInsights}/>
    </ListSection>
    {peptide.notes.trim() && <><SectionHeading title="Anteckning"/><Card className="mb-7 p-4 text-[15px] leading-6 whitespace-pre-wrap">{peptide.notes}</Card></>}
    <ListSection footer="Arkiverade peptider syns inte på Idag men historiken sparas.">
      <ListRow title={<span className="block text-center">Arkivera peptid</span>} destructive onClick={() => { if (window.confirm(`Arkivera ${peptide.name}?`)) { set({ archived: true }); onBack(); } }}/>
    </ListSection>
    {editing && <PeptideEditor peptide={peptide} adding={false} store={store} update={update} onClose={() => setEditing(false)}/>}
  </>;
}

function CalendarView({ store, update, back }: { store: PeptimeStore; update: React.Dispatch<React.SetStateAction<PeptimeStore>>; back: { label: string; onClick: () => void } }) {
  const initialDate=stockholmDate();
  const [cursor,setCursor]=useState(new Date(`${initialDate}T12:00:00`));
  const [selected,setSelected]=useState(initialDate);
  const [retrospectiveNote,setRetrospectiveNote]=useState<DailyNote|null>(null);
  const year=cursor.getFullYear(),month=cursor.getMonth();
  const first=new Date(year,month,1);
  const blanks=(first.getDay()+6)%7;
  const days=new Date(year,month+1,0).getDate();
  const cells=[...Array(blanks).fill(null),...Array.from({length:days},(_,i)=>i+1)];
  const iso=(day:number)=>`${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  const logsForDate=(date:string)=>store.logs.filter(log=>logScheduledDate(log,store.settings.dayBoundaryHour)===date);
  const dayLogs=logsForDate(selected);
  const dayNote=store.dailyNotes.find(value=>value.date===selected);
  const hasDayNote=hasWellbeingData(dayNote);
  const retrospectiveDates=[previousDate(initialDate),previousDate(previousDate(initialDate))];
  const canAddRetrospectiveNote=retrospectiveDates.includes(selected)&&!hasDayNote;
  const hasDayContent=dayLogs.length>0||hasDayNote;
  const statusForDate=(date:string)=>{const logs=logsForDate(date);const note=store.dailyNotes.find(value=>value.date===date);return {complete:logs.length>0&&logs.every(log=>log.status==="taken"),skipped:logs.some(log=>log.status==="skipped"),noted:hasWellbeingData(note)}};
  const toggleRetrospectiveTag=(tag:string)=>setRetrospectiveNote(note=>note?{...note,tags:note.tags.includes(tag)?note.tags.filter(value=>value!==tag):[...note.tags,tag]}:note);
  const saveRetrospectiveNote=()=>{if(!retrospectiveNote||!hasWellbeingData(retrospectiveNote))return;update(s=>({...s,dailyNotes:[...s.dailyNotes.filter(note=>note.date!==retrospectiveNote.date),retrospectiveNote]}));setRetrospectiveNote(null)};
  return <><PageHeader title="Kalender" back={back}/><Card className="p-4"><div className="mb-5 flex items-center justify-between"><Button variant="ghost" size="icon" onClick={()=>setCursor(new Date(year,month-1,1))}><ChevronLeft/></Button><p className="text-[17px] font-semibold capitalize">{new Intl.DateTimeFormat("sv-SE",{month:"long",year:"numeric"}).format(cursor)}</p><Button variant="ghost" size="icon" onClick={()=>setCursor(new Date(year,month+1,1))}><ChevronRight/></Button></div><div className="grid grid-cols-7 text-center text-[13px] font-medium text-muted-foreground">{"M T O T F L S".split(" ").map((d,i)=><span key={i} className="py-2">{d}</span>)}{cells.map((day,i)=>{if(!day)return <span key={i}/>;const date=iso(day);const status=statusForDate(date);return <button key={i} onClick={()=>setSelected(date)} className={`relative mx-auto grid size-11 place-items-center rounded-full text-[17px] tabular-nums transition-colors ${selected===date?"bg-primary font-semibold text-primary-foreground":date===initialDate?"font-semibold text-primary":""}`}>{day}<span className="absolute bottom-0.5 flex gap-0.5">{status.complete&&<span className="size-1.5 rounded-full bg-primary"/>}{status.noted&&<span className="size-1.5 rounded-full bg-[#7f9fca]"/>}{status.skipped&&<span className="size-1.5 rounded-full bg-zinc-500"/>}</span></button>})}</div><div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-3 text-[13px] text-muted-foreground"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-primary"/>Klart</span><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-[#7f9fca]"/>Anteckning</span><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-zinc-500"/>Överhoppat</span></div></Card><section className="mt-6"><SectionHeading title={dayHeading(selected,initialDate)}/>{!hasDayContent&&!canAddRetrospectiveNote?<p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Inga poster denna dag.</p>:hasDayContent?<Card className="divide-y divide-border">{dayLogs.map(l=><div key={l.id} className="flex min-h-14 items-center justify-between gap-3 px-4 text-sm"><span>{l.peptideName}</span><span className="text-right text-muted-foreground">{l.status==="taken"?`${n(l.actualDose)} mcg · ${n(l.computedIu)} IU`:"Överhoppad"}<span className="ml-2 tabular-nums">{new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Stockholm",hour:"2-digit",minute:"2-digit"}).format(new Date(l.takenAt))}</span></span></div>)}{dayNote&&hasDayNote&&<div className="p-4"><p className="mb-2 text-xs font-semibold text-muted-foreground">Dagens mående</p>{wellbeingScales.some(scale=>dayNote[scale.key]!==undefined)&&<div className="mb-3 grid grid-cols-2 gap-2">{wellbeingScales.filter(scale=>dayNote[scale.key]!==undefined).map(scale=><div key={scale.key} className="rounded-xl bg-muted/50 p-2 text-xs"><span className="block text-muted-foreground">{scale.title}</span><strong className="mt-1 block">{dayNote[scale.key]} / 5</strong></div>)}</div>}{dayNote.tags.length>0&&<div className="mb-3 flex flex-wrap gap-1.5">{dayNote.tags.map(tag=><span key={tag} className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs">{tagLabel(tag)}</span>)}</div>}{dayNote.note&&<p className="text-sm leading-6">{dayNote.note}</p>}</div>}</Card>:null}{canAddRetrospectiveNote&&<Card className="mt-3 p-4"><div className="flex items-center justify-between gap-4"><div><p className="font-medium">Dagens mående saknas</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Kan fyllas i upp till två dagar efteråt.</p></div><Button variant="outline" className="shrink-0" onClick={()=>setRetrospectiveNote({date:selected,note:"",tags:[]})}>Fyll i</Button></div></Card>}</section>
    <Dialog open={!!retrospectiveNote} onOpenChange={open=>!open&&setRetrospectiveNote(null)}><DialogContent className="max-h-[88dvh] overflow-y-auto"><DialogHeader><DialogTitle>Hur mådde du?</DialogTitle><DialogDescription>{retrospectiveNote?.date} · fylls i i efterhand</DialogDescription></DialogHeader>{retrospectiveNote&&<div className="space-y-4">{wellbeingScales.map(scale=><WellbeingScale key={scale.key} scale={scale} value={retrospectiveNote[scale.key]} onChange={value=>setRetrospectiveNote(note=>note?{...note,[scale.key]:value}:note)}/>) }<div><p className="mb-2 text-[15px] font-semibold">Hur kändes dagen?</p><div className="flex flex-wrap gap-2">{[...dailyTags.map(tag=>tag.id),...store.settings.customDailyTags].map(tag=><button type="button" key={tag} aria-pressed={retrospectiveNote.tags.includes(tag)} onClick={()=>toggleRetrospectiveTag(tag)} className={`min-h-11 rounded-full px-3 text-[13px] transition-colors ${retrospectiveNote.tags.includes(tag)?"bg-primary text-primary-foreground":"bg-muted text-muted-foreground"}`}>{tagLabel(tag)}</button>)}</div></div><label className="text-sm font-medium">Anteckning <span className="font-normal text-muted-foreground">· valfritt</span><Textarea className="mt-2 resize-none" value={retrospectiveNote.note} onChange={event=>setRetrospectiveNote(note=>note?{...note,note:event.target.value}:note)} placeholder="Något du vill komma ihåg?"/></label><Button disabled={!hasWellbeingData(retrospectiveNote)} className="h-12 w-full" onClick={saveRetrospectiveNote}>Spara mående</Button></div>}</DialogContent></Dialog>
  </>;
}

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => { window.removeEventListener("online", onChange); window.removeEventListener("offline", onChange); };
}

type View = "today" | "log" | "peptides" | "insights" | "peptide" | "peptide-insights" | "planner" | "schedule-sharing" | "calendar" | "settings";
type Tab = "today" | "log" | "peptides" | "insights";
const tabLabels: Record<Tab, string> = { today: "Idag", log: "Logg", peptides: "Peptider", insights: "Insikter" };

export function PeptimeApp({ userEmail }: { userEmail?: string }) {
  const [store,update,ready,syncState,retrySync,syncError,userId,recoveryActive,recoveryCounts,restoreMissingRecords,importSharedSchedule]=useStore();
  const [tab,setTab]=useState<Tab>("today");
  const [view,setView]=useState<View>("today");
  const [peptideId,setPeptideId]=useState<string|null>(null);
  const [insightReturn,setInsightReturn]=useState<"peptide"|"insights">("insights");
  const [checkinOnOpen,setCheckinOnOpen]=useState(false);
  const navigate=(next:View)=>{setView(next);window.scrollTo(0,0)};
  // Tapping the current tab again returns to its first screen, as in iOS.
  const selectTab=(next:Tab)=>{setTab(next);navigate(next)};
  const openPeptideInsights=(id:string,from:"peptide"|"insights")=>{setPeptideId(id);setInsightReturn(from);navigate("peptide-insights")};
  const logMood=()=>{setCheckinOnOpen(true);selectTab("today")};
  // Views compute "today" when they render; remount them when the date changes while the app stays open.
  const [day,setDay]=useState(()=>stockholmDate());
  useEffect(()=>{const check=()=>setDay(stockholmDate());const timer=window.setInterval(check,60_000);document.addEventListener("visibilitychange",check);return()=>{window.clearInterval(timer);document.removeEventListener("visibilitychange",check)}},[]);
  const online=useSyncExternalStore(subscribeOnline,()=>navigator.onLine,()=>true);
  useEffect(()=>{const media=window.matchMedia("(prefers-color-scheme: dark)");const apply=()=>applyThemeMode(store.settings.themeMode??"system");apply();media.addEventListener("change",apply);return()=>media.removeEventListener("change",apply)},[store.settings.themeMode]);
  if(!ready)return syncState==="error"?<main className="grid min-h-dvh place-items-center bg-background p-5"><Card className="w-full max-w-[430px] p-6 text-center"><span className="mx-auto grid size-14 place-items-center rounded-full bg-secondary text-muted-foreground"><RotateCcw className="size-7"/></span><h1 className="mt-4 text-[20px] font-bold">Kunde inte hämta ditt konto</h1><p className="mt-2 text-[15px] leading-6 text-muted-foreground">Dina uppgifter är kvar. Peptime försöker ansluta igen automatiskt.</p>{syncError&&<p className="mt-3 break-words text-[13px] text-destructive">{syncError}</p>}<Button className="mt-5 h-[52px] w-full rounded-[14px] text-[17px]" onClick={retrySync}>Försök igen</Button></Card></main>:<div className="min-h-dvh bg-background"/>;
  if(!store.onboardingComplete)return <Onboarding store={store} update={update}/>;
  const headerAction=<ProfileButton email={userEmail} onClick={()=>navigate("settings")}/>;
  const peptide=peptideId?store.peptides.find(item=>item.id===peptideId):undefined;
  const backToTab={label:tabLabels[tab],onClick:()=>navigate(tab)};
  return <main className="mx-auto min-h-dvh w-full max-w-[500px] bg-background px-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6">
    {recoveryActive&&view!=="settings"&&<button type="button" onClick={()=>navigate("settings")} className="mt-[calc(.75rem+env(safe-area-inset-top))] flex w-full items-start gap-3 rounded-[14px] bg-amber-500/12 p-3 text-left text-[15px] leading-5"><TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600"/><span>Kontosynk är pausad för att skydda dina uppgifter. <span className="font-semibold text-primary">Öppna Inställningar</span></span></button>}
    <Fragment key={day}>
      {view==="today"&&<TodayView store={store} update={update} openCalendar={()=>navigate("calendar")} headerAction={headerAction} openCheckinInitially={checkinOnOpen} onCheckinClosed={()=>setCheckinOnOpen(false)}/>}
      {view==="log"&&<LogView store={store} update={update} headerAction={headerAction} openCalendar={()=>navigate("calendar")}/>}
      {view==="peptides"&&<PeptidesView store={store} update={update} headerAction={headerAction} openPlanner={()=>navigate("planner")} openSchedules={()=>navigate("schedule-sharing")} openPeptide={id=>{setPeptideId(id);navigate("peptide")}}/>}
      {view==="peptide"&&(peptide?<PeptideDetail store={store} update={update} peptide={peptide} onBack={()=>navigate("peptides")} openInsights={()=>openPeptideInsights(peptide.id,"peptide")}/>:<PeptidesView store={store} update={update} headerAction={headerAction} openPlanner={()=>navigate("planner")} openSchedules={()=>navigate("schedule-sharing")} openPeptide={id=>{setPeptideId(id);navigate("peptide")}}/>)}
      {view==="peptide-insights"&&peptide&&<PeptideInsights store={store} peptide={peptide} back={insightReturn==="peptide"?{label:peptide.name,onClick:()=>navigate("peptide")}:{label:"Insikter",onClick:()=>navigate("insights")}}/>}
      {view==="insights"&&<InsightsView store={store} headerAction={headerAction} onOpenPeptide={id=>openPeptideInsights(id,"insights")} onOpenCalendar={()=>navigate("calendar")} onLogMood={logMood}/>}
      {view==="planner"&&<PurchasePlanner peptides={store.peptides} plans={store.purchasePlans} onChange={purchasePlans=>update(s=>({...s,purchasePlans}))} onBack={()=>navigate("peptides")}/>}
      {view==="schedule-sharing"&&<ScheduleSharing store={store} onBack={()=>navigate("peptides")} importSchedule={importSharedSchedule} importEnabled={Boolean(userId)&&!recoveryActive&&syncState!=="error"&&syncState!=="syncing"}/>}
      {view==="calendar"&&<CalendarView store={store} update={update} back={backToTab}/>}
      {view==="settings"&&<SettingsView store={store} update={update} back={backToTab} syncState={syncState} retrySync={retrySync} syncError={syncError} userEmail={userEmail} userId={userId} preserveLocal={recoveryActive} recoveryCounts={recoveryCounts} restoreMissingRecords={restoreMissingRecords}/>}
    </Fragment>
    {!online&&<div role="status" className="pointer-events-none fixed inset-x-0 bottom-[calc(68px+env(safe-area-inset-bottom))] z-30 mx-auto w-fit rounded-full bg-foreground px-4 py-2 text-[13px] font-medium text-background shadow-lg ring-4 ring-background">Offline · ändringar sparas på enheten</div>}
    <BottomNav tab={tab} onSelect={selectTab}/>
  </main>;
}
