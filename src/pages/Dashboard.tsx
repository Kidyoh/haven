import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity, AlertTriangle, Building2, CheckCircle, Copy, Eye, EyeOff, LogOut,
  MapPin, Phone, Search, TrendingUp, UserPlus, Users,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Container, IconTile, PageHeader, Screen, type Tone } from "@/components/haven/Screen";
import { Callout, EmptyState, ScreenLoader, Spinner, StatusPill } from "@/components/haven/Feedback";
import { Field, TextField } from "@/components/haven/Field";

type Tab = "overview" | "incidents" | "analytics" | "team";

interface Incident {
  id: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
  latitude: number | null;
  longitude: number | null;
  reference_number: string;
  user_id: string;
  battery_level: number | null;
  signal_strength: string | null;
  audio_url: string | null;
}

interface Profile {
  user_id: string;
  full_name: string;
  phone_number: string;
}

interface RoleRow {
  user_id: string;
  role: string;
  created_at: string;
}

type TeamMember = RoleRow & { profile?: Profile };

/**
 * Roles and profiles live in separate tables with no join, so the team list is
 * two queries stitched on user_id. Both the initial load and the refresh after
 * an invite go through here.
 */
async function loadTeam(): Promise<TeamMember[]> {
  const { data: roles } = await supabase
    .from("user_roles")
    .select("user_id, role, created_at, organizations(name)");
  if (!roles) return [];

  const rows = roles as unknown as RoleRow[];
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const { data: teamProfiles } = await supabase
    .from("profiles")
    .select("user_id, full_name, phone_number")
    .in("user_id", userIds);

  const profileMap = new Map((teamProfiles ?? []).map((p) => [p.user_id, p as Profile]));
  return rows.map((r) => ({ ...r, profile: profileMap.get(r.user_id) }));
}

