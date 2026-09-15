import { afterEach, describe, expect, test, vi } from "vitest";
import { distanceMeters, shouldSend } from "@/lib/sos/location";
import { checkPin, clearPins, hasPins, savePins } from "@/lib/sos/pin";
import { fallbackMessage, smsHref } from "@/lib/sos/contacts";
import { evidencePath } from "@/lib/sos/executor";
import { SegmentRecorder, type AudioClip, type AudioStatus } from "@/lib/sos/recorder";
import { describeAlert } from "@/lib/sos/wording";
import type { SOSSnapshot } from "@/lib/sos/engine";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe("location throttling", () => {
  const at = (ms: number, lat = 9.03) => ({ lat, lng: 38.74, accuracy: 10, at: ms });

  test("distance is roughly right", () => {
    expect(distanceMeters({ lat: 9.03, lng: 38.74 }, { lat: 9.0309, lng: 38.74 })).toBeGreaterThan(95);
    expect(distanceMeters({ lat: 9.03, lng: 38.74 }, { lat: 9.0309, lng: 38.74 })).toBeLessThan(105);
  });

  test("the first fix is always sent", () => expect(shouldSend(null, at(0))).toBe(true));
  test("standing still is sent every 30 seconds", () => {
    expect(shouldSend(at(0), at(20_000))).toBe(false);
    expect(shouldSend(at(0), at(30_000))).toBe(true);
  });
  test("moving is sent sooner, but not more than every 10 seconds", () => {
    expect(shouldSend(at(0), at(5_000, 9.031))).toBe(false);
    expect(shouldSend(at(0), at(12_000, 9.031))).toBe(true);
  });
  test("an older fix is never sent after a newer one", () => expect(shouldSend(at(50_000), at(10_000))).toBe(false));
});

describe("I am safe PIN", () => {
  test("with no PIN set, any entry counts as safe", async () => {
    expect(await checkPin("u", "0000", memoryStorage())).toBe("safe");
  });

  test("tells the safe PIN, the duress PIN and a wrong PIN apart", async () => {
    const storage = memoryStorage();
    await savePins("u", "1234", "9999", storage);
    expect(hasPins("u", storage)).toEqual({ safe: true, duress: true });
    expect(await checkPin("u", "1234", storage)).toBe("safe");
    expect(await checkPin("u", "9999", storage)).toBe("duress");
    expect(await checkPin("u", "1111", storage)).toBe("wrong");
    expect(storage.getItem("haven-pins:u")).not.toContain("1234");
  });

  test("rejects short PINs and a duress PIN equal to the safe PIN", async () => {
    const storage = memoryStorage();
    await expect(savePins("u", "12", null, storage)).rejects.toThrow();
    await expect(savePins("u", "1234", "1234", storage)).rejects.toThrow();
  });

  test("PINs are per account and can be removed", async () => {
    const storage = memoryStorage();
    await savePins("u", "1234", null, storage);
    expect(hasPins("other", storage).safe).toBe(false);
    clearPins("u", storage);
    expect(hasPins("u", storage).safe).toBe(false);
  });
});

describe("text-it-yourself fallback", () => {
  test("builds an sms: link with every contact and the message", () => {
    const href = smsHref(["+251 911 000 000", "0922-111-111"], "help", "Android");
    expect(href).toBe("sms:+251911000000,0922111111?body=help");
  });

  test("uses the iOS body separator on iPhones", () => {
    expect(smsHref(["+251911000000"], "help me", "iPhone")).toBe("sms:+251911000000&body=help%20me");
  });

  test("the message includes a map link when there is a fix", () => {
    expect(fallbackMessage("Hana", 9.03, 38.74)).toBe(
      "SOS. This is Hana. I need help now. My location: https://maps.google.com/?q=9.03000,38.74000",
    );
    expect(fallbackMessage(null, null, null)).toBe("SOS. I need help now.");
  });
});

describe("evidence storage paths", () => {
  test("clips sit under the user's folder so storage policies apply, in playback order", () => {
    expect(evidencePath("u1", "inc", 7, "audio/webm;codecs=opus")).toBe("u1/inc/0007.webm");
    expect(evidencePath("u1", "inc", 12, "audio/mp4")).toBe("u1/inc/0012.m4a");
  });
});

