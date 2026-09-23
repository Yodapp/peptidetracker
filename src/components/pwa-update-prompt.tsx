"use client";

import { useEffect, useState } from "react";

export function PwaUpdatePrompt() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then(registrations => Promise.all(registrations.map(registration => registration.unregister()))).catch(() => undefined);
      if ("caches" in window) caches.keys().then(names => Promise.all(names.filter(name => name.startsWith("peptime-")).map(name => caches.delete(name)))).catch(() => undefined);
      return;
    }

    let registration: ServiceWorkerRegistration | undefined;
    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    const onUpdateFound = () => {
      const worker = registration?.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) setWaitingWorker(worker);
      });
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then(value => {
      registration = value;
      if (value.waiting && navigator.serviceWorker.controller) setWaitingWorker(value.waiting);
      value.addEventListener("updatefound", onUpdateFound);
    }).catch(() => undefined);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      registration?.removeEventListener("updatefound", onUpdateFound);
    };
  }, []);

  if (!waitingWorker) return null;
  return <button
    type="button"
    onClick={() => waitingWorker.postMessage({ type: "SKIP_WAITING" })}
    className="fixed inset-x-5 bottom-[calc(88px+env(safe-area-inset-bottom))] z-50 mx-auto min-h-12 max-w-[460px] rounded-full bg-foreground px-5 text-sm font-semibold text-background shadow-xl"
  >Ny version · Ladda om</button>;
}
