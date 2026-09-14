import { useId } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * A labelled form control. Every form in HAVEN uses this, so the label,
 * spacing, hint and error treatment are identical whether you are signing in,
 * adding an emergency contact, or inviting a responder.
 */
export function Field({
  label,
  hint,
  error,
  required,
  optional,
  children,
  className,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** Marks the field optional in the label. Most fields are required, so
      calling those out would be noise — the exceptions are what to flag. */
  optional?: boolean;
  /** A select, textarea or custom control. Omit to render a plain input. */
  children?: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => React.ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  const auto = useId();
  const id = htmlFor ?? auto;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {optional && <span className="ml-1.5 font-normal text-muted-foreground">optional</span>}
      </Label>
      {children?.({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs text-sos">
          {error}
        </p>
      )}
    </div>
  );
}

/** The common case: a label and a text input. */
export function TextField({
  label,
  hint,
  error,
  required,
  optional,
  className,
  ...inputProps
}: {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
} & React.ComponentProps<typeof Input>) {
  return (
    <Field label={label} hint={hint} error={error} required={required} optional={optional} className={className}>
      {(a11y) => <Input {...a11y} required={required} aria-invalid={a11y["aria-invalid"]} {...inputProps} />}
    </Field>
  );
}
