import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline" | "accentSoft";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const base =
  "inline-flex items-center justify-center gap-2 font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-55 whitespace-nowrap select-none";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-[var(--brand)] text-[var(--brand-foreground)] hover:opacity-90 active:opacity-95 shadow-[var(--shadow-sm)]",
  secondary: "bg-surface-2 text-foreground border border-border hover:bg-surface-3",
  ghost: "text-muted-strong hover:bg-surface-2 hover:text-foreground",
  danger: "bg-[var(--danger)] text-white hover:opacity-90",
  outline: "border border-border-strong text-foreground hover:bg-surface-2",
  accentSoft: "bg-accent-soft text-emerald-900 dark:text-emerald-200 hover:brightness-95",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 rounded-lg px-3 text-[13px]",
  md: "h-10 rounded-lg px-4 text-sm",
  lg: "h-11 rounded-lg px-5 text-[15px]",
  icon: "h-9 w-9 rounded-lg",
};

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  loading,
  children,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean }) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, className)}
      disabled={props.disabled || loading}
      {...props}
    >
      {loading ? (
        <span
          aria-hidden
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClasses(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}

/** Full-width submit button for use with form action pending states. */
export function SubmitButton({
  children,
  pending,
  variant = "primary",
  size = "md",
  className,
  disabled,
  name,
  value,
}: {
  children: ReactNode;
  pending?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  disabled?: boolean;
  name?: string;
  value?: string;
}) {
  return (
    <Button type="submit" variant={variant} size={size} className={className} loading={pending} disabled={disabled} name={name} value={value}>
      {children}
    </Button>
  );
}
