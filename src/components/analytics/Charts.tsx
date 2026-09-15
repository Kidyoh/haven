import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Table2, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Bucket } from "@/lib/analytics/incidents";
import { VIZ } from "@/lib/analytics/viz";

/**
 * Chart kit for the response dashboard. Hand-built SVG so every mark follows
 * one spec: bars capped at 24px with 4px rounded data-ends on a single
 * baseline, hairline solid grid, text in text tokens (never the series color),
 * a tooltip on hover and keyboard focus, and a table view for every chart.
 *
 * Colors live in lib/analytics/viz.ts.
 */

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** A card holding one chart, with a chart/table switch. */
export function ChartCard({
  title,
  subtitle,
  children,
  table,
  className,
  action,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** The same data as a table: the accessible twin of the chart. */
  table?: { columns: string[]; rows: (string | number)[][] };
  className?: string;
  action?: React.ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className={cn("min-w-0 rounded-2xl border border-border bg-card p-5", className)}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {action}
          {table && (
            <button
              type="button"
              onClick={() => setAsTable((v) => !v)}
              aria-pressed={asTable}
              aria-label={asTable ? `Show ${title} as a chart` : `Show ${title} as a table`}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {asTable ? <BarChart3 className="h-4 w-4" /> : <Table2 className="h-4 w-4" />}
            </button>
          )}
        </div>
      </header>
      {asTable && table ? <DataTable {...table} /> : children}
    </section>
  );
}

