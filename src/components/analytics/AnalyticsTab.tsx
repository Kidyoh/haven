import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Info, MapPin, RotateCw, TrendingDown, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Callout, EmptyState, Spinner } from "@/components/haven/Feedback";
import {
  RANGES,
  TIME_ZONE_LABEL,
  WEEKDAYS,
  batteryHistogram,
  hotspots,
  insights,
  rangeBounds,
  resolveHistogram,
  splitByWindow,
  summarize,
  volumeSeries,
  weekHourMatrix,
  type Bucket,
  type Hotspot,
  type IncidentRow,
  type Insight,
  type RangeKey,
  type Summary,
} from "@/lib/analytics/incidents";
import { ChartCard, ColumnChart, Heatmap, Meter, Sparkline, StatTile, type DeltaTone } from "./Charts";
import { VIZ } from "@/lib/analytics/viz";

/**
 * The analytics tab: how many alerts, when they come in, how fast they are
 * closed, and whether each part of the alert (texts, audio, location) worked.
 * One range filter above everything; every number below comes from the same
 * slice.
 */

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

function duration(minutes: number | null) {
  if (minutes === null) return "—";
  if (minutes < 1) return "<1 min";
  if (minutes < 90) return `${Math.round(minutes)} min`;
  if (minutes < 48 * 60) return `${(minutes / 60).toFixed(minutes < 600 ? 1 : 0)} h`;
  return `${Math.round(minutes / 1440)} d`;
}

function countDelta(now: number, before: number, periodLabel: string): { text: string; tone: DeltaTone } | null {
  if (before === 0 && now === 0) return null;
  if (before === 0) return { text: `New this period · none in the previous ${periodLabel}`, tone: "neutral" };
  const change = (now - before) / before;
  const sign = change > 0 ? "+" : change < 0 ? "−" : "±";
  return { text: `${sign}${Math.abs(Math.round(change * 100))}% vs previous ${periodLabel}`, tone: "neutral" };
}

/** Lower is better (e.g. time to resolve). */
function minutesDelta(now: number | null, before: number | null, periodLabel: string) {
  if (now === null || before === null || before === 0) return null;
  const change = (now - before) / before;
  if (Math.abs(change) < 0.05) return { text: `About the same as previous ${periodLabel}`, tone: "neutral" as DeltaTone };
  return {
    text: `${change < 0 ? "Faster" : "Slower"} by ${Math.abs(Math.round(change * 100))}% vs previous ${periodLabel}`,
    tone: (change < 0 ? "good" : "bad") as DeltaTone,
  };
}

/** Higher is better (e.g. contacts reached). */
function shareDelta(now: number | null, before: number | null, periodLabel: string) {
  if (now === null || before === null) return null;
  const points = Math.round((now - before) * 100);
  if (points === 0) return { text: `No change vs previous ${periodLabel}`, tone: "neutral" as DeltaTone };
  return {
    text: `${points > 0 ? "+" : "−"}${Math.abs(points)} pts vs previous ${periodLabel}`,
    tone: (points > 0 ? "good" : "bad") as DeltaTone,
  };
}

