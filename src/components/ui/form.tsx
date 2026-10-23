import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

const fieldBase =
  "w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted/80 shadow-[var(--shadow-sm)] transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-60 aria-[invalid=true]:border-[var(--danger)]";

export function Label({ className, children, ...props }: ComponentProps<"label">) {
  return (
    <label className={cn("mb-1.5 block text-[13px] font-medium text-foreground", className)} {...props}>
      {children}
    </label>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldBase, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(fieldBase, "min-h-[96px] py-2.5 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn(fieldBase, "h-10 pr-8 appearance-none bg-[length:16px] pr-9", className)} {...props}>
      {children}
    </select>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
  optional,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string | string[];
  children: ReactNode;
  className?: string;
  optional?: boolean;
}) {
  const message = Array.isArray(error) ? error[0] : error;
  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-baseline justify-between">
        <Label htmlFor={htmlFor}>{label}</Label>
        {optional ? <span className="mb-1.5 text-[11px] text-muted">Optional</span> : null}
      </div>
      {children}
      {message ? (
        <p className="mt-1.5 text-[12px] text-[var(--danger)]" role="alert">
          {message}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[12px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Checkbox({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      type="checkbox"
      className={cn(
        "mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong text-accent accent-[var(--accent)] focus:ring-accent/30",
        className,
      )}
      {...props}
    />
  );
}

export function Fieldset({ legend, children, description }: { legend: string; description?: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4 border-0 p-0">
      <legend className="p-0">
        <span className="block text-sm font-semibold text-foreground">{legend}</span>
        {description ? <span className="mt-0.5 block text-[12px] text-muted">{description}</span> : null}
      </legend>
      {children}
    </fieldset>
  );
}
