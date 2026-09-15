/**
 * Response analytics. Pure functions over the per-incident rows returned by
 * get_incident_analytics(), so every chart and number on the tab is computed
 * from one slice and they always agree.
 *
 * Vocabulary:
 *   alert      an incident that was actually sent (status active or resolved)
 *   cancelled  the countdown was stopped; nothing was sent
 *
 * Times are bucketed in East Africa Time. Ethiopia has no daylight saving, so a
 * fixed +3h offset is exact and avoids Intl on every row.
 */

export interface IncidentRow {
  id: string;
  user_id: string;
  status: string;
  created_at: string;
  activated_at: string | null;
  resolved_at: string | null;
  duress_at: string | null;
  battery_level: number | null;
  signal_strength: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy_meters: number | null;
  location_fixes: number;
  clips: number;
  audio_seconds: number;
  sms_sent: number;
  sms_failed: number;
  contacts_reached: number;
}

export type RangeKey = "7d" | "30d" | "90d" | "365d";

export const RANGES: { key: RangeKey; days: number; label: string; bucket: "day" | "week" | "month" }[] = [
  { key: "7d", days: 7, label: "Last 7 days", bucket: "day" },
  { key: "30d", days: 30, label: "Last 30 days", bucket: "day" },
  { key: "90d", days: 90, label: "Last 90 days", bucket: "week" },
  { key: "365d", days: 365, label: "Last 12 months", bucket: "month" },
];

export const TIME_ZONE_LABEL = "East Africa Time";
const TZ_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const ms = (iso: string) => new Date(iso).getTime();
const localDay = (t: number) => Math.floor((t + TZ_OFFSET_MS) / DAY_MS);
/** 0 = Monday … 6 = Sunday. 1970-01-01 was a Thursday. */
const weekdayOf = (t: number) => (localDay(t) + 3) % 7;
const hourOf = (t: number) => new Date(t + TZ_OFFSET_MS).getUTCHours();

export const isAlert = (r: IncidentRow) => r.status === "active" || r.status === "resolved";

export function rangeBounds(key: RangeKey, now: number) {
  const days = RANGES.find((r) => r.key === key)!.days;
  const start = now - days * DAY_MS;
  return { start, end: now, prevStart: start - days * DAY_MS, days };
}

/** Rows from the current window and the one before it, for deltas. */
export function splitByWindow(rows: IncidentRow[], key: RangeKey, now: number) {
  const { start, prevStart } = rangeBounds(key, now);
  const current: IncidentRow[] = [];
  const previous: IncidentRow[] = [];
  for (const r of rows) {
    const t = ms(r.created_at);
    if (t >= start && t <= now) current.push(r);
    else if (t >= prevStart && t < start) previous.push(r);
  }
  return { current, previous };
}

export function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function resolveMinutes(r: IncidentRow): number | null {
  if (r.status !== "resolved" || !r.resolved_at) return null;
  const from = ms(r.activated_at ?? r.created_at);
  const minutes = (ms(r.resolved_at) - from) / 60_000;
  return minutes >= 0 ? minutes : null;
}

const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : null);

export interface Summary {
  alerts: number;
  cancelled: number;
  /** Share of started countdowns that were cancelled. */
  cancelRate: number | null;
  open: number;
  duress: number;
  people: number;
  repeatPeople: number;
  resolve: { median: number | null; p90: number | null; count: number };
  sms: { sent: number; failed: number; alertsReached: number; reachRate: number | null; deliveryRate: number | null };
  evidence: { withAudio: number; coverage: number | null; audioMinutes: number };
  location: { withFix: number; coverage: number | null; medianAccuracy: number | null; medianFixes: number | null };
  conditions: { offline: number; offlineRate: number | null; lowBattery: number; batteryKnown: number };
}