const AnalyticsTab = () => {
  const [range, setRange] = useState<RangeKey>("30d");
  const [rows, setRows] = useState<IncidentRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ missing: boolean; message: string } | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Re-render every 30s so "updated N min ago" stays true.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async (key: RangeKey) => {
    setLoading(true);
    const at = Date.now();
    const { prevStart } = rangeBounds(key, at);
    const { data, error: rpcError } = await supabase.rpc("get_incident_analytics", {
      p_since: new Date(prevStart).toISOString(),
    });
    if (rpcError) {
      const missing = rpcError.code === "PGRST202" || /could not find the function/i.test(rpcError.message);
      setError({ missing, message: rpcError.message });
    } else {
      setError(null);
      setRows((data ?? []) as IncidentRow[]);
      setNow(at);
      setLoadedAt(at);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(range);
  }, [load, range]);

  const rangeInfo = RANGES.find((r) => r.key === range)!;
  const periodLabel = `${rangeInfo.days} days`;

  const view = useMemo((): View | null => {
    if (!rows) return null;
    const { current, previous } = splitByWindow(rows, range, now);
    const summary = summarize(current);
    const prev = summarize(previous);
    const matrix = weekHourMatrix(current);
    return {
      summary,
      prev,
      volume: volumeSeries(current, range, now),
      matrix,
      resolve: resolveHistogram(current),
      battery: batteryHistogram(current),
      spots: hotspots(current),
      notes: insights(summary, matrix),
    };
  }, [rows, range, now]);

  return (
    <div className="space-y-5">
      {/* One filter row, above everything it scopes. */}
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Time range" className="flex flex-wrap gap-1 rounded-2xl bg-card p-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              aria-pressed={range === r.key}
              onClick={() => setRange(r.key)}
              className={cn(
                "min-h-9 rounded-xl px-3 text-xs font-medium transition-colors",
                range === r.key ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Times in {TIME_ZONE_LABEL}
          {loadedAt && ` · updated ${agoText(Date.now() - loadedAt)}`}
        </p>
        <button
          type="button"
          onClick={() => void load(range)}
          disabled={loading}
          className="ml-auto flex h-9 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
        >
          {loading ? <Spinner size="sm" tone="current" label="Refreshing" /> : <RotateCw className="h-3.5 w-3.5" />}
          Refresh
        </button>
      </div>

      {error && (
        <Callout tone={error.missing ? "warning" : "danger"} icon={<AlertTriangle />} title="Analytics could not load">
          {error.missing
            ? "The analytics database function is not deployed yet. Apply the latest Supabase migrations (supabase db push) and refresh."
            : error.message}
        </Callout>
      )}

      {!view && loading && (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      )}

      {view && (
        // Refetch keeps the frame: the previous render stays, dimmed, with no layout jump.
        <div className={cn("space-y-5 transition-opacity", loading && "opacity-60")} aria-busy={loading}>
          {view.summary.alerts === 0 && view.summary.cancelled === 0 ? (
            <div className="rounded-2xl border border-border bg-card">
              <EmptyState
                icon={<Info />}
                title={`No alerts in the ${rangeInfo.label.toLowerCase()}`}
                description="Pick a longer range above, or check back once alerts come in."
              />
            </div>
          ) : (
            <Report view={view} periodLabel={periodLabel} rangeLabel={rangeInfo.label} bucket={rangeInfo.bucket} />
          )}
        </div>
      )}
    </div>
  );
};

interface View {
  summary: Summary;
  prev: Summary;
  volume: Bucket[];
  matrix: number[][];
  resolve: Bucket[];
  battery: Bucket[];
  spots: Hotspot[];
  notes: Insight[];
}

function Report({
  view,
  periodLabel,
  rangeLabel,
  bucket,
}: {
  view: View;
  periodLabel: string;
  rangeLabel: string;
  bucket: "day" | "week" | "month";
}) {
  const { summary: s, prev } = view;
  const alertDelta = countDelta(s.alerts, prev.alerts, periodLabel);
  const alertsUnit = (n: number) => plural(n, "alert");
  const bucketWord = bucket === "day" ? "day" : bucket === "week" ? "week" : "month";

  return (
    <>
      {/* Headline: one hero figure, then the numbers that explain it. */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)]">
        <div className="flex flex-col rounded-2xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Alerts sent · {rangeLabel.toLowerCase()}</p>
          <p className="mt-1 font-display text-5xl font-semibold leading-none text-foreground sm:text-6xl">
            {s.alerts.toLocaleString()}
          </p>
          {alertDelta && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              {s.alerts >= prev.alerts ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {alertDelta.text}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {plural(s.people, "person", "people")} · {s.open > 0 ? `${s.open} still open` : "none still open"}
          </p>
          <div className="mt-auto pt-4">
            <Sparkline values={view.volume.map((b) => b.value)} label={`Alerts per ${bucketWord}, ${rangeLabel}`} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <StatTile
            label="Median time to resolve"
            value={duration(s.resolve.median)}
            sub={s.resolve.count > 0 ? `90% within ${duration(s.resolve.p90)} · ${plural(s.resolve.count, "resolved alert")}` : "No resolved alerts yet"}
            delta={minutesDelta(s.resolve.median, prev.resolve.median, periodLabel)}
          />
          <StatTile
            label="Alerts that reached a contact"
            value={pct(s.sms.reachRate)}
            sub={`${plural(s.sms.sent, "text")} delivered · ${s.sms.failed.toLocaleString()} failed`}
            delta={shareDelta(s.sms.reachRate, prev.sms.reachRate, periodLabel)}
          />
          <StatTile
            label="Ended with duress PIN"
            value={s.duress.toLocaleString()}
            sub={s.duress > 0 ? "Phone showed safe; not confirmed" : "None in this period"}
          />
          <StatTile
            label="Cancelled countdowns"
            value={s.cancelled.toLocaleString()}
            sub={s.cancelRate === null ? "No countdowns started" : `${pct(s.cancelRate)} of countdowns started`}
          />
        </div>
      </div>

      {view.notes.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-5" aria-label="What stands out">
          <h3 className="font-display text-base font-semibold text-foreground">What stands out</h3>
          <ul className="mt-3 space-y-2.5">
            {view.notes.map((n) => (
              <li key={n.text} className="flex gap-2.5 text-sm text-foreground">
                {n.tone === "warning" ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-label="Needs attention" />
                ) : (
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-label="Note" />
                )}
                <span>{n.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ChartCard
        title="Alerts over time"
        subtitle={`Alerts sent per ${bucketWord}. Cancelled countdowns are not counted.`}
        table={{ columns: [bucket === "day" ? "Day" : bucket === "week" ? "Week" : "Month", "Alerts"], rows: view.volume.map((b) => [b.detail, b.value]) }}
      >
        <ColumnChart data={view.volume} unit={alertsUnit} label={`Alerts per ${bucketWord}`} height={220} />
      </ChartCard>

      <ChartCard
        title="When alerts come in"
        subtitle={`By day of week and hour, ${TIME_ZONE_LABEL}. Use it to plan responder cover.`}
        table={{
          columns: ["Day", ...Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"))],
          rows: view.matrix.map((row, d) => [WEEKDAYS[d], ...row]),
        }}
      >
        <Heatmap matrix={view.matrix} rowLabels={WEEKDAYS} unit={alertsUnit} />
      </ChartCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard
          title="How long alerts stay open"
          subtitle="From sending to resolved, for alerts resolved in this period."
          table={{ columns: ["Time open", "Alerts"], rows: view.resolve.map((b) => [b.detail, b.value]) }}
        >
          {s.resolve.count === 0 ? (
            <EmptyChart text="No alerts were resolved in this period." />
          ) : (
            <ColumnChart data={view.resolve} unit={alertsUnit} label="Alerts by time to resolve" />
          )}
        </ChartCard>

        <ChartCard title="Did each part of the alert work?" subtitle="Share of alerts in this period.">
          <div className="space-y-5">
            <Meter
              label="Reached at least one contact by text"
              value={s.sms.reachRate}
              warnBelow={0.9}
              detail={`${s.sms.alertsReached} of ${plural(s.alerts, "alert")}`}
            />
            <Meter
              label="Texts delivered"
              value={s.sms.deliveryRate}
              warnBelow={0.95}
              detail={
                s.sms.sent + s.sms.failed === 0
                  ? "No texts attempted. SMS may not be configured."
                  : `${s.sms.sent} delivered, ${s.sms.failed} failed`
              }
            />
            <Meter
              label="Recorded audio"
              value={s.evidence.coverage}
              warnBelow={0.7}
              detail={`${s.evidence.withAudio} alerts · ${plural(s.evidence.audioMinutes, "minute")} in total`}
            />
            <Meter
              label="Shared a location"
              value={s.location.coverage}
              warnBelow={0.8}
              detail={
                s.location.medianAccuracy === null
                  ? `${s.location.withFix} alerts`
                  : `${s.location.withFix} alerts · typical accuracy ±${Math.round(s.location.medianAccuracy)} m`
              }
            />
          </div>
        </ChartCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard
          title="Where alerts cluster"
          subtitle="Areas of about 1 km with the most alerts. Coarse on purpose."
          table={{
            columns: ["Area (lat, lng)", "Alerts", "People"],
            rows: view.spots.map((h) => [`${h.lat.toFixed(2)}, ${h.lng.toFixed(2)}`, h.alerts, h.people]),
          }}
        >
          {view.spots.length === 0 ? (
            <EmptyChart text="No alerts in this period had a location." />
          ) : (
            <ol className="space-y-2">
              {view.spots.map((h, i) => {
                const top = view.spots[0].alerts;
                return (
                  <li key={`${h.lat},${h.lng}`} className="flex items-center gap-3">
                    <span className="w-4 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <a
                          href={`https://maps.google.com/?q=${h.lat},${h.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-foreground hover:text-haven-gold"
                        >
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="tabular-nums">
                            {h.lat.toFixed(2)}, {h.lng.toFixed(2)}
                          </span>
                        </a>
                        <span className="text-xs text-muted-foreground">
                          {plural(h.alerts, "alert")}
                          {h.people !== h.alerts && ` · ${plural(h.people, "person", "people")}`}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full" style={{ background: "rgba(57,135,229,0.16)" }}>
                        <div className="h-full rounded-full" style={{ width: `${(h.alerts / top) * 100}%`, background: VIZ.series }} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </ChartCard>

        <ChartCard
          title="Phone at the moment of the alert"
          subtitle={
            s.conditions.batteryKnown === 0
              ? "Battery level is only reported by some phones."
              : `Battery level, for the ${s.conditions.batteryKnown} alerts that reported it.`
          }
          table={{ columns: ["Battery", "Alerts"], rows: view.battery.map((b) => [b.label, b.value]) }}
        >
          {s.conditions.batteryKnown === 0 ? (
            <EmptyChart text="No battery readings in this period." />
          ) : (
            <ColumnChart data={view.battery} unit={alertsUnit} label="Alerts by battery level" height={170} />
          )}
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-xs">
            <div>
              <dt className="text-muted-foreground">Sent while offline</dt>
              <dd className="mt-0.5 text-sm font-semibold text-foreground">
                {s.conditions.offline} <span className="font-normal text-muted-foreground">({pct(s.conditions.offlineRate)})</span>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Battery at 20% or less</dt>
              <dd className="mt-0.5 text-sm font-semibold text-foreground">{s.conditions.lowBattery}</dd>
            </div>
          </dl>
        </ChartCard>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        An alert is a countdown that finished and was sent. Resolve time runs from sending to the moment it was marked
        resolved, by the user or a responder. Percentages compare against alerts in the selected range; changes compare
        against the {periodLabel} before it.
      </p>
    </>
  );
}

function EmptyChart({ text }: { text: string }) {
  return <p className="flex min-h-[140px] items-center justify-center text-center text-sm text-muted-foreground">{text}</p>;
}

function agoText(msAgo: number) {
  const m = Math.floor(msAgo / 60_000);
  return m < 1 ? "just now" : m === 1 ? "1 min ago" : `${m} min ago`;
}

export default AnalyticsTab;
