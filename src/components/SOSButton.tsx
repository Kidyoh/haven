import { useHold } from "@/hooks/useHold";

interface SOSButtonProps {
  onActivate: () => void;
  disabled?: boolean;
}

const HOLD_DURATION_MS = 2000;

const SOSButton = ({ onActivate, disabled }: SOSButtonProps) => {
  const { progress, holding, handlers } = useHold({ durationMs: HOLD_DURATION_MS, onComplete: onActivate, disabled });

  return (
    <div className="relative flex items-center justify-center">
      {/* Outer pulsing rings */}
      <div className="absolute h-64 w-64 animate-sos-ring rounded-full border-2 border-sos/20" />
      <div className="absolute h-64 w-64 animate-sos-ring rounded-full border-2 border-sos/10" style={{ animationDelay: "0.5s" }} />

      {/* Progress ring */}
      {holding && (
        <svg className="absolute h-56 w-56 -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="45" fill="none" stroke="hsl(var(--sos-red) / 0.2)" strokeWidth="3" />
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="hsl(var(--sos-red))"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="283"
            strokeDashoffset={283 - 283 * progress}
            className="transition-all duration-75"
          />
        </svg>
      )}

      <button
        {...handlers}
        disabled={disabled}
        aria-label="SOS. Press and hold for two seconds to send an emergency alert."
        style={{ touchAction: "none", WebkitTouchCallout: "none" }}
        className={`
          relative z-10 flex h-44 w-44 select-none flex-col items-center justify-center gap-1 rounded-full
          bg-gradient-to-br from-sos to-sos-glow font-display font-bold text-destructive-foreground
          shadow-[0_0_40px_hsl(var(--sos-red)/0.4)] transition-all duration-200
          focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sos/50
          ${holding ? "scale-95 shadow-[0_0_60px_hsl(var(--sos-red)/0.7)]" : "animate-sos-pulse"}
          ${disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"}
        `}
      >
        <span className="text-3xl font-black tracking-widest">SOS</span>
        <span className="font-sans text-xs font-medium opacity-80">{holding ? "Keep holding…" : "Hold for 2s"}</span>
      </button>
    </div>
  );
};

export default SOSButton;
