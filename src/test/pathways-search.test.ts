import { describe, expect, test } from "vitest";
import { normalise, scoreRecord, searchRecords, tokenise } from "@/lib/pathways/search";
import type { ServiceRecord } from "@/lib/pathways/types";

describe("pathways search", () => {
  test("normalise folds case and Latin diacritics", () => {
    expect(normalise("Gändhi Memorial")).toBe("gandhi memorial");
  });

  test("normalise folds Ethiopic homophones and keeps the vowel order", () => {
    expect(normalise("ሠላም")).toBe(normalise("ሰላም"));
    expect(normalise("ሐይወት")).toBe(normalise("ሀይወት"));
    expect(normalise("ዐለም")).toBe(normalise("አለም"));
    expect(normalise("ሰላም")).not.toBe(normalise("ሱላም")); // different vowel stays different
  });

  test("Ethiopic punctuation splits tokens", () => {
    expect(tokenise("ቂርቆስ፣ አዲስ አበባ።")).toEqual(["ቂርቆስ", "አዲስ", "አበባ"]);
  });

  test("every token must match (AND), names outrank places", () => {
    const text = { names: ["Gandhi Memorial Hospital One-Stop Centre"], place: ["Kirkos", "Addis Ababa"], other: [] };
    expect(scoreRecord("gandhi", text)).toBeGreaterThan(scoreRecord("kirkos", text));
    expect(scoreRecord("gandhi kirkos", text)).toBeGreaterThan(0);
    expect(scoreRecord("gandhi bole", text)).toBe(0);
  });

  test("prefix matches work mid-word so typing finds results early", () => {
    const text = { names: ["Alegnta 6388"], place: [], other: [] };
    expect(scoreRecord("aleg", text)).toBeGreaterThan(0);
    expect(scoreRecord("638", text)).toBeGreaterThan(0);
  });

  test("Amharic query finds Amharic name", () => {
    const text = { names: ["EWLA hotline 7711", "የኢትዮጵያ የሴቶች ሕግ ባለሙያዎች ማኅበር"], place: [], other: [] };
    expect(scoreRecord("ሴቶች", text)).toBeGreaterThan(0);
  });

  test("searchRecords keeps the list when the query is empty and sorts by score", () => {
    const recs = [
      { id: "a", name_en: "Police 991" },
      { id: "b", name_en: "Gandhi Hospital" },
      { id: "c", name_en: "Hospital transport" },
    ] as ServiceRecord[];
    const toText = (r: ServiceRecord) => ({ names: [r.name_en], place: [], other: [] });
    expect(searchRecords("", recs, toText).map((r) => r.id)).toEqual(["a", "b", "c"]);
    const hits = searchRecords("hospital", recs, toText).map((r) => r.id);
    expect(new Set(hits)).toEqual(new Set(["b", "c"]));
  });
});
