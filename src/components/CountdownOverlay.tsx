import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CountdownOverlayProps {
  seconds: number;
  onComplete: () => void;
  onCancel: () => void;
}

const CountdownOverlay = ({ seconds, onComplete, onCancel }: CountdownOverlayProps) => {
  const [remaining, setRemaining] = useState(seconds);
  // The parent re-renders while the countdown runs (mic and GPS status arrive),
  // handing over a new onComplete each time. Read it from a ref and fire once.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const fired = useRef(false);

  useEffect(() => {
    if (remaining <= 0) {
      if (!fired.current) {
        fired.current = true;
        navigator.vibrate?.([200, 100, 200]);
        onCompleteRef.current();
      }
      return;
    }
    navigator.vibrate?.(60);
    const timer = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);

  const progress = ((seconds - remaining) / seconds) * 100;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 px-5 backdrop-blur-sm sm:px-6">
      <div className="relative mb-8 h-48 w-48">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="45" fill="none" stroke="hsl(var(--sos-red) / 0.15)" strokeWidth="4" />
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="hsl(var(--sos-red))"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="283"
            strokeDashoffset={283 - (283 * progress) / 100}
            className="transition-all duration-1000 ease-linear"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center" role="timer" aria-live="assertive">
          <span className="tabular font-display text-6xl font-bold text-sos">{Math.max(remaining, 0)}</span>
          <span className="mt-1 text-sm text-muted-foreground">seconds</span>
        </div>
      </div>

      <p className="text-lg font-semibold text-foreground">Sending SOS alert</p>
      <p className="mt-2 max-w-xs text-center text-sm leading-relaxed text-muted-foreground">
        Your emergency contacts will get a text with your live location. The microphone and GPS are switching on.
      </p>

      {/* Cancel is the only other thing on screen, and it is large on purpose. */}
      <Button variant="outline" size="xl" onClick={onCancel} className="mt-10 w-full max-w-xs rounded-full">
        <X />
        Cancel
      </Button>
    </div>
  );
};

export default CountdownOverlay;
