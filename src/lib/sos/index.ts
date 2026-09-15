import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SOSEngine, type SOSSnapshot } from "./engine";
import { createSupabaseExecutor } from "./executor";
import { createIdbStore } from "./outbox";

export type { SOSSnapshot } from "./engine";
export { COUNTDOWN_SECONDS } from "./engine";

let wakeLock: WakeLockSentinel | null = null;

/** The one engine the app uses. Tests build their own from ./engine with fakes. */
export const sosEngine = new SOSEngine({
  store: createIdbStore(),
  executor: createSupabaseExecutor(supabase),
  storage: localStorage,
  // A plain object: window.document is read-only, so it cannot be assigned onto window.
  events: { addEventListener: window.addEventListener.bind(window), document },
  fetchIncidentStatus: async (id) => {
    const { data } = await supabase.from("incidents").select("status").eq("id", id).maybeSingle();
    return data?.status ?? null;
  },
  batteryLevel: async () => {
    // Battery Status API: Chromium-only, and absent from lib.dom.
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number }> };
    const battery = await nav.getBattery?.();
    return battery ? Math.round(battery.level * 100) : null;
  },
  wakeLock: {
    // Keeps the screen (and so the page's timers, mic and GPS) alive during an alert.
    acquire: () => {
      if (wakeLock || !("wakeLock" in navigator) || document.visibilityState !== "visible") return;
      navigator.wakeLock
        .request("screen")
        .then((sentinel) => {
          wakeLock = sentinel;
          sentinel.addEventListener("release", () => {
            if (wakeLock === sentinel) wakeLock = null;
          });
        })
        .catch(() => {});
    },
    release: () => {
      void wakeLock?.release().catch(() => {});
      wakeLock = null;
    },
  },
});

export function useSOS(): SOSSnapshot {
  return useSyncExternalStore(sosEngine.subscribe, sosEngine.getSnapshot);
}