const Dashboard = () => {
  const [tab, setTab] = useState<Tab>("overview");
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "resolved">("all");
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  // Team management state
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("responder");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  // Check responder role
  useEffect(() => {
    if (!user) return;
    const checkRole = async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (!roles || roles.length === 0) {
        setAuthorized(false);
        navigate("/respond", { replace: true });
      } else {
        setAuthorized(true);
        setIsAdmin(roles.some((r) => r.role === "admin" || r.role === "org_admin"));
      }
    };
    checkRole();
  }, [user, navigate]);

  useEffect(() => {
    if (authorized !== true) return;
    const fetchData = async () => {
      const [incidentRes, profileRes] = await Promise.all([
        supabase.from("incidents").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("user_id, full_name, phone_number"),
      ]);

      if (incidentRes.data) setIncidents(incidentRes.data);
      if (profileRes.data) {
        const map = new Map<string, Profile>();
        profileRes.data.forEach((p) => map.set(p.user_id, p));
        setProfiles(map);
      }
      setLoading(false);
    };

    fetchData();

    // Realtime subscription
    const channel = supabase
      .channel("dashboard-incidents")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "incidents" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setIncidents((prev) => [payload.new as Incident, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setIncidents((prev) =>
              prev.map((i) => (i.id === (payload.new as Incident).id ? (payload.new as Incident) : i))
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authorized]);

  // Fetch team members
  useEffect(() => {
    if (!authorized || !isAdmin) return;
    loadTeam().then(setTeamMembers);
  }, [authorized, isAdmin]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteLoading(true);
    setTempPassword(null);

    const { data, error } = await supabase.functions.invoke("invite-responder", {
      body: {
        email: inviteEmail,
        full_name: inviteName,
        phone: invitePhone,
        role: inviteRole,
      },
    });

    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Failed to invite user");
      setInviteLoading(false);
      return;
    }

    setTempPassword(data.temp_password);
    toast.success(`${inviteName} has been added as ${inviteRole}`);
    setInviteEmail("");
    setInviteName("");
    setInvitePhone("");
    setInviteLoading(false);

    setTeamMembers(await loadTeam());
  };

  const handleResolve = async (incidentId: string) => {
    await supabase
      .from("incidents")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("id", incidentId);
  };

  const filteredIncidents = incidents.filter((i) => {
    const matchesSearch =
      search === "" ||
      i.reference_number.toLowerCase().includes(search.toLowerCase()) ||
      (profiles.get(i.user_id)?.full_name || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && i.status === "active") ||
      (statusFilter === "resolved" && i.status !== "active");
    return matchesSearch && matchesStatus;
  });

  const activeCount = incidents.filter((i) => i.status === "active").length;
  const resolvedCount = incidents.filter((i) => i.status !== "active").length;
  const totalUsers = new Set(incidents.map((i) => i.user_id)).size;

  // Analytics: incidents per day (last 7 days)
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().split("T")[0];
  });

  const incidentsPerDay = last7Days.map((day) => ({
    day: new Date(day).toLocaleDateString(undefined, { weekday: "short" }),
    count: incidents.filter((i) => i.created_at.startsWith(day)).length,
  }));

  const maxDayCount = Math.max(...incidentsPerDay.map((d) => d.count), 1);

  if (loading || authorized === null) return <ScreenLoader />;

  const tabs: Tab[] = ["overview", "incidents", "analytics", ...(isAdmin ? (["team"] as Tab[]) : [])];

  return (
    <Screen>
      <PageHeader
        brand
        sticky
        width="full"
        subtitle="Response dashboard"
        actions={
          <>
            {isAdmin && (
              <Button variant="subtle" size="sm" onClick={() => navigate("/organizations")}>
                <Building2 />
                <span className="hidden sm:inline">Organizations</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                signOut();
                navigate("/");
              }}
            >
              <LogOut />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </>
        }
      />

      <Container width="full" as="main" className="flex-1 py-6">
        {/* Tabs */}
        <div role="tablist" aria-label="Dashboard sections" className="mb-6 flex w-fit max-w-full flex-wrap gap-1 rounded-2xl bg-card p-1">
          {tabs.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "min-h-10 rounded-xl px-4 text-sm font-medium capitalize transition-colors",
                tab === t ? "bg-sos text-destructive-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="space-y-5">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard icon={<AlertTriangle />} label="Active alerts" value={activeCount} tone="sos" />
              <StatCard icon={<CheckCircle />} label="Resolved" value={resolvedCount} tone="safe" />
              <StatCard icon={<Activity />} label="Total incidents" value={incidents.length} tone="gold" />
              <StatCard icon={<Users />} label="Users affected" value={totalUsers} tone="muted" />
            </div>

            {/* Active incidents */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-display text-lg">
                  <span
                    className={cn("h-2 w-2 rounded-full", activeCount > 0 ? "animate-alert-pulse bg-sos" : "bg-safe")}
                  />
                  Active alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                {activeCount === 0 ? (
                  <EmptyState
                    icon={<CheckCircle />}
                    tone="safe"
                    title="No active alerts"
                    description="Every incident has been resolved. New ones appear here the moment they are sent."
                  />
                ) : (
                  <div className="space-y-3">
                    {incidents
                      .filter((i) => i.status === "active")
                      .slice(0, 5)
                      .map((incident) => {
                        const profile = profiles.get(incident.user_id);
                        return (
                          <div
                            key={incident.id}
                            className="flex flex-col gap-3 rounded-2xl border border-sos/20 bg-sos/5 p-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-foreground">
                                  {profile?.full_name || "Unknown user"}
                                </p>
                                <p className="font-mono text-xs text-muted-foreground">
                                  {incident.reference_number}
                                </p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {new Date(incident.created_at).toLocaleString()}
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                {incident.latitude && (
                                  <Button asChild size="icon" variant="subtle" aria-label="Open location on a map">
                                    <a
                                      href={`https://maps.google.com/?q=${incident.latitude},${incident.longitude}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      <MapPin />
                                    </a>
                                  </Button>
                                )}
                                {profile?.phone_number && (
                                  <Button asChild size="icon" variant="subtle" aria-label={`Call ${profile.full_name}`}>
                                    <a href={`tel:${profile.phone_number}`}>
                                      <Phone />
                                    </a>
                                  </Button>
                                )}
                                <Button variant="safe" onClick={() => handleResolve(incident.id)}>
                                  Resolve
                                </Button>
                              </div>
                            </div>
                            {incident.audio_url && (
                              <audio controls src={incident.audio_url} className="h-9 w-full" preload="none" />
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent activity */}
            <Card>
              <CardHeader>
                <CardTitle className="font-display text-lg">Recent activity</CardTitle>
              </CardHeader>
              <CardContent>
                {incidents.length === 0 ? (
                  <EmptyState icon={<Activity />} title="Nothing yet" description="Incidents will be listed here." />
                ) : (
                  <ul>
                    {incidents.slice(0, 8).map((incident) => {
                      const profile = profiles.get(incident.user_id);
                      return (
                        <li
                          key={incident.id}
                          className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0 last:pb-0"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span
                              className={cn(
                                "h-2 w-2 shrink-0 rounded-full",
                                incident.status === "active" ? "bg-sos" : "bg-safe",
                              )}
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm text-foreground">{profile?.full_name || "Unknown"}</p>
                              <p className="font-mono text-xs text-muted-foreground">{incident.reference_number}</p>
                            </div>
                          </div>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {new Date(incident.created_at).toLocaleDateString()}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {tab === "incidents" && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by name or reference…"
                  aria-label="Search incidents"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div role="group" aria-label="Filter by status" className="flex gap-1 rounded-2xl bg-card p-1">
                {(["all", "active", "resolved"] as const).map((s) => (
                  <button
                    key={s}
                    aria-pressed={statusFilter === s}
                    onClick={() => setStatusFilter(s)}
                    className={cn(
                      "min-h-9 flex-1 rounded-xl px-3 text-xs font-medium capitalize transition-colors sm:flex-none",
                      statusFilter === s ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reference</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Audio</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredIncidents.length === 0 ? (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={8} className="p-0">
                            <EmptyState
                              icon={<Search />}
                              title="No incidents found"
                              description={
                                search || statusFilter !== "all"
                                  ? "Nothing matches that search or filter."
                                  : "No incidents have been reported yet."
                              }
                            />
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredIncidents.map((incident) => {
                          const profile = profiles.get(incident.user_id);
                          return (
                            <TableRow key={incident.id}>
                              <TableCell className="font-mono text-xs">{incident.reference_number}</TableCell>
                              <TableCell className="font-medium">{profile?.full_name || "Unknown"}</TableCell>
                              <TableCell className="whitespace-nowrap text-xs">
                                {profile?.phone_number ? (
                                  <a href={`tel:${profile.phone_number}`} className="hover:text-haven-gold">
                                    {profile.phone_number}
                                  </a>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <StatusPill active={incident.status === "active"} />
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                {new Date(incident.created_at).toLocaleDateString()}
                              </TableCell>
                              <TableCell>
                                {incident.latitude ? (
                                  <a
                                    href={`https://maps.google.com/?q=${incident.latitude},${incident.longitude}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-xs font-medium text-haven-gold hover:underline"
                                  >
                                    <MapPin className="h-3 w-3" /> Map
                                  </a>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {incident.audio_url ? (
                                  <audio controls src={incident.audio_url} className="h-8 max-w-[180px]" preload="none" />
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {incident.status === "active" && (
                                  <Button size="sm" variant="safe" onClick={() => handleResolve(incident.id)}>
                                    Resolve
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {tab === "analytics" && (
          <div className="space-y-5">
            {/* Weekly chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-display text-lg">
                  <TrendingUp className="h-5 w-5 text-muted-foreground" />
                  Incidents this week
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex h-44 items-end gap-2">
                  {incidentsPerDay.map((day) => (
                    <div key={day.day} className="flex flex-1 flex-col items-center gap-1.5">
                      <span className="tabular text-xs font-medium text-foreground">{day.count}</span>
                      <div
                        className="w-full rounded-t-lg bg-sos/50 transition-all"
                        style={{ height: `${Math.max((day.count / maxDayCount) * 100, 3)}%` }}
                      />
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{day.day}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Summary cards */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <MetricCard
                label="Avg resolution time"
                value={
                  incidents.filter((i) => i.resolved_at).length > 0
                    ? `${Math.round(
                        incidents
                          .filter((i) => i.resolved_at)
                          .reduce(
                            (acc, i) =>
                              acc +
                              (new Date(i.resolved_at!).getTime() - new Date(i.created_at).getTime()) / 60000,
                            0
                          ) / incidents.filter((i) => i.resolved_at).length
                      )} min`
                    : "—"
                }
              />
              <MetricCard
                label="Resolution rate"
                value={incidents.length > 0 ? `${Math.round((resolvedCount / incidents.length) * 100)}%` : "—"}
              />
            </div>
          </div>
        )}

        {tab === "team" && isAdmin && (
          <div className="space-y-5">
            {/* Invite form */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-display text-lg">
                  <UserPlus className="h-5 w-5 text-muted-foreground" />
                  Invite a responder
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleInvite} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <TextField
                      label="Full name"
                      required
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      placeholder="Officer Kebede"
                    />
                    <TextField
                      label="Email"
                      required
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="kebede@police.gov.et"
                    />
                    <TextField
                      label="Phone"
                      optional
                      type="tel"
                      value={invitePhone}
                      onChange={(e) => setInvitePhone(e.target.value)}
                      placeholder="+251 9XX XXX XXX"
                    />
                    <Field label="Role">
                      {(a11y) => (
                        <Select value={inviteRole} onValueChange={setInviteRole}>
                          <SelectTrigger id={a11y.id} className="h-11 rounded-xl bg-card">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="responder">Responder</SelectItem>
                            <SelectItem value="org_admin">Organization admin</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </Field>
                  </div>
                  <Button type="submit" variant="sos" disabled={inviteLoading}>
                    {inviteLoading ? (
                      <Spinner size="sm" tone="current" label="Creating account" />
                    ) : (
                      <>
                        <UserPlus />
                        Create &amp; invite
                      </>
                    )}
                  </Button>
                </form>

                {tempPassword && (
                  <Callout tone="safe" icon={<CheckCircle />} title="Account created" className="mt-4">
                    <p className="text-xs leading-relaxed">
                      Share this temporary password with them. They should change it after the first sign-in.
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <code className="flex-1 truncate rounded-xl bg-card px-3 py-2.5 font-mono text-sm text-foreground">
                        {showPassword ? tempPassword : "••••••••••••"}
                      </code>
                      <Button
                        variant="subtle"
                        size="icon"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff /> : <Eye />}
                      </Button>
                      <Button
                        variant="subtle"
                        size="icon"
                        aria-label="Copy password"
                        onClick={() => {
                          navigator.clipboard.writeText(tempPassword);
                          toast.success("Password copied to clipboard");
                        }}
                      >
                        <Copy />
                      </Button>
                    </div>
                  </Callout>
                )}
              </CardContent>
            </Card>

            {/* Team list */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-display text-lg">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  Team members ({teamMembers.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {teamMembers.length === 0 ? (
                  <EmptyState
                    icon={<Users />}
                    title="No team members yet"
                    description="Invite your first responder using the form above."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Added</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {teamMembers.map((member) => (
                          <TableRow key={`${member.user_id}-${member.role}`}>
                            <TableCell className="font-medium">{member.profile?.full_name || "Unknown"}</TableCell>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                              {member.profile?.phone_number || "—"}
                            </TableCell>
                            <TableCell>
                              <RoleBadge role={member.role} />
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                              {new Date(member.created_at).toLocaleDateString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </Container>
    </Screen>
  );
};

/**
 * Tones are picked from a fixed map, never interpolated into a class name —
 * Tailwind only emits classes it can see as complete strings in the source.
 */
const StatCard = ({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: Tone;
}) => (
  <div className="rounded-2xl border border-border bg-card p-4">
    <div className="flex items-center gap-3">
      <IconTile tone={tone}>{icon}</IconTile>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="tabular font-display text-2xl font-bold text-foreground">{value}</p>
      </div>
    </div>
  </div>
);

const MetricCard = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-2xl border border-border bg-card p-5">
    <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className="tabular mt-1 font-display text-2xl font-bold text-foreground">{value}</p>
  </div>
);

const ROLE_STYLES: Record<string, string> = {
  admin: "bg-haven-gold/10 text-haven-gold",
  org_admin: "bg-warning/10 text-warning",
  responder: "bg-safe/10 text-safe",
};

const RoleBadge = ({ role }: { role: string }) => (
  <span
    className={cn(
      "inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold",
      ROLE_STYLES[role] ?? "bg-secondary text-muted-foreground",
    )}
  >
    {role === "org_admin" ? "Org admin" : role.charAt(0).toUpperCase() + role.slice(1)}
  </span>
);

export default Dashboard;
