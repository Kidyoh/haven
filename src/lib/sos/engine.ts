import { Outbox, type Executor, type LocationFix, type OutboxOp, type OutboxStore } from "./outbox";
import { SegmentRecorder, type AudioClip, type AudioStatus, type RecorderOptions } from "./recorder";
import { HEARTBEAT_MS, LocationTracker, shouldSend, type LocationStatus, type TrackerOptions } from "./location";
import type { NotifyResult } from "./executor";

/**
 * The SOS engine: one per app, living outside React so an alert keeps running
 * while the user moves between screens, and picks itself back up after a
 * reload.
 *
 *   idle ──hold──▶ countdown ──5s──▶ active ──safe PIN──▶ idle
 *                     │                 │
 *                   cancel          duress PIN
 *                     ▼                 ▼
 *                   idle             duress  (looks idle; still recording and sharing)
 *
 * The countdown already creates the incident (as pending) and starts the mic
 * and GPS, so by the time it fires there is a location to send and the first
 * clip is under way. Nothing leaves the phone except the pending row until the
 * countdown completes; a cancel discards the audio.
 */

export const COUNTDOWN_SECONDS = 5;
export const SEGMENT_MS = 10_000;
export const MAX_RECORDING_MS = 10 * 60_000;
/** How long the alert text waits for a first GPS fix before going without one. */
export const NOTIFY_WAIT_FOR_FIX_MS = 5_000;
const STATUS_POLL_MS = 60_000;
const SESSION_KEY = "haven-sos-session";

export type Phase = "idle" | "countdown" | "active" | "duress";
export type NotifyState = "idle" | "waiting" | "sending" | "retrying" | NotifyResult["status"];

export interface SOSSnapshot {
  phase: Phase;
  incidentId: string | null;
  referenceNumber: string | null;
  startedAt: number | null;
  activatedAt: number | null;
  online: boolean;
  /** Writes saved on this phone and not yet on the server, for any incident. */
  pending: number;
  pendingClips: number;
  /** The server has this incident as active. */
  delivered: boolean;
  notify: { state: NotifyState; sent: number; total: number };
  audio: { status: AudioStatus; clips: number; uploaded: number };
  location: { status: LocationStatus; lastFix: LocationFix | null; lastSentAt: number | null };
}

interface Session {
  userId: string;
  incidentId: string;
  referenceNumber: string;
  phase: "countdown" | "active" | "duress";
  startedAt: number;
  activatedAt: number | null;
  nextSeq: number;
  recordedMs: number;
  clips: number;
  uploaded: number;
  delivered: boolean;
  notifyQueued: boolean;
  notify: SOSSnapshot["notify"];
  lastSent: LocationFix | null;
}

export interface RecorderLike {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface TrackerLike {
  start(): void;
  stop(): void;
  refresh(): void;
}

export interface EngineDeps {
  store: OutboxStore;
  executor: Executor;
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  createRecorder?: (opts: RecorderOptions) => RecorderLike;
  createTracker?: (opts: TrackerOptions) => TrackerLike;
  now?: () => number;
  uuid?: () => string;
  isOnline?: () => boolean;
  batteryLevel?: () => Promise<number | null>;
  /** Lets the engine notice a responder resolving the incident. */
  fetchIncidentStatus?: (incidentId: string) => Promise<string | null>;
  wakeLock?: { acquire(): void; release(): void };
  /** Outbox retries and heartbeat timers. Off in tests. */
  background?: boolean;
  /** Subscribe to online/offline/visibility events. */
  events?: Pick<Window, "addEventListener"> & { document?: Pick<Document, "addEventListener" | "visibilityState"> };
}

const IDLE_NOTIFY: SOSSnapshot["notify"] = { state: "idle", sent: 0, total: 0 };

export class SOSEngine {
  private readonly listeners = new Set<() => void>();
  private readonly outbox: Outbox;
  private readonly now: () => number;
  private readonly uuid: () => string;
  private readonly isOnline: () => boolean;
  private readonly background: boolean;

  private session: Session | null = null;
  /** The session being wound down by markSafe, so its last clip still lands. */
  private ending: Session | null = null;
  private snapshot: SOSSnapshot;
  private recorder: RecorderLike | null = null;
  private tracker: TrackerLike | null = null;
  private heldClips: AudioClip[] = [];
  private audioStatus: AudioStatus = "idle";
  private locationStatus: LocationStatus = "idle";
  private lastFix: LocationFix | null = null;
  private battery: number | null = null;
  private pending = 0;
  private pendingClips = 0;
  private online: boolean;
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private restoredFor: string | null = null;

