/// <reference lib="webworker" />
/*
 * HAVEN service worker (vite-plugin-pwa, injectManifest strategy).
 *
 * 1. Precache everything Vite emits (same behaviour the generated worker had),
 *    including the Pathways dataset under /pathways/, so the directory works
 *    offline after one visit.
 * 2. SPA navigation fallback, with the same OAuth denylist as before.
 * 3. Background Sync for the Pathways dataset: when the page asked for a
 *    refresh while offline, fetch a fresh copy once a connection returns —
 *    even if the app is closed — store it straight into IndexedDB, and tell
 *    any open page.
 *
 * It does NOT register for push, talk to analytics, or cache other origins.
 */
import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { kvSet } from "@/lib/pathways/db";

declare let self: ServiceWorkerGlobalScope;

const PATHWAYS_SYNC_TAG = "dataset-refresh";
const PATHWAYS_DATASET = "/pathways/dataset.json";

self.skipWaiting();
clientsClaim();

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html"), { denylist: [/^\/~oauth/] }));

self.addEventListener("sync", (event: SyncEvent) => {
  if (event.tag !== PATHWAYS_SYNC_TAG) return;
  event.waitUntil(refreshPathwaysDataset());
});

async function refreshPathwaysDataset(): Promise<void> {
  // Query string bypasses the precache so this always goes to the network.
  const res = await fetch(`${PATHWAYS_DATASET}?sync=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error("dataset refresh failed"); // rejecting keeps the sync pending for a retry
  const dataset = await res.json();
  if (!dataset || !Array.isArray(dataset.records)) throw new Error("dataset malformed");
  await kvSet("dataset", dataset);
  const clients = await self.clients.matchAll({ type: "window" });
  for (const c of clients) c.postMessage({ type: "pathways-dataset-refreshed" });
}

// Background Sync is not in lib.dom / lib.webworker typings yet.
interface SyncEvent extends ExtendableEvent {
  readonly tag: string;
}
