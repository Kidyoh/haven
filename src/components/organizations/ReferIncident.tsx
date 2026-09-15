import { useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/haven/Feedback";
import { orgTypeLabel } from "@/lib/organizations/directory";

interface Option {
  id: string;
  name: string;
  type: string;
  accepts_referrals: boolean;
}

/**
 * The dashboard's "Refer" control: pick an active organization, confirm, and
 * an incident_referrals row is written. Organizations load when it opens, so
 * a dashboard with many alerts does not fetch the directory once per row.
 */
export function ReferIncident({ incidentId, reference }: { incidentId: string; reference: string }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Option[] | null>(null);
  const [pick, setPick] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("organizations")
      .select("id, name, type, accepts_referrals")
      .eq("is_active", true)
      .order("name");
    if (error) {
      toast.error("Could not load organizations");
      setOptions([]);
    } else setOptions(data ?? []);
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setPick("");
      setOptions(null);
      load();
    }
  };

  const confirm = async () => {
    const org = options?.find((o) => o.id === pick);
    if (!org) return;
    setSaving(true);
    const { error } = await supabase.from("incident_referrals").insert({ incident_id: incidentId, organization_id: org.id });
    setSaving(false);
    if (error) {
      toast.error(error.code === "23505" ? `${reference} is already referred to ${org.name}` : error.message);
      return;
    }
    toast.success(`${reference} referred to ${org.name}`);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="subtle" aria-label={`Refer ${reference} to an organization`}>
          <Send />
          <span className="hidden sm:inline">Refer</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3 rounded-xl">
        <p className="text-sm font-medium text-foreground">Refer {reference}</p>
        {options === null ? (
          <div className="flex justify-center py-3">
            <Spinner size="sm" tone="gold" label="Loading organizations" />
          </div>
        ) : options.length === 0 ? (
          <p className="text-xs text-muted-foreground">No active organizations in the directory.</p>
        ) : (
          <>
            <Select value={pick} onValueChange={setPick}>
              <SelectTrigger className="h-11 rounded-xl bg-card" aria-label="Organization">
                <SelectValue placeholder="Choose an organization…" />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.id} value={o.id} disabled={!o.accepts_referrals}>
                    {o.name} · {orgTypeLabel(o.type)}
                    {!o.accepts_referrals && " (not accepting)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="gold" className="w-full" onClick={confirm} disabled={!pick || saving}>
              {saving ? <Spinner size="sm" tone="current" label="Referring" /> : "Confirm referral"}
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
