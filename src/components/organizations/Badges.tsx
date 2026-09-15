import { ExternalLink, Mail, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { normalizeWebsite, orgTypeLabel, type Organization } from "@/lib/organizations/directory";

/** Small labels shared by the directory list, the detail panel and the Refer control. */

export const TypeBadge = ({ type, className }: { type: string; className?: string }) => (
  <span
    className={cn(
      "inline-flex whitespace-nowrap rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground",
      className,
    )}
  >
    {orgTypeLabel(type)}
  </span>
);

/** Active is the normal state, so it reads calm; inactive is muted, not alarming. */
export const ActivePill = ({ active, className }: { active: boolean; className?: string }) => (
  <span
    className={cn(
      "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold",
      active ? "bg-safe/10 text-safe" : "bg-secondary text-muted-foreground",
      className,
    )}
  >
    <span className="h-1.5 w-1.5 rounded-full bg-current" />
    {active ? "Active" : "Inactive"}
  </span>
);

const REFERRAL_STYLES: Record<string, string> = {
  referred: "bg-haven-gold/10 text-haven-gold",
  accepted: "bg-safe/10 text-safe",
  completed: "bg-safe/10 text-safe",
  declined: "bg-secondary text-muted-foreground",
};

export const ReferralStatusPill = ({ status }: { status: string }) => (
  <span
    className={cn(
      "inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize",
      REFERRAL_STYLES[status] ?? "bg-secondary text-muted-foreground",
    )}
  >
    {status}
  </span>
);

/** Call, email, website. Each only when the organization has one. */
export const QuickActions = ({ org, compact = false }: { org: Organization; compact?: boolean }) => {
  const website = normalizeWebsite(org.website);
  const size = compact ? "icon-sm" : "icon";
  return (
    <div className="flex shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      {org.phone && (
        <Button asChild size={size} variant="subtle" aria-label={`Call ${org.name}`}>
          <a href={`tel:${org.phone.replace(/[^\d+]/g, "")}`}>
            <Phone />
          </a>
        </Button>
      )}
      {org.email && (
        <Button asChild size={size} variant="subtle" aria-label={`Email ${org.name}`}>
          <a href={`mailto:${org.email}`}>
            <Mail />
          </a>
        </Button>
      )}
      {website && (
        <Button asChild size={size} variant="subtle" aria-label={`Open ${org.name} website`}>
          <a href={website} target="_blank" rel="noopener noreferrer">
            <ExternalLink />
          </a>
        </Button>
      )}
    </div>
  );
};
