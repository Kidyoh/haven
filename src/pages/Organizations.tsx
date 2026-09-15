import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, CheckCircle, Download, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Container, IconTile, PageHeader, Screen, type Tone } from "@/components/haven/Screen";
import { Callout, EmptyState, ScreenLoader } from "@/components/haven/Feedback";
import { DirectoryList } from "@/components/organizations/DirectoryList";
import { OrganizationDetail } from "@/components/organizations/OrganizationDetail";
import { OrganizationForm } from "@/components/organizations/OrganizationForm";
import {
  applyDirectoryQuery,
  csvFilename,
  DEFAULT_QUERY,
  directoryStats,
  ORG_TYPES,
  organizationsToCsv,
  payloadFromForm,
  type ActiveFilter,
  type DirectoryQuery,
  type Organization,
  type OrganizationFormValues,
  type OrgType,
  type SortKey,
} from "@/lib/organizations/directory";
import { fetchAccess, fetchOrganizations, type DirectoryAccess } from "@/lib/organizations/data";

/**
 * The responder organizations directory. Admins manage every organization;
 * org admins can browse it and edit their own (the RLS policies say the same).
 */
const Organizations = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [access, setAccess] = useState<DirectoryAccess | null>(null);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState<DirectoryQuery>(DEFAULT_QUERY);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Organization | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Organization | null>(null);

  const loadOrgs = useCallback(async () => {
    try {
      setOrgs(await fetchOrganizations());
      setLoadError(false);
    } catch {
      setLoadError(true);
      toast.error("Failed to load organizations");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchAccess(user.id).then((a) => {
      setAccess(a);
      if (a.isAdmin || a.isOrgAdmin) loadOrgs();
      else setLoading(false);
    });
  }, [user, loadOrgs]);

  const visible = useMemo(() => applyDirectoryQuery(orgs, query), [orgs, query]);
  const stats = useMemo(() => directoryStats(orgs), [orgs]);
  // Read from the list so the panel reflects an edit the moment it reloads.
  const selected = orgs.find((o) => o.id === selectedId) ?? null;
  const setQ = (patch: Partial<DirectoryQuery>) => setQuery((q) => ({ ...q, ...patch }));
  const filtered = query.search !== "" || query.type !== "all" || query.active !== "all";

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (org: Organization) => {
    setEditing(org);
    setFormOpen(true);
  };

  const handleSave = async (values: OrganizationFormValues) => {
    setSaving(true);
    const payload = payloadFromForm(values);
    const { error } = editing
      ? await supabase.from("organizations").update(payload).eq("id", editing.id)
      : await supabase.from("organizations").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editing ? "Organization updated" : "Organization added");
    setFormOpen(false);
    loadOrgs();
  };

  const handleToggleActive = async (org: Organization) => {
    const { error } = await supabase.from("organizations").update({ is_active: !org.is_active }).eq("id", org.id);
    if (error) toast.error(error.message);
    else {
      toast.success(org.is_active ? `${org.name} deactivated` : `${org.name} reactivated`);
      loadOrgs();
    }
  };

  const handleDelete = async (org: Organization) => {
    const { error } = await supabase.from("organizations").delete().eq("id", org.id);
    setPendingDelete(null);
    if (error) {
      // 23503: referrals arrived after the panel counted them.
      toast.error(error.code === "23503" ? "This organization has referrals. Deactivate it instead." : error.message);
      return;
    }
    toast.success("Organization deleted");
    setSelectedId(null);
    loadOrgs();
  };

  const handleExport = () => {
    const blob = new Blob([organizationsToCsv(visible)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = csvFilename(new Date());
    a.click();
    URL.revokeObjectURL(url);
  };

  if (access === null || loading) return <ScreenLoader tone="gold" />;

  if (!access.isAdmin && !access.isOrgAdmin) {
    return (
      <Screen center>
        <div className="w-full max-w-sm">
          <EmptyState
            icon={<Building2 />}
            tone="sos"
            title="Access denied"
            description="Only admins and organization admins can open the organizations directory."
            action={
              <Button variant="subtle" size="lg" onClick={() => navigate("/dashboard")}>
                Back to dashboard
              </Button>
            }
          />
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader
        sticky
        width="wide"
        icon={<Building2 />}
        tone="gold"
        title="Organizations"
        subtitle="Responder agencies, services and referrals"
        onBack={() => navigate("/dashboard")}
        backLabel="Back to dashboard"
        actions={
          access.isAdmin && (
            <Button variant="gold" onClick={openCreate}>
              <Plus />
              <span className="hidden sm:inline">Add organization</span>
              <span className="sm:hidden">Add</span>
            </Button>
          )
        }
      />

      <Container width="wide" as="main" className="flex-1 space-y-5 py-6">
        {loadError && (
          <Callout tone="danger" title="Could not load the directory">
            <button onClick={loadOrgs} className="text-xs font-semibold underline underline-offset-2">
              Try again
            </button>
          </Callout>
        )}

        {orgs.length === 0 && !loadError ? (
          <div className="rounded-2xl border border-dashed border-border">
            <EmptyState
              icon={<Building2 />}
              tone="gold"
              title="No organizations yet"
              description="Add police stations, hospitals, shelters, NGOs and other agencies so incidents have somewhere to be referred."
              action={
                access.isAdmin && (
                  <Button variant="gold" onClick={openCreate}>
                    <Plus />
                    Add your first organization
                  </Button>
                )
              }
            />
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <StatTile icon={<Building2 />} label="Organizations" value={stats.total} tone="gold" />
              <StatTile icon={<CheckCircle />} label="Active" value={stats.active} tone="safe" />
            </div>
            <div role="group" aria-label="Filter by type" className="flex flex-wrap gap-1.5">
              {ORG_TYPES.map((t) => {
                const on = query.type === t.value;
                return (
                  <button
                    key={t.value}
                    aria-pressed={on}
                    onClick={() => setQ({ type: on ? "all" : t.value })}
                    className={cn(
                      "min-h-9 rounded-full border px-3 text-xs font-medium transition-colors",
                      on
                        ? "border-haven-gold/40 bg-haven-gold/10 text-haven-gold"
                        : "border-border bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t.label} <span className="tabular ml-1 text-foreground">{stats.byType[t.value]}</span>
                  </button>
                );
              })}
            </div>

            {/* Filters */}
            <div className="flex flex-col gap-3 lg:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search name, sub-city or service…"
                  aria-label="Search organizations"
                  value={query.search}
                  onChange={(e) => setQ({ search: e.target.value })}
                  className="pl-10"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={query.type} onValueChange={(v) => setQ({ type: v as OrgType | "all" })}>
                  <SelectTrigger className="h-11 w-40 rounded-xl bg-card" aria-label="Type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {ORG_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div role="group" aria-label="Filter by status" className="flex gap-1 rounded-2xl bg-card p-1">
                  {(["all", "active", "inactive"] as ActiveFilter[]).map((s) => (
                    <button
                      key={s}
                      aria-pressed={query.active === s}
                      onClick={() => setQ({ active: s })}
                      className={cn(
                        "min-h-9 rounded-xl px-3 text-xs font-medium capitalize transition-colors",
                        query.active === s
                          ? "bg-secondary text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <Select value={query.sort} onValueChange={(v) => setQ({ sort: v as SortKey })}>
                  <SelectTrigger className="h-11 w-44 rounded-xl bg-card" aria-label="Sort">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Name A–Z</SelectItem>
                    <SelectItem value="updated">Recently updated</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="subtle" onClick={handleExport} disabled={visible.length === 0}>
                  <Download />
                  Export CSV
                </Button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground" aria-live="polite">
              Showing {visible.length} of {orgs.length}
            </p>

            {visible.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border">
                <EmptyState
                  icon={<Search />}
                  title="No organizations match"
                  description="Try a different search, or clear the filters."
                  action={
                    filtered && (
                      <Button variant="subtle" onClick={() => setQuery({ ...DEFAULT_QUERY, sort: query.sort })}>
                        Clear filters
                      </Button>
                    )
                  }
                />
              </div>
            ) : (
              <DirectoryList orgs={visible} onOpen={(org) => setSelectedId(org.id)} />
            )}
          </>
        )}
      </Container>

      <OrganizationDetail
        org={selected}
        organizations={orgs}
        access={access}
        onOpenChange={(open) => !open && setSelectedId(null)}
        onEdit={openEdit}
        onToggleActive={handleToggleActive}
        onDelete={setPendingDelete}
      />

      <OrganizationForm
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        saving={saving}
        onSubmit={handleSave}
      />

      {/* Delete confirmation. Only reachable when the organization has no referrals. */}
      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Delete "{pendingDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the organization from the directory and unassigns its members. It cannot be undone. To
              keep it on record, deactivate it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && handleDelete(pendingDelete)}
              className="bg-sos text-destructive-foreground hover:bg-sos/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Screen>
  );
};

const StatTile = ({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: Tone }) => (
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

export default Organizations;
