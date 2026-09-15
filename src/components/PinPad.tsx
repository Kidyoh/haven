import { useState } from "react";
import { Check, Delete } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Asks for the "I am safe" PIN. It says nothing about which PIN was entered:
 * the safe PIN and the duress PIN close it the same way.
 */
const PinPad = ({
  onSubmit,
  onClose,
}: {
  /** Resolves false when the PIN was not recognised. */
  onSubmit: (pin: string) => Promise<boolean>;
  onClose: () => void;
}) => {
  const [pin, setPin] = useState("");
  const [wrong, setWrong] = useState(false);
  const [checking, setChecking] = useState(false);

  const press = (digit: string) => {
    setWrong(false);
    setPin((p) => (p.length < 6 ? p + digit : p));
  };

  const submit = async () => {
    if (pin.length < 4 || checking) return;
    setChecking(true);
    const ok = await onSubmit(pin);
    setChecking(false);
    if (!ok) {
      setWrong(true);
      setPin("");
      navigator.vibrate?.([80, 60, 80]);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pinpad-title"
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-background px-5"
    >
      <h2 id="pinpad-title" className="font-display text-xl font-bold text-foreground">
        Enter your PIN
      </h2>
      <p className={cn("mt-2 h-5 text-sm", wrong ? "text-sos" : "text-muted-foreground")} role="status">
        {wrong ? "That PIN is not right" : "to end the alert"}
      </p>

      <div className="my-6 flex gap-3" aria-label={`${pin.length} digits entered`}>
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
          <span
            key={i}
            className={cn("h-3.5 w-3.5 rounded-full border-2", i < pin.length ? "border-foreground bg-foreground" : "border-border")}
          />
        ))}
      </div>

      <div className="grid w-full max-w-[280px] grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <Key key={d} onClick={() => press(d)}>
            {d}
          </Key>
        ))}
        <Key onClick={() => setPin((p) => p.slice(0, -1))} label="Delete">
          <Delete className="h-6 w-6" />
        </Key>
        <Key onClick={() => press("0")}>0</Key>
        <Key onClick={submit} label="Confirm" disabled={pin.length < 4 || checking} tone="safe">
          <Check className="h-6 w-6" />
        </Key>
      </div>

      <Button variant="ghost" className="mt-6" onClick={onClose}>
        Keep the alert on
      </Button>
    </div>
  );
};

const Key = ({
  children,
  onClick,
  label,
  disabled,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label?: string;
  disabled?: boolean;
  tone?: "safe";
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    disabled={disabled}
    className={cn(
      "flex h-16 items-center justify-center rounded-2xl font-display text-2xl font-semibold transition-colors active:scale-95 disabled:opacity-40",
      tone === "safe" ? "bg-safe text-ink" : "border border-border bg-card text-foreground hover:bg-secondary",
    )}
  >
    {children}
  </button>
);

export default PinPad;
