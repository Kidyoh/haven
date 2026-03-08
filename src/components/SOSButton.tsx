import { useState, useRef, useCallback } from "react";

interface SOSButtonProps {
  onActivate: () => void;
  disabled?: boolean;
}

const SOSButton = ({ onActivate, disabled }: SOSButtonProps) => {
  const [isHolding, setIsHolding] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const holdTimer = useRef<NodeJS.Timeout | null>(null);
  const progressTimer = useRef<NodeJS.Timeout | null>(null);

  const HOLD_DURATION = 2000; // 2 seconds
  const PROGRESS_INTERVAL = 30;

  const startHold = useCallback(() => {
    if (disabled) return;
    setIsHolding(true);
    setHoldProgress(0);

    let elapsed = 0;
    progressTimer.current = setInterval(() => {
      elapsed += PROGRESS_INTERVAL;
      setHoldProgress(Math.min((elapsed / HOLD_DURATION) * 100, 100));
    }, PROGRESS_INTERVAL);

    holdTimer.current = setTimeout(() => {
      if (progressTimer.current) clearInterval(progressTimer.current);
      setHoldProgress(100);
      setIsHolding(false);
      onActivate();
    }, HOLD_DURATION);
  }, [disabled, onActivate]);

  const cancelHold = useCallback(() => {
    setIsHolding(false);
    setHoldProgress(0);
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (progressTimer.current) clearInterval(progressTimer.current);
  }, []);

  return (
    <div className="relative flex items-center justify-center">
      {/* Outer pulsing rings */}
      <div className="absolute w-64 h-64 rounded-full border-2 border-sos/20 animate-sos-ring" />
      <div className="absolute w-64 h-64 rounded-full border-2 border-sos/10 animate-sos-ring" style={{ animationDelay: "0.5s" }} />

      {/* Progress ring */}
      {isHolding && (
        <svg className="absolute w-56 h-56 -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50" cy="50" r="45"
            fill="none"
            stroke="hsl(var(--sos-red) / 0.2)"
            strokeWidth="3"
          />
          <circle
            cx="50" cy="50" r="45"
            fill="none"
            stroke="hsl(var(--sos-red))"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="283"
            strokeDashoffset={283 - (283 * holdProgress) / 100}
            className="transition-all duration-75"
          />
        </svg>
      )}

      {/* Main button */}
      <button
        onMouseDown={startHold}
        onMouseUp={cancelHold}
        onMouseLeave={cancelHold}
        onTouchStart={startHold}
        onTouchEnd={cancelHold}
        onTouchCancel={cancelHold}
        disabled={disabled}
        className={`
          relative z-10 w-44 h-44 rounded-full 
          bg-gradient-to-br from-sos to-sos-glow
          flex flex-col items-center justify-center gap-1
          text-destructive-foreground font-display font-bold
          shadow-[0_0_40px_hsl(var(--sos-red)/0.4)]
          transition-all duration-200 select-none
          ${isHolding ? "scale-95 shadow-[0_0_60px_hsl(var(--sos-red)/0.7)]" : "animate-sos-pulse"}
          ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer active:scale-95"}
        `}
      >
        <span className="text-3xl font-black tracking-widest">SOS</span>
        <span className="text-xs font-sans font-medium opacity-80">
          {isHolding ? "Keep holding..." : "Hold for 2s"}
        </span>
      </button>
    </div>
  );
};

export default SOSButton;
