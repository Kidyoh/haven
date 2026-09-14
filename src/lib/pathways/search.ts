import type { ServiceRecord } from "./types";

/**
 * On-device search. Runs against the cached dataset only. There is no search
 * endpoint and no query log anywhere in this project: the query itself reveals
 * that someone is looking for a shelter, so it must never leave the phone.
 */

/**
 * Fold Ethiopic homophone consonants so that "ሰላም" and "ሠላም" match.
 * Ethiopic syllables sit in blocks of 8 (7 vowel orders + 1); the offset within
 * a block is preserved so the vowel is kept.
 */
const ETHIOPIC_FOLDS: Array<[number, number]> = [
  [0x1210, 0x1200], // ሐ → ሀ
  [0x1280, 0x1200], // ኀ → ሀ
  [0x1220, 0x1230], // ሠ → ሰ
  [0x1340, 0x1338], // ፀ → ጸ
  [0x12d0, 0x12a0], // ዐ → አ
];

function foldEthiopic(ch: string): string {
  const cp = ch.codePointAt(0)!;
  for (const [from, to] of ETHIOPIC_FOLDS) {
    if (cp >= from && cp < from + 8) return String.fromCodePoint(to + (cp - from));
  }
  return ch;
}

export function normalise(text: string): string {
  return Array.from(
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, ""), // strip Latin diacritics
  )
    .map(foldEthiopic)
    .join("")
    .replace(/[፡-፨]/g, " ") // Ethiopic punctuation (፡ ። ፣ …) → space
    .replace(/[^\p{L}\p{N}+]+/gu, " ")
    .trim();
}

export function tokenise(text: string): string[] {
  return normalise(text).split(/\s+/).filter(Boolean);
}

export interface SearchableText {
  /** Highest weight: the record's names in every language. */
  names: string[];
  /** Medium weight: area, location description, localised service labels. */
  place: string[];
  /** Lower weight: everything else worth matching (notes, category label). */
  other: string[];
}

export interface Scored<T> {
  item: T;
  score: number;
}

/**
 * Score one record against a query. Every query token must match somewhere
 * (AND semantics), so a short query stays precise. Prefix matches count, so
 * typing "gand" finds Gandhi before the word is finished.
 */
export function scoreRecord(query: string, text: SearchableText): number {
  const tokens = tokenise(query);
  if (tokens.length === 0) return 0;

  const names = text.names.map(normalise);
  const place = text.place.map(normalise);
  const other = text.other.map(normalise);

  let total = 0;
  for (const tok of tokens) {
    let best = 0;
    for (const n of names) best = Math.max(best, matchWeight(tok, n, 10));
    if (best === 0) for (const p of place) best = Math.max(best, matchWeight(tok, p, 5));
    if (best === 0) for (const o of other) best = Math.max(best, matchWeight(tok, o, 2));
    if (best === 0) return 0; // one token missed → no match
    total += best;
  }
  // Phone numbers: digits typed by the user match exactly against digits.
  return total;
}

function matchWeight(tok: string, haystack: string, base: number): number {
  if (!haystack) return 0;
  if (haystack === tok) return base * 3;
  const words = haystack.split(" ");
  if (words.includes(tok)) return base * 2;
  if (words.some((w) => w.startsWith(tok))) return base * 1.5;
  if (haystack.includes(tok)) return base;
  return 0;
}

export function searchRecords<T extends ServiceRecord>(
  query: string,
  records: T[],
  toText: (r: T) => SearchableText,
): T[] {
  const q = query.trim();
  if (!q) return records;
  const scored: Scored<T>[] = [];
  for (const r of records) {
    const s = scoreRecord(q, toText(r));
    if (s > 0) scored.push({ item: r, score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}
