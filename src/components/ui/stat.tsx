import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
  delta,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: "default" | "accent" | "warning" | "danger";
  delta?: { value: number; label?: string };
  className?: string;
}) {
  const tones = {
    default: "text-foreground",
    accent: "text-emerald-700 dark:text-emerald-300",
    warning: "text-amber-700 dark:text-amber-300",
    danger: "text-red-700 dark:text-red-300",
  }[tone];

  return (
    <div className={cn("surface-card p-4 sm:p-5", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12.5px] font-medium text-muted">{label}</p>
        {icon ? <span className="text-muted">{icon}</span> : null}
      </div>
      <p className={cn("mt-2 text-[22px] font-semibold tracking-tight tabular sm:text-[25px]", tones)}>{value}</p>
      <div className="mt-1.5 flex items-center gap-2">
        {delta ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-[11.5px] font-medium",
              delta.value > 0 ? "text-emerald-600 dark:text-emerald-400" : delta.value < 0 ? "text-red-600 dark:text-red-400" : "text-muted",
            )}
          >
            {delta.value > 0 ? <ArrowUpRight className="h-3 w-3" /> : delta.value < 0 ? <ArrowDownRight className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
            {Math.abs(delta.value).toFixed(1)}%
            {delta.label ? <span className="text-muted"> {delta.label}</span> : null}
          </span>
        ) : null}
        {hint ? <p className="text-[11.5px] leading-tight text-muted">{hint}</p> : null}
      </div>
    </div>
  );
}

export function MiniStat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted">{label}</p>
      <p className="mt-1.5 text-[18px] font-semibold tabular text-foreground">{value}</p>
      {hint ? <p className="mt-0.5 text-[11.5px] text-muted">{hint}</p> : null}
    </div>
  );
}
