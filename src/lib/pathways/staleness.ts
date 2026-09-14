import type { ServiceRecord } from "./types";

/**
 * What the UI shows for a record's trust state.
 *
 * "verified_stale" is computed here, at display time, and only here. The data
 * file is never rewritten to downgrade a record and nothing is ever hidden.
 * Rationale: an old phone number that the user KNOWS is old is more useful than
 * a silent gap. So a stale record stays green-ish, keeps its date, and gets a
 * visible "re-check" flag instead of disappearing.
 */
export type DisplayStatus = "verified" | "verified_stale" | "unverified" | "reported_closed";

export const DEFAULT_STALENESS_DAYS = 90;

/** Whole days between an ISO date (YYYY-MM-DD) and `today`, using UTC midnight. */
export function daysSince(isoDate: string, today: Date = new Date()): number {
  const then = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY;
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.floor((now - then) / 86_400_000);
}

export function isStale(
  record: Pick<ServiceRecord, "status" | "verified_on">,
  today: Date = new Date(),
  stalenessDays: number = DEFAULT_STALENESS_DAYS,
): boolean {
  return record.status === "verified" && daysSince(record.verified_on, today) > stalenessDays;
}

export function displayStatus(
  record: Pick<ServiceRecord, "status" | "verified_on">,
  today: Date = new Date(),
  stalenessDays: number = DEFAULT_STALENESS_DAYS,
): DisplayStatus {
  if (record.status === "verified") {
    return isStale(record, today, stalenessDays) ? "verified_stale" : "verified";
  }
  return record.status;
}
