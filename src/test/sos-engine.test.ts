import { afterEach, describe, expect, test, vi } from "vitest";
import { SOSEngine, NOTIFY_WAIT_FOR_FIX_MS, type RecorderLike, type TrackerLike } from "@/lib/sos/engine";
import { createMemoryStore, type ExecResult, type LocationFix, type OutboxOp } from "@/lib/sos/outbox";
import type { AudioClip, RecorderOptions } from "@/lib/sos/recorder";
import type { TrackerOptions } from "@/lib/sos/location";

/**
 * The engine with every device faked: a recorder and GPS we drive by hand, an
 * executor that records what would have reached Supabase, and memory storage
 * standing in for localStorage.
 */

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

function setup({ storage = memoryStorage(), notifyResult = { status: "sent", sent: 2, failed: 0, total: 2 } } = {}) {
  const ops: OutboxOp[] = [];
  let recorderOpts: RecorderOptions | null = null;
  let trackerOpts: TrackerOptions | null = null;
  const recorder: RecorderLike = { start: vi.fn(async () => {}), stop: vi.fn(async () => {}) };
  const tracker: TrackerLike = { start: vi.fn(), stop: vi.fn(), refresh: vi.fn() };
  let id = 0;
  let clock = 1_000_000;

  const engine = new SOSEngine({
    store: createMemoryStore(),
    storage,
    executor: async (op): Promise<ExecResult> => {
      ops.push(op);
      return op.kind === "notify" ? { done: true, data: notifyResult } : { done: true };
    },
    createRecorder: (opts) => {
      recorderOpts = opts;
      return recorder;
    },
    createTracker: (opts) => {
      trackerOpts = opts;
      return tracker;
    },
    now: () => clock,
    uuid: () => `id-${++id}`,
    isOnline: () => true,
    background: false,
  });

  const settle = async () => {
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
      await engine.flush();
    }
  };
  const kinds = () => ops.map((op) => (op.kind === "notify" ? `notify:${op.notify}` : op.kind));
  const clip = (seq: number): AudioClip => ({
    seq,
    blob: new Blob(["x"]),
    mimeType: "audio/webm",
    startedAt: clock,
    durationMs: 10_000,
  });
  const fix = (overrides: Partial<LocationFix> = {}): LocationFix => ({ lat: 9.03, lng: 38.74, accuracy: 12, at: clock, ...overrides });

  return {
    engine,
    ops,
    kinds,
    settle,
    recorder,
    tracker,
    storage,
    emitClip: (seq: number) => recorderOpts!.onClip(clip(seq)),
    emitFix: (f?: Partial<LocationFix>) => trackerOpts!.onFix(fix(f)),
    tick: (ms: number) => (clock += ms),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("SOS engine", () => {
  test("the countdown creates a pending incident and starts the mic and GPS, but sends nothing else", async () => {
    const t = setup();
    t.engine.startCountdown("user-1");
    t.emitClip(0);
    t.emitFix();
    await t.settle();

    expect(t.engine.getSnapshot().phase).toBe("countdown");
    expect(t.recorder.start).toHaveBeenCalled();
    expect(t.tracker.start).toHaveBeenCalled();
    expect(t.kinds()).toEqual(["incident.create"]);
  });

  test("activation sends the alert, the audio and fix captured during the countdown, then texts contacts", async () => {
    const t = setup();
    t.engine.startCountdown("user-1");
    t.emitClip(0);
    t.emitFix();
    t.engine.activate();
    await t.settle();

    expect(t.kinds()).toEqual(["incident.create", "incident.activate", "location", "notify:alert", "evidence"]);
    const snap = t.engine.getSnapshot();
    expect(snap.phase).toBe("active");
    expect(snap.delivered).toBe(true);
    expect(snap.notify).toEqual({ state: "sent", sent: 2, total: 2 });
    expect(snap.audio.uploaded).toBe(1);
  });

  test("without a GPS fix, contacts are texted after a short wait rather than never", async () => {
    vi.useFakeTimers();
    const t = setup();
    t.engine.startCountdown("user-1");
    t.engine.activate();
    await t.settle();
    expect(t.kinds()).not.toContain("notify:alert");

    await vi.advanceTimersByTimeAsync(NOTIFY_WAIT_FOR_FIX_MS);
    await t.settle();
    expect(t.kinds()).toContain("notify:alert");
  });

  test("a fix arriving during the wait sends the text straight away, with the location first", async () => {
    vi.useFakeTimers();
    const t = setup();
    t.engine.startCountdown("user-1");
    t.engine.activate();
    t.emitFix();
    await t.settle();
    expect(t.kinds()).toEqual(["incident.create", "incident.activate", "location", "notify:alert"]);
  });

  test("cancel marks the incident cancelled and throws away the audio", async () => {
    const t = setup();
    t.engine.startCountdown("user-1");
    t.emitClip(0);
    await t.engine.cancel();
    await t.settle();

    expect(t.kinds()).toEqual(["incident.create", "incident.cancel"]);
    expect(t.recorder.stop).toHaveBeenCalled();
    expect(t.engine.getSnapshot().phase).toBe("idle");
  });

  test("I am safe resolves the incident, tells the contacts, and stops capture", async () => {
    const t = setup();
    t.engine.startCountdown("user-1");
    t.emitFix();
    t.engine.activate();
    await t.settle();
    await t.engine.markSafe();
    await t.settle();

    expect(t.kinds().slice(-2)).toEqual(["incident.resolve", "notify:safe"]);
    expect(t.recorder.stop).toHaveBeenCalled();
    expect(t.tracker.stop).toHaveBeenCalled();
    expect(t.engine.getSnapshot().phase).toBe("idle");
  });

  test("the duress PIN looks like standing down but keeps recording and sharing", async () => {
    const t = setup();
    t.engine.startCountdown("user-1");
    t.emitFix();
    t.engine.activate();
    await t.settle();

    t.engine.enterDuress();
    t.tick(60_000);
    t.emitFix({ at: 1_060_000, lat: 9.04 });
    t.emitClip(3);
    await t.settle();

    expect(t.engine.getSnapshot().phase).toBe("duress");
    expect(t.recorder.stop).not.toHaveBeenCalled();
    const kinds = t.kinds();
    expect(kinds).toContain("incident.duress");
    expect(kinds).not.toContain("incident.resolve");
    expect(kinds).not.toContain("notify:safe");
    expect(kinds.filter((k) => k === "location")).toHaveLength(2);
    expect(kinds).toContain("evidence");
  });

  test("pressing SOS during a duress stand-down brings back the same alert, not a new one", async () => {
    const t = setup();
    t.engine.startCountdown("user-1");
    t.engine.activate();
    const incidentId = t.engine.getSnapshot().incidentId;
    t.engine.enterDuress();
    t.engine.startCountdown("user-1");
    await t.settle();

    const snap = t.engine.getSnapshot();
    expect(snap.phase).toBe("active");
    expect(snap.incidentId).toBe(incidentId);
    expect(t.kinds().filter((k) => k === "incident.create")).toHaveLength(1);
  });

  test("location is only sent again after moving or after the heartbeat interval", async () => {
    const t = setup();
    t.engine.startCountdown("user-1");
    t.engine.activate();
    t.emitFix({ at: 1_000_000 });
    t.emitFix({ at: 1_005_000 }); // same place, 5s later
    t.emitFix({ at: 1_015_000, lat: 9.0305 }); // ~55 m, 15s later
    t.emitFix({ at: 1_020_000, lat: 9.0305 }); // same place, 5s later
    t.emitFix({ at: 1_046_000, lat: 9.0305 }); // same place, 31s after the last send
    await t.settle();
    expect(t.kinds().filter((k) => k === "location")).toHaveLength(3);
  });

  test("an alert survives a reload: capture restarts and nothing is sent twice", async () => {
    const storage = memoryStorage();
    const first = setup({ storage });
    first.engine.startCountdown("user-1");
    first.emitFix();
    first.engine.activate();
    await first.settle();

    const second = setup({ storage });
    second.engine.restore("user-1");
    await second.settle();

    const snap = second.engine.getSnapshot();
    expect(snap.phase).toBe("active");
    expect(snap.delivered).toBe(true);
    expect(second.recorder.start).toHaveBeenCalled();
    expect(second.tracker.start).toHaveBeenCalled();
    expect(second.kinds()).not.toContain("notify:alert");
  });

  test("a countdown cut short by a reload is treated as a request for help", async () => {
    const storage = memoryStorage();
    const first = setup({ storage });
    first.engine.startCountdown("user-1");

    const second = setup({ storage });
    second.engine.restore("user-1");
    await second.settle();
    expect(second.engine.getSnapshot().phase).toBe("active");
    expect(second.kinds()).toContain("incident.activate");
  });

  test("another account's saved alert is not restored", () => {
    const storage = memoryStorage();
    const first = setup({ storage });
    first.engine.startCountdown("user-1");

    const second = setup({ storage });
    second.engine.restore("user-2");
    expect(second.engine.getSnapshot().phase).toBe("idle");
  });

  test("the snapshot says when contacts could not be texted", async () => {
    const t = setup({ notifyResult: { status: "not_configured", sent: 0, failed: 0, total: 2 } });
    t.engine.startCountdown("user-1");
    t.emitFix();
    t.engine.activate();
    await t.settle();
    expect(t.engine.getSnapshot().notify.state).toBe("not_configured");
  });
});
