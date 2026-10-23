import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "accent" | "outline";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-muted-strong border-border",
  success: "bg-accent-soft text-emerald-800 dark:text-emerald-200 border-emerald-500/20",
  warning: "bg-warning-soft text-amber-800 dark:text-amber-200 border-amber-500/20",
  danger: "bg-danger-soft text-red-700 dark:text-red-300 border-red-500/20",
  info: "bg-info-soft text-blue-700 dark:text-blue-300 border-blue-500/20",
  accent: "bg-accent text-[var(--accent-ink)] border-transparent",
  outline: "bg-transparent text-muted-strong border-border-strong",
};

export function Badge({
  children,
  tone = "neutral",
  className,
  dot = false,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-wide",
        tones[tone],
        className,
      )}
    >
      {dot ? <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-80" /> : null}
      {children}
    </span>
  );
}

const statusTones: Record<string, BadgeTone> = {
  succeeded: "success",
  paid: "success",
  active: "success",
  verified: "success",
  published: "success",
  approved: "info",
  processing: "info",
  pending: "warning",
  pending_approval: "warning",
  pending_payment: "warning",
  requested: "warning",
  issued: "info",
  partially_paid: "warning",
  overdue: "danger",
  failed: "danger",
  cancelled: "neutral",
  expired: "neutral",
  refunded: "info",
  partially_refunded: "info",
  draft: "neutral",
  disabled: "neutral",
  unverified: "neutral",
  suspended: "danger",
  rejected: "danger",
  open: "warning",
  resolved: "success",
  ignored: "neutral",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = statusTones[status] ?? "neutral";
  return (
    <Badge tone={tone} dot className={cn("capitalize", className)}>
      {status.replaceAll("_", " ")}
    </Badge>
  );
}
