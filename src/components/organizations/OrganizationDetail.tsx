import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, CheckCircle, Clock, Globe, Mail, MapPin, Pencil, Phone, Send, Trash2, UserMinus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Callout, Spinner } from "@/components/haven/Feedback";
import { ActivePill, QuickActions, ReferralStatusPill, TypeBadge } from "./Badges";
import {
  canUpdateReferrals,
  nextReferralStatuses,
  deleteBlockedReason,
  normalizeWebsite,
  REFERRAL_STATUSES,
  roleLabel,
  splitMembers,
  type Organization,
  type ReferralCounts,
  type TeamUser,
} from "@/lib/organizations/directory";
import {
  assignMember,
  fetchReferralSummary,
  fetchTeam,
  removeMember,
  updateReferralStatus,
  type DirectoryAccess,
  type ReferralItem,
} from "@/lib/organizations/data";

/**
 * Everything about one organization: profile, referral history, members, and
 * the edit / deactivate / delete actions its viewer is allowed.
 */
export function OrganizationDetail({
  org,
  organizations,
  access,
  onOpenChange,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  org: Organization | null;
  /** The whole directory, to name the organization a candidate member would leave. */
  organizations: Organization[];
  access: DirectoryAccess;
  onOpenChange: (open: boolean) => void;
  onEdit: (org: Organization) => void;
  onToggleActive: (org: Organization) => void;
  onDelete: (org: Organization) => void;
}) {
  return (
    <Sheet open={org !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg">
        {org && (
          // Keyed so switching organizations starts every section from scratch.
          <DetailBody
            key={org.id}
            org={org}
            organizations={organizations}
            access={access}
            onEdit={onEdit}
            onToggleActive={onToggleActive}
            onDelete={onDelete}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailBody({
  org,
  organizations,
  access,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  org: Organization;
  organizations: Organization[];
  access: DirectoryAccess;
  onEdit: (org: Organization) => void;
  onToggleActive: (org: Organization) => void;
  onDelete: (org: Organization) => void;
}) {
  const referrals = useReferrals(org.id);
  const canManage = access.isAdmin || access.orgAdminOf.includes(org.id);

  return (
    <>
      <SheetHeader className="space-y-3 border-b border-border p-6 pr-12 text-left">
        <SheetTitle className="font-display text-xl leading-tight">{org.name}</SheetTitle>
        <SheetDescription asChild>
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={org.type} />
            <ActivePill active={org.is_active} />
            {!org.accepts_referrals && <span className="text-xs text-muted-foreground">Not accepting referrals</span>}
          </div>
        </SheetDescription>
        <QuickActions org={org} />
      </SheetHeader>

      <div className="flex-1 space-y-6 p-6">
        <Profile org={org} />
        <Referrals org={org} access={access} referrals={referrals} />
        <Members org={org} organizations={organizations} canAssign={access.isAdmin} />
      </div>

      {canManage && (
        <Actions
          org={org}
          isAdmin={access.isAdmin}
          referralTotal={referrals.counts?.total ?? null}
          onEdit={onEdit}
          onToggleActive={onToggleActive}
          onDelete={onDelete}
        />
      )}
    </>
  );
}

const Section = ({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) => (
  <section>
    <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-foreground [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-muted-foreground">
      {icon}
      {title}
    </h3>
    {children}
  </section>
);

const Row = ({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) => (
  <div className="flex gap-3 py-2">
    <dt className="mt-0.5 shrink-0 text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">
      {icon}
      <span className="sr-only">{label}</span>
    </dt>
    <dd className="min-w-0 break-words text-sm text-foreground">{children}</dd>
  </div>
);

function Profile({ org }: { org: Organization }) {
  const website = normalizeWebsite(org.website);
  const place = [org.address, org.subcity, org.region].filter(Boolean).join(", ");
  return (
    <div className="space-y-4">
      <dl className="divide-y divide-border rounded-xl border border-border bg-card px-4">
        <Row icon={<MapPin />} label="Location">
          {place || <span className="text-muted-foreground">No location recorded</span>}
        </Row>
        {org.phone && (
          <Row icon={<Phone />} label="Phone">
            <a href={`tel:${org.phone.replace(/[^\d+]/g, "")}`} className="hover:text-haven-gold hover:underline">
              {org.phone}
            </a>
          </Row>
        )}
        {org.email && (
          <Row icon={<Mail />} label="Email">
            <a href={`mailto:${org.email}`} className="hover:text-haven-gold hover:underline">
              {org.email}
            </a>
          </Row>
        )}
        {website && (
          <Row icon={<Globe />} label="Website">
            <a href={website} target="_blank" rel="noopener noreferrer" className="hover:text-haven-gold hover:underline">
              {org.website}
            </a>
          </Row>
        )}
        {org.hours && (
          <Row icon={<Clock />} label="Hours">
            {org.hours}
          </Row>
        )}
      </dl>

      {org.services.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Services">
          {org.services.map((s) => (
            <li key={s} className="rounded-full bg-haven-gold/10 px-2.5 py-1 text-xs font-medium text-haven-gold">
              {s}
            </li>
          ))}
        </ul>
      )}

      {org.notes && <p className="whitespace-pre-line text-sm text-muted-foreground">{org.notes}</p>}

      <p className="text-xs text-muted-foreground">Updated {new Date(org.updated_at).toLocaleString()}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Referrals
// ---------------------------------------------------------------------------

function useReferrals(orgId: string) {
  const [state, setState] = useState<{ counts: ReferralCounts; latest: ReferralItem[] } | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await fetchReferralSummary(orgId));
      setError(false);
    } catch {
      setError(true);
    }
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  return { counts: state?.counts, latest: state?.latest, loaded: state !== null, error, reload: load };
}

function Referrals({
  org,
  access,
  referrals,
}: {
  org: Organization;
  access: DirectoryAccess;
  referrals: ReturnType<typeof useReferrals>;
}) {
  const { counts, latest, loaded, error, reload } = referrals;
  const [updating, setUpdating] = useState<string | null>(null);
  const editable = canUpdateReferrals(access, org.id);

  const changeStatus = async (item: ReferralItem, status: string) => {
    setUpdating(item.id);
    const err = await updateReferralStatus(item.id, status);
    setUpdating(null);
    if (err) toast.error(err);
    else {
      toast.success(`Referral marked ${status}`);
      reload();
    }
  };

  return (
    <Section title="Referrals" icon={<Send />}>
      {error ? (
        <Callout tone="danger" title="Could not load referrals" />
      ) : !loaded || !counts || !latest ? (
        <div className="flex justify-center py-6">
          <Spinner tone="gold" size="sm" label="Loading referrals" />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {REFERRAL_STATUSES.map((s) => (
              <div key={s} className="rounded-xl border border-border bg-card px-3 py-2">
                <p className="text-xs capitalize text-muted-foreground">{s}</p>
                <p className="tabular font-display text-xl font-bold text-foreground">{counts[s]}</p>
              </div>
            ))}
          </div>

          {latest.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
              No incidents have been referred here yet.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">
              {latest.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs text-foreground">{item.reference_number ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString()}</p>
                  </div>
                  {editable && nextReferralStatuses(item.status).length > 0 ? (
                    <Select
                      value={item.status}
                      onValueChange={(v) => changeStatus(item, v)}
                      disabled={updating === item.id}
                    >
                      <SelectTrigger
                        className="h-9 w-32 rounded-lg bg-background text-xs capitalize"
                        aria-label={`Status of referral ${item.reference_number ?? ""}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[item.status, ...nextReferralStatuses(item.status)].map((s) => (
                          <SelectItem key={s} value={s} className="capitalize">
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <ReferralStatusPill status={item.status} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

function Members({
  org,
  organizations,
  canAssign,
}: {
  org: Organization;
  organizations: Organization[];
  canAssign: boolean;
}) {
  const [team, setTeam] = useState<TeamUser[] | null>(null);
  const [pick, setPick] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => fetchTeam().then(setTeam), []);
  useEffect(() => {
    load();
  }, [load]);

  const { members, candidates } = useMemo(() => splitMembers(team ?? [], org.id), [team, org.id]);
  const orgName = useMemo(() => new Map(organizations.map((o) => [o.id, o.name])), [organizations]);

  const assign = async () => {
    if (!pick) return;
    setBusy(true);
    const { error } = await assignMember(pick, org.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Member added");
    setPick("");
    load();
  };

  const remove = async (user: TeamUser) => {
    setBusy(true);
    const { error } = await removeMember(user.user_id, org.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${user.profile?.full_name || "Member"} removed from ${org.name}`);
    load();
  };

  return (
    <Section title={`Members${team ? ` (${members.length})` : ""}`} icon={<Users />}>
      {team === null ? (
        <div className="flex justify-center py-6">
          <Spinner tone="gold" size="sm" label="Loading members" />
        </div>
      ) : (
        <div className="space-y-3">
          {members.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
              Nobody on the team belongs to this organization yet.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">
              {members.map((m) => (
                <li key={m.user_id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{m.profile?.full_name || "Unknown"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.roles.map(roleLabel).join(", ")}
                      {m.profile?.phone_number && (
                        <>
                          {" · "}
                          <a href={`tel:${m.profile.phone_number}`} className="hover:text-haven-gold">
                            {m.profile.phone_number}
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                  {canAssign && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => remove(m)}
                      aria-label={`Remove ${m.profile?.full_name || "member"} from ${org.name}`}
                    >
                      <UserMinus />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canAssign &&
            (candidates.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Everyone on the team is already here. Invite new people from the dashboard team tab.
              </p>
            ) : (
              <div className="flex gap-2">
                <Select value={pick} onValueChange={setPick}>
                  <SelectTrigger className="h-11 flex-1 rounded-xl bg-card" aria-label="Team member to add">
                    <SelectValue placeholder="Add a team member…" />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((c) => {
                      const current = c.organization_ids.map((id) => orgName.get(id)).filter(Boolean);
                      return (
                        <SelectItem key={c.user_id} value={c.user_id}>
                          {c.profile?.full_name || "Unknown"} · {c.roles.map(roleLabel).join(", ")}
                          {current.length > 0 && ` (moves from ${current.join(", ")})`}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <Button variant="gold" onClick={assign} disabled={!pick || busy}>
                  Add
                </Button>
              </div>
            ))}
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function Actions({
  org,
  isAdmin,
  referralTotal,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  org: Organization;
  isAdmin: boolean;
  /** null while the count is loading (or failed): delete stays off until it is known. */
  referralTotal: number | null;
  onEdit: (org: Organization) => void;
  onToggleActive: (org: Organization) => void;
  onDelete: (org: Organization) => void;
}) {
  const loaded = referralTotal !== null;
  const blocked = loaded ? deleteBlockedReason(referralTotal) : null;

  return (
    <div className="sticky bottom-0 space-y-3 border-t border-border bg-background/95 p-4 backdrop-blur">
      <div className="flex flex-wrap gap-2">
        <Button variant="gold" onClick={() => onEdit(org)} className="flex-1">
          <Pencil />
          Edit
        </Button>
        {org.is_active ? (
          <Button variant="subtle" onClick={() => onToggleActive(org)} className="flex-1">
            <Ban />
            Deactivate
          </Button>
        ) : (
          <Button variant="safe" onClick={() => onToggleActive(org)} className="flex-1">
            <CheckCircle />
            Reactivate
          </Button>
        )}
        {isAdmin && (
          <Button
            variant="ghost"
            onClick={() => onDelete(org)}
            disabled={!loaded || blocked !== null}
            aria-describedby={blocked ? "org-delete-blocked" : undefined}
            className="hover:text-sos"
          >
            <Trash2 />
            Delete
          </Button>
        )}
      </div>
      {isAdmin && blocked && (
        <p id="org-delete-blocked" className="text-xs text-muted-foreground">
          Delete is off: {blocked}
        </p>
      )}
    </div>
  );
}
