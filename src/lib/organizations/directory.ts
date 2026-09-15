/**
 * The organizations directory. Pure functions — filtering, sorting, stats,
 * member grouping and CSV — so the page only fetches and renders, and every
 * rule here is covered by tests.
 */

export const ORG_TYPES = [
  { value: "police", label: "Police" },
  { value: "ngo", label: "NGO" },
  { value: "hospital", label: "Hospital" },
  { value: "shelter", label: "Shelter" },
  { value: "legal_aid", label: "Legal aid" },
  { value: "government", label: "Government" },
  { value: "other", label: "Other" },
] as const;

export type OrgType = (typeof ORG_TYPES)[number]["value"];

export const orgTypeLabel = (type: string) => ORG_TYPES.find((t) => t.value === type)?.label ?? type;

export const ETHIOPIA_REGIONS = [
  "Addis Ababa",
  "Afar",
  "Amhara",
  "Benishangul-Gumuz",
  "Central Ethiopia",
  "Dire Dawa",
  "Gambela",
  "Harari",
  "Oromia",
  "Sidama",
  "Somali",
  "South Ethiopia",
  "South West Ethiopia Peoples'",
  "Tigray",
] as const;

export interface Organization {
  id: string;
  name: string;
  type: string;
  region: string | null;
  subcity: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  services: string[];
  hours: string | null;
  is_active: boolean;
  accepts_referrals: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Filter and sort
// ---------------------------------------------------------------------------

export type ActiveFilter = "all" | "active" | "inactive";
export type SortKey = "name" | "updated";

export interface DirectoryQuery {
  search: string;
  type: OrgType | "all";
  active: ActiveFilter;
  sort: SortKey;
}

export const DEFAULT_QUERY: DirectoryQuery = { search: "", type: "all", active: "all", sort: "name" };

/** Case- and accent-insensitive, so "gulele" finds "Gulele" and "Gulélé". */
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Every word must appear in the name, sub-city or a service. */
export function matchesSearch(org: Organization, search: string): boolean {
  const words = fold(search).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = fold([org.name, org.subcity ?? "", ...org.services].join(" "));
  return words.every((w) => haystack.includes(w));
}

export function filterOrganizations(orgs: Organization[], query: DirectoryQuery): Organization[] {
  return orgs.filter(
    (org) =>
      (query.type === "all" || org.type === query.type) &&
      (query.active === "all" || org.is_active === (query.active === "active")) &&
      matchesSearch(org, query.search),
  );
}

/** Returns a new array. Ties fall back to name so the order never jitters. */
export function sortOrganizations(orgs: Organization[], sort: SortKey): Organization[] {
  const byName = (a: Organization, b: Organization) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id);
  return [...orgs].sort((a, b) =>
    sort === "updated" ? Date.parse(b.updated_at) - Date.parse(a.updated_at) || byName(a, b) : byName(a, b),
  );
}

export const applyDirectoryQuery = (orgs: Organization[], query: DirectoryQuery) =>
  sortOrganizations(filterOrganizations(orgs, query), query.sort);

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export interface DirectoryStats {
  total: number;
  active: number;
  inactive: number;
  byType: Record<OrgType, number>;
}

export function directoryStats(orgs: Organization[]): DirectoryStats {
  const byType = Object.fromEntries(ORG_TYPES.map((t) => [t.value, 0])) as Record<OrgType, number>;
  let active = 0;
  for (const org of orgs) {
    if (org.is_active) active += 1;
    // Anything outside the list is counted as "other", matching the migration.
    const key = (org.type in byType ? org.type : "other") as OrgType;
    byType[key] += 1;
  }
  return { total: orgs.length, active, inactive: orgs.length - active, byType };
}

// ---------------------------------------------------------------------------
// Form helpers
// ---------------------------------------------------------------------------

/** "Counselling, legal aid\nshelter, Counselling" → ["Counselling", "legal aid", "shelter"]. */
export function parseServices(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(/[,\n;]/)) {
    const s = raw.trim().replace(/\s+/g, " ");
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s);
  }
  return out;
}

