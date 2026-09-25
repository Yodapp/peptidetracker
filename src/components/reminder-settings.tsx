"use client";

import { useEffect, useState } from "react";
import { Bell, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { IconTile, Surface } from "@/components/peptime-ui";
import { registerServiceWorker } from "@/lib/service-worker";

type Preferences = { enabled: boolean; lead_minutes: 0 | 10 | 15; follow_up_enabled: boolean; daily_summary_enabled: boolean; daily_summary_time: string };
type InstallPrompt = Event & { prompt: () => Promise<void> };
const defaults: Preferences = { enabled: false, lead_minutes: 0, follow_up_enabled: true, daily_summary_enabled: false, daily_summary_time: "20:30" };

function currentSubscription() {
  if (!("serviceWorker" in navigator)) return Promise.resolve(null);
  return navigator.serviceWorker.getRegistration("/").then(registration => registration?.pushManager.getSubscription() ?? null);
}

function publicKeyBytes(value: string) {
  const encoded = value.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "="));
  return Uint8Array.from(bytes, char => char.charCodeAt(0));
}

export function ReminderSettings({ available }: { available: boolean }) {
  const [preferences, setPreferences] = useState<Preferences>(defaults);
  const [configured, setConfigured] = useState(false);
  const [deliveryReady, setDeliveryReady] = useState(false);
  const [publicKey, setPublicKey] = useState("");
  const [registered, setRegistered] = useState(false);
  const [endpoint, setEndpoint] = useState("");
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [summaryTimeDraft, setSummaryTimeDraft] = useState(defaults.daily_summary_time);

  useEffect(() => {
    let active = true;
    const onInstallPrompt = (event: Event) => { event.preventDefault(); if (active) setInstallPrompt(event as InstallPrompt); };
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    queueMicrotask(() => {
      if (!active) return;
      setIos(/iPhone|iPad|iPod/.test(navigator.userAgent));
      setInstalled(window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
      setPermission("Notification" in window ? Notification.permission : "denied");
      if (!available) setLoading(false);
    });
    if (!available) return () => { active = false; window.removeEventListener("beforeinstallprompt", onInstallPrompt); };
    void (async () => {
      try {
        const response = await fetch("/api/reminders", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Kunde inte läsa påminnelser.");
        const subscription = await currentSubscription();
        if (!active) return;
        setPreferences(data.preferences ?? defaults);
        setSummaryTimeDraft(data.preferences?.daily_summary_time ?? defaults.daily_summary_time);
        setConfigured(Boolean(data.configured));
        setDeliveryReady(Boolean(data.deliveryReady));
        setPublicKey(data.publicKey ?? "");
        setEndpoint(subscription?.endpoint ?? "");
        setRegistered(Boolean(subscription && data.endpoints?.includes(subscription.endpoint)));
      } catch (cause) { if (active) setError((cause as Error).message); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; window.removeEventListener("beforeinstallprompt", onInstallPrompt); };
  }, [available]);

  const active = preferences.enabled && registered && permission === "granted";
  const save = async (next: Preferences) => {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      let subscription: PushSubscription | null = null;
      if (next.enabled) {
        if (ios && !installed) throw new Error("Öppna Peptime från hemskärmen för att aktivera påminnelser.");
        if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Den här webbläsaren stöder inte pushnotiser.");
        if (Notification.permission === "denied") throw new Error("Notiser är blockerade. Tillåt Peptime i telefonens notisinställningar.");
        if (!preferences.enabled || !registered) {
          // iOS requires this call to happen directly inside the user's tap handler.
          const granted = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
          setPermission(granted);
          if (granted !== "granted") throw new Error("Tillåt notiser för att aktivera påminnelser.");
          const registration = await registerServiceWorker();
          subscription = await registration.pushManager.getSubscription();
          const key = publicKeyBytes(publicKey);
          const existingKey = subscription?.options.applicationServerKey;
          if (subscription && existingKey && (existingKey.byteLength !== key.length || new Uint8Array(existingKey).some((byte, index) => byte !== key[index]))) {
            await subscription.unsubscribe();
            subscription = null;
          }
          subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        } else {
          subscription = await currentSubscription();
          if (!subscription) throw new Error("Telefonens notisprenumeration saknas. Aktivera påminnelser igen.");
        }
      } else subscription = await currentSubscription();
      const response = await fetch("/api/reminders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next.enabled, leadMinutes: next.lead_minutes, followUpEnabled: next.follow_up_enabled, dailySummaryEnabled: next.daily_summary_enabled, dailySummaryTime: next.daily_summary_time, subscription: next.enabled ? subscription?.toJSON() : undefined }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Kunde inte spara påminnelser.");
      setPreferences(next);
      setSummaryTimeDraft(next.daily_summary_time);
      setEndpoint(subscription?.endpoint ?? "");
      if (!next.enabled || !registered) setRegistered(Boolean(next.enabled && subscription));
      setMessage(next.enabled ? "Påminnelseinställningarna är sparade." : "Påminnelser är avstängda.");
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };

  const test = async () => {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/reminders/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Testnotisen kunde inte skickas.");
      setMessage("Test skickat. Kontrollera att det visas på telefonen.");
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };

  const status = loading ? "Kontrollerar…" : !available ? "Logga in på kontot först" : !configured ? "Servern är inte konfigurerad" : active ? "Aktiva på den här telefonen" : permission === "denied" ? "Blockerade i telefonens inställningar" : preferences.enabled ? "Aktivera på den här telefonen" : "Avstängda";
  return <Surface className="overflow-hidden rounded-[14px]">
    <div className="flex min-h-16 items-center justify-between gap-3 p-4">
      <div className="flex min-w-0 items-center gap-3"><IconTile className="bg-red-500"><Bell/></IconTile><div><p className="text-[17px]">Påminnelser</p><p className="mt-0.5 text-[13px] text-muted-foreground">{status}</p></div></div>
      <Switch aria-label="Aktivera påminnelser" checked={active} disabled={loading || busy || !available || !configured} onCheckedChange={checked => void save({ ...preferences, enabled: checked })}/>
    </div>
    {ios && !installed && <div className="border-t border-border bg-muted/40 p-4 text-sm leading-6"><p className="font-medium">Lägg till Peptime på hemskärmen</p><p className="mt-1 text-muted-foreground">Tryck på Dela i webbläsaren, välj ”Lägg till på hemskärmen” och öppna sedan Peptime från den nya ikonen. Då kan du slå på notiser.</p></div>}
    {!ios && !installed && installPrompt && <div className="border-t border-border p-4"><Button type="button" variant="outline" className="w-full" onClick={() => { void installPrompt.prompt(); setInstallPrompt(null); }}>Lägg till Peptime på hemskärmen</Button></div>}
    {configured && available && <div className="space-y-4 border-t border-border p-4">
      {!deliveryReady && <p className="rounded-xl border border-amber-600/40 bg-amber-500/10 p-3 text-sm leading-5">Serverns senaste leveranskontroll saknas. Du kan aktivera telefonen och skicka en testnotis, men schemalagda påminnelser är inte bekräftade ännu.</p>}
      <label className="block text-sm font-medium">Första påminnelsen<select className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-base text-foreground" value={preferences.lead_minutes} disabled={busy || !active} onChange={event => void save({ ...preferences, lead_minutes: Number(event.target.value) as 0 | 10 | 15 })}><option value={0}>Vid schemalagd tid</option><option value={10}>10 minuter före</option><option value={15}>15 minuter före</option></select></label>
      <div className="flex min-h-12 items-center justify-between gap-3"><div><p className="text-sm font-medium">Påminn igen om dosen inte är loggad</p><p className="text-xs leading-5 text-muted-foreground">10 minuter efter schemalagd tid.</p></div><Switch aria-label="Påminn igen" checked={preferences.follow_up_enabled} disabled={busy || !active} onCheckedChange={checked => void save({ ...preferences, follow_up_enabled: checked })}/></div>
      <div className="flex min-h-12 items-center justify-between gap-3 border-t border-border pt-4"><div><p className="text-sm font-medium">Dagens sammanfattning</p><p className="text-xs leading-5 text-muted-foreground">En påminnelse om du inte fyllt i den.</p></div><Switch aria-label="Påminn om dagens sammanfattning" checked={preferences.daily_summary_enabled} disabled={busy || !active} onCheckedChange={checked => void save({ ...preferences, daily_summary_enabled: checked })}/></div>
      {preferences.daily_summary_enabled && <label className="block text-sm font-medium">Tid för sammanfattning<input type="time" className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-base text-foreground" value={summaryTimeDraft} disabled={busy || !active} onChange={event => setSummaryTimeDraft(event.target.value)} onBlur={() => { if (summaryTimeDraft && summaryTimeDraft !== preferences.daily_summary_time) void save({ ...preferences, daily_summary_time: summaryTimeDraft }); }} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }}/></label>}
      {active && <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={test}>Skicka testnotis</Button>}
      <p className="text-xs leading-5 text-muted-foreground">På iPhone krävs iOS 16.4 eller senare och att Peptime öppnas från hemskärmen. Telefonen behöver internet för pushnotiser. Om en logg ännu inte har synkats kan du få en extra påminnelse.</p>
    </div>}
    {(message || error) && <p role="status" className={`flex gap-2 border-t border-border px-4 py-3 text-sm ${error ? "text-destructive" : "text-primary"}`}>{!error && <CheckCircle2 className="size-4 shrink-0"/>}{error || message}</p>}
  </Surface>;
}
