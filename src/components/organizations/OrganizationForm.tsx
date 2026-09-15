import { useEffect, useId, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Callout, Spinner } from "@/components/haven/Feedback";
import { Field, TextField } from "@/components/haven/Field";
import {
  EMPTY_FORM,
  ETHIOPIA_REGIONS,
  formFromOrganization,
  ORG_TYPES,
  validateOrganizationForm,
  type FormErrors,
  type Organization,
  type OrganizationFormValues,
  type OrgType,
} from "@/lib/organizations/directory";

// Radix Select cannot hold an empty value, so "no region" needs a stand-in.
const NO_REGION = "__none";

/** Create or edit an organization. Validation lives in directory.ts. */
export function OrganizationForm({
  open,
  onOpenChange,
  editing,
  saving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The organization being edited, or null to create one. */
  editing: Organization | null;
  saving: boolean;
  onSubmit: (values: OrganizationFormValues) => void;
}) {
  const [form, setForm] = useState<OrganizationFormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    if (!open) return;
    setForm(editing ? formFromOrganization(editing) : EMPTY_FORM);
    setErrors({});
  }, [open, editing]);

  const set = <K extends keyof OrganizationFormValues>(key: K, value: OrganizationFormValues[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = validateOrganizationForm(form);
    setErrors(found);
    if (Object.keys(found).length === 0) onSubmit(form);
  };

  const isShelter = form.type === "shelter";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{editing ? "Edit organization" : "Add organization"}</DialogTitle>
          <DialogDescription>Listed for responders in the HAVEN directory.</DialogDescription>
        </DialogHeader>

        <form id="organization-form" onSubmit={submit} className="space-y-4 py-1" noValidate>
          <TextField
            label="Name"
            required
            value={form.name}
            error={errors.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Gulele Police Station"
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Type">
              {(a11y) => (
                <Select value={form.type} onValueChange={(v) => set("type", v as OrgType)}>
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
            <Field label="Region" optional>
              {(a11y) => (
                <Select
                  value={form.region || NO_REGION}
                  onValueChange={(v) => set("region", v === NO_REGION ? "" : v)}
                >
                  <SelectTrigger id={a11y.id} className="h-11 rounded-xl bg-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_REGION}>Not set</SelectItem>
                    {/* Keep a stored region that is not on the list selectable. */}
                    {form.region && !(ETHIOPIA_REGIONS as readonly string[]).includes(form.region) && (
                      <SelectItem value={form.region}>{form.region}</SelectItem>
                    )}
                    {ETHIOPIA_REGIONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          </div>

          {isShelter && (
            <Callout tone="warning" icon={<ShieldAlert />} title="Never record where the shelter is">
              <p className="text-xs leading-relaxed">
                Everyone with a HAVEN account can read this directory. Leave the address blank, or give a public intake
                point that is not the safe house. The address is also left out of CSV exports.
              </p>
            </Callout>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              label="Sub-city"
              optional
              value={form.subcity}
              onChange={(e) => set("subcity", e.target.value)}
              placeholder="e.g. Gulele"
            />
            <TextField
              label={isShelter ? "Public intake address" : "Address"}
              optional
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder={isShelter ? "Not the safe-house location" : "Street, woreda, landmark"}
            />
            <TextField
              label="Phone"
              optional
              type="tel"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="+251 ..."
            />
            <TextField
              label="Email"
              optional
              type="email"
              value={form.email}
              error={errors.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="contact@org.et"
            />
            <TextField
              label="Website"
              optional
              value={form.website}
              error={errors.website}
              onChange={(e) => set("website", e.target.value)}
              placeholder="org.et"
            />
            <TextField
              label="Hours"
              optional
              value={form.hours}
              onChange={(e) => set("hours", e.target.value)}
              placeholder="e.g. 24/7, or Mon–Fri 8:30–17:30"
            />
          </div>

          <TextField
            label="Services"
            optional
            hint="Separate with commas"
            value={form.services}
            onChange={(e) => set("services", e.target.value)}
            placeholder="Counselling, medical care, legal advice"
          />

          <Field label="Notes" optional hint="Visible to responders and admins">
            {(a11y) => (
              <Textarea
                {...a11y}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                className="rounded-xl bg-card"
                rows={3}
              />
            )}
          </Field>

          <div className="space-y-1 rounded-xl border border-border bg-card px-4 py-1">
            <Toggle
              label="Accepts referrals"
              hint="Responders can refer incidents here"
              checked={form.accepts_referrals}
              onChange={(v) => set("accepts_referrals", v)}
            />
            <Toggle
              label="Active"
              hint="Inactive organizations stay on record but receive nothing"
              checked={form.is_active}
              onChange={(v) => set("is_active", v)}
            />
          </div>
        </form>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="organization-form" variant="gold" disabled={saving}>
            {saving ? <Spinner size="sm" tone="current" label="Saving" /> : editing ? "Save changes" : "Add organization"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const Toggle = ({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) => {
  const id = useId();
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 border-b border-border py-2 last:border-0">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
};
