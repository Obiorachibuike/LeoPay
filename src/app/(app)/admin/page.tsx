import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/auth/context";
import {
  platformStats,
  listOrganizationsForAdmin,
  listUsersForAdmin,
  listOpenExceptions,
  listWebhookFailures,
} from "@/services/admin";
import { getSession } from "@/lib/auth/session";
import { formatDate, formatDateTime, timeAgo } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/action-button";
import {
  adminSetOrgStatusAction,
  adminVerificationDecisionAction,
  adminSetUserStatusAction,
} from "@/app/actions/admin";

export const metadata: Metadata = { title: "Platform administration", robots: { index: false, follow: false } };

export default async function AdminPage() {
  let admin;
  try {
    admin = await requirePlatformAdmin();
  } catch {
    notFound();
  }
  const session = await getSession();
  const [stats, organizations, users, exceptions, webhooks] = await Promise.all([
    platformStats(),
    listOrganizationsForAdmin({ limit: 50 }),
    listUsersForAdmin(50),
    listOpenExceptions(20),
    listWebhookFailures(10),
  ]);

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo href="/dashboard" size={24} />
            <span className="rounded-full border border-border px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">
              Platform admin
            </span>
          </div>
          <div className="flex items-center gap-3 text-[12px]">
            <span className="hidden text-muted sm:inline">{admin.email}</span>
            <ThemeToggle />
            <Link href="/dashboard" className="text-muted hover:text-foreground">Dashboard</Link>
            {session ? (
              <form action="/api/auth/logout" method="post" className="hidden">
                <button type="submit">Sign out</button>
              </form>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Platform overview</h1>
          <p className="mt-1 text-[13px] text-muted">
            Cross-organization operations. Every decision here is audited and requires a platform administrator account.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Organizations" value={stats.organizations} hint={`${stats.users} users`} />
          <StatCard label="Verified volume (30d)" value={formatMoney(stats.volume30dMinor, "NGN")} hint={`${stats.payments30d} payments across currencies`} tone="accent" />
          <StatCard label="Open exceptions" value={stats.openExceptions} tone={stats.openExceptions > 0 ? "warning" : "default"} />
          <StatCard label="Failed provider events" value={stats.failedProviderEvents} tone={stats.failedProviderEvents > 0 ? "danger" : "default"} hint={`${stats.emails.failed} failed emails`} />
        </div>

        <Card>
          <CardHeader title="Organizations" description={`${organizations.length} most recent`} />
          <TableWrap>
            <thead>
              <tr><Th>Workspace</Th><Th>Status</Th><Th>Verification</Th><Th>Members</Th><Th>Created</Th><Th align="right" /></tr>
            </thead>
            <tbody>
              {organizations.map((organization) => (
                <Tr key={organization.id}>
                  <Td>
                    <span className="block font-medium">{organization.name}</span>
                    <span className="block font-mono text-[10.5px] text-muted">/{organization.slug}</span>
                  </Td>
                  <Td><StatusBadge status={organization.status} /></Td>
                  <Td><StatusBadge status={organization.verificationStatus} /></Td>
                  <Td className="text-muted">{organization.members}</Td>
                  <Td className="whitespace-nowrap text-muted">{formatDate(organization.createdAt)}</Td>
                  <Td align="right">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {organization.verificationStatus === "pending" ? (
                        <>
                          <ActionButton action={adminVerificationDecisionAction.bind(null, organization.id, "verified")} size="sm">
                            Verify
                          </ActionButton>
                          <ActionButton action={adminVerificationDecisionAction.bind(null, organization.id, "rejected")} size="sm" variant="secondary">
                            Reject
                          </ActionButton>
                        </>
                      ) : null}
                      <ActionButton
                        action={adminSetOrgStatusAction.bind(null, organization.id, organization.status === "active" ? "suspended" : "active")}
                        size="sm"
                        variant="ghost"
                        confirm={organization.status === "active" ? "Suspend this organization? Its users lose dashboard access and payments stop." : "Reactivate this organization?"}
                      >
                        {organization.status === "active" ? "Suspend" : "Reactivate"}
                      </ActionButton>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <Card>
            <CardHeader title="Users" description="Recent accounts" />
            <TableWrap>
              <thead><tr><Th>User</Th><Th>Status</Th><Th>Email</Th><Th>Last login</Th><Th align="right" /></tr></thead>
              <tbody>
                {users.map((user) => (
                  <Tr key={user.id}>
                    <Td>
                      <span className="block">{user.name}</span>
                      <span className="block text-[10.5px] text-muted">{user.organizations} workspace(s){user.platformRole === "admin" ? " · platform admin" : ""}</span>
                    </Td>
                    <Td><Badge tone={user.status === "active" ? "success" : "danger"}>{user.status}</Badge></Td>
                    <Td>{user.emailVerifiedAt ? <Badge tone="success">verified</Badge> : <Badge tone="warning">unverified</Badge>}</Td>
                    <Td className="whitespace-nowrap text-muted">{user.lastLoginAt ? timeAgo(user.lastLoginAt) : "Never"}</Td>
                    <Td align="right">
                      {user.id !== admin.id ? (
                        <ActionButton
                          action={adminSetUserStatusAction.bind(null, user.id, user.status === "active" ? "suspended" : "active")}
                          size="sm"
                          variant="ghost"
                          confirm="Change this account's status? Suspended users are signed out of every workspace."
                        >
                          {user.status === "active" ? "Suspend" : "Restore"}
                        </ActionButton>
                      ) : null}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader title="Reconciliation exceptions" description={`${exceptions.length} open`} />
              <CardBody className="space-y-2">
                {exceptions.length === 0 ? (
                  <p className="text-[12.5px] text-muted">No open exceptions.</p>
                ) : (
                  exceptions.map((exception) => (
                    <div key={exception.id} className="border-b border-border pb-2 text-[12px] last:border-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium capitalize">{exception.type.replaceAll("_", " ")}</span>
                        <Badge tone={exception.severity === "critical" ? "danger" : "warning"}>{exception.severity}</Badge>
                      </div>
                      <p className="text-muted">{exception.organizationName} · {exception.description}</p>
                      <p className="text-[10.5px] text-muted">{formatDateTime(exception.createdAt)}</p>
                    </div>
                  ))
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Webhook failures" description="Provider events and merchant deliveries" />
              <CardBody className="space-y-2 text-[12px]">
                {webhooks.providerEvents.length === 0 && webhooks.merchantDeliveries.length === 0 ? (
                  <p className="text-muted">No failures recorded.</p>
                ) : null}
                {webhooks.providerEvents.map((event) => (
                  <div key={event.id} className="flex justify-between gap-2 border-b border-border pb-2 last:border-0">
                    <span className="truncate">{event.eventType}</span>
                    <span className="shrink-0 text-muted">{timeAgo(event.receivedAt)}</span>
                  </div>
                ))}
                {webhooks.merchantDeliveries.map((delivery) => (
                  <div key={delivery.id} className="flex justify-between gap-2 border-b border-border pb-2 last:border-0">
                    <span className="truncate">{delivery.eventType} {delivery.responseStatus ? `· HTTP ${delivery.responseStatus}` : ""}</span>
                    <span className="shrink-0 text-muted">{delivery.attempts} attempt(s)</span>
                  </div>
                ))}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Administration notes" />
              <CardBody className="space-y-2 text-[12px] text-muted">
                <p className="flex items-start gap-1.5">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Platform administrators can suspend accounts and review verification requests. They cannot approve payouts
                  inside a customer organization.
                </p>
                <p>Verification decisions are manual. LeoPay does not claim regulatory approval on your behalf.</p>
              </CardBody>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
