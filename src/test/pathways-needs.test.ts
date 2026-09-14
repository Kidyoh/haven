import { describe, expect, test } from "vitest";
import { NEEDS, matchesNeed, rankForNeed } from "@/lib/pathways/needs";
import type { ServiceRecord } from "@/lib/pathways/types";

const base: Omit<ServiceRecord, "category" | "services"> = {
  id: "x-y-z",
  name_en: "",
  name_am: "",
  region: "",
  subcity: null,
  location_description_en: null,
  location_description_am: null,
  coordinates: { lat: null, lng: null },
  phone: [],
  hours: null,
  what_to_bring_en: null,
  what_to_bring_am: null,
  cost: "unknown",
  accepts_walk_in: null,
  source_name: "",
  source_url: null,
  source_text_original: "x",
  verified_on: "2026-01-01",
  verified_via: "document",
  status: "unverified",
};
const rec = (category: ServiceRecord["category"], services: ServiceRecord["services"]): ServiceRecord => ({ ...base, category, services });
const need = (id: string) => NEEDS.find((n) => n.id === id)!;

describe("pathways needs", () => {
  test("a shelter matches 'stay' by category; a hotline with shelter_referral matches by service", () => {
    expect(matchesNeed(rec("shelter", ["shelter"]), need("stay"))).toBe(true);
    expect(matchesNeed(rec("hotline", ["shelter_referral"]), need("stay"))).toBe(true);
    expect(matchesNeed(rec("police", ["report_filing"]), need("stay"))).toBe(false);
  });

  test("category matches rank above direct services, which rank above referrals", () => {
    const shelter = rec("shelter", ["shelter"]);
    const osc = rec("one_stop_centre", ["shelter"]);
    const hotline = rec("hotline", ["shelter_referral"]);
    expect(rankForNeed(shelter, need("stay"))).toBeLessThan(rankForNeed(osc, need("stay")));
    expect(rankForNeed(osc, need("stay"))).toBeLessThan(rankForNeed(hotline, need("stay")));
  });

  test("categories rank in the order the need lists them", () => {
    expect(rankForNeed(rec("one_stop_centre", ["medical_care"]), need("medical"))).toBeLessThan(rankForNeed(rec("health", ["medical_care"]), need("medical")));
  });

  test("every need has a label key shape the locale bundles use", () => {
    for (const n of NEEDS) expect(n.id).toMatch(/^[a-z]+$/);
  });
});