/**
 * A website safe to put in an href: http(s) only, scheme added when missing.
 * Returns null for anything else (javascript:, mailto:, garbage).
 */
export function normalizeWebsite(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export interface OrganizationFormValues {
  name: string;
  type: OrgType;
  region: string;
  subcity: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  services: string;
  hours: string;
  notes: string;
  is_active: boolean;
  accepts_referrals: boolean;
}

export const EMPTY_FORM: OrganizationFormValues = {
  name: "",
  type: "police",
  region: "",
  subcity: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  services: "",
  hours: "",
  notes: "",
  is_active: true,
  accepts_referrals: true,
};

export function formFromOrganization(org: Organization): OrganizationFormValues {
  return {
    name: org.name,
    type: (ORG_TYPES.some((t) => t.value === org.type) ? org.type : "other") as OrgType,
    region: org.region ?? "",
    subcity: org.subcity ?? "",
    address: org.address ?? "",
    phone: org.phone ?? "",
    email: org.email ?? "",
    website: org.website ?? "",
    services: org.services.join(", "),
    hours: org.hours ?? "",
    notes: org.notes ?? "",
    is_active: org.is_active,
    accepts_referrals: org.accepts_referrals,
  };
}

export type FormErrors = Partial<Record<keyof OrganizationFormValues, string>>;

export function validateOrganizationForm(values: OrganizationFormValues): FormErrors {
  const errors: FormErrors = {};
  if (!values.name.trim()) errors.name = "Name is required";
  if (values.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.email = "That does not look like an email address";
  }
  if (values.website.trim() && !normalizeWebsite(values.website)) {
    errors.website = "Use a web address like example.org";
  }
  return errors;
}

/** The row written to Supabase. Blank strings become null. */
export function payloadFromForm(values: OrganizationFormValues) {
  const text = (s: string) => s.trim() || null;
  return {
    name: values.name.trim(),
    type: values.type,
    region: text(values.region),
    subcity: text(values.subcity),
    address: text(values.address),
    phone: text(values.phone),
    email: text(values.email),
    website: normalizeWebsite(values.website),
    services: parseServices(values.services),
    hours: text(values.hours),
    notes: text(values.notes),
    is_active: values.is_active,
    accepts_referrals: values.accepts_referrals,
  };
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export interface RoleRow {
  user_id: string;
  role: string;
  organization_id: string | null;
}

export interface MemberProfile {
  user_id: string;
  full_name: string;
  phone_number: string;
}

export interface TeamUser {
  user_id: string;
  roles: string[];
  /** Organizations this user's role rows point at (normally zero or one). */
  organization_ids: string[];
  profile?: MemberProfile;
}

const ROLE_ORDER = ["admin", "org_admin", "responder"];

export const roleLabel = (role: string) =>
  ({ admin: "Admin", org_admin: "Org admin", responder: "Responder" })[role] ?? role;

/** user_roles has one row per role; the directory thinks in people. */
export function groupTeam(rows: RoleRow[], profiles: MemberProfile[]): TeamUser[] {
  const profileMap = new Map(profiles.map((p) => [p.user_id, p]));
  const users = new Map<string, TeamUser>();
  for (const row of rows) {
    const user = users.get(row.user_id) ?? {
      user_id: row.user_id,
      roles: [],
      organization_ids: [],
      profile: profileMap.get(row.user_id),
    };
    if (!user.roles.includes(row.role)) user.roles.push(row.role);
    if (row.organization_id && !user.organization_ids.includes(row.organization_id)) {
      user.organization_ids.push(row.organization_id);
    }
    users.set(row.user_id, user);
  }
  const rank = (r: string) => (ROLE_ORDER.includes(r) ? ROLE_ORDER.indexOf(r) : ROLE_ORDER.length);
  const name = (u: TeamUser) => u.profile?.full_name || "";
  return [...users.values()]
    .map((u) => ({ ...u, roles: [...u.roles].sort((a, b) => rank(a) - rank(b)) }))
    .sort((a, b) => name(a).localeCompare(name(b)) || a.user_id.localeCompare(b.user_id));
}

/** Who belongs to this organization, and who could be added to it. */
export function splitMembers(team: TeamUser[], organizationId: string) {
  const members = team.filter((u) => u.organization_ids.includes(organizationId));
  const candidates = team.filter((u) => !u.organization_ids.includes(organizationId));
  return { members, candidates };
}

// ---------------------------------------------------------------------------
// Referrals
// ---------------------------------------------------------------------------

export const REFERRAL_STATUSES = ["referred", "accepted", "declined", "completed"] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

export type ReferralCounts = Record<ReferralStatus, number> & { total: number };

export function referralCounts(rows: { status: string }[]): ReferralCounts {
  const counts: ReferralCounts = { referred: 0, accepted: 0, declined: 0, completed: 0, total: 0 };
  for (const r of rows) {
    if ((REFERRAL_STATUSES as readonly string[]).includes(r.status)) counts[r.status as ReferralStatus] += 1;
    counts.total += 1;
  }
  return counts;
}

/** Mirrors the update policy: admins, or an org admin of the receiving organization. */
export function canUpdateReferrals(access: { isAdmin: boolean; orgAdminOf: string[] }, organizationId: string) {
  return access.isAdmin || access.orgAdminOf.includes(organizationId);
}

/** Why an organization cannot be deleted, or null if it can. */
export function deleteBlockedReason(referralTotal: number): string | null {
  if (referralTotal <= 0) return null;
  return `${referralTotal} referral${referralTotal === 1 ? "" : "s"} point${
    referralTotal === 1 ? "s" : ""
  } here. Deactivate it instead, so the referral history stays intact.`;
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

const CSV_COLUMNS: { header: string; value: (o: Organization) => string }[] = [
  { header: "Name", value: (o) => o.name },
  { header: "Type", value: (o) => orgTypeLabel(o.type) },
  { header: "Active", value: (o) => (o.is_active ? "yes" : "no") },
  { header: "Accepts referrals", value: (o) => (o.accepts_referrals ? "yes" : "no") },
  { header: "Region", value: (o) => o.region ?? "" },
  { header: "Sub-city", value: (o) => o.subcity ?? "" },
  // A shelter's address never leaves the app in a file that can be forwarded.
  { header: "Address", value: (o) => (o.type === "shelter" ? "" : o.address ?? "") },
  { header: "Phone", value: (o) => o.phone ?? "" },
  { header: "Email", value: (o) => o.email ?? "" },
  { header: "Website", value: (o) => o.website ?? "" },
  { header: "Services", value: (o) => o.services.join("; ") },
  { header: "Hours", value: (o) => o.hours ?? "" },
  { header: "Updated", value: (o) => o.updated_at },
];

/**
 * One CSV cell. Quotes when needed, and defuses spreadsheet formulas: a cell
 * starting with = @ + - is prefixed with an apostrophe — except a phone number
 * like "+251 911…", which is left readable.
 */
export function csvCell(value: string): string {
  let v = value;
  if (/^[=@\t\r]/.test(v) || (/^[+-]./.test(v) && !/^[+-][\d\s()-]+$/.test(v))) v = `'${v}`;
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function organizationsToCsv(orgs: Organization[]): string {
  const lines = [CSV_COLUMNS.map((c) => csvCell(c.header)).join(",")];
  for (const org of orgs) lines.push(CSV_COLUMNS.map((c) => csvCell(c.value(org))).join(","));
  // CRLF per RFC 4180; Excel and Sheets both expect it.
  return lines.join("\r\n") + "\r\n";
}

export const csvFilename = (now: Date) => `haven-organizations-${now.toISOString().slice(0, 10)}.csv`;