export function summarize(rows: IncidentRow[]): Summary {
  const alerts = rows.filter(isAlert);
  const cancelled = rows.filter((r) => r.status === "cancelled").length;

  const perPerson = new Map<string, number>();
  for (const r of alerts) perPerson.set(r.user_id, (perPerson.get(r.user_id) ?? 0) + 1);

  const resolveTimes = alerts.map(resolveMinutes).filter((m): m is number => m !== null);
  const sent = alerts.reduce((n, r) => n + r.sms_sent, 0);
  const failed = alerts.reduce((n, r) => n + r.sms_failed, 0);
  const alertsReached = alerts.filter((r) => r.contacts_reached > 0).length;
  const withAudio = alerts.filter((r) => r.clips > 0).length;
  const withFix = alerts.filter((r) => r.latitude !== null && r.longitude !== null).length;
  const accuracies = alerts.map((r) => r.accuracy_meters).filter((a): a is number => a !== null);
  const fixes = alerts.filter((r) => r.location_fixes > 0).map((r) => r.location_fixes);
  const batteries = alerts.map((r) => r.battery_level).filter((b): b is number => b !== null);
  const offline = alerts.filter((r) => r.signal_strength === "offline").length;

  return {
    alerts: alerts.length,
    cancelled,
    cancelRate: ratio(cancelled, alerts.length + cancelled),
    open: alerts.filter((r) => r.status === "active").length,
    duress: alerts.filter((r) => r.duress_at !== null).length,
    people: perPerson.size,
    repeatPeople: [...perPerson.values()].filter((n) => n > 1).length,
    resolve: { median: quantile(resolveTimes, 0.5), p90: quantile(resolveTimes, 0.9), count: resolveTimes.length },
    sms: {
      sent,
      failed,
      alertsReached,
      reachRate: ratio(alertsReached, alerts.length),
      deliveryRate: ratio(sent, sent + failed),
    },
    evidence: {
      withAudio,
      coverage: ratio(withAudio, alerts.length),
      audioMinutes: Math.round(alerts.reduce((n, r) => n + r.audio_seconds, 0) / 60),
    },
    location: {
      withFix,
      coverage: ratio(withFix, alerts.length),
      medianAccuracy: quantile(accuracies, 0.5),
      medianFixes: quantile(fixes, 0.5),
    },
    conditions: {
      offline,
      offlineRate: ratio(offline, alerts.length),
      lowBattery: batteries.filter((b) => b <= 20).length,
      batteryKnown: batteries.length,
    },
  };
}

