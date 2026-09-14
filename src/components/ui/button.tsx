import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Variants carry meaning, not just colour — see the accent roles in index.css.
 *   sos    urgent / irreversible / dangerous. Nothing else.
 *   safe   resolving, confirming, standing down.
 *   gold   the calm informational layer (Pathways, wayfinding, secondary CTAs).
 *   subtle a card-coloured button for toolbars and chips.
 *
 * Heights are >= 44px at every size but `sm`, because this app gets used
 * one-handed, in a hurry, sometimes in the dark.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium ring-offset-background transition-[background-color,border-color,color,transform,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        sos: "bg-sos text-destructive-foreground hover:bg-sos/90 shadow-[0_0_24px_hsl(var(--sos-red)/0.25)] hover:shadow-[0_0_32px_hsl(var(--sos-red)/0.4)]",
        safe: "bg-safe text-ink hover:bg-safe/90",
        gold: "bg-haven-gold text-ink hover:bg-haven-gold/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-border bg-transparent hover:bg-secondary hover:text-foreground",
        subtle: "border border-border bg-card text-foreground hover:bg-secondary",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "text-muted-foreground hover:bg-secondary hover:text-foreground",
        link: "text-haven-gold underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        default: "h-11 px-4 py-2",
        sm: "h-9 rounded-lg px-3 text-xs",
        lg: "h-12 px-6",
        /** Full-width primary action at the bottom of a screen. */
        xl: "h-14 rounded-2xl px-8 font-display text-lg font-bold [&_svg]:size-5",
        icon: "h-11 w-11",
        "icon-sm": "h-9 w-9 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
