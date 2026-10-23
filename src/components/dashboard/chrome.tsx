"use client";

import Link from "next/link";
import { useState } from "react";
import { Building2, ChevronDown, LogOut, Menu, Search, Shield, UserRound } from "lucide-react";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { SidebarNav, MobileSidebar } from "@/components/dashboard/sidebar-nav";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { cn, initials } from "@/lib/utils";
import type { NavSection } from "@/lib/navigation";
import type { FormState } from "@/app/actions/auth";

type OrgSummary = { id: string; name: string; role: string };

export function DashboardChrome({
  sections,
  badges,
  organizations,
  activeOrganizationId,
  organizationName,
  roleLabel,
  user,
  isPlatformAdmin,
  switchOrgAction,
  signOutAction,
  children,
}: {
  sections: NavSection[];
  badges?: Partial<Record<"payoutsAwaiting" | "invoicesOverdue", number>>;
  organizations: OrgSummary[];
  activeOrganizationId: string;
  organizationName: string;
  roleLabel: string;
  user: { name: string; email: string };
  isPlatformAdmin: boolean;
  switchOrgAction: (orgId: string) => Promise<void>;
  signOutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-dvh bg-background">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-16 items-center border-b border-border px-5">
          <Logo href="/dashboard" size={26} />
        </div>

        <div className="px-3 pt-3">
          <details className="group relative">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2 text-left hover:bg-surface-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--brand)] text-[11px] font-semibold text-[var(--brand-foreground)]">
                {initials(organizationName)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium text-foreground">{organizationName}</span>
                <span className="block text-[10.5px] text-muted">{roleLabel}</span>
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
            </summary>
            <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadow-md)]">
              <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">Workspaces</p>
              {organizations.map((org) => (
                <form
                  key={org.id}
                  action={async () => {
                    await switchOrgAction(org.id);
                  }}
                >
                  <button
                    type="submit"
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] hover:bg-surface-2",
                      org.id === activeOrganizationId ? "text-foreground" : "text-muted-strong",
                    )}
                  >
                    <Building2 className="h-3.5 w-3.5" aria-hidden />
                    <span className="truncate">{org.name}</span>
                    {org.id === activeOrganizationId ? <span className="ml-auto text-accent">•</span> : null}
                  </button>
                </form>
              ))}
              <Link href="/onboarding" className="block border-t border-border px-3 py-2 text-[12.5px] text-muted-strong hover:bg-surface-2">
                + New workspace
              </Link>
            </div>
          </details>
        </div>

        <div className="scroll-thin flex-1 overflow-y-auto px-3 py-4">
          <SidebarNav sections={sections} badges={badges} />
          {isPlatformAdmin ? (
            <div className="mt-4 border-t border-border pt-3">
              <Link href="/admin" className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-medium text-amber-700 hover:bg-warning-soft dark:text-amber-300">
                <Shield className="h-4 w-4" aria-hidden /> Platform admin
              </Link>
            </div>
          ) : null}
        </div>

        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2 rounded-lg px-2 py-1.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-3 text-[11px] font-semibold text-foreground">
              {initials(user.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium text-foreground">{user.name}</p>
              <p className="truncate text-[10.5px] text-muted">{user.email}</p>
            </div>
            <form action={signOutAction}>
              <button
                type="submit"
                aria-label="Sign out"
                title="Sign out"
                className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      <MobileSidebar open={mobileOpen} onClose={() => setMobileOpen(false)}>
        <div className="mb-4 flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-medium">{organizationName}</p>
            <p className="text-[10.5px] text-muted">{roleLabel}</p>
          </div>
          <Badge tone="neutral">{initials(organizationName)}</Badge>
        </div>
        <SidebarNav sections={sections} badges={badges} onNavigate={() => setMobileOpen(false)} />
        <form action={signOutAction} className="mt-4 border-t border-border pt-3">
          <button type="submit" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-muted-strong hover:bg-surface-2">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </form>
      </MobileSidebar>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-md sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="rounded-lg border border-border p-2 text-muted-strong lg:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="lg:hidden">
            <Logo href="/dashboard" size={24} />
          </div>

          <Link
            href="/dashboard/payments"
            className="hidden items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-[12.5px] text-muted md:flex md:w-64"
          >
            <Search className="h-3.5 w-3.5" aria-hidden />
            Search payments…
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle compact />
            <details className="relative">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-border bg-surface px-2 py-1.5 text-[12.5px] font-medium text-foreground hover:bg-surface-2">
                <UserRound className="h-3.5 w-3.5 text-muted" aria-hidden />
                <span className="hidden max-w-[120px] truncate sm:block">{user.name.split(" ")[0]}</span>
                <ChevronDown className="h-3 w-3 text-muted" aria-hidden />
              </summary>
              <div className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadow-md)]">
                <div className="border-b border-border px-3 py-2">
                  <p className="truncate text-[12.5px] font-medium">{user.name}</p>
                  <p className="truncate text-[11px] text-muted">{user.email}</p>
                </div>
                <Link href="/dashboard/settings" className="block px-3 py-2 text-[12.5px] hover:bg-surface-2">
                  Account settings
                </Link>
                <Link href="/dashboard/settings#security" className="block px-3 py-2 text-[12.5px] hover:bg-surface-2">
                  Security
                </Link>
                <Link href="/help" className="block px-3 py-2 text-[12.5px] hover:bg-surface-2">
                  Help centre
                </Link>
                <form action={signOutAction} className="border-t border-border">
                  <button type="submit" className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-[var(--danger)] hover:bg-surface-2">
                    <LogOut className="h-3.5 w-3.5" /> Sign out
                  </button>
                </form>
              </div>
            </details>
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>

        <footer className="border-t border-border px-4 py-4 text-[11px] text-muted sm:px-6">
          <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-2">
            <span>© {new Date().getFullYear()} LeoPay · Your Business. Your Money. Your Momentum.</span>
            <span className="flex gap-3">
              <Link href="/legal/terms" className="hover:text-foreground">Terms</Link>
              <Link href="/legal/privacy" className="hover:text-foreground">Privacy</Link>
              <Link href="/status" className="hover:text-foreground">Status</Link>
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}

export function InlineFormButton({
  action,
  children,
  className,
}: {
  action: () => Promise<void>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <form action={action}>
      <button type="submit" className={className ?? buttonClasses("secondary", "sm")}>
        {children}
      </button>
    </form>
  );
}

export type { FormState };
