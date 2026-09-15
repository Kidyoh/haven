import { t } from "./i18n";
import type { Locale, ServiceRecord } from "./types";

/**
 * Regions. Records carry the region as stated in English; the UI shows a
 * translated label when the locale bundle has one ("region.<name>") and the
 * stored name otherwise.
 *
 * Phone lines that work from anywhere carry the region NATIONWIDE and appear
 * under every region filter: someone in Dessie still needs 7711.
 */

export const NATIONWIDE = "Nationwide";

export function regionLabel(locale: Locale, region: string): string {
  const key = `region.${region}`;
  const label = t(locale, key);
  return label === key ? region : label;
}

export function matchesRegion(record: ServiceRecord, region: string | null): boolean {
  return region === null || record.region === region || record.region === NATIONWIDE;
}

/** Regions that have at least one place of their own, most places first. */
export function regionOptions(records: ServiceRecord[]): string[] {
  const counts = new Map<string, number>();
  for (const r of records) {
    if (r.region === NATIONWIDE) continue;
    counts.set(r.region, (counts.get(r.region) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([region]) => region);
}