export interface Bucket {
  key: string;
  label: string;
  /** Longer label for tooltips and the table view. */
  detail: string;
  value: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayLabel(day: number) {
  const d = new Date(day * DAY_MS);
  return { short: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`, weekday: WEEKDAYS[(day + 3) % 7] };
}

/** Alerts per day, week or month across the window, zero-filled. */
export function volumeSeries(rows: IncidentRow[], key: RangeKey, now: number): Bucket[] {
  const range = RANGES.find((r) => r.key === key)!;
  const alerts = rows.filter(isAlert).map((r) => ms(r.created_at));
  const today = localDay(now);

  if (range.bucket === "day") {
    const first = today - range.days + 1;
    const counts = new Array(range.days).fill(0);
    for (const t of alerts) {
      const i = localDay(t) - first;
      if (i >= 0 && i < counts.length) counts[i] += 1;
    }
    return counts.map((value, i) => {
      const { short, weekday } = dayLabel(first + i);
      return {
        key: String(first + i),
        label: range.days <= 7 ? weekday : short,
        detail: `${weekday} ${short}`,
        value,
      };
    });
  }

  if (range.bucket === "week") {
    // Weeks start on Monday.
    const thisMonday = today - ((today + 3) % 7);
    const weeks = Math.ceil(range.days / 7);
    const firstMonday = thisMonday - (weeks - 1) * 7;
    const counts = new Array(weeks).fill(0);
    for (const t of alerts) {
      const i = Math.floor((localDay(t) - firstMonday) / 7);
      if (i >= 0 && i < weeks) counts[i] += 1;
    }
    return counts.map((value, i) => {
      const { short } = dayLabel(firstMonday + i * 7);
      return { key: String(firstMonday + i * 7), label: short, detail: `Week of ${short}`, value };
    });
  }

  const nowLocal = new Date(now + TZ_OFFSET_MS);
  const months: { y: number; m: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth() - i, 1));
    months.push({ y: d.getUTCFullYear(), m: d.getUTCMonth() });
  }
  const counts = new Array(12).fill(0);
  for (const t of alerts) {
    const d = new Date(t + TZ_OFFSET_MS);
    const i = months.findIndex((mm) => mm.y === d.getUTCFullYear() && mm.m === d.getUTCMonth());
    if (i >= 0) counts[i] += 1;
  }
  return counts.map((value, i) => ({
    key: `${months[i].y}-${months[i].m}`,
    label: MONTHS[months[i].m],
    detail: `${MONTHS[months[i].m]} ${months[i].y}`,
    value,
  }));
}

/** Alerts by weekday (rows, Monday first) and hour of day (columns). */
export function weekHourMatrix(rows: IncidentRow[]): number[][] {
  const matrix = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const r of rows.filter(isAlert)) {
    const t = ms(r.created_at);
    matrix[weekdayOf(t)][hourOf(t)] += 1;
  }
  return matrix;
}

const RESOLVE_BINS: { label: string; detail: string; max: number }[] = [
  { label: "<5m", detail: "Under 5 minutes", max: 5 },
  { label: "5–15m", detail: "5 to 15 minutes", max: 15 },
  { label: "15–30m", detail: "15 to 30 minutes", max: 30 },
  { label: "30–60m", detail: "30 to 60 minutes", max: 60 },
  { label: "1–3h", detail: "1 to 3 hours", max: 180 },
  { label: "3–12h", detail: "3 to 12 hours", max: 720 },
  { label: "12h+", detail: "12 hours or more", max: Infinity },
];

/** How long resolved alerts stayed open. */
export function resolveHistogram(rows: IncidentRow[]): Bucket[] {
  const counts = new Array(RESOLVE_BINS.length).fill(0);
  for (const r of rows.filter(isAlert)) {
    const m = resolveMinutes(r);
    if (m === null) continue;
    counts[RESOLVE_BINS.findIndex((b) => m < b.max)] += 1;
  }
  return RESOLVE_BINS.map((b, i) => ({ key: b.label, label: b.label, detail: b.detail, value: counts[i] }));
}

const BATTERY_BINS = [
  { label: "0–20%", max: 20 },
  { label: "21–50%", max: 50 },
  { label: "51–80%", max: 80 },
  { label: "81–100%", max: 100 },
];

/** Battery level when the alert was sent (Chromium phones only report it). */
export function batteryHistogram(rows: IncidentRow[]): Bucket[] {
  const counts = new Array(BATTERY_BINS.length).fill(0);
  for (const r of rows.filter(isAlert)) {
    if (r.battery_level === null) continue;
    counts[BATTERY_BINS.findIndex((b) => r.battery_level! <= b.max)] += 1;
  }
  return BATTERY_BINS.map((b, i) => ({ key: b.label, label: b.label, detail: `Battery ${b.label}`, value: counts[i] }));
}

export interface Hotspot {
  lat: number;
  lng: number;
  alerts: number;
  people: number;
  lastAt: string;
}

/**
 * Areas with repeated alerts, on a ~1 km grid (two decimal places). Coarse on
 * purpose: this is for placing responders, not for pinpointing anyone.
 */
export function hotspots(rows: IncidentRow[], limit = 6): Hotspot[] {
  const cells = new Map<string, { lat: number; lng: number; alerts: number; users: Set<string>; lastAt: string }>();
  for (const r of rows.filter(isAlert)) {
    if (r.latitude === null || r.longitude === null) continue;
    const lat = Math.round(r.latitude * 100) / 100;
    const lng = Math.round(r.longitude * 100) / 100;
    const key = `${lat},${lng}`;
    const cell = cells.get(key) ?? { lat, lng, alerts: 0, users: new Set<string>(), lastAt: r.created_at };
    cell.alerts += 1;
    cell.users.add(r.user_id);
    if (r.created_at > cell.lastAt) cell.lastAt = r.created_at;
    cells.set(key, cell);
  }
  return [...cells.values()]
    .sort((a, b) => b.alerts - a.alerts || (a.lastAt < b.lastAt ? 1 : -1))
    .slice(0, limit)
    .map(({ users, ...c }) => ({ ...c, people: users.size }));
}

export interface Insight {
  tone: "info" | "warning";
  text: string;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const hourRange = (h: number) => `${String(h).padStart(2, "0")}:00–${String((h + 1) % 24).padStart(2, "0")}:00`;

/**
 * Plain-language observations. Each one is only produced when the data
 * supports it, with thresholds high enough that it is not noise.
 */
export function insights(summary: Summary, matrix: number[][]): Insight[] {
  const out: Insight[] = [];
  if (summary.alerts === 0) return out;

  if (summary.open > 0) {
    out.push({
      tone: "warning",
      text: `${summary.open} alert${summary.open === 1 ? " is" : "s are"} still open from this period.`,
    });
  }

  if (summary.duress > 0) {
    out.push({
      tone: "warning",
      text: `${summary.duress} alert${summary.duress === 1 ? " was" : "s were"} ended with a duress PIN. The phone showed "safe"; treat these as unconfirmed.`,
    });
  }

  if (summary.sms.reachRate !== null && summary.alerts >= 3 && summary.sms.reachRate < 0.9) {
    const missed = summary.alerts - summary.sms.alertsReached;
    out.push({
      tone: "warning",
      text: `${missed} of ${summary.alerts} alerts reached no emergency contact by text (${pct(summary.sms.reachRate)} reached). Check the SMS provider and contact numbers.`,
    });
  }

  let peak = { day: 0, hour: 0, n: 0 };
  matrix.forEach((row, day) => row.forEach((n, hour) => n > peak.n && (peak = { day, hour, n })));
  if (peak.n >= 2) {
    out.push({
      tone: "info",
      text: `Busiest hour: ${WEEKDAYS[peak.day]} ${hourRange(peak.hour)} ${TIME_ZONE_LABEL}, with ${peak.n} alerts.`,
    });
  }

  const night = matrix.reduce((n, row) => n + row.filter((_, h) => h >= 18 || h < 6).reduce((a, b) => a + b, 0), 0);
  if (summary.alerts >= 5) {
    out.push({
      tone: "info",
      text: `${pct(night / summary.alerts)} of alerts were sent between 18:00 and 06:00.`,
    });
  }

  if (summary.evidence.coverage !== null && summary.alerts >= 3 && summary.evidence.coverage < 0.7) {
    out.push({
      tone: "warning",
      text: `Only ${pct(summary.evidence.coverage)} of alerts have audio. Microphone permission is often not granted ahead of time.`,
    });
  }

  if (summary.location.coverage !== null && summary.alerts >= 3 && summary.location.coverage < 0.8) {
    out.push({
      tone: "warning",
      text: `${pct(1 - summary.location.coverage)} of alerts arrived with no location.`,
    });
  }

  if (summary.cancelRate !== null && summary.alerts + summary.cancelled >= 5 && summary.cancelRate >= 0.3) {
    out.push({
      tone: "info",
      text: `${pct(summary.cancelRate)} of countdowns were cancelled before sending. Many may be accidental presses.`,
    });
  }

  if (summary.repeatPeople > 0) {
    out.push({
      tone: "info",
      text: `${summary.repeatPeople} ${summary.repeatPeople === 1 ? "person" : "people"} sent more than one alert in this period.`,
    });
  }

  return out;
}
