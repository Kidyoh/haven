import { useState } from "react";
import { User, Users, Bell, ChevronRight, Plus, Trash2 } from "lucide-react";

interface Contact {
  name: string;
  phone: string;
}

interface SetupWizardProps {
  onComplete: (data: { name: string; phone: string; contacts: Contact[] }) => void;
}

const SetupWizard = ({ onComplete }: SetupWizardProps) => {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([{ name: "", phone: "" }]);

  const steps = [
    { icon: <User className="w-6 h-6" />, title: "Your Info", desc: "Used in emergency reports" },
    { icon: <Users className="w-6 h-6" />, title: "Emergency Contacts", desc: "Who should we alert?" },
    { icon: <Bell className="w-6 h-6" />, title: "Permissions", desc: "Enable location, mic & camera" },
  ];

  const addContact = () => {
    if (contacts.length < 6) setContacts([...contacts, { name: "", phone: "" }]);
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
    if (step === 0) return name.trim() && phone.trim();
    if (step === 1) return contacts[0].name.trim() && contacts[0].phone.trim();
    return true;
  };

  const handleNext = () => {
    if (step < 2) setStep(step + 1);
    else onComplete({ name, phone, contacts: contacts.filter(c => c.name && c.phone) });
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
          <p className="text-xs text-muted-foreground">Step {step + 1} of 3</p>
          <h2 className="font-display font-bold text-xl text-foreground">{steps[step].title}</h2>
        </div>
      </div>
      <p className="text-muted-foreground text-sm mb-8">{steps[step].desc}</p>

      {/* Step content */}
      <div className="flex-1">
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Full Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Tigist Alemu"
                className="w-full px-4 py-3 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-sos/50"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Phone Number</label>
              <input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+251 9XX XXX XXX"
                className="w-full px-4 py-3 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-sos/50"
              />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            {contacts.map((c, i) => (
              <div key={i} className="p-4 rounded-xl bg-card border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground font-medium">Contact {i + 1}</span>
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
              </div>
            ))}
            {contacts.length < 6 && (
              <button onClick={addContact} className="w-full py-3 rounded-xl border border-dashed border-muted-foreground/30 text-muted-foreground text-sm flex items-center justify-center gap-2 hover:border-foreground hover:text-foreground transition-all">
                <Plus className="w-4 h-4" /> Add another contact
              </button>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <PermissionRow emoji="📍" title="Location" desc="Required for GPS coordinates in alerts" />
            <PermissionRow emoji="🎤" title="Microphone" desc="Records audio evidence during SOS" />
            <PermissionRow emoji="📷" title="Camera" desc="Captures photo evidence on activation" />
            <PermissionRow emoji="🔔" title="Notifications" desc="Receive alerts from other HAVEN users" />
            <p className="text-xs text-muted-foreground text-center mt-4">
              Permissions will be requested when you first use SOS. No data is stored on your device.
            </p>
          </div>
        )}
      </div>

      {/* Bottom action */}
      <button
        onClick={handleNext}
        disabled={!canProceed()}
        className={`w-full py-4 rounded-2xl font-display font-bold text-lg flex items-center justify-center gap-2 transition-all mt-6 ${
          canProceed()
            ? "bg-sos text-destructive-foreground active:scale-[0.98]"
            : "bg-muted text-muted-foreground cursor-not-allowed"
        }`}
      >
        {step === 2 ? "Complete Setup" : "Continue"}
        <ChevronRight className="w-5 h-5" />
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

export default SetupWizard;
