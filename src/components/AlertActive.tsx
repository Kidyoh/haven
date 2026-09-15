import { useEffect, useState } from "react";
import { MapPin, MessageSquare, Mic, Phone, Radio, RotateCw, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useHold } from "@/hooks/useHold";
import type { SOSSnapshot } from "@/lib/sos/engine";
import { fallbackMessage, smsHref, type CachedContact } from "@/lib/sos/contacts";
import { describeAlert } from "@/lib/sos/wording";

/**
 * The screen while an alert runs. Every line on it is read from the engine,
 * so it only ever says what has actually happened: if contacts have not been
 * texted, it says so and puts "call" and "text them yourself" first.
 */

interface AlertActiveProps {
  sos: SOSSnapshot;
  /** Called once "I am safe" has been held. The page decides whether a PIN is needed. */
  onSafe: () => void;
  onResumeAudio?: () => void;
  contacts?: CachedContact[];
  firstName?: string | null;
  emergencyNumber?: string;
}

const SAFE_HOLD_MS = 1500;

type RowTone = "ok" | "busy" | "warn";

const AlertActive = ({
  sos,
  onSafe,
  onResumeAudio,
  contacts = [],
  firstName = null,
  emergencyNumber = "991",
}: AlertActiveProps) => {
  const now = useNow();
  const elapsed = Math.max(0, Math.floor((now - (sos.activatedAt ?? sos.startedAt ?? now)) / 1000));
  const status = describeAlert(sos);
  const safeHold = useHold({ durationMs: SAFE_HOLD_MS, onComplete: onSafe });

  const fix = sos.location.lastFix;
  const textHref =
    contacts.length > 0
      ? smsHref(
          contacts.map((c) => c.phone),
          fallbackMessage(firstName, fix?.lat ?? null, fix?.lng ?? null),
        )
      : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-6 px-5 py-8">
        {/* What is happening, in one sentence */}
        <header className="order-1 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-sos/10 px-4 py-2">
            <span className="h-2 w-2 animate-alert-pulse rounded-full bg-sos" />
            <span className="text-sm font-semibold uppercase tracking-wider text-sos">Alert active</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground" aria-live="polite">
            {status.title}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{status.detail}</p>
          <p className="tabular mt-3 font-mono text-xs text-muted-foreground" aria-live="off">
            {formatDuration(elapsed)} since you sent it
            {sos.referenceNumber && <> · {sos.referenceNumber}</>}
          </p>
        </header>

        {/* Do-it-yourself fallback: first when nobody has been reached */}
        <div className={cn("grid grid-cols-2 gap-2", status.urgent ? "order-2" : "order-4")}>
          <Button asChild variant={status.urgent ? "sos" : "subtle"} size="lg">
            <a href={`tel:${emergencyNumber}`}>
              <Phone />
              Call {emergencyNumber}
            </a>
          </Button>
          {textHref ? (
            <Button asChild variant={status.urgent ? "gold" : "subtle"} size="lg">
              <a href={textHref}>
                <MessageSquare />
                Text contacts
              </a>
            </Button>
          ) : (
            <Button variant="subtle" size="lg" disabled>
              <MessageSquare />
              No contacts
            </Button>
          )}
        </div>

        {/* Each part of the alert, and whether it is working */}
        <ul className="order-3 space-y-2.5" aria-label="Alert status">
          <StatusRow icon={<Radio />} label="Alert" {...alertRow(sos)} />
          <StatusRow icon={<Users />} label="Contacts" {...contactsRow(sos)} />
          <StatusRow
            icon={<Mic />}
            label="Audio"
            {...audioRow(sos)}
            action={
              onResumeAudio && ["denied", "interrupted", "error"].includes(sos.audio.status) ? (
                <Button size="sm" variant="subtle" onClick={onResumeAudio}>
                  <RotateCw />
                  Retry
                </Button>
              ) : undefined
            }
          />
          <StatusRow icon={<MapPin />} label="Location" {...locationRow(sos, now)} />
        </ul>

        <div className="order-5 mt-auto space-y-2">
          <button
            {...safeHold.handlers}
            style={{ touchAction: "none", WebkitTouchCallout: "none" }}
            className="relative flex h-16 w-full select-none items-center justify-center gap-2 overflow-hidden rounded-2xl bg-safe font-display text-xl font-bold tracking-wide text-ink animate-safe-glow focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-safe/50"
          >
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 bg-ink/15"
              style={{ width: `${safeHold.progress * 100}%` }}
            />
            <ShieldCheck className="relative h-5 w-5" />
            <span className="relative">I AM SAFE</span>
          </button>
          <p className="text-center text-xs text-muted-foreground">
            {safeHold.holding ? "Keep holding…" : "Press and hold to end the alert"}
          </p>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Row wording. Pure functions of the snapshot, like describeAlert.
// ---------------------------------------------------------------------------

type Row = { status: string; tone: RowTone };

function alertRow(sos: SOSSnapshot): Row {
  if (sos.delivered) return { status: "Delivered", tone: "ok" };
  return sos.online ? { status: "Sending…", tone: "busy" } : { status: "Saved, waiting for signal", tone: "warn" };
}

function contactsRow({ notify }: SOSSnapshot): Row {
  switch (notify.state) {
    case "sent":
      return { status: `Texted ${notify.sent} of ${notify.total}`, tone: "ok" };
    case "partial":
      return { status: `Texted ${notify.sent} of ${notify.total}, retrying`, tone: "warn" };
    case "retrying":
    case "failed":
      return { status: "Not reached, retrying", tone: "warn" };
    case "not_configured":
      return { status: "SMS not set up", tone: "warn" };
    case "no_contacts":
      return { status: "None saved", tone: "warn" };
    case "rate_limited":
      return { status: "Not texted again", tone: "warn" };
    case "skipped":
      return { status: "Not texted", tone: "warn" };
    case "waiting":
      return { status: "Waiting for your location", tone: "busy" };
    default:
      return { status: "Texting…", tone: "busy" };
  }
}

function audioRow({ audio, pendingClips }: SOSSnapshot): Row {
  const clips = `${audio.clips} clip${audio.clips === 1 ? "" : "s"}`;
  const waiting = pendingClips > 0 ? `, ${pendingClips} to upload` : "";
  switch (audio.status) {
    case "recording":
      return { status: `Recording · ${clips}${waiting}`, tone: "ok" };
    case "starting":
      return { status: "Starting…", tone: "busy" };
    case "capped":
      return { status: `Stopped at 10 min · ${clips}${waiting}`, tone: "ok" };
    case "denied":
      return { status: "Microphone blocked", tone: "warn" };
    case "interrupted":
      return { status: "Paused by your phone", tone: "warn" };
    case "unsupported":
      return { status: "Not available on this phone", tone: "warn" };
    case "error":
      return { status: "Could not start", tone: "warn" };
    default:
      return { status: audio.clips > 0 ? `${clips}${waiting}` : "Off", tone: "busy" };
  }
}

function locationRow({ location, online }: SOSSnapshot, now: number): Row {
  switch (location.status) {
    case "denied":
      return { status: "Location blocked", tone: "warn" };
    case "unavailable":
      return { status: "No GPS signal", tone: "warn" };
    case "ok": {
      const fix = location.lastFix;
      const accuracy = fix ? ` · ±${Math.round(fix.accuracy)} m` : "";
      if (location.lastSentAt === null) return { status: `Found${accuracy}`, tone: "busy" };
      const ago = formatAgo(now - location.lastSentAt);
      return online
        ? { status: `Shared ${ago}${accuracy}`, tone: "ok" }
        : { status: `Saved ${ago}, waiting for signal`, tone: "warn" };
    }
    default:
      return { status: "Finding you…", tone: "busy" };
  }
}

const TONE_DOT: Record<RowTone, string> = {
  ok: "bg-safe",
  busy: "bg-muted-foreground animate-alert-pulse",
  warn: "bg-warning",
};

const StatusRow = ({
  icon,
  label,
  status,
  tone,
  action,
}: {
  icon: React.ReactNode;
  label: string;
  status: string;
  tone: RowTone;
  action?: React.ReactNode;
}) => (
  <li className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
    <span className="text-muted-foreground [&_svg]:h-5 [&_svg]:w-5">{icon}</span>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className={cn("mt-0.5 flex items-center gap-2 text-xs", tone === "warn" ? "text-warning" : "text-muted-foreground")}>
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TONE_DOT[tone])} />
        {status}
      </p>
    </div>
    {action}
  </li>
);

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function formatDuration(secs: number) {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatAgo(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)} min ago`;
}

export default AlertActive;
