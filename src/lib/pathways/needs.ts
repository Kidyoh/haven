import type { Category, ServiceKey, ServiceRecord } from "./types";

/**
 * People arrive with a need, not a taxonomy. Each need maps onto the
 * controlled vocabulary in /data/schema.json (categories and service keys),
 * so this file is country-agnostic: a dataset for another country that uses
 * the same vocabulary gets the same needs screen for free. Labels live in the
 * locale bundles under `needs.<id>`.
 */
export interface Need {
  id: string;
  icon: "medical" | "home" | "report" | "legal" | "talk" | "phone";
  categories: Category[];
  services: ServiceKey[];
}

export const NEEDS: Need[] = [
  {
    id: "medical",
    icon: "medical",
    categories: ["one_stop_centre", "health"],
    services: ["medical_care", "forensic_exam", "emergency_contraception", "hiv_pep", "sti_treatment"],
  },
  {
    id: "stay",
    icon: "home",
    categories: ["shelter"],
    services: ["shelter", "shelter_referral"],
  },
  {
    id: "report",
    icon: "report",
    categories: ["police"],
    services: ["report_filing", "emergency_response"],
  },
  {
    id: "legal",
    icon: "legal",
    categories: ["legal_aid"],
    services: ["legal_advice", "court_representation", "legal_referral"],
  },
  {
    id: "talk",
    icon: "talk",
    categories: ["psychosocial"],
    services: ["counselling", "psychosocial_referral", "case_management"],
  },
  {
    id: "call",
    icon: "phone",
    categories: ["hotline"],
    services: [],
  },
];

export function matchesNeed(record: ServiceRecord, need: Need): boolean {
  if (need.categories.includes(record.category)) return true;
  return record.services.some((s) => need.services.includes(s));
}

/**
 * Order within a need: category matches first, in the order the need lists
 * its categories (a one-stop centre before an ambulance line for "medical"),
 * then records that offer the service directly, then records that only refer
 * onward. Within a group the dataset order (by id) is kept.
 */
export function rankForNeed(record: ServiceRecord, need: Need): number {
  const ci = need.categories.indexOf(record.category);
  if (ci >= 0) return ci;
  const n = need.categories.length;
  const direct = record.services.some((s) => need.services.includes(s) && !s.endsWith("_referral"));
  return direct ? n : n + 1;
}
