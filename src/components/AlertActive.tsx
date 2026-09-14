import { useState, useEffect } from "react";
import { MapPin, Mic, Radio, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-background px-5 py-12 sm:px-6">
      {/* Top status */}
      <div className="text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-sos/10 px-4 py-2">
          <span className="h-2 w-2 animate-alert-pulse rounded-full bg-sos" />
          <span className="text-sm font-semibold uppercase tracking-wider text-sos">Alert active</span>
        </div>
        <h1 className="font-display text-2xl font-bold text-foreground">Help is on the way</h1>
        <p className="mt-2 text-sm text-muted-foreground">Your contacts and the police have been notified</p>
        <p className="tabular mt-3 font-mono text-xs text-muted-foreground" aria-live="off">
          {formatTime(elapsed)} since you sent it
        </p>
      </div>

      {/* Status indicators */}
      <div className="w-full max-w-sm space-y-2.5">
        <StatusRow icon={<Radio />} label="Alerts sent" status="Delivered" />
        <StatusRow icon={<Mic />} label="Audio recording" status="Recording" active />
        <StatusRow icon={<MapPin />} label="Location sharing" status="Every 5 min" active />
      </div>

      {/* I Am Safe button */}
      <Button
        variant="safe"
        size="xl"
        onClick={onSafe}
        className="w-full max-w-sm animate-safe-glow text-xl tracking-wide"
      >
        <ShieldCheck />
        I AM SAFE
      </Button>
    </div>
  );
};

const StatusRow = ({
  icon,
  label,
  status,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  status: string;
  active?: boolean;
}) => (
  <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
    <span className="text-muted-foreground [&_svg]:h-5 [&_svg]:w-5">{icon}</span>
    <p className="flex-1 text-sm font-medium text-foreground">{label}</p>
    <span className="flex items-center gap-2 text-xs text-muted-foreground">
      {active && <span className="h-1.5 w-1.5 animate-alert-pulse rounded-full bg-safe" />}
      {status}
    </span>
  </div>
);

export default AlertActive;
