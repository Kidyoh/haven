import { useState } from "react";
import { CheckCircle, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/haven/Field";
import { Callout } from "@/components/haven/Feedback";
import { clearPins, hasPins, isValidPin, savePins } from "@/lib/sos/pin";

/** Set, change or remove the "I am safe" PIN and the duress PIN on this phone. */
const SafetySettings = ({ userId }: { userId: string }) => {
  const [configured, setConfigured] = useState(() => hasPins(userId));
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [duress, setDuress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 6);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    if (!isValidPin(pin)) return setError("Use 4 to 6 digits for your PIN.");
    if (pin !== confirm) return setError("The two PINs do not match.");
    try {
      await savePins(userId, pin, duress ? duress : null);
    } catch (err) {
      return setError(err instanceof Error ? err.message : "Could not save the PIN.");
    }
    setError(null);
    setPin("");
    setConfirm("");
    setDuress("");
    setConfigured(hasPins(userId));
    setSaved(true);
  };

  const remove = () => {
    clearPins(userId);
    setConfigured(hasPins(userId));
    setSaved(false);
  };

  return (
    <div className="animate-rise rounded-2xl border border-border bg-card p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <KeyRound className="h-4 w-4 text-haven-gold" />
        "I am safe" PIN
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        With a PIN, ending an alert needs the PIN, so nobody else can stop it. A duress PIN looks like it ends the alert,
        but recording and location sharing carry on and responders are told it was ended under pressure. Saved only on
        this phone.
      </p>

      {configured.safe && (
        <p className="mt-3 text-xs text-safe">
          PIN set{configured.duress ? " · duress PIN set" : ""}. Saving again replaces {configured.duress ? "both" : "it"}.
        </p>
      )}

      <form onSubmit={save} className="mt-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="PIN"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(digits(e.target.value))}
          />
          <TextField
            label="Repeat PIN"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={confirm}
            onChange={(e) => setConfirm(digits(e.target.value))}
          />
        </div>
        <TextField
          label="Duress PIN"
          optional
          type="password"
          inputMode="numeric"
          autoComplete="off"
          hint="Different from your PIN."
          value={duress}
          onChange={(e) => setDuress(digits(e.target.value))}
        />
        {error && <Callout tone="danger">{error}</Callout>}
        {saved && (
          <Callout tone="safe" icon={<CheckCircle />}>
            Saved on this phone.
          </Callout>
        )}
        <div className="flex gap-2">
          <Button type="submit" size="sm" variant="gold">
            Save PIN
          </Button>
          {configured.safe && (
            <Button type="button" size="sm" variant="ghost" onClick={remove}>
              Remove PIN
            </Button>
          )}
        </div>
      </form>
    </div>
  );
};

export default SafetySettings;
