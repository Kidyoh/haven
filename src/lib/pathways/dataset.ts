import { kvGet, kvSet } from "./db";
import type { Dataset } from "./types";

/**
 * Dataset lifecycle:
 *
 *   first visit   fetch /pathways/dataset.json (precached by the service
 *                 worker at install) → IndexedDB → render
 *   later visits  IndexedDB → render, then quietly look for a newer version
 *   offline       IndexedDB → render; ask the service worker to sync later
 *
 * /pathways/dataset.json is generated from /data by scripts/build-dataset.mjs.
 * Update checks add a query string so they bypass the precache and reach the
 * network; when that fails we know we are offline, regardless of what
 * navigator.onLine claims.
 */

const KEY = "dataset";
const DATASET_URL = "/pathways/dataset.json";
const VERSION_URL = "/pathways/dataset-version.json";
export const SYNC_TAG = "dataset-refresh";

export async function loadCachedDataset(): Promise<Dataset | null> {
  const ds = await kvGet<Dataset>(KEY);
  return ds && Array.isArray(ds.records) ? ds : null;
}

/** Served by the service worker's precache once installed; network before that. */
export async function fetchDataset(): Promise<Dataset> {
  const res = await fetch(DATASET_URL);
  if (!res.ok) throw new Error(`dataset fetch failed: ${res.status}`);
  return parse(await res.json());
}

/** Always hits the network (query string bypasses the precache). */
async function fetchDatasetFromNetwork(): Promise<Dataset> {
  const res = await fetch(`${DATASET_URL}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`dataset fetch failed: ${res.status}`);
  return parse(await res.json());
}

function parse(ds: unknown): Dataset {
  const d = ds as Dataset;
  if (!d || !Array.isArray(d.records)) throw new Error("dataset malformed");
  return d;
}

export async function saveDataset(ds: Dataset): Promise<void> {
  await kvSet(KEY, ds);
}

export type UpdateResult =
  | { status: "updated"; dataset: Dataset }
  | { status: "same" }
  | { status: "offline" };

/**
 * Cheap update check: a ~60-byte version file first, the full dataset only if
 * the version differs. Never throws; "offline" covers any network failure.
 */
export async function checkForUpdate(current: Dataset | null): Promise<UpdateResult> {
  try {
    const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return { status: "offline" };
    const { version } = (await res.json()) as { version: string };
    if (current && version === current.version) return { status: "same" };
    const ds = await fetchDatasetFromNetwork();
    if (current && ds.version === current.version) return { status: "same" };
    await saveDataset(ds);
    return { status: "updated", dataset: ds };
  } catch {
    requestBackgroundSync();
    return { status: "offline" };
  }
}

/**
 * Background Sync: when the phone is offline, ask the service worker to fetch
 * a fresh dataset the next time a connection returns, even if the app is
 * closed. Silently a no-op where the API does not exist.
 */
export function requestBackgroundSync(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready
    .then((reg) => {
      const sync = (reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }).sync;
      return sync?.register(SYNC_TAG);
    })
    .catch(() => {});
}
