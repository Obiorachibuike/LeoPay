import { redirect } from "next/navigation";
import { and, count, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { invoices, payouts } from "@/lib/db/schema";
import { getOrgContext } from "@/lib/auth/context";
import { listUserOrganizations } from "@/lib/auth/context";
import { hasPermission, ROLE_LABELS } from "@/lib/auth/rbac";
import { dashboardNav } from "@/lib/navigation";
import { DashboardChrome } from "@/components/dashboard/chrome";
import { logoutAction } from "@/app/actions/auth";
import { switchOrganizationAction } from "@/app/actions/organization";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/onboarding");

  const organizations = await listUserOrganizations();

  const sections = dashboardNav
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.permission || hasPermission(ctx.role, item.permission)),
    }))
    .filter((section) => section.items.length > 0);

  const badges: { payoutsAwaiting?: number; invoicesOverdue?: number } = {};
  if (hasPermission(ctx.role, "payout:approve")) {
    const [row] = await db
      .select({ value: count() })
      .from(payouts)
      .where(and(eq(payouts.organizationId, ctx.organization.id), eq(payouts.status, "pending_approval")));
    badges.payoutsAwaiting = Number(row?.value ?? 0);
  }
  if (hasPermission(ctx.role, "invoice:read")) {
    const [row] = await db
      .select({ value: count() })
      .from(invoices)
      .where(
        and(
          eq(invoices.organizationId, ctx.organization.id),
          sql`${invoices.status} = 'overdue' or (${invoices.status} in ('issued','partially_paid') and ${invoices.dueDate} < now())`,
        ),
      );
    badges.invoicesOverdue = Number(row?.value ?? 0);
  }

  return (
    <DashboardChrome
      sections={sections}
      badges={badges}
      organizations={organizations.map((o) => ({ id: o.id, name: o.name, role: o.role }))}
      activeOrganizationId={ctx.organization.id}
      organizationName={ctx.organization.name}
      roleLabel={ROLE_LABELS[ctx.role]}
      user={{ name: ctx.user.name, email: ctx.user.email }}
      isPlatformAdmin={ctx.user.platformRole === "admin"}
      switchOrgAction={switchOrganizationAction}
      signOutAction={logoutAction}
    >
      {children}
    </DashboardChrome>
  );
}
