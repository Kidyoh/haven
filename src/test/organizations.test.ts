import { describe, expect, test } from "vitest";
import {
  applyDirectoryQuery,
  canUpdateReferrals,
  csvCell,
  csvFilename,
  DEFAULT_QUERY,
  deleteBlockedReason,
  directoryStats,
  EMPTY_FORM,
  filterOrganizations,
  formFromOrganization,
  groupTeam,
  matchesSearch,
  normalizeWebsite,
  organizationsToCsv,
  parseServices,
  payloadFromForm,
  referralCounts,
  sortOrganizations,
  splitMembers,
  validateOrganizationForm,
  type Organization,
} from "@/lib/organizations/directory";

let n = 0;
function org(overrides: Partial<Organization> = {}): Organization {
  n += 1;
  return {
    id: `o${n}`,
    name: `Org ${n}`,
    type: "police",
    region: "Addis Ababa",
    subcity: null,
    address: null,
    phone: null,
    email: null,
    website: null,
    services: [],
    hours: null,
    is_active: true,
    accepts_referrals: true,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("search", () => {
  const o = org({ name: "Gulele Police Station", subcity: "Gulélé", services: ["Legal advice", "Counselling"] });

  test("matches name, sub-city and services, ignoring case and accents", () => {
    expect(matchesSearch(o, "police")).toBe(true);
    expect(matchesSearch(o, "gulele")).toBe(true);
    expect(matchesSearch(o, "COUNSEL")).toBe(true);
  });

  test("every word must match somewhere", () => {
    expect(matchesSearch(o, "gulele legal")).toBe(true);
    expect(matchesSearch(o, "gulele shelter")).toBe(false);
  });

  test("blank search matches everything", () => {
    expect(matchesSearch(o, "   ")).toBe(true);
  });

  test("does not search the address or notes", () => {
    expect(matchesSearch(org({ address: "Secret Street", notes: "hidden" }), "secret")).toBe(false);
  });
});

describe("filter and sort", () => {
  const police = org({ name: "b police", type: "police", updated_at: "2026-03-01T00:00:00Z" });
  const shelter = org({ name: "A shelter", type: "shelter", is_active: false, updated_at: "2026-05-01T00:00:00Z" });
  const ngo = org({ name: "c ngo", type: "ngo", updated_at: "2026-04-01T00:00:00Z" });
  const all = [police, shelter, ngo];

  test("filters by type and by active state", () => {
    expect(filterOrganizations(all, { ...DEFAULT_QUERY, type: "shelter" })).toEqual([shelter]);
    expect(filterOrganizations(all, { ...DEFAULT_QUERY, active: "inactive" })).toEqual([shelter]);
    expect(filterOrganizations(all, { ...DEFAULT_QUERY, active: "active" })).toEqual([police, ngo]);
  });

  test("sorts by name case-insensitively, or by most recently updated", () => {
    expect(sortOrganizations(all, "name").map((o) => o.name)).toEqual(["A shelter", "b police", "c ngo"]);
    expect(sortOrganizations(all, "updated").map((o) => o.name)).toEqual(["A shelter", "c ngo", "b police"]);
  });

  test("sorting does not mutate the input", () => {
    const copy = [...all];
    sortOrganizations(all, "name");
    expect(all).toEqual(copy);
  });

  test("updated ties fall back to name", () => {
    const x = org({ name: "Zeta", updated_at: "2026-01-01T00:00:00Z" });
    const y = org({ name: "Alpha", updated_at: "2026-01-01T00:00:00Z" });
    expect(sortOrganizations([x, y], "updated").map((o) => o.name)).toEqual(["Alpha", "Zeta"]);
  });

  test("applyDirectoryQuery filters then sorts", () => {
    const result = applyDirectoryQuery(all, { search: "", type: "all", active: "active", sort: "updated" });
    expect(result.map((o) => o.name)).toEqual(["c ngo", "b police"]);
  });
});

describe("stats", () => {
  test("counts total, active and every type, with unknown types as other", () => {
    const stats = directoryStats([
      org({ type: "police" }),
      org({ type: "police", is_active: false }),
      org({ type: "shelter" }),
      org({ type: "fire" }),
    ]);
    expect(stats.total).toBe(4);
    expect(stats.active).toBe(3);
    expect(stats.inactive).toBe(1);
    expect(stats.byType).toEqual({ police: 2, ngo: 0, hospital: 0, shelter: 1, legal_aid: 0, government: 0, other: 1 });
  });

  test("empty directory", () => {
    expect(directoryStats([]).total).toBe(0);
  });
});

describe("form", () => {
  test("parses services on commas, semicolons and newlines, deduplicating", () => {
    expect(parseServices("Counselling, legal aid\nshelter;  counselling ,, ")).toEqual([
      "Counselling",
      "legal aid",
      "shelter",
    ]);
  });

  test("normalizes websites to http(s) only", () => {
    expect(normalizeWebsite("org.et")).toBe("https://org.et/");
    expect(normalizeWebsite("http://example.org/path")).toBe("http://example.org/path");
    expect(normalizeWebsite("javascript:alert(1)")).toBeNull();
    expect(normalizeWebsite("mailto:a@b.c")).toBeNull();
    expect(normalizeWebsite("not a site")).toBeNull();
    expect(normalizeWebsite("")).toBeNull();
    expect(normalizeWebsite(null)).toBeNull();
  });

  test("validates name, email and website", () => {
    expect(validateOrganizationForm(EMPTY_FORM)).toEqual({ name: "Name is required" });
    const errors = validateOrganizationForm({ ...EMPTY_FORM, name: "X", email: "nope", website: "javascript:x" });
    expect(Object.keys(errors).sort()).toEqual(["email", "website"]);
    expect(validateOrganizationForm({ ...EMPTY_FORM, name: "X", email: "a@b.et", website: "b.et" })).toEqual({});
  });

  test("payload trims, nulls blanks and parses lists", () => {
    const payload = payloadFromForm({
      ...EMPTY_FORM,
      name: "  Hope Shelter ",
      type: "shelter",
      subcity: " ",
      website: "hope.org",
      services: "Beds, food",
    });
    expect(payload).toMatchObject({
      name: "Hope Shelter",
      type: "shelter",
      subcity: null,
      website: "https://hope.org/",
      services: ["Beds", "food"],
    });
  });

  test("an organization with a retired type edits as other", () => {
    expect(formFromOrganization(org({ type: "fire" })).type).toBe("other");
  });
});

describe("members", () => {
  const rows = [
    { user_id: "u1", role: "responder", organization_id: "o-a" },
    { user_id: "u1", role: "admin", organization_id: "o-a" },
    { user_id: "u2", role: "org_admin", organization_id: "o-b" },
    { user_id: "u3", role: "responder", organization_id: null },
  ];
  const profiles = [
    { user_id: "u1", full_name: "Selam", phone_number: "+251911" },
    { user_id: "u2", full_name: "Abebe", phone_number: "+251922" },
  ];

  test("groups role rows into people, roles ordered by rank, names sorted", () => {
    const team = groupTeam(rows, profiles);
    expect(team.map((u) => u.user_id)).toEqual(["u3", "u2", "u1"]); // unnamed first, then A, S
    expect(team.find((u) => u.user_id === "u1")).toMatchObject({
      roles: ["admin", "responder"],
      organization_ids: ["o-a"],
      profile: { full_name: "Selam" },
    });
  });

  test("splits members of an organization from candidates", () => {
    const { members, candidates } = splitMembers(groupTeam(rows, profiles), "o-a");
    expect(members.map((u) => u.user_id)).toEqual(["u1"]);
    expect(candidates.map((u) => u.user_id).sort()).toEqual(["u2", "u3"]);
  });
});

describe("referrals", () => {
  test("counts by status", () => {
    expect(
      referralCounts([{ status: "referred" }, { status: "referred" }, { status: "completed" }, { status: "odd" }]),
    ).toEqual({ referred: 2, accepted: 0, declined: 0, completed: 1, total: 4 });
  });

  test("only admins and that organization's org admins may update", () => {
    expect(canUpdateReferrals({ isAdmin: true, orgAdminOf: [] }, "o1")).toBe(true);
    expect(canUpdateReferrals({ isAdmin: false, orgAdminOf: ["o1"] }, "o1")).toBe(true);
    expect(canUpdateReferrals({ isAdmin: false, orgAdminOf: ["o2"] }, "o1")).toBe(false);
  });

  test("delete is blocked while referrals exist", () => {
    expect(deleteBlockedReason(0)).toBeNull();
    expect(deleteBlockedReason(1)).toMatch(/^1 referral points here/);
    expect(deleteBlockedReason(3)).toMatch(/^3 referrals point here/);
  });
});

describe("csv", () => {
  test("quotes commas, quotes and newlines", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a, b")).toBe('"a, b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
  });

  test("defuses formulas but leaves phone numbers readable", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("+cmd")).toBe("'+cmd");
    expect(csvCell("+251 911 000 000")).toBe("+251 911 000 000");
    expect(csvCell("-")).toBe("-");
  });

  test("exports a header and one row per organization, CRLF-terminated", () => {
    const csv = organizationsToCsv([
      org({ name: "Hope, Inc", type: "legal_aid", services: ["Court", "Advice"], phone: "+251 911" }),
    ]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(
      "Name,Type,Active,Accepts referrals,Region,Sub-city,Address,Phone,Email,Website,Services,Hours,Updated",
    );
    expect(lines[1]).toBe('"Hope, Inc",Legal aid,yes,yes,Addis Ababa,,,+251 911,,,Court; Advice,,2026-01-01T00:00:00Z');
    expect(lines[2]).toBe("");
  });

  test("never exports a shelter's address", () => {
    const csv = organizationsToCsv([
      org({ type: "shelter", address: "Behind the church" }),
      org({ type: "hospital", address: "Churchill Ave" }),
    ]);
    expect(csv).not.toContain("Behind the church");
    expect(csv).toContain("Churchill Ave");
  });

  test("filename carries the date", () => {
    expect(csvFilename(new Date("2026-09-15T10:00:00Z"))).toBe("haven-organizations-2026-09-15.csv");
  });
});

describe("referral lifecycle", () => {
  test("only forward moves are offered, and final states offer none", async () => {
    const { nextReferralStatuses } = await import("@/lib/organizations/directory");
    expect(nextReferralStatuses("referred")).toEqual(["accepted", "declined"]);
    expect(nextReferralStatuses("accepted")).toEqual(["completed", "declined"]);
    expect(nextReferralStatuses("declined")).toEqual([]);
    expect(nextReferralStatuses("completed")).toEqual([]);
  });
});
