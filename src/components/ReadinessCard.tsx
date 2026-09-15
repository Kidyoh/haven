import { useEffect, useState } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconTile } from "@/components/haven/Screen";
import { cn } from "@/lib/utils";

/**
 * "Is SOS going to work right now?" — checked, not assumed. Anything that
 * would weaken an alert (no mic or location permission, no contacts, no
 * signal) is listed with a way to fix it before it is needed.
 */

type Permission = "granted" | "denied" | "prompt" | "unknown";

function usePermission(name: "microphone" | "geolocation"): [Permission, () => void] {
  const [state, setState] = useState<Permission>("unknown");

  useEffect(() => {
    let status: PermissionStatus | null = null;
    const update = () => status && setState(status.state as Permission);
    navigator.permissions
      ?.query({ name: name as PermissionName })
      .then((s) => {
        status = s;
        update();
        s.addEventListener("change", update);
      })
      .catch(() => setState("unknown")); // Firefox and older Safari cannot query the microphone
    return () => status?.removeEventListener("change", update);
  }, [name]);

  const request = () => {
    if (name === "microphone") {
      navigator.mediaDevices
        ?.getUserMedia({ audio: true })
        .then((stream) => {
          stream.getTracks().forEach((t) => t.stop());
          setState("granted");
        })
        .catch(() => setState("denied"));
    } else {
      navigator.geolocation?.getCurrentPosition(
        () => setState("granted"),
        (err) => setState(err.code === 1 ? "denied" : "granted"),
        { timeout: 15_000 },
      );
    }
  };

  return [state, request];
}

interface Issue {
  key: string;
  text: string;
  action?: { label: string; onClick: () => void };
}

const ReadinessCard = ({
  online,
  contactCount,
  pending,
  discreet = false,
}: {
  online: boolean;
  /** null while loading. */
  contactCount: number | null;
  pending: number;
  /** During a duress stand-down: show nothing that hints an alert is still running. */
  discreet?: boolean;
}) => {
  const [mic, requestMic] = usePermission("microphone");
  const [geo, requestGeo] = usePermission("geolocation");

  const issues: Issue[] = [];
  if (mic === "denied") issues.push({ key: "mic", text: "Microphone is blocked. Allow it in your browser settings to record audio." });
  else if (mic !== "granted") issues.push({ key: "mic", text: "Microphone not allowed yet", action: { label: "Allow", onClick: requestMic } });
  if (geo === "denied") issues.push({ key: "geo", text: "Location is blocked. Allow it in your browser settings to share where you are." });
  else if (geo !== "granted") issues.push({ key: "geo", text: "Location not allowed yet", action: { label: "Allow", onClick: requestGeo } });
  if (contactCount === 0) issues.push({ key: "contacts", text: "No emergency contacts saved, so nobody would be texted." });
  if (!online) issues.push({ key: "offline", text: "Offline. An alert would be saved and sent when signal returns." });

  const ready = issues.length === 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <IconTile tone={ready ? "safe" : "gold"} size="sm">
            {ready ? <ShieldCheck /> : <AlertTriangle />}
          </IconTile>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {ready ? "Ready" : `${issues.length} thing${issues.length === 1 ? "" : "s"} to check`}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {ready
                ? `Mic, location and ${contactCount} contact${contactCount === 1 ? "" : "s"} set`
                : "SOS still works, with less"}
            </p>
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <span className={cn("h-2 w-2 rounded-full", online ? "bg-safe" : "bg-warning")} />
          {online ? "Online" : "Offline"}
        </span>
      </div>

      {issues.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-border pt-3">
          {issues.map((issue) => (
            <li key={issue.key} className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>{issue.text}</span>
              {issue.action && (
                <Button size="sm" variant="subtle" onClick={issue.action.onClick} className="shrink-0">
                  {issue.action.label}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!discreet && pending > 0 && (
        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
          {pending} item{pending === 1 ? "" : "s"} from your last alert still sending{online ? "…" : " when you are back online"}
        </p>
      )}
    </div>
  );
};

export default ReadinessCard;
