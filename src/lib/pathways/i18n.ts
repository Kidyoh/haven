import en from "@/locales/pathways/en.json";
import am from "@/locales/pathways/am.json";
import type { Locale, ServiceRecord } from "./types";

/**
 * UI strings. One flat bundle per locale, keyed "section.key". Records carry
 * their own translations (name_en / name_am …) so the dataset is never
 * duplicated per language; see field() below.
 *
 * Adding a locale = adding a bundle here and listing it in /data/meta.json.
 */
const BUNDLES: Record<string, Record<string, string>> = { en, am };

export const AVAILABLE_LOCALES = Object.keys(BUNDLES);
const STORAGE_KEY = "pathways.lang";

export function t(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const bundle = BUNDLES[locale] ?? BUNDLES.en;
  let s = bundle[key] ?? BUNDLES.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Plural helper for the few strings that need it. */
export function tn(locale: Locale, key: string, n: number): string {
  return n === 1 ? t(locale, `${key}_one`, { n }) : t(locale, `${key}_other`, { n });
}

/**
 * Read a localised field off a record ("name", "location_description",
 * "what_to_bring", "notes"). Falls back to English, then to null, so a missing
 * translation shows English rather than nothing.
 */
export function field(
  record: ServiceRecord,
  base: "name" | "location_description" | "what_to_bring" | "notes",
  locale: Locale,
): string | null {
  const r = record as unknown as Record<string, unknown>;
  const v = r[`${base}_${locale}`];
  if (typeof v === "string" && v.length > 0) return v;
  const fallback = r[`${base}_en`];
  return typeof fallback === "string" && fallback.length > 0 ? fallback : null;
}

export function readStoredLocale(): Locale | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v && BUNDLES[v] ? v : null;
  } catch {
    return null;
  }
}

export function storeLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* private mode or storage blocked: the choice just does not persist */
  }
}

/** Initial locale: stored choice → phone language if we ship it → dataset default. */
export function initialLocale(datasetDefault: string): Locale {
  const stored = readStoredLocale();
  if (stored) return stored;
  if (typeof navigator !== "undefined") {
    const nav = (navigator.language || "").toLowerCase().split("-")[0];
    if (BUNDLES[nav]) return nav;
  }
  return BUNDLES[datasetDefault] ? datasetDefault : "en";
}

export function formatDate(locale: Locale, isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  try {
    return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(d);
  } catch {
    return isoDate;
  }
}
