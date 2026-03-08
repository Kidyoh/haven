import { useState, useEffect } from "react";
import { Shield, MapPin, Mic, Radio } from "lucide-react";

interface AlertActiveProps {
  onSafe: () => void;
  incidentId?: string | null;
}

const AlertActive = ({ onSafe, incidentId }: AlertActiveProps) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-between py-12 px-6">
      {/* Top status */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-sos/10 mb-4">
          <div className="w-2 h-2 rounded-full bg-sos animate-alert-pulse" />
          <span className="text-sos font-semibold text-sm">ALERT ACTIVE</span>
        </div>
        <h1 className="text-2xl font-display font-bold text-foreground">Help is on the way</h1>
        <p className="text-muted-foreground text-sm mt-2">Your contacts and police have been notified</p>
        <p className="text-xs text-muted-foreground mt-1 font-mono">Duration: {formatTime(elapsed)}</p>
      </div>

      {/* Status indicators */}
      <div className="w-full max-w-sm space-y-3">
        <StatusRow icon={<Radio className="w-5 h-5" />} label="Alerts sent" status="Delivered" />
        <StatusRow icon={<Mic className="w-5 h-5" />} label="Audio recording" status="Recording..." active />
        <StatusRow icon={<MapPin className="w-5 h-5" />} label="Location sharing" status="Every 5 min" active />
      </div>

      {/* I Am Safe button */}
      <button
        onClick={onSafe}
        className="w-full max-w-sm py-5 rounded-2xl bg-safe font-display font-bold text-lg text-primary-foreground animate-safe-glow transition-all active:scale-95"
      >
        <div className="flex items-center justify-center gap-3">
          <Shield className="w-6 h-6" />
          I AM SAFE
        </div>
      </button>
    </div>
  );
};

const StatusRow = ({ icon, label, status, active }: { icon: React.ReactNode; label: string; status: string; active?: boolean }) => (
  <div className="flex items-center gap-4 p-4 rounded-xl bg-card">
    <div className="text-muted-foreground">{icon}</div>
    <div className="flex-1">
      <p className="text-sm font-medium text-foreground">{label}</p>
    </div>
    <div className="flex items-center gap-2">
      {active && <div className="w-1.5 h-1.5 rounded-full bg-safe animate-alert-pulse" />}
      <span className="text-xs text-muted-foreground">{status}</span>
    </div>
  </div>
);

export default AlertActive;
