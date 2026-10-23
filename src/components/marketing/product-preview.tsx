import { ArrowUpRight, CheckCircle2, CircleDashed, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * Illustrative product mockup. Every number here is sample data and the UI
 * labels it as such — it is never presented as real customer activity.
 */
export function ProductPreview() {
  const bars = [38, 52, 44, 68, 59, 74, 62, 88, 70, 92, 78, 96];

  return (
    <figure className="relative w-full max-w-[520px]">
      <div className="absolute -inset-4 -z-10 rounded-[26px] bg-gradient-to-br from-accent/20 via-transparent to-transparent blur-2xl" aria-hidden />
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-lg)]">
        <div className="flex items-center justify-between border-b border-border bg-surface-2/60 px-4 py-2.5">
          <div className="flex items-center gap-1.5" aria-hidden>
            <span className="h-2 w-2 rounded-full bg-border-strong" />
            <span className="h-2 w-2 rounded-full bg-border-strong" />
            <span className="h-2 w-2 rounded-full bg-border-strong" />
          </div>
          <Badge tone="neutral" className="text-[9.5px] uppercase tracking-[0.1em]">
            Illustrative preview · sample data
          </Badge>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-medium text-muted">Collections · last 30 days</p>
              <p className="mt-1 text-[26px] font-semibold tracking-tight tabular">₦4,820,500.00</p>
              <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                <ArrowUpRight className="h-3 w-3" /> 12.4% vs previous period
              </p>
            </div>
            <span className="rounded-md border border-border bg-surface-2 px-2 py-1 text-[10.5px] font-medium text-muted">
              Last 30 days
            </span>
          </div>

          <div className="mt-4 flex h-[92px] items-end gap-1.5" aria-hidden>
            {bars.map((height, index) => (
              <div
                key={index}
                className="flex-1 rounded-t-[3px]"
                style={{
                  height: `${height}%`,
                  background: index === bars.length - 1 ? "var(--accent)" : "color-mix(in srgb, var(--accent) 32%, transparent)",
                }}
              />
            ))}
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            {[
              { label: "Successful", value: "128", icon: CheckCircle2, tone: "text-emerald-600 dark:text-emerald-400" },
              { label: "Pending", value: "6", icon: CircleDashed, tone: "text-amber-600 dark:text-amber-400" },
              { label: "Payment links", value: "9", icon: Link2, tone: "text-blue-600 dark:text-blue-400" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border border-border bg-background p-2.5">
                <stat.icon className={`h-3.5 w-3.5 ${stat.tone}`} aria-hidden />
                <p className="mt-1.5 text-[15px] font-semibold tabular">{stat.value}</p>
                <p className="text-[10px] text-muted">{stat.label}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border border-border">
            {[
              { name: "Design retainer", amount: "₦250,000.00", status: "Succeeded" },
              { name: "Landing page build", amount: "₦480,000.00", status: "Succeeded" },
              { name: "Consulting session", amount: "₦95,000.00", status: "Pending" },
            ].map((row, index) => (
              <div
                key={row.name}
                className={`flex items-center justify-between px-3 py-2 text-[11.5px] ${index !== 2 ? "border-b border-border" : ""}`}
              >
                <span className="truncate text-muted-strong">{row.name}</span>
                <span className="flex items-center gap-2">
                  <span className="tabular font-medium">{row.amount}</span>
                  <span
                    className={`hidden rounded-full px-1.5 py-0.5 text-[9.5px] font-medium sm:inline ${
                      row.status === "Succeeded"
                        ? "bg-accent-soft text-emerald-700 dark:text-emerald-300"
                        : "bg-warning-soft text-amber-700 dark:text-amber-300"
                    }`}
                  >
                    {row.status}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <figcaption className="sr-only">
        An illustrative LeoPay dashboard showing sample collections, payment counts and recent transactions. The values
        shown are sample data, not real customer activity.
      </figcaption>
    </figure>
  );
}
