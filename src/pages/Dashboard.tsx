import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Shield, MapPin, Users, BarChart3, AlertTriangle, CheckCircle,
  Clock, LogOut, Search, Filter, ChevronRight, Activity, TrendingUp,
  Phone, Mail, UserPlus, Copy, Eye, EyeOff, Trash2
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { toast } from "sonner";

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
}

interface Profile {
  user_id: string;
  full_name: string;
  phone_number: string;
}

const Dashboard = () => {
  const [tab, setTab] = useState<Tab>("overview");
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "resolved">("all");
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  // Team management state
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
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

  if (loading || authorized === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-sos border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sos/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-sos" />
            </div>
            <div>
              <h1 className="font-display font-bold text-lg tracking-[0.2em] text-foreground">HAVEN</h1>
              <p className="text-xs text-muted-foreground">Response Dashboard</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { signOut(); navigate("/"); }}>
            <LogOut className="w-4 h-4 mr-2" /> Sign Out
          </Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 p-1 rounded-xl bg-card w-fit">
          {(["overview", "incidents", "analytics"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                tab === t
                  ? "bg-sos text-destructive-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                icon={<AlertTriangle className="w-5 h-5" />}
                label="Active Alerts"
                value={activeCount}
                color="sos"
              />
              <StatCard
                icon={<CheckCircle className="w-5 h-5" />}
                label="Resolved"
                value={resolvedCount}
                color="safe"
              />
              <StatCard
                icon={<Activity className="w-5 h-5" />}
                label="Total Incidents"
                value={incidents.length}
                color="warning"
              />
              <StatCard
                icon={<Users className="w-5 h-5" />}
                label="Users Affected"
                value={totalUsers}
                color="muted"
              />
            </div>

            {/* Active incidents */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-sos animate-alert-pulse" />
                  Active Alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                {activeCount === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="w-10 h-10 text-safe mx-auto mb-3" />
                    <p className="text-muted-foreground text-sm">No active alerts</p>
                  </div>
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
                            className="flex items-center justify-between p-4 rounded-xl bg-sos/5 border border-sos/10"
                          >
                            <div>
                              <p className="font-semibold text-sm text-foreground">
                                {profile?.full_name || "Unknown User"}
                              </p>
                              <p className="text-xs text-muted-foreground font-mono">
                                {incident.reference_number}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {new Date(incident.created_at).toLocaleString()}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {incident.latitude && (
                                <a
                                  href={`https://maps.google.com/?q=${incident.latitude},${incident.longitude}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="w-9 h-9 rounded-lg bg-card flex items-center justify-center text-muted-foreground hover:text-foreground"
                                >
                                  <MapPin className="w-4 h-4" />
                                </a>
                              )}
                              {profile?.phone_number && (
                                <a
                                  href={`tel:${profile.phone_number}`}
                                  className="w-9 h-9 rounded-lg bg-card flex items-center justify-center text-muted-foreground hover:text-foreground"
                                >
                                  <Phone className="w-4 h-4" />
                                </a>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleResolve(incident.id)}
                                className="text-safe border-safe/20 hover:bg-safe/10"
                              >
                                Resolve
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent resolved */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {incidents.slice(0, 8).map((incident) => {
                    const profile = profiles.get(incident.user_id);
                    return (
                      <div key={incident.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-2 h-2 rounded-full ${
                              incident.status === "active" ? "bg-sos" : "bg-safe"
                            }`}
                          />
                          <div>
                            <p className="text-sm text-foreground">{profile?.full_name || "Unknown"}</p>
                            <p className="text-xs text-muted-foreground">{incident.reference_number}</p>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(incident.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {tab === "incidents" && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by name or reference..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex gap-1 p-1 rounded-lg bg-card">
                {(["all", "active", "resolved"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${
                      statusFilter === s
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredIncidents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No incidents found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredIncidents.map((incident) => {
                        const profile = profiles.get(incident.user_id);
                        return (
                          <TableRow key={incident.id}>
                            <TableCell className="font-mono text-xs">{incident.reference_number}</TableCell>
                            <TableCell className="font-medium">{profile?.full_name || "Unknown"}</TableCell>
                            <TableCell className="text-xs">{profile?.phone_number || "—"}</TableCell>
                            <TableCell>
                              <span
                                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                  incident.status === "active"
                                    ? "bg-sos/10 text-sos"
                                    : "bg-safe/10 text-safe"
                                }`}
                              >
                                {incident.status === "active" ? "Active" : "Resolved"}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {new Date(incident.created_at).toLocaleDateString()}
                            </TableCell>
                            <TableCell>
                              {incident.latitude ? (
                                <a
                                  href={`https://maps.google.com/?q=${incident.latitude},${incident.longitude}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-sos hover:underline flex items-center gap-1"
                                >
                                  <MapPin className="w-3 h-3" /> Map
                                </a>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {incident.status === "active" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleResolve(incident.id)}
                                  className="text-xs h-7"
                                >
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
              </CardContent>
            </Card>
          </div>
        )}

        {tab === "analytics" && (
          <div className="space-y-6">
            {/* Weekly chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-muted-foreground" />
                  Incidents This Week
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-2 h-40">
                  {incidentsPerDay.map((day) => (
                    <div key={day.day} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-xs text-muted-foreground">{day.count}</span>
                      <div
                        className="w-full rounded-t-lg bg-sos/60 transition-all"
                        style={{
                          height: `${Math.max((day.count / maxDayCount) * 100, 4)}%`,
                        }}
                      />
                      <span className="text-[10px] text-muted-foreground">{day.day}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Avg Resolution Time</p>
                  <p className="text-2xl font-display font-bold text-foreground mt-1">
                    {incidents.filter((i) => i.resolved_at).length > 0
                      ? `${Math.round(
                          incidents
                            .filter((i) => i.resolved_at)
                            .reduce(
                              (acc, i) =>
                                acc +
                                (new Date(i.resolved_at!).getTime() - new Date(i.created_at).getTime()) /
                                  60000,
                              0
                            ) / incidents.filter((i) => i.resolved_at).length
                        )} min`
                      : "—"}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Resolution Rate</p>
                  <p className="text-2xl font-display font-bold text-foreground mt-1">
                    {incidents.length > 0
                      ? `${Math.round((resolvedCount / incidents.length) * 100)}%`
                      : "—"}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const StatCard = ({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) => (
  <Card>
    <CardContent className="pt-6">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl bg-${color === "muted" ? "muted" : `${color}/10`} flex items-center justify-center text-${color === "muted" ? "muted-foreground" : color}`}>
          {icon}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-display font-bold text-foreground">{value}</p>
        </div>
      </div>
    </CardContent>
  </Card>
);

export default Dashboard;
