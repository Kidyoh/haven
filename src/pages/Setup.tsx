import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Bell, ChevronRight, MapPin, Mic, Plus, Trash2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Container, IconTile, Screen } from "@/components/haven/Screen";
import { Callout, ScreenLoader, Spinner } from "@/components/haven/Feedback";
import { Field, TextField } from "@/components/haven/Field";

interface Contact {
  name: string;
  phone: string;
  relationship: string;
}

const RELATIONSHIPS = ["family", "spouse", "friend", "colleague", "neighbor"];

const Setup = () => {
  const [step, setStep] = useState(0);
  const [contacts, setContacts] = useState<Contact[]>([{ name: "", phone: "", relationship: "family" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [checkingSetup, setCheckingSetup] = useState(true);
  const navigate = useNavigate();
  const { user } = useAuth();

  // Redirect if setup already complete
  useEffect(() => {
    if (!user) return;
    const check = async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("setup_complete")
        .eq("user_id", user.id)
        .single();
      if (profile?.setup_complete) {
        navigate("/sos", { replace: true });
      } else {
        setCheckingSetup(false);
      }
    };
    check();
  }, [user, navigate]);

  const steps = [
    { icon: <Users />, title: "Emergency contacts", desc: "Who should we alert in an emergency?" },
    { icon: <Bell />, title: "Permissions", desc: "Location and microphone power your alerts." },
  ];

  const addContact = () => {
    if (contacts.length < 6) setContacts([...contacts, { name: "", phone: "", relationship: "friend" }]);
  };

  const removeContact = (i: number) => {
    if (contacts.length > 1) setContacts(contacts.filter((_, idx) => idx !== i));
  };

  const updateContact = (i: number, field: keyof Contact, value: string) => {
    const updated = [...contacts];
    updated[i][field] = value;
    setContacts(updated);
  };

  const canProceed = () => {
    if (step === 0) return contacts[0].name.trim() && contacts[0].phone.trim();
    return true;
  };

  const handleComplete = async () => {
    if (!user) return;
    setSaving(true);
    setError("");

    try {
      // Insert emergency contacts
      const validContacts = contacts.filter(c => c.name && c.phone);
      const { error: contactError } = await supabase.from("emergency_contacts").insert(
        validContacts.map((c, i) => ({
          user_id: user.id,
          name: c.name,
          phone: c.phone,
          relationship: c.relationship,
          is_primary: i === 0,
        }))
      );
      if (contactError) throw contactError;

      // Mark setup complete
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ setup_complete: true })
        .eq("user_id", user.id);
      if (profileError) throw profileError;

      navigate("/sos");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const handleNext = () => {
    if (step < 1) setStep(step + 1);
    else handleComplete();
  };

  if (checkingSetup) return <ScreenLoader />;

  return (
    <Screen>
      <Container width="form" as="main" className="flex flex-1 flex-col py-6">
        {/* Progress */}
        <div className="mb-7 flex gap-2" role="group" aria-label={`Step ${step + 1} of ${steps.length}`}>
          {steps.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? "bg-sos" : "bg-secondary"}`} />
          ))}
        </div>

        {/* Step header */}
        <div className="flex items-center gap-3">
          <IconTile tone="sos">{steps[step].icon}</IconTile>
          <div>
            <p className="text-xs text-muted-foreground">
              Step {step + 1} of {steps.length}
            </p>
            <h1 className="font-display text-xl font-bold leading-tight text-foreground">{steps[step].title}</h1>
          </div>
        </div>
        <p className="mb-7 mt-2 text-sm text-muted-foreground">{steps[step].desc}</p>

        {/* Step content */}
        <div className="flex-1">
          {step === 0 && (
            <div className="space-y-3">
              {contacts.map((c, i) => (
                <div key={i} className="animate-rise space-y-3 rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {i === 0 ? "Primary contact" : `Contact ${i + 1}`}
                    </span>
                    {contacts.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => removeContact(i)}
                        aria-label={`Remove contact ${i + 1}`}
                        className="-mr-1 hover:text-sos"
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                  <TextField
                    label="Name"
                    value={c.name}
                    onChange={(e) => updateContact(i, "name", e.target.value)}
                    placeholder="Contact name"
                  />
                  <TextField
                    label="Phone"
                    type="tel"
                    value={c.phone}
                    onChange={(e) => updateContact(i, "phone", e.target.value)}
                    placeholder="+251 9XX XXX XXX"
                  />
                  <Field label="Relationship">
                    {(a11y) => (
                      <Select value={c.relationship} onValueChange={(v) => updateContact(i, "relationship", v)}>
                        <SelectTrigger id={a11y.id} className="h-11 rounded-xl bg-card capitalize">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RELATIONSHIPS.map((r) => (
                            <SelectItem key={r} value={r} className="capitalize">
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </Field>
                </div>
              ))}
              {contacts.length < 6 && (
                <button
                  onClick={addContact}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-haven-gold/50 hover:text-foreground"
                >
                  <Plus className="h-4 w-4" /> Add another contact
                </button>
              )}
              <p className="px-1 pt-1 text-xs text-muted-foreground">
                Up to six people. The first is your primary contact and is alerted first.
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <PermissionRow icon={<MapPin />} title="Location" desc="Shares where you are with your contacts during an alert" />
              <PermissionRow icon={<Mic />} title="Microphone" desc="Records audio evidence until you mark yourself safe" />
              <p className="px-1 pt-1 text-xs leading-relaxed text-muted-foreground">
                Nothing is requested now. You can allow both from the SOS screen ahead of time, so your phone does not
                have to ask during an emergency. Alerts are kept on the phone only until they have been sent.
              </p>
            </div>
          )}
        </div>

        {error && (
          <Callout tone="danger" icon={<AlertTriangle />} className="mt-4">
            {error}
          </Callout>
        )}

        <Button
          variant="sos"
          size="xl"
          onClick={handleNext}
          disabled={!canProceed() || saving}
          className="mt-6 w-full"
        >
          {saving ? (
            <Spinner size="sm" tone="current" label="Saving" />
          ) : (
            <>
              {step === steps.length - 1 ? "Complete setup" : "Continue"}
              <ChevronRight />
            </>
          )}
        </Button>
      </Container>
    </Screen>
  );
};

const PermissionRow = ({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) => (
  <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
    <IconTile tone="gold">{icon}</IconTile>
    <div className="min-w-0">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground">{desc}</p>
    </div>
  </div>
);

export default Setup;
