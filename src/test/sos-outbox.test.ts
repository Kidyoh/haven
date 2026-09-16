import { describe, expect, test, vi } from "vitest";
import { Outbox, createMemoryStore, type ExecResult, type OutboxOp } from "@/lib/sos/outbox";

const create = (incidentId: string): OutboxOp => ({
  kind: "incident.create",
  incidentId,
  row: { id: incidentId, user_id: "u", reference_number: "HVN-1", signal_strength: "online" },
});
const activate = (incidentId: string): OutboxOp => ({ kind: "incident.activate", incidentId, at: 1, batteryLevel: null });
const resolve = (incidentId: string): OutboxOp => ({ kind: "incident.resolve", incidentId, at: 2 });
const notify = (incidentId: string): OutboxOp => ({ kind: "notify", incidentId, notify: "alert" });
const location = (incidentId: string, id = "l1"): OutboxOp => ({
  kind: "location",
  incidentId,
  id,
  userId: "u",
  fix: { lat: 9, lng: 38, accuracy: 10, at: 1 },
});
const clip = (incidentId: string, seq = 0): OutboxOp => ({
  kind: "evidence",
  incidentId,
  userId: "u",
  seq,
  blob: new Blob(["a"]),
  mimeType: "audio/webm",
  startedAt: 1,
  durationMs: 10_000,
});

function setup(fail: (op: OutboxOp) => boolean = () => false, opts: { online?: boolean; maxAttempts?: number } = {}) {
  const sent: string[] = [];
  const executor = vi.fn(async (op: OutboxOp): Promise<ExecResult> => {
    if (fail(op)) throw new Error(`fail ${op.kind}`);
    sent.push(`${op.kind}:${op.incidentId}`);
    return { done: true };
  });
  const onDrop = vi.fn();
  const store = createMemoryStore();
  const outbox = new Outbox(store, executor, {
    autoFlush: false,
    isOnline: () => opts.online ?? true,
    maxAttempts: opts.maxAttempts ?? 3,
    onDrop,
  });
  return { outbox, store, sent, executor, onDrop };
}

describe("SOS outbox", () => {
  test("sends in queue order and clears what was sent", async () => {
    const { outbox, store, sent } = setup();
    for (const op of [create("a"), activate("a"), location("a"), notify("a")]) await outbox.enqueue(op);
    await outbox.flush();
    expect(sent).toEqual(["incident.create:a", "incident.activate:a", "location:a", "notify:a"]);
    expect(await store.all()).toHaveLength(0);
  });

  test("audio clips go after everything else, so uploads never delay the alert", async () => {
    const { outbox, sent } = setup();
    await outbox.enqueue(create("a"));
    await outbox.enqueue(clip("a"));
    await outbox.enqueue(activate("a"));
    await outbox.enqueue(notify("a"));
    await outbox.flush();
    expect(sent).toEqual(["incident.create:a", "incident.activate:a", "notify:a", "evidence:a"]);
  });

  test("a failed create holds back everything for that incident, and nothing for others", async () => {
    const { outbox, store, sent } = setup((op) => op.kind === "incident.create" && op.incidentId === "a");
    for (const op of [create("a"), location("a"), clip("a"), create("b"), activate("b")]) await outbox.enqueue(op);
    await outbox.flush();
    expect(sent).toEqual(["incident.create:b", "incident.activate:b"]);
    expect((await store.all()).map((r) => r.op.kind)).toEqual(["incident.create", "location", "evidence"]);
  });

  test("a failed status change holds back later status changes and notifications, not locations", async () => {
    let activateFails = true;
    const { outbox, sent } = setup((op) => op.kind === "incident.activate" && activateFails);
    await outbox.enqueue(activate("a"));
    await outbox.enqueue(location("a"));
    await outbox.enqueue(notify("a"));
    await outbox.enqueue(resolve("a"));
    await outbox.flush();
    // resolve must not land before activate, or activate would re-open a resolved incident
    expect(sent).toEqual(["location:a"]);

    activateFails = false;
    await outbox.flush();
    expect(sent).toEqual(["location:a", "incident.activate:a", "notify:a", "incident.resolve:a"]);
  });

  test("a failing notification never holds back I am safe", async () => {
    const { outbox, sent } = setup((op) => op.kind === "notify");
    await outbox.enqueue(notify("a"));
    await outbox.enqueue(resolve("a"));
    await outbox.flush();
    expect(sent).toEqual(["incident.resolve:a"]);
  });

  test("status changes are never given up on, however long they fail", async () => {
    const { outbox, store, onDrop } = setup((op) => op.kind === "incident.create", { maxAttempts: 2 });
    await outbox.enqueue(create("a"));
    for (let i = 0; i < 5; i++) await outbox.flush();
    expect(await store.all()).toHaveLength(1);
    expect(onDrop).not.toHaveBeenCalled();
  });

  test("a partly finished op (done: false) is kept and retried", async () => {
    let calls = 0;
    const store = createMemoryStore();
    const outbox = new Outbox(
      store,
      async () => {
        calls += 1;
        return { done: calls > 1 };
      },
      { autoFlush: false, isOnline: () => true },
    );
    await outbox.enqueue(notify("a"));
    await outbox.flush();
    expect(await store.all()).toHaveLength(1);
    await outbox.flush();
    expect(await store.all()).toHaveLength(0);
  });

  test("failures while offline do not use up attempts", async () => {
    const { outbox, store, onDrop } = setup(() => true, { online: false, maxAttempts: 2 });
    await outbox.enqueue(location("a"));
    for (let i = 0; i < 5; i++) await outbox.flush();
    const [record] = await store.all();
    expect(record.attempts).toBe(0);
    expect(onDrop).not.toHaveBeenCalled();
  });

  test("an op that keeps failing while online is eventually given up on", async () => {
    const { outbox, store, onDrop } = setup((op) => op.kind === "location", { maxAttempts: 2 });
    await outbox.enqueue(location("a"));
    await outbox.flush();
    await outbox.flush();
    expect(await store.all()).toHaveLength(0);
    expect(onDrop).toHaveBeenCalledTimes(1);
  });

  test("concurrent flushes never send the same op twice", async () => {
    const { outbox, executor } = setup();
    await outbox.enqueue(create("a"));
    await Promise.all([outbox.flush(), outbox.flush(), outbox.flush()]);
    expect(executor).toHaveBeenCalledTimes(1);
  });
});