  constructor(private readonly deps: EngineDeps) {
    this.now = deps.now ?? Date.now;
    this.uuid = deps.uuid ?? (() => crypto.randomUUID());
    this.isOnline = deps.isOnline ?? (() => (typeof navigator === "undefined" ? true : navigator.onLine));
    this.background = deps.background ?? true;
    this.online = this.isOnline();

    this.outbox = new Outbox(deps.store, deps.executor, {
      isOnline: this.isOnline,
      autoFlush: this.background,
      onChange: (records) => {
        this.pending = records.length;
        this.pendingClips = records.filter((r) => r.op.kind === "evidence").length;
        this.emit();
      },
      onResult: (op, result) => this.handleResult(op, result),
      onDrop: (op, error) => console.error(`SOS outbox gave up on ${op.kind}`, error),
    });

    this.snapshot = this.buildSnapshot();

    const events = deps.events;
    if (events) {
      events.addEventListener("online", () => this.setOnline(true));
      events.addEventListener("offline", () => this.setOnline(false));
      events.document?.addEventListener("visibilitychange", () => {
        if (events.document?.visibilityState !== "visible") return;
        this.setOnline(this.isOnline());
        if (this.session) {
          this.deps.wakeLock?.acquire(); // released by the browser when hidden
          this.tracker?.refresh();
        }
      });
    }
  }

  // ---------------------------------------------------------------------------
  // React glue
  // ---------------------------------------------------------------------------

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Pick up an alert that was running before a reload, and send anything left queued. */
  restore(userId: string) {
    if (this.restoredFor === userId) return;
    this.restoredFor = userId;
    void this.outbox.flush();

    if (this.session) return;
    const saved = this.readSession();
    if (!saved || saved.userId !== userId) return;

    this.session = saved;
    this.startCapture();
    if (saved.phase === "countdown") {
      // Only Cancel cancels. A countdown cut short by a reload or the OS killing
      // the tab was still a request for help.
      this.activate();
      return;
    }
    if (!saved.notifyQueued) this.scheduleNotify();
    this.startTimers();
    this.emit();
  }

  startCountdown(userId: string) {
    if (this.session) {
      // Pressing SOS during a duress stand-down brings the real alert screen back.
      if (this.session.phase === "duress") {
        this.session.phase = "active";
        this.persist();
        this.emit();
      }
      return;
    }

    const now = this.now();
    const incidentId = this.uuid();
    const referenceNumber = `HVN-${now.toString(36).toUpperCase()}`;
    this.session = {
      userId,
      incidentId,
      referenceNumber,
      phase: "countdown",
      startedAt: now,
      activatedAt: null,
      nextSeq: 0,
      recordedMs: 0,
      clips: 0,
      uploaded: 0,
      delivered: false,
      notifyQueued: false,
      notify: { ...IDLE_NOTIFY },
      lastSent: null,
    };
    this.heldClips = [];
    this.lastFix = null;
    this.persist();

    void this.enqueue({
      kind: "incident.create",
      incidentId,
      row: {
        id: incidentId,
        user_id: userId,
        reference_number: referenceNumber,
        signal_strength: this.online ? "online" : "offline",
      },
    });
    this.startCapture();
    this.emit();
  }

  activate() {
    const s = this.session;
    if (!s || s.phase !== "countdown") return;

    s.phase = "active";
    s.activatedAt = this.now();
    s.notify = { state: "waiting", sent: 0, total: 0 };
    this.persist();

    void this.enqueue({ kind: "incident.activate", incidentId: s.incidentId, at: s.activatedAt, batteryLevel: this.battery });
    for (const clip of this.heldClips) this.enqueueClip(s, clip);
    this.heldClips = [];
    if (this.lastFix) this.sendFix(s, this.lastFix);

    this.scheduleNotify();
    this.startTimers();
    this.emit();
  }

  async cancel() {
    const s = this.session;
    if (!s || s.phase !== "countdown") return;

    this.session = null;
    this.heldClips = [];
    this.clearSession();
    void this.enqueue({ kind: "incident.cancel", incidentId: s.incidentId, at: this.now() });
    this.emit();
    await this.stopCapture(); // the clip in progress is dropped: there is no session to attach it to
    this.emit();
  }

