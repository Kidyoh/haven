import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { User, Users, Bell, ChevronRight, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Contact {
  name: string;
  phone: string;
  relationship: string;
}

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
    { icon: <Users className="w-6 h-6" />, title: "Emergency Contacts", desc: "Who should we alert in an emergency?" },
    { icon: <Bell className="w-6 h-6" />, title: "Permissions", desc: "Enable location, mic & camera" },
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
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const handleNext = () => {
    if (step < 1) setStep(step + 1);
    else handleComplete();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col px-6 py-8">
      {/* Progress */}
      <div className="flex gap-2 mb-8">
        {steps.map((_, i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= step ? "bg-sos" : "bg-muted"}`} />
        ))}
      </div>

      {/* Step header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-sos/10 flex items-center justify-center text-sos">
          {steps[step].icon}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Step {step + 1} of 2</p>
          <h2 className="font-display font-bold text-xl text-foreground">{steps[step].title}</h2>
        </div>
      </div>
      <p className="text-muted-foreground text-sm mb-8">{steps[step].desc}</p>

      {/* Step content */}
      <div className="flex-1">
        {step === 0 && (
          <div className="space-y-4">
            {contacts.map((c, i) => (
              <div key={i} className="p-4 rounded-xl bg-card border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground font-medium">
                    {i === 0 ? "Primary Contact" : `Contact ${i + 1}`}
                  </span>
                  {contacts.length > 1 && (
                    <button onClick={() => removeContact(i)} className="text-muted-foreground hover:text-sos">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <input
                  value={c.name}
                  onChange={e => updateContact(i, "name", e.target.value)}
                  placeholder="Contact name"
                  className="w-full px-3 py-2.5 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-sos/50"
                />
                <input
                  value={c.phone}
                  onChange={e => updateContact(i, "phone", e.target.value)}
                  placeholder="Phone number"
                  className="w-full px-3 py-2.5 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-sos/50"
                />
                <select
                  value={c.relationship}
                  onChange={e => updateContact(i, "relationship", e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-sos/50"
                >
                  <option value="family">Family</option>
                  <option value="spouse">Spouse</option>
                  <option value="friend">Friend</option>
                  <option value="colleague">Colleague</option>
                  <option value="neighbor">Neighbor</option>
                </select>
              </div>
            ))}
            {contacts.length < 6 && (
              <button onClick={addContact} className="w-full py-3 rounded-xl border border-dashed border-muted-foreground/30 text-muted-foreground text-sm flex items-center justify-center gap-2 hover:border-foreground hover:text-foreground transition-all">
                <Plus className="w-4 h-4" /> Add another contact
              </button>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <PermissionRow emoji="📍" title="Location" desc="Required for GPS coordinates in alerts" />
            <PermissionRow emoji="🎤" title="Microphone" desc="Records audio evidence during SOS" />
            <PermissionRow emoji="📷" title="Camera" desc="Captures photo evidence on activation" />
            <PermissionRow emoji="🔔" title="Notifications" desc="Receive alerts from other HAVEN users" />
            <p className="text-xs text-muted-foreground text-center mt-4">
              Permissions will be requested when you first use SOS. No data is stored on your device after transmission.
            </p>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-sos bg-sos/10 px-4 py-3 rounded-xl mb-4">{error}</p>}

      {/* Bottom action */}
      <button
        onClick={handleNext}
        disabled={!canProceed() || saving}
        className={`w-full py-4 rounded-2xl font-display font-bold text-lg flex items-center justify-center gap-2 transition-all mt-6 ${
          canProceed() && !saving
            ? "bg-sos text-destructive-foreground active:scale-[0.98]"
            : "bg-muted text-muted-foreground cursor-not-allowed"
        }`}
      >
        {saving ? "Saving..." : step === 1 ? "Complete Setup" : "Continue"}
        {!saving && <ChevronRight className="w-5 h-5" />}
      </button>
    </div>
  );
};

const PermissionRow = ({ emoji, title, desc }: { emoji: string; title: string; desc: string }) => (
  <div className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border">
    <span className="text-2xl">{emoji}</span>
    <div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground">{desc}</p>
    </div>
  </div>
);

export default Setup;
