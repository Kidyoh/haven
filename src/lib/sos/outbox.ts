/**
 * The SOS outbox. Every write an alert makes — the incident row, each status
 * change, each location fix, each audio clip, each "text my contacts" — is
 * saved on the phone first and sent from here. Losing signal, locking the
 * screen or reloading the page delays a write; it never loses it.
 *
 * Ordering rules, so retries cannot put the server in a wrong state:
 *  - Status changes and notifications for one incident go strictly in order.
 *    If one fails, the rest for that incident wait for the next flush.
 *  - Nothing for an incident is sent until its create has succeeded.
 *  - Locations and clips for one incident do not block each other.
 *  - Audio clips go last in every flush, so a slow upload never delays the
 *    alert itself.
 *
 * Stored in IndexedDB, falling back to memory when storage is unavailable.
 */

export interface IncidentCreateRow {
  id: string;
  user_id: string;
  reference_number: string;
  signal_strength: string;
}

export interface LocationFix {
  lat: number;
  lng: number;
  accuracy: number;
  /** Epoch ms, when the phone took the fix. */
  at: number;
}

export type OutboxOp =
  | { kind: "incident.create"; incidentId: string; row: IncidentCreateRow }
  | { kind: "incident.activate"; incidentId: string; at: number; batteryLevel: number | null }
  | { kind: "incident.cancel"; incidentId: string; at: number }
  | { kind: "incident.resolve"; incidentId: string; at: number }
  | { kind: "incident.duress"; incidentId: string; at: number }
  | { kind: "location"; incidentId: string; id: string; userId: string; fix: LocationFix }
  | {
      kind: "evidence";
      incidentId: string;
      userId: string;
      seq: number;
      blob: Blob;
      mimeType: string;
      startedAt: number;
      durationMs: number;
    }
  | { kind: "notify"; incidentId: string; notify: "alert" | "safe" };

export interface StoredOp {
  id: number;
  op: OutboxOp;
  attempts: number;
}

export interface OutboxStore {
  add(op: OutboxOp): Promise<StoredOp>;
  all(): Promise<StoredOp[]>;
  put(record: StoredOp): Promise<void>;
  remove(id: number): Promise<void>;
}

/**
 * What an executor reports. `done: false` means "reached the server but not
 * finished" (e.g. only some contacts were texted) and is retried like a
 * failure; a thrown error is a failure. `data` is passed to listeners either way.
 */
export interface ExecResult {
  done: boolean;
  data?: unknown;
}

export type Executor = (op: OutboxOp) => Promise<ExecResult>;

/** Status changes: they go in order, and one failing holds back the rest for that incident. */
const STATUS_OPS = new Set<OutboxOp["kind"]>([
  "incident.create",
  "incident.activate",
  "incident.cancel",
  "incident.resolve",
  "incident.duress",
]);

/**
 * Notifications wait behind a held-back status change (an alert text needs the
 * incident active) but never hold anything back themselves: one bad phone
 * number must not delay "I am safe" or a duress flag reaching responders.
 */
const WAITS_FOR_STATUS = new Set<OutboxOp["kind"]>([...STATUS_OPS, "notify"]);

export interface OutboxOptions {
  /** Failures (while online) before an op is given up on. */
  maxAttempts?: number;
  isOnline?: () => boolean;
  /** Schedule flushes automatically after enqueue and after failures. Off in tests. */
  autoFlush?: boolean;
  onChange?: (records: StoredOp[]) => void;
  onResult?: (op: OutboxOp, result: ExecResult | { done: false; error: unknown }) => void;
  onDrop?: (op: OutboxOp, error: unknown) => void;
}

export class Outbox {
  private flushing: Promise<void> | null = null;
  private again = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  private readonly maxAttempts: number;
  private readonly isOnline: () => boolean;
  private readonly autoFlush: boolean;

  constructor(
    private readonly store: OutboxStore,
    private readonly executor: Executor,
    private readonly options: OutboxOptions = {},
  ) {
    this.maxAttempts = options.maxAttempts ?? 20;
    this.isOnline = options.isOnline ?? (() => (typeof navigator === "undefined" ? true : navigator.onLine));
    this.autoFlush = options.autoFlush ?? true;
  }

  async enqueue(op: OutboxOp): Promise<void> {
    await this.store.add(op);
    await this.emitChange();
    if (this.autoFlush) void this.flush();
  }

  /** Send everything that can be sent. Concurrent calls share one run, then run once more. */
  flush(): Promise<void> {
    if (this.flushing) {
      this.again = true;
      return this.flushing;
    }
    this.flushing = (async () => {
      try {
        do {
          this.again = false;
          await this.runOnce();
        } while (this.again);
      } finally {
        this.flushing = null;
      }
    })();
    return this.flushing;
  }

  async records(): Promise<StoredOp[]> {
    return this.store.all();
  }

