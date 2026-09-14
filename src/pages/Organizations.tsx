import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Mail, MapPin, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Container, PageHeader, Screen } from "@/components/haven/Screen";
import { EmptyState, ScreenLoader, Spinner } from "@/components/haven/Feedback";
import { Field, TextField } from "@/components/haven/Field";

interface Organization {
  id: string;
  name: string;
  type: string;
  location: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
}

const ORG_TYPES = [
  { value: "police", label: "Police" },
  { value: "hospital", label: "Hospital" },
  { value: "ngo", label: "NGO" },
  { value: "fire", label: "Fire & Rescue" },
  { value: "security", label: "Private Security" },
  { value: "other", label: "Other" },
];

const Organizations = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Organization | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Organization | null>(null);

  const [form, setForm] = useState({
    name: "",
    type: "police",
    location: "",
    phone: "",
    email: "",
  });

  useEffect(() => {
    const check = async () => {
      if (!user) return;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      const isAdmin = data?.some((r) => r.role === "admin") ?? false;
      setAuthorized(isAdmin);
      if (isAdmin) loadOrgs();
      else setLoading(false);
    };
    check();
  }, [user]);

  const loadOrgs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("organizations")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error("Failed to load organizations");
    else setOrgs(data || []);
    setLoading(false);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", type: "police", location: "", phone: "", email: "" });
    setDialogOpen(true);
  };

  const openEdit = (org: Organization) => {
    setEditing(org);
    setForm({
      name: org.name,
      type: org.type,
      location: org.location ?? "",
      phone: org.phone ?? "",
      email: org.email ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      type: form.type,
      location: form.location.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
    };
    const { error } = editing
      ? await supabase.from("organizations").update(payload).eq("id", editing.id)
      : await supabase.from("organizations").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editing ? "Organization updated" : "Organization added");
    setDialogOpen(false);
    loadOrgs();
  };

  const handleDelete = async (org: Organization) => {
    const { error } = await supabase.from("organizations").delete().eq("id", org.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Organization deleted");
      loadOrgs();
    }
    setPendingDelete(null);
  };

  if (authorized === null || loading) return <ScreenLoader tone="gold" />;

  if (!authorized) {
    return (
      <Screen center>
        <div className="w-full max-w-sm">
          <EmptyState
            icon={<Building2 />}
            tone="sos"
            title="Access denied"
            description="Only admins can manage responder organizations."
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
        subtitle="Responder agencies that receive alerts"
        onBack={() => navigate("/dashboard")}
        backLabel="Back to dashboard"
        actions={
          <Button variant="gold" onClick={openCreate}>
            <Plus />
            <span className="hidden sm:inline">Add organization</span>
            <span className="sm:hidden">Add</span>
          </Button>
        }
      />

      <Container width="wide" as="main" className="flex-1 py-6">
        {orgs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border">
            <EmptyState
              icon={<Building2 />}
              tone="gold"
              title="No organizations yet"
              description="Add police stations, hospitals, NGOs and other agencies so alerts have somewhere to go."
              action={
                <Button variant="gold" onClick={openCreate}>
                  <Plus />
                  Add your first organization
                </Button>
              }
            />
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {orgs.map((org) => (
              <li
                key={org.id}
                className="group flex flex-col rounded-2xl border border-border bg-card p-5 transition-colors hover:border-haven-gold/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-base font-semibold text-foreground">{org.name}</h2>
                    <Badge variant="secondary" className="mt-1.5 capitalize">
                      {org.type}
                    </Badge>
                  </div>
                  <div className="flex shrink-0 gap-1 opacity-60 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    <Button size="icon-sm" variant="ghost" onClick={() => openEdit(org)} aria-label={`Edit ${org.name}`}>
                      <Pencil />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setPendingDelete(org)}
                      aria-label={`Delete ${org.name}`}
                      className="hover:text-sos"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>

                <dl className="mt-4 space-y-2 text-sm text-muted-foreground">
                  <Detail icon={<MapPin />} value={org.location} />
                  <Detail icon={<Phone />} value={org.phone} href={org.phone ? `tel:${org.phone}` : undefined} />
                  <Detail icon={<Mail />} value={org.email} href={org.email ? `mailto:${org.email}` : undefined} />
                  {!org.location && !org.phone && !org.email && (
                    <p className="text-xs italic">No contact details recorded</p>
                  )}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </Container>

      {/* Create / edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">
              {editing ? "Edit organization" : "Add organization"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <TextField
              label="Name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Gulele Police Station"
            />
            <Field label="Type">
              {(a11y) => (
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger id={a11y.id} className="h-11 rounded-xl bg-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORG_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
            <TextField
              label="Location"
              optional
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="City, sub-city or address"
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField
                label="Phone"
                optional
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+251 ..."
              />
              <TextField
                label="Email"
                optional
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="contact@org.et"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="gold" onClick={handleSave} disabled={saving}>
              {saving ? <Spinner size="sm" tone="current" label="Saving" /> : editing ? "Save changes" : "Add organization"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Delete "{pendingDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the organization from the responder network. It cannot be undone.
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

const Detail = ({ icon, value, href }: { icon: React.ReactNode; value: string | null; href?: string }) =>
  value ? (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
      {href ? (
        <a href={href} className="truncate hover:text-haven-gold hover:underline">
          {value}
        </a>
      ) : (
        <span className="truncate">{value}</span>
      )}
    </div>
  ) : null;

export default Organizations;
