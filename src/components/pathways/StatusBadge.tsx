import { daysSince, displayStatus, type DisplayStatus } from "@/lib/pathways/staleness";
import { formatDate, t } from "@/lib/pathways/i18n";
import type { Locale, ServiceRecord } from "@/lib/pathways/types";

/**
 * Trust state, shown on every card and at the top of every record. Never
 * inside an accordion. The three data states map to:
 *   verified         green + date (and a re-check flag if older than the threshold)
 *   unverified       amber + the source it came from
 *   reported_closed  muted red, record still fully readable
 */
const PILL: Record<DisplayStatus, string> = {
  verified: "bg-safe/15 text-safe",
  verified_stale: "bg-safe/15 text-safe",
  unverified: "bg-warning/15 text-warning",
  reported_closed: "bg-destructive/15 text-destructive",
};

export function StatusBadge({
  record,
  locale,
  stalenessDays,
  today,
  detailed = false,
}: {
  record: ServiceRecord;
  locale: Locale;
  stalenessDays: number;
  today: Date;
  detailed?: boolean;
}) {
  const ds = displayStatus(record, today, stalenessDays);
  const date = formatDate(locale, record.verified_on);

  let label: string;
  if (ds === "verified" || ds === "verified_stale") label = `${t(locale, "status.verified")} · ${t(locale, "status.verified_on", { date })}`;
  else if (ds === "unverified") label = t(locale, "status.unverified");
  else label = t(locale, "status.reported_closed");

  return (
    <div className="space-y-1">
      <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.86em] font-semibold leading-snug ${PILL[ds]}`}>
        <span aria-hidden className="h-2 w-2 flex-none rounded-full bg-current" />
        {label}
      </span>
      {ds === "verified_stale" && (
        <span className="block rounded-lg bg-warning/15 px-3 py-2 text-[0.92em] text-warning">
          {t(locale, "status.stale", { days: daysSince(record.verified_on, today) })}
        </span>
      )}
      {ds === "unverified" && detailed && (
        <span className="block rounded-lg bg-warning/15 px-3 py-2 text-[0.92em] text-warning">
          {t(locale, "status.unverified_hint")} {t(locale, "status.checked", { date })}.
        </span>
      )}
      {ds === "reported_closed" && (
        <span className="block rounded-lg bg-destructive/15 px-3 py-2 text-[0.92em] text-destructive">{t(locale, "status.closed_note")}</span>
      )}
      {record.placeholder && (
        <span className="block rounded-lg bg-destructive/15 px-3 py-2 text-[0.92em] font-bold text-destructive">{t(locale, "placeholder.label")}</span>
      )}
    </div>
  );
}