describe("segmented recorder", () => {
  afterEach(() => vi.useRealTimers());

  function fakes() {
    const track = { stop: vi.fn(), onended: null as null | (() => void) };
    const stream = { getAudioTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    class FakeRecorder {
      static isTypeSupported = (t: string) => t === "audio/webm";
      state = "inactive";
      mimeType: string;
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      constructor(_s: MediaStream, opts?: { mimeType?: string }) {
        this.mimeType = opts?.mimeType ?? "";
      }
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob(["audio"]) });
        this.onstop?.();
      }
    }
    return { track, stream, FakeRecorder: FakeRecorder as unknown as typeof MediaRecorder };
  }

  test("hands over one playable clip per segment and stops at the cap", async () => {
    vi.useFakeTimers();
    const { stream, track, FakeRecorder } = fakes();
    const clips: AudioClip[] = [];
    const statuses: AudioStatus[] = [];
    const rec = new SegmentRecorder({
      segmentMs: 10_000,
      maxMs: 25_000,
      onClip: (c) => clips.push(c),
      onStatus: (s) => statuses.push(s),
      getUserMedia: async () => stream,
      MediaRecorderImpl: FakeRecorder,
    });

    await rec.start();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(clips.map((c) => c.seq)).toEqual([0, 1, 2]);
    expect(clips.every((c) => c.mimeType === "audio/webm" && c.blob.size > 0)).toBe(true);
    expect(statuses).toContain("recording");
    expect(statuses.at(-1)).toBe("capped");
    expect(track.stop).toHaveBeenCalled();
  });

  test("stop hands over the clip in progress", async () => {
    vi.useFakeTimers();
    const { stream, FakeRecorder } = fakes();
    const clips: AudioClip[] = [];
    const rec = new SegmentRecorder({
      segmentMs: 10_000,
      maxMs: 600_000,
      startSeq: 5,
      onClip: (c) => clips.push(c),
      onStatus: () => {},
      getUserMedia: async () => stream,
      MediaRecorderImpl: FakeRecorder,
    });
    await rec.start();
    await vi.advanceTimersByTimeAsync(4_000);
    await rec.stop();
    expect(clips.map((c) => c.seq)).toEqual([5]);
  });

  test("reports a refused microphone instead of failing silently", async () => {
    const { FakeRecorder } = fakes();
    const statuses: AudioStatus[] = [];
    const rec = new SegmentRecorder({
      segmentMs: 10_000,
      maxMs: 600_000,
      onClip: () => {},
      onStatus: (s) => statuses.push(s),
      getUserMedia: async () => {
        throw Object.assign(new Error("no"), { name: "NotAllowedError" });
      },
      MediaRecorderImpl: FakeRecorder,
    });
    await rec.start();
    expect(statuses.at(-1)).toBe("denied");
  });
});

describe("alert screen wording", () => {
  const base: SOSSnapshot = {
    phase: "active",
    incidentId: "i",
    referenceNumber: "HVN-1",
    startedAt: 0,
    activatedAt: 0,
    online: true,
    pending: 0,
    pendingClips: 0,
    delivered: true,
    notify: { state: "sent", sent: 2, total: 2 },
    audio: { status: "recording", clips: 1, uploaded: 1 },
    location: { status: "ok", lastFix: null, lastSentAt: null },
  };

  test("never claims contacts were told when they were not", () => {
    for (const state of ["not_configured", "no_contacts", "failed", "retrying", "rate_limited"] as const) {
      const copy = describeAlert({ ...base, notify: { state, sent: 0, total: 2 } });
      expect(copy.title).not.toMatch(/texted|notified|on the way/i);
      expect(copy.urgent).toBe(true);
    }
  });

  test("offline and undelivered says so, and asks the user to call", () => {
    const copy = describeAlert({ ...base, online: false, delivered: false });
    expect(copy.title).toBe("Waiting for signal");
    expect(copy.urgent).toBe(true);
  });

  test("says how many contacts were texted when they were", () => {
    expect(describeAlert(base).title).toBe("2 contacts have been texted");
    expect(describeAlert({ ...base, notify: { state: "sent", sent: 1, total: 1 } }).title).toBe("Your contact has been texted");
  });
});
