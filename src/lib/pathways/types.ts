// Mirrors /data/schema.json. Keep the two in step: the schema is the source of
// truth for the data, this file is only how the app reads it.

export type Category =
  | "one_stop_centre"
  | "police"
  | "health"
  | "legal_aid"
  | "shelter"
  | "psychosocial"
  | "hotline";

export type ServiceKey =
  | "report_filing"
  | "medical_care"
  | "forensic_exam"
  | "emergency_contraception"
  | "hiv_pep"
  | "sti_treatment"
  | "counselling"
  | "shelter"
  | "legal_advice"
  | "court_representation"
  | "case_management"
  | "child_protection"
  | "emergency_response"
  | "medical_referral"
  | "legal_referral"
  | "shelter_referral"
  | "police_referral"
  | "psychosocial_referral";

export type VerifiedVia = "document" | "institutional_contact" | "phone";
export type RecordStatus = "verified" | "unverified" | "reported_closed";
export type Cost = "free" | "paid" | "unknown";

export interface SourceRef {
  name: string;
  url?: string | null;
  note?: string | null;
}

export interface ServiceRecord {
  id: string;
  name_en: string;
  name_am: string;
  category: Category;
  services: ServiceKey[];
  region: string;
  subcity: string | null;
  location_description_en: string | null;
  location_description_am: string | null;
  coordinates: { lat: number | null; lng: number | null };
  phone: string[];
  hours: string | null;
  what_to_bring_en: string | null;
  what_to_bring_am: string | null;
  cost: Cost;
  accepts_walk_in: boolean | null;
  source_name: string;
  source_url: string | null;
  source_text_original: string;
  source_language?: string;
  additional_sources?: SourceRef[];
  verified_on: string; // YYYY-MM-DD
  verified_via: VerifiedVia;
  status: RecordStatus;
  notes_en?: string | null;
  notes_am?: string | null;
  placeholder?: boolean;
  /** Added by scripts/build-dataset.mjs: which region file the record came from. */
  _file?: string;
}

export interface DatasetMeta {
  country_code: string;
  country_name_en: string;
  country_name_am?: string;
  languages: string[];
  default_language: string;
  staleness_days: number;
  coverage_note_en?: string;
  coverage_note_am?: string;
  [key: string]: unknown;
}

export interface Dataset {
  version: string;
  generated_at: string;
  record_count: number;
  meta: DatasetMeta;
  records: ServiceRecord[];
}

/** Locale codes are whatever /data/meta.json lists. "en" and "am" ship today. */
export type Locale = string;
