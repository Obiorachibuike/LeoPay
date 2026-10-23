"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartNoAxesCombined,
  Code2,
  CreditCard,
  FileText,
  LayoutDashboard,
  Landmark,
  LifeBuoy,
  Link2,
  Package,
  Receipt,
  Settings,
  ShoppingBag,
  Store,
  Users,
  UsersRound,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavSection } from "@/lib/navigation";

const icons: Record<string, LucideIcon> = {
  "layout-dashboard": LayoutDashboard,
  "credit-card": CreditCard,
  link: Link2,
  "file-text": FileText,
  users: Users,
  store: Store,
  package: Package,
  "shopping-bag": ShoppingBag,
  wallet: Wallet,
  landmark: Landmark,
  receipt: Receipt,
  chart: ChartNoAxesCombined,
  "users-round": UsersRound,
  code: Code2,
  settings: Settings,
  "life-buoy": LifeBuoy,
};

export function SidebarNav({
  sections,
  onNavigate,
  badges,
}: {
  sections: NavSection[];
  onNavigate?: () => void;
  badges?: Partial<Record<"payoutsAwaiting" | "invoicesOverdue", number>>;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Dashboard" className="flex flex-col gap-5">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="px-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted/80">
            {section.title}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = icons[item.icon] ?? LayoutDashboard;
              const active =
                item.href === "/dashboard" ? pathname === "/dashboard" : pathname === item.href || pathname.startsWith(`${item.href}/`);
              const badge = item.badgeKey ? badges?.[item.badgeKey] : undefined;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                      active
                        ? "bg-surface-2 text-foreground shadow-[inset_0_0_0_1px_var(--border)]"
                        : "text-muted-strong hover:bg-surface-2/70 hover:text-foreground",
                    )}
                  >
                    <Icon
                      className={cn("h-[15px] w-[15px] shrink-0", active ? "text-accent" : "text-muted group-hover:text-muted-strong")}
                      aria-hidden
                    />
                    <span className="truncate">{item.label}</span>
                    {badge && badge > 0 ? (
                      <span className="ml-auto rounded-full bg-warning-soft px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200">
                        {badge > 99 ? "99+" : badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function MobileSidebar({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("fixed inset-0 z-50 lg:hidden", open ? "block" : "hidden")} role="dialog" aria-modal="true" aria-label="Navigation">
      <button type="button" aria-label="Close navigation" onClick={onClose} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="safe-bottom absolute inset-y-0 left-0 w-[280px] max-w-[85vw] overflow-y-auto border-r border-border bg-surface p-4 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Navigation</span>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-surface-2" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
