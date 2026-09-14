import { Shield } from "lucide-react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Page chrome. Every screen in HAVEN is built from these three pieces so the
 * ground, the gutters and the header read the same everywhere.
 */

/** How wide the content column is allowed to grow. */
export type Width = "form" | "content" | "wide" | "full";

const WIDTHS: Record<Width, string> = {
  form: "max-w-sm", // a single column of fields
  content: "max-w-2xl", // reading and browsing
  wide: "max-w-6xl", // cards and grids
  full: "max-w-7xl", // dense tables
};

/** Tinted accent used by a tile or rule. See the accent roles in index.css. */
export type Tone = "sos" | "safe" | "gold" | "muted";

const TILE_TONES: Record<Tone, string> = {
  sos: "bg-sos/10 text-sos",
  safe: "bg-safe/10 text-safe",
  gold: "bg-haven-gold/10 text-haven-gold",
  muted: "bg-secondary text-muted-foreground",
};

/** The page ground. Full height, column layout so footers sit at the bottom. */
export function Screen({
  children,
  center = false,
  className,
}: {
  children: React.ReactNode;
  /** Centre the content vertically — for sign-in, empty and error screens. */
  center?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-screen flex-col bg-background",
        center && "items-center justify-center px-5 py-10 sm:px-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The content column. Same gutters on every page. */
export function Container({
  children,
  width = "content",
  as: Tag = "div",
  className,
}: {
  children: React.ReactNode;
  width?: Width;
  as?: "div" | "main" | "header" | "footer" | "section";
  className?: string;
}) {
  return <Tag className={cn("mx-auto w-full px-5 sm:px-6", WIDTHS[width], className)}>{children}</Tag>;
}

/** A rounded tile holding an icon. The one way HAVEN frames an icon. */
export function IconTile({
  children,
  tone = "sos",
  size = "md",
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: "h-9 w-9 rounded-lg [&_svg]:h-4 [&_svg]:w-4",
    md: "h-10 w-10 rounded-xl [&_svg]:h-5 [&_svg]:w-5",
    lg: "h-16 w-16 rounded-2xl [&_svg]:h-8 [&_svg]:w-8",
  };
  return (
    <div className={cn("flex shrink-0 items-center justify-center", sizes[size], TILE_TONES[tone], className)}>
      {children}
    </div>
  );
}

/**
 * The HAVEN lockup: shield tile, wordmark, and what this particular surface
 * is. `stacked` is the large centred form used on sign-in and install screens.
 */
export function BrandMark({
  subtitle,
  note,
  stacked = false,
  tone = "sos",
  icon,
}: {
  subtitle?: string;
  note?: string;
  stacked?: boolean;
  tone?: Tone;
  icon?: React.ReactNode;
}) {
  const glyph = icon ?? <Shield />;

  if (stacked) {
    return (
      <div className="text-center">
        <IconTile tone={tone} size="lg" className="mx-auto mb-4">
          {glyph}
        </IconTile>
        <p className="brand-wordmark text-2xl text-foreground">HAVEN</p>
        {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
        {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-3">
      <IconTile tone={tone}>{glyph}</IconTile>
      <div className="min-w-0">
        <p className="brand-wordmark text-base leading-tight text-foreground">HAVEN</p>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

/**
 * Top bar. Either the HAVEN lockup (`brand`) or a titled page header, with an
 * optional back affordance and trailing actions.
 */
export function PageHeader({
  brand = false,
  icon,
  tone = "sos",
  title,
  subtitle,
  onBack,
  backLabel = "Back",
  actions,
  width = "content",
  sticky = false,
}: {
  brand?: boolean;
  icon?: React.ReactNode;
  tone?: Tone;
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  actions?: React.ReactNode;
  width?: Width;
  sticky?: boolean;
}) {
  return (
    <header
      className={cn(
        "border-b border-border bg-background/85 backdrop-blur",
        sticky && "sticky top-0 z-20",
      )}
    >
      <Container width={width} className="flex min-h-[68px] items-center gap-3 py-3">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack} aria-label={backLabel} className="-ml-2 shrink-0">
            <ArrowLeft />
          </Button>
        )}

        {brand ? (
          <BrandMark subtitle={subtitle} tone={tone} icon={icon} />
        ) : (
          <div className="flex min-w-0 items-center gap-3">
            {icon && <IconTile tone={tone}>{icon}</IconTile>}
            <div className="min-w-0">
              <h1 className="truncate font-display text-lg font-bold leading-tight text-foreground">{title}</h1>
              {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
        )}

        {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
      </Container>
    </header>
  );
}