  private async runOnce(): Promise<void> {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    const records = await this.store.all();
    if (records.length === 0) return;

    // Clips last, everything else in queue order.
    const ordered = [
      ...records.filter((r) => r.op.kind !== "evidence"),
      ...records.filter((r) => r.op.kind === "evidence"),
    ];

    const blocked = new Set<string>(); // sequential ops held back for this incident
    const uncreated = new Set<string>(); // create failed: hold back everything for this incident
    let failed = false;

    for (const record of ordered) {
      const { op } = record;
      if (uncreated.has(op.incidentId)) continue;
      if (WAITS_FOR_STATUS.has(op.kind) && blocked.has(op.incidentId)) continue;

      let ok = false;
      let error: unknown = null;
      try {
        const result = await this.executor(op);
        this.options.onResult?.(op, result);
        ok = result.done;
      } catch (err) {
        error = err;
        this.options.onResult?.(op, { done: false, error: err });
      }

      if (ok) {
        await this.store.remove(record.id);
        continue;
      }

      failed = true;
      if (op.kind === "incident.create") uncreated.add(op.incidentId);
      if (STATUS_OPS.has(op.kind)) blocked.add(op.incidentId);

      // Being offline is not the op's fault; only count attempts that had a chance.
      if (this.isOnline()) record.attempts += 1;
      // The incident itself is never given up on: dropping a create or a resolve
      // would leave the server telling a different story from the phone.
      if (record.attempts >= this.maxAttempts && !STATUS_OPS.has(op.kind)) {
        await this.store.remove(record.id);
        this.options.onDrop?.(op, error);
      } else {
        await this.store.put(record);
      }
    }

    await this.emitChange();

    if (failed) {
      this.failures += 1;
      this.scheduleRetry();
    } else {
      this.failures = 0;
    }
  }

  private scheduleRetry() {
    if (!this.autoFlush || this.retryTimer) return;
    // 2s, 4s, 8s, 16s, then every 30s.
    const delay = Math.min(30_000, 1000 * 2 ** this.failures);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flush();
    }, delay);
  }

  private async emitChange() {
    if (!this.options.onChange) return;
    this.options.onChange(await this.store.all());
  }
}

export function createMemoryStore(): OutboxStore {
  let nextId = 1;
  const records = new Map<number, StoredOp>();
  return {
    async add(op) {
      const record = { id: nextId++, op, attempts: 0 };
      records.set(record.id, record);
      return { ...record };
    },
    async all() {
      return [...records.values()].sort((a, b) => a.id - b.id).map((r) => ({ ...r }));
    },
    async put(record) {
      if (records.has(record.id)) records.set(record.id, { ...record });
    },
    async remove(id) {
      records.delete(id);
    },
  };
}

const DB_NAME = "haven-sos";
const STORE = "outbox";

/**
 * IndexedDB-backed store. If the database cannot be opened (private mode,
 * storage blocked) it quietly behaves like the memory store: the alert still
 * sends, it just cannot survive a reload.
 */
export function createIdbStore(): OutboxStore {
  const fallback = createMemoryStore();
  let dbPromise: Promise<IDBDatabase | null> | null = null;

  const open = () => {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      if (typeof indexedDB === "undefined") return resolve(null);
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(STORE)) {
            req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return dbPromise;
  };

  const run = <T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>) =>
    open().then(
      (db) =>
        new Promise<T | undefined>((resolve, reject) => {
          if (!db) return reject(new Error("no-idb"));
          try {
            const tx = db.transaction(STORE, mode);
            const req = fn(tx.objectStore(STORE));
            tx.oncomplete = () => resolve(req.result);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
          } catch (err) {
            reject(err);
          }
        }),
    );

  return {
    async add(op) {
      try {
        const id = (await run("readwrite", (s) => s.add({ op, attempts: 0 }))) as number;
        return { id, op, attempts: 0 };
      } catch {
        return fallback.add(op);
      }
    },
    async all() {
      const fromMemory = await fallback.all();
      try {
        const rows = ((await run("readonly", (s) => s.getAll())) ?? []) as StoredOp[];
        return [...rows, ...fromMemory.map((r) => ({ ...r, id: -r.id }))].sort(byQueueOrder);
      } catch {
        return fromMemory;
      }
    },
    async put(record) {
      if (record.id < 0) return fallback.put({ ...record, id: -record.id });
      try {
        await run("readwrite", (s) => s.put(record));
      } catch {
        /* the next flush retries it with the old attempt count */
      }
    },
    async remove(id) {
      if (id < 0) return fallback.remove(-id);
      try {
        await run("readwrite", (s) => s.delete(id));
      } catch {
        /* sent twice at worst; every executor op is idempotent */
      }
    },
  };
}

/** Persisted rows by id; memory-only rows (negative ids) after them. */
function byQueueOrder(a: StoredOp, b: StoredOp) {
  if (a.id > 0 && b.id > 0) return a.id - b.id;
  if (a.id < 0 && b.id < 0) return b.id - a.id;
  return a.id > 0 ? -1 : 1;
}
