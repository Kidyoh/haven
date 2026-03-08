import { useState, useEffect } from "react";
import { X } from "lucide-react";

interface CountdownOverlayProps {
  seconds: number;
  onComplete: () => void;
  onCancel: () => void;
}

const CountdownOverlay = ({ seconds, onComplete, onCancel }: CountdownOverlayProps) => {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (remaining <= 0) {
      onComplete();
      return;
    }
    const timer = setTimeout(() => setRemaining(remaining - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining, onComplete]);

  const progress = ((seconds - remaining) / seconds) * 100;

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center">
      {/* Countdown circle */}
      <div className="relative w-48 h-48 mb-8">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" fill="none" stroke="hsl(var(--sos-red) / 0.15)" strokeWidth="4" />
          <circle
            cx="50" cy="50" r="45"
            fill="none"
            stroke="hsl(var(--sos-red))"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="283"
            strokeDashoffset={283 - (283 * progress) / 100}
            className="transition-all duration-1000 ease-linear"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-6xl font-display font-bold text-sos">{remaining}</span>
          <span className="text-sm text-muted-foreground mt-1">seconds</span>
        </div>
      </div>

      <p className="text-lg font-semibold text-foreground mb-2">Sending SOS Alert</p>
      <p className="text-muted-foreground text-sm mb-10 text-center px-8">
        Your emergency contacts and police will be notified
      </p>

      {/* Cancel button */}
      <button
        onClick={onCancel}
        className="flex items-center gap-3 px-8 py-4 rounded-full border-2 border-muted-foreground/30 text-muted-foreground hover:border-foreground hover:text-foreground transition-all"
      >
        <X className="w-5 h-5" />
        <span className="font-semibold text-lg">Cancel</span>
      </button>
    </div>
  );
};

export default CountdownOverlay;
