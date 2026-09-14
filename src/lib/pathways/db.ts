/**
 * Tiny key/value layer over IndexedDB. One store, one object per key. The whole
 * dataset is stored as a single value so a low-end phone with a tight quota
 * pays for one write, and translations ride inside each record instead of
 * being duplicated per language.
 *
 * If IndexedDB is unavailable (private mode, storage blocked) everything falls
 * back to an in-memory map: the app still works for this visit, it just
 * cannot remember the dataset for the next one.
 */

const DB_NAME = "pathways";
const DB_VERSION = 1;
const STORE = "kv";

const memory = new Map<string, unknown>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await open();
  if (!db) return memory.get(key) as T | undefined;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => resolve(memory.get(key) as T | undefined);
    } catch {
      resolve(memory.get(key) as T | undefined);
    }
  });
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  memory.set(key, value);
  const db = await open();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}
