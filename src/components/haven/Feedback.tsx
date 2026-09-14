import { cn } from "@/lib/utils";
import { IconTile, Screen, type Tone } from "./Screen";

/**
 * Everything the app uses to say "wait", "that worked", "that did not", or
 * "there is nothing here yet".
 */

/** The single loading indicator. */
export function Spinner({
  size = "md",
  tone = "sos",
  className,
  label = "Loading",
}: {
  size?: "sm" | "md";
  tone?: "sos" | "gold" | "current";
  className?: string;
  label?: string;
}) {
  const tones = {
    sos: "border-sos",
    gold: "border-haven-gold",
    current: "border-current",
  };
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        "inline-block animate-spin rounded-full border-2 border-t-transparent",
        size === "sm" ? "h-4 w-4" : "h-8 w-8",
        tones[tone],
        className,
      )}
    />
  );
}

/** Whole-page loading state, used while a route checks auth or fetches. */
export function ScreenLoader({ tone = "sos" }: { tone?: "sos" | "gold" }) {
  return (
    <Screen center>
      <Spinner tone={tone} />
    </Screen>
  );
}

export type CalloutTone = "danger" | "safe" | "warning" | "info";

const CALLOUT_TONES: Record<CalloutTone, string> = {
  danger: "border-sos/25 bg-sos/10 text-sos",
  safe: "border-safe/25 bg-safe/10 text-safe",
  warning: "border-warning/25 bg-warning/10 text-warning",
  info: "border-border bg-secondary text-muted-foreground",
};

/**
 * An inline message: a form error, a success confirmation, a standing note.
 * Errors are announced, so a screen reader hears a failed sign-in.
 */
export function Callout({
  tone = "info",
  icon,
  title,
  children,
  className,
}: {
  tone?: CalloutTone;
  icon?: React.ReactNode;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("rounded-xl border px-4 py-3 text-sm", CALLOUT_TONES[tone], className)}
    >
      <div className="flex gap-2.5">
        {icon && <span className="mt-0.5 shrink-0 [&_svg]:h-4 [&_svg]:w-4">{icon}</span>}
        <div className="min-w-0 flex-1">
          {title && <p className="font-semibold">{title}</p>}
          {children && <div className={cn("text-current/90", title && "mt-1")}>{children}</div>}
        </div>
      </div>
    </div>
  );
}

/** Status of an incident. One pill, used by the dashboard and the track page. */
export function StatusPill({ active, className }: { active: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        active ? "bg-sos/10 text-sos" : "bg-safe/10 text-safe",
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full bg-current", active && "animate-alert-pulse")} />
      {active ? "Active" : "Resolved"}
    </span>
  );
}

/** Nothing here yet — say what would be here, and how to put it there. */
export function EmptyState({
  icon,
  tone = "muted",
  title,
  description,
  action,
  className,
}: {
  icon: React.ReactNode;
  tone?: Tone;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-4 px-6 py-14 text-center", className)}>
      <IconTile tone={tone} size="lg">
        {icon}
      </IconTile>
      <div className="max-w-sm">
        <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
