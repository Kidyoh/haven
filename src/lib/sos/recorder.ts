/**
 * Records audio as a run of short, independently playable clips.
 *
 * A MediaRecorder's timeslice chunks are not playable on their own (only the
 * first carries the container header), so each clip is a fresh recorder on
 * the same microphone stream. The gap between clips is a few milliseconds.
 * Each finished clip is handed over immediately, so a phone that is grabbed
 * or goes dark loses at most the clip in progress.
 */

export type AudioStatus =
  | "idle"
  | "starting"
  | "recording"
  | "denied" // permission refused
  | "unsupported" // no microphone or no MediaRecorder
  | "interrupted" // the OS took the mic (a call, another app)
  | "capped" // reached the maximum length
  | "stopped"
  | "error";

export interface AudioClip {
  seq: number;
  blob: Blob;
  mimeType: string;
  startedAt: number;
  durationMs: number;
}

export interface RecorderOptions {
  segmentMs: number;
  maxMs: number;
  startSeq?: number;
  /** Milliseconds already recorded in this incident (after a reload). */
  recordedMs?: number;
  onClip: (clip: AudioClip) => void;
  onStatus: (status: AudioStatus) => void;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  MediaRecorderImpl?: typeof MediaRecorder;
  now?: () => number;
}

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac", "audio/ogg;codecs=opus"];

export function pickMimeType(Impl: typeof MediaRecorder | undefined): string {
  if (!Impl || typeof Impl.isTypeSupported !== "function") return "";
  return MIME_CANDIDATES.find((t) => Impl.isTypeSupported(t)) ?? "";
}

export class SegmentRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private seq: number;
  private recordedMs: number;
  private status: AudioStatus = "idle";
  private finished: Promise<void> = Promise.resolve();
  private readonly now: () => number;

  constructor(private readonly opts: RecorderOptions) {
    this.seq = opts.startSeq ?? 0;
    this.recordedMs = opts.recordedMs ?? 0;
    this.now = opts.now ?? Date.now;
  }

  get nextSeq() {
    return this.seq;
  }

  get totalMs() {
    return this.recordedMs;
  }

  async start(): Promise<void> {
    if (this.running) return;
    if (this.recordedMs >= this.opts.maxMs) return this.setStatus("capped");

    const Impl = this.opts.MediaRecorderImpl ?? (typeof MediaRecorder === "undefined" ? undefined : MediaRecorder);
    const getUserMedia =
      this.opts.getUserMedia ??
      (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia
        ? (c: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(c)
        : undefined);
    if (!Impl || !getUserMedia) return this.setStatus("unsupported");

    this.running = true;
    this.setStatus("starting");
    try {
      // Evidence wants the room, not a clean voice call: no noise suppression.
      this.stream = await getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
      });
    } catch (err) {
      this.running = false;
      const name = (err as { name?: string })?.name;
      return this.setStatus(
        name === "NotAllowedError" || name === "SecurityError"
          ? "denied"
          : name === "NotFoundError"
            ? "unsupported"
            : "error",
      );
    }

    // stop() may have been called while the permission prompt was open.
    if (!this.running) {
      this.releaseStream();
      return;
    }

    this.stream.getAudioTracks().forEach((track) => {
      track.onended = () => {
        if (!this.running) return;
        this.running = false;
        this.endSegment();
        this.setStatus("interrupted");
      };
    });

    this.setStatus("recording");
    this.beginSegment(Impl);
  }

  /** Stop recording. Resolves once the last clip has been handed over. */
  async stop(): Promise<void> {
    const wasRunning = this.running;
    this.running = false;
    this.endSegment();
    // onstop has been seen never to fire on some mobile browsers; do not hang on it.
    await Promise.race([this.finished, new Promise((r) => setTimeout(r, 3000))]);
    this.releaseStream();
    if (wasRunning || this.status === "starting") this.setStatus("stopped");
  }

  private beginSegment(Impl: typeof MediaRecorder) {
    if (!this.stream) return;
    const mimeType = pickMimeType(Impl);
    let recorder: MediaRecorder;
    try {
      recorder = mimeType ? new Impl(this.stream, { mimeType }) : new Impl(this.stream);
    } catch {
      this.running = false;
      this.releaseStream();
      return this.setStatus("error");
    }

    const chunks: Blob[] = [];
    const startedAt = this.now();
    const seq = this.seq++;
    let resolveFinished!: () => void;
    this.finished = new Promise((resolve) => (resolveFinished = resolve));

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      const durationMs = this.now() - startedAt;
      this.recordedMs += durationMs;
      const type = recorder.mimeType || mimeType;
      if (chunks.length > 0) {
        this.opts.onClip({ seq, blob: new Blob(chunks, { type }), mimeType: type, startedAt, durationMs });
      }
      if (this.recorder === recorder) this.recorder = null;
      resolveFinished();

      if (!this.running) return;
      if (this.recordedMs >= this.opts.maxMs) {
        this.running = false;
        this.releaseStream();
        this.setStatus("capped");
        return;
      }
      this.beginSegment(Impl);
    };

    this.recorder = recorder;
    recorder.start(1000);
    const budget = Math.max(1000, this.opts.maxMs - this.recordedMs);
    this.timer = setTimeout(() => this.endSegment(), Math.min(this.opts.segmentMs, budget));
  }

  private endSegment() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const recorder = this.recorder;
    if (!recorder || recorder.state === "inactive") return;
    try {
      recorder.stop();
    } catch {
      this.recorder = null;
    }
  }

  private releaseStream() {
    this.stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    this.stream = null;
  }

  private setStatus(status: AudioStatus) {
    this.status = status;
    this.opts.onStatus(status);
  }
}
