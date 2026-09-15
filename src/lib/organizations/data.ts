import { supabase } from "@/integrations/supabase/client";
import {
  groupTeam,
  REFERRAL_STATUSES,
  type MemberProfile,
  type Organization,
  type ReferralCounts,
  type RoleRow,
  type TeamUser,
} from "./directory";

/**
 * Every Supabase read and write the organizations screens make. Kept apart
 * from directory.ts so the pure logic can be tested without a client.
 */

export interface DirectoryAccess {
  /** A HAVEN admin: full control of every organization. */
  isAdmin: boolean;
  /** Organizations this user is an org admin of. */
  orgAdminOf: string[];
  /** Holds the org_admin role at all, assigned to an organization or not. */
  isOrgAdmin: boolean;
}

export async function fetchAccess(userId: string): Promise<DirectoryAccess> {
  const { data, error } = await supabase.from("user_roles").select("role, organization_id").eq("user_id", userId);
  // A failed lookup is not the same as having no role: let the page offer a retry.
  if (error) throw error;
  const rows = data ?? [];
  return {
    isAdmin: rows.some((r) => r.role === "admin"),
    isOrgAdmin: rows.some((r) => r.role === "org_admin"),
    orgAdminOf: rows.filter((r) => r.role === "org_admin" && r.organization_id).map((r) => r.organization_id!),
  };
}

export async function fetchOrganizations(): Promise<Organization[]> {
  const { data, error } = await supabase.from("organizations").select("*").order("name");
  if (error) throw error;
  return (data ?? []).map((o) => ({ ...o, services: o.services ?? [] }));
}

/**
 * Everyone this user can see in user_roles, as people. For an admin that is
 * the whole team; for an org admin, their own organization.
 */
export async function fetchTeam(): Promise<TeamUser[]> {
  const { data: roles } = await supabase.from("user_roles").select("user_id, role, organization_id");
  const rows = (roles ?? []) as RoleRow[];
  if (rows.length === 0) return [];
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, full_name, phone_number")
    .in("user_id", userIds);
  return groupTeam(rows, (profiles ?? []) as MemberProfile[]);
}

/** Every role row of the user moves to this organization. */
export const assignMember = (userId: string, organizationId: string) =>
  supabase.from("user_roles").update({ organization_id: organizationId }).eq("user_id", userId);

export const removeMember = (userId: string, organizationId: string) =>
  supabase
    .from("user_roles")
    .update({ organization_id: null })
    .eq("user_id", userId)
    .eq("organization_id", organizationId);

export interface ReferralItem {
  id: string;
  status: string;
  created_at: string;
  reference_number: string | null;
}

/**
 * Exact counts per status (head requests, so the row cap never undercounts)
 * plus the latest ten referrals.
 */
export async function fetchReferralSummary(
  organizationId: string,
): Promise<{ counts: ReferralCounts; latest: ReferralItem[] }> {
  const countFor = (status: string) =>
    supabase
      .from("incident_referrals")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", status);

  const [latestRes, ...countRes] = await Promise.all([
    supabase
      .from("incident_referrals")
      .select("id, status, created_at, incidents(reference_number)")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(10),
    ...REFERRAL_STATUSES.map(countFor),
  ]);
  if (latestRes.error) throw latestRes.error;
  const failed = countRes.find((r) => r.error);
  if (failed?.error) throw failed.error;

  const counts = { referred: 0, accepted: 0, declined: 0, completed: 0, total: 0 } as ReferralCounts;
  REFERRAL_STATUSES.forEach((status, i) => {
    counts[status] = countRes[i].count ?? 0;
    counts.total += counts[status];
  });

  const latest = (latestRes.data ?? []).map((r) => ({
    id: r.id,
    status: r.status,
    created_at: r.created_at,
    reference_number: r.incidents?.reference_number ?? null,
  }));
  return { counts, latest };
}

/** Resolves to an error message, or null on success. Zero rows updated counts as a failure. */
export async function updateReferralStatus(referralId: string, status: string): Promise<string | null> {
  const { data, error } = await supabase.from("incident_referrals").update({ status }).eq("id", referralId).select("id");
  if (error) return error.message;
  return data && data.length > 0 ? null : "You no longer have permission to update this referral.";
}