  /** "I am safe", confirmed. */
  async markSafe() {
    const s = this.session;
    if (!s || (s.phase !== "active" && s.phase !== "duress")) return;

    // Queue the resolve before anything slow, so closing the app straight away still stands it down.
    void this.enqueue({ kind: "incident.resolve", incidentId: s.incidentId, at: this.now() });
    if (s.notifyQueued) void this.enqueue({ kind: "notify", incidentId: s.incidentId, notify: "safe" });

    this.session = null;
    this.ending = s;
    this.clearSession();
    this.emit();
    await this.stopCapture();
    this.ending = null;
    this.emit();
  }

  /** "I am safe" with the duress PIN: the screen stands down, the alert does not. */
  enterDuress() {
    const s = this.session;
    if (!s || s.phase !== "active") return;
    s.phase = "duress";
    this.persist();
    void this.enqueue({ kind: "incident.duress", incidentId: s.incidentId, at: this.now() });
    this.emit();
  }

  /** Try the microphone again after it was denied or interrupted. */
  async resumeAudio() {
    const s = this.session;
    if (!s) return;
    await this.recorder?.stop();
    this.recorder = this.makeRecorder(s);
    await this.recorder.start();
  }

  /** Send queued writes now (e.g. the user tapped "retry"). */
  flush() {
    return this.outbox.flush();
  }

  // ---------------------------------------------------------------------------
  // Capture
  // ---------------------------------------------------------------------------

  private startCapture() {
    const s = this.session;
    if (!s) return;

    if (!this.recorder) {
      this.recorder = this.makeRecorder(s);
      void this.recorder.start();
    }

    if (!this.tracker) {
      const opts: TrackerOptions = {
        onFix: (fix) => this.handleFix(fix),
        onStatus: (status) => {
          this.locationStatus = status;
          this.emit();
        },
      };
      this.tracker = this.deps.createTracker ? this.deps.createTracker(opts) : new LocationTracker(opts);
      this.tracker.start();
    }

    this.deps.wakeLock?.acquire();
    this.deps
      .batteryLevel?.()
      .then((level) => (this.battery = level))
      .catch(() => {});
  }

  private makeRecorder(s: Session): RecorderLike {
    const opts: RecorderOptions = {
      segmentMs: SEGMENT_MS,
      maxMs: MAX_RECORDING_MS,
      startSeq: s.nextSeq,
      recordedMs: s.recordedMs,
      onClip: (clip) => this.handleClip(clip),
      onStatus: (status) => {
        this.audioStatus = status;
        this.emit();
      },
    };
    return this.deps.createRecorder ? this.deps.createRecorder(opts) : new SegmentRecorder(opts);
  }

  private async stopCapture() {
    this.stopTimers();
    this.tracker?.stop();
    this.tracker = null;
    this.deps.wakeLock?.release();
    const recorder = this.recorder;
    this.recorder = null;
    await recorder?.stop();
    this.audioStatus = "idle";
    this.locationStatus = "idle";
    this.lastFix = null;
  }

  private handleClip(clip: AudioClip) {
    const s = this.session ?? this.ending;
    if (!s) return;
    s.nextSeq = Math.max(s.nextSeq, clip.seq + 1);
    s.recordedMs += clip.durationMs;
    s.clips += 1;
    if (s.phase === "countdown" && s === this.session) this.heldClips.push(clip);
    else this.enqueueClip(s, clip);
    if (s === this.session) this.persist();
    this.emit();
  }

  private enqueueClip(s: Session, clip: AudioClip) {
    void this.enqueue({
      kind: "evidence",
      incidentId: s.incidentId,
      userId: s.userId,
      seq: clip.seq,
      blob: clip.blob,
      mimeType: clip.mimeType,
      startedAt: clip.startedAt,
      durationMs: clip.durationMs,
    });
  }

  private handleFix(fix: LocationFix) {
    this.lastFix = fix;
    const s = this.session;
    if (s && s.phase !== "countdown") {
      if (shouldSend(s.lastSent, fix)) this.sendFix(s, fix);
      if (!s.notifyQueued) this.queueNotify(s);
    }
    this.emit();
  }

  private sendFix(s: Session, fix: LocationFix) {
    s.lastSent = fix;
    this.persist();
    void this.enqueue({ kind: "location", incidentId: s.incidentId, id: this.uuid(), userId: s.userId, fix });
  }

  // ---------------------------------------------------------------------------
  // Notifying contacts
  // ---------------------------------------------------------------------------