function DataTable({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <div className="max-h-72 overflow-auto rounded-xl border border-border">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-card">
          <tr>
            {columns.map((c, i) => (
              <th key={c} className={cn("px-3 py-2 font-medium text-muted-foreground", i > 0 && "text-right")}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular">
          {rows.map((row, r) => (
            <tr key={r} className="border-t border-border">
              {row.map((cell, i) => (
                <td key={i} className={cn("px-3 py-1.5 text-foreground", i > 0 && "text-right tabular-nums")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function niceMax(max: number) {
  if (max <= 4) return Math.max(1, max);
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * step >= max) return m * step;
  return 10 * step;
}

/** Column path with a 4px rounded data-end and a square foot on the baseline. */
function columnPath(x: number, y: number, w: number, h: number) {
  if (h <= 0) return "";
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/** Tooltip: value leads, label follows. Positioned inside the chart's own box. */
function Tooltip({ x, y, value, label, containerWidth }: { x: number; y: number; value: string; label: string; containerWidth: number }) {
  const w = 150;
  const left = Math.max(0, Math.min(containerWidth - w, x - w / 2));
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 w-[150px] rounded-xl border border-border bg-popover px-3 py-2 shadow-lg"
      style={{ left, top: Math.max(0, y - 60) }}
    >
      <p className="text-sm font-semibold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/** Single-series column chart: magnitude per bucket, with the peak labelled. */
export function ColumnChart({
  data,
  height = 200,
  unit,
  label,
}: {
  data: Bucket[];
  height?: number;
  /** e.g. (n) => `${n} alerts` */
  unit: (n: number) => string;
  /** Accessible name for the chart. */
  label: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const margin = { top: 18, right: 4, bottom: 26, left: 30 };
  const plotW = Math.max(0, width - margin.left - margin.right);
  const plotH = height - margin.top - margin.bottom;
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const ticks = max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, max / 2, max];
  const band = data.length ? plotW / data.length : 0;
  const barW = Math.max(2, Math.min(24, band * 0.62));
  const peak = data.reduce((best, d, i) => (d.value > (data[best]?.value ?? -1) ? i : best), 0);
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(plotW / 46))));
  const y = (v: number) => margin.top + plotH - (v / max) * plotH;

  return (
    <div ref={ref} className="relative w-full" onPointerLeave={() => setActive(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label} className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={margin.left}
                x2={width - margin.right}
                y1={y(t)}
                y2={y(t)}
                stroke={t === 0 ? VIZ.baseline : VIZ.grid}
                strokeWidth={1}
                shapeRendering="crispEdges"
              />
              <text x={margin.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
                {Number.isInteger(t) ? t : t.toFixed(1)}
              </text>
            </g>
          ))}

          {data.map((d, i) => {
            const x = margin.left + i * band + (band - barW) / 2;
            const h = (d.value / max) * plotH;
            // Count label positions back from the last bar, so the newest bucket is always labelled and never crowded.
            const showLabel = (data.length - 1 - i) % labelEvery === 0;
            return (
              <g key={d.key}>
                <path d={columnPath(x, y(d.value), barW, h)} fill={active === i ? VIZ.seriesHover : VIZ.series} />
                {i === peak && d.value > 0 && (
                  <text x={x + barW / 2} y={y(d.value) - 6} textAnchor="middle" className="fill-foreground text-[11px] font-semibold">
                    {d.value}
                  </text>
                )}
                {showLabel && (
                  <text x={x + barW / 2} y={height - 8} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                    {d.label}
                  </text>
                )}
                {/* Hit target: the whole band, taller than the bar. */}
                <rect
                  x={margin.left + i * band}
                  y={margin.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  role="img"
                  aria-label={`${d.detail}: ${unit(d.value)}`}
                  className="cursor-default outline-none focus-visible:stroke-[hsl(var(--ring))]"
                  onPointerMove={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                />
              </g>
            );
          })}
        </svg>
      )}
      {active !== null && data[active] && (
        <Tooltip
          x={margin.left + active * band + band / 2}
          y={y(data[active].value)}
          value={unit(data[active].value)}
          label={data[active].detail}
          containerWidth={width}
        />
      )}
      {width === 0 && <div style={{ height }} />}
    </div>
  );
}

/** Weekday × hour heatmap on a one-hue sequential ramp. */
export function Heatmap({
  matrix,
  rowLabels,
  unit,
}: {
  matrix: number[][];
  rowLabels: string[];
  unit: (n: number) => string;
}) {
  const [active, setActive] = useState<{ r: number; c: number } | null>(null);
  const max = Math.max(0, ...matrix.flat());
  // The busiest cell always takes the brightest step; any non-zero count is at least the first.
  const binOf = (n: number) => (n === 0 || max === 0 ? -1 : Math.max(0, Math.ceil((n / max) * VIZ.ramp.length) - 1));
  const hour = (h: number) => `${String(h).padStart(2, "0")}:00`;

  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div className="min-w-[560px]" onPointerLeave={() => setActive(null)}>
          <div className="grid grid-cols-[36px_repeat(24,minmax(0,1fr))] gap-[2px]">
            {matrix.map((row, r) => (
              <HeatRow key={rowLabels[r]} label={rowLabels[r]}>
                {row.map((n, c) => {
                  const bin = binOf(n);
                  const isActive = active?.r === r && active?.c === c;
                  return (
                    <div
                      key={c}
                      onPointerEnter={() => setActive({ r, c })}
                      className={cn("h-5 rounded-[3px] transition-[outline] lg:h-6", isActive && "outline outline-2 outline-foreground")}
                      style={{ background: bin < 0 ? VIZ.empty : VIZ.ramp[bin] }}
                    />
                  );
                })}
              </HeatRow>
            ))}
          </div>
          <div className="mt-1.5 grid grid-cols-[36px_repeat(24,minmax(0,1fr))] gap-[2px] text-[10px] text-muted-foreground">
            <span />
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="text-center tabular-nums">
                {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <p aria-live="polite" className="min-h-4">
          {active ? (
            <>
              <span className="font-semibold text-foreground">{unit(matrix[active.r][active.c])}</span> ·{" "}
              {rowLabels[active.r]} {hour(active.c)}–{hour((active.c + 1) % 24)}
            </>
          ) : (
            "Hover a square for the count"
          )}
        </p>
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span>0</span>
          <span className="h-3 w-3 rounded-[3px]" style={{ background: VIZ.empty }} />
          {VIZ.ramp.map((c) => (
            <span key={c} className="h-3 w-3 rounded-[3px]" style={{ background: c }} />
          ))}
          <span>{max}</span>
        </div>
      </div>
    </div>
  );
}

function HeatRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span className="flex items-center text-[10px] text-muted-foreground">{label}</span>
      {children}
    </>
  );
}

/** A ratio against 100%: fill in the series hue on a track from the same ramp. */
export function Meter({
  label,
  value,
  detail,
  warnBelow,
}: {
  label: string;
  /** 0..1, or null when there is nothing to measure. */
  value: number | null;
  detail: string;
  /** Mark the meter as needing attention below this share. */
  warnBelow?: number;
}) {
  const id = useId();
  const warn = value !== null && warnBelow !== undefined && value < warnBelow;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p id={id} className="text-sm text-foreground">
          {label}
        </p>
        <p className="text-sm font-semibold text-foreground">{value === null ? "—" : `${Math.round(value * 100)}%`}</p>
      </div>
      <div
        role="meter"
        aria-labelledby={id}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value === null ? undefined : Math.round(value * 100)}
        className="mt-2 h-2 overflow-hidden rounded-full"
        style={{ background: "rgba(57,135,229,0.16)" }}
      >
        <div className="h-full rounded-full" style={{ width: `${(value ?? 0) * 100}%`, background: VIZ.series }} />
      </div>
      <p className={cn("mt-1.5 text-xs", warn ? "text-warning" : "text-muted-foreground")}>
        {warn && "Needs attention · "}
        {detail}
      </p>
    </div>
  );
}

/** A 2px trend line in the de-emphasis gray with the latest point in the series hue. */
export function Sparkline({ values, height = 36, label }: { values: number[]; height?: number; label: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const points = useMemo(() => {
    if (width === 0 || values.length < 2) return [];
    const max = Math.max(1, ...values);
    return values.map((v, i) => [(i / (values.length - 1)) * (width - 8) + 4, height - 4 - (v / max) * (height - 8)] as const);
  }, [values, width, height]);
  const last = points[points.length - 1];

  return (
    <div ref={ref} className="w-full">
      {points.length > 0 && (
        <svg width={width} height={height} role="img" aria-label={label} className="block overflow-visible">
          <polyline
            points={points.map((p) => p.join(",")).join(" ")}
            fill="none"
            stroke={VIZ.deemphasis}
            strokeOpacity={0.6}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle cx={last[0]} cy={last[1]} r={4} fill={VIZ.series} stroke="hsl(var(--card))" strokeWidth={2} />
        </svg>
      )}
    </div>
  );
}

export type DeltaTone = "good" | "bad" | "neutral";

/** Label, value, and an optional signed change against the previous period. */
export function StatTile({
  label,
  value,
  sub,
  delta,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: { text: string; tone: DeltaTone } | null;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-4", className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold text-foreground">{value}</p>
      {delta && (
        <p
          className={cn(
            "mt-1 text-xs",
            delta.tone === "good" ? "text-safe" : delta.tone === "bad" ? "text-warning" : "text-muted-foreground",
          )}
        >
          {delta.text}
        </p>
      )}
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