  private scheduleNotify() {
    const s = this.session;
    if (!s || s.notifyQueued) return;
    if (this.lastFix) return this.queueNotify(s);
    if (this.notifyTimer) return;
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null;
      if (this.session === s && !s.notifyQueued) this.queueNotify(s);
    }, NOTIFY_WAIT_FOR_FIX_MS);
  }

  private queueNotify(s: Session) {
    if (this.notifyTimer) {
      clearTimeout(this.notifyTimer);
      this.notifyTimer = null;
    }
    s.notifyQueued = true;
    s.notify = { ...s.notify, state: "sending" };
    this.persist();
    void this.enqueue({ kind: "notify", incidentId: s.incidentId, notify: "alert" });
    this.emit();
  }

  private handleResult(op: OutboxOp, result: { done: boolean; data?: unknown; error?: unknown }) {
    const s = this.session;
    if (!s || op.incidentId !== s.incidentId) return;

    if (op.kind === "incident.activate" && result.done) s.delivered = true;
    if (op.kind === "evidence" && result.done) s.uploaded += 1;
    if (op.kind === "notify" && op.notify === "alert") {
      const data = result.data as NotifyResult | undefined;
      if (data?.status) {
        const retrying = data.status === "failed" || data.status === "partial";
        s.notify = { state: retrying && data.sent === 0 ? "retrying" : data.status, sent: data.sent, total: data.total };
      } else if ("error" in result && this.isOnline()) {
        s.notify = { ...s.notify, state: "retrying" };
      }
    }
    this.persist();
    this.emit();
  }

  // ---------------------------------------------------------------------------
  // Timers, connectivity, persistence
  // ---------------------------------------------------------------------------

  private startTimers() {
    if (!this.background) return;
    if (!this.heartbeat) this.heartbeat = setInterval(() => this.tracker?.refresh(), HEARTBEAT_MS);
    if (!this.poll && this.deps.fetchIncidentStatus) {
      this.poll = setInterval(() => void this.checkServerStatus(), STATUS_POLL_MS);
    }
  }

  private stopTimers() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.poll) clearInterval(this.poll);
    if (this.notifyTimer) clearTimeout(this.notifyTimer);
    this.heartbeat = this.poll = this.notifyTimer = null;
  }

  /** A responder resolving the incident on the dashboard ends it here too. */
  async checkServerStatus() {
    const s = this.session;
    if (!s || !s.delivered || !this.deps.fetchIncidentStatus || !this.isOnline()) return;
    const status = await this.deps.fetchIncidentStatus(s.incidentId).catch(() => null);
    if (this.session !== s || (status !== "resolved" && status !== "cancelled")) return;
    this.session = null;
    this.ending = s;
    this.clearSession();
    this.emit();
    await this.stopCapture();
    this.ending = null;
    this.emit();
  }

  private setOnline(online: boolean) {
    this.online = online;
    if (online) void this.outbox.flush();
    this.emit();
  }

  private enqueue(op: OutboxOp) {
    return this.outbox.enqueue(op);
  }

  private persist() {
    if (!this.session) return;
    try {
      this.deps.storage.setItem(SESSION_KEY, JSON.stringify(this.session));
    } catch {
      /* storage full or blocked: the alert still runs, it just won't survive a reload */
    }
  }

  private clearSession() {
    try {
      this.deps.storage.removeItem(SESSION_KEY);
    } catch {
      /* nothing to clean up */
    }
  }

  private readSession(): Session | null {
    try {
      const raw = this.deps.storage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      return null;
    }
  }

  private emit() {
    this.snapshot = this.buildSnapshot();
    this.listeners.forEach((l) => l());
  }

  private buildSnapshot(): SOSSnapshot {
    const s = this.session;
    return {
      phase: s?.phase ?? "idle",
      incidentId: s?.incidentId ?? null,
      referenceNumber: s?.referenceNumber ?? null,
      startedAt: s?.startedAt ?? null,
      activatedAt: s?.activatedAt ?? null,
      online: this.online,
      pending: this.pending,
      pendingClips: this.pendingClips,
      delivered: s?.delivered ?? false,
      notify: s ? { ...s.notify } : { ...IDLE_NOTIFY },
      audio: { status: s ? this.audioStatus : "idle", clips: s?.clips ?? 0, uploaded: s?.uploaded ?? 0 },
      location: {
        status: s ? this.locationStatus : "idle",
        lastFix: s ? this.lastFix : null,
        lastSentAt: s?.lastSent?.at ?? null,
      },
    };
  }
}
