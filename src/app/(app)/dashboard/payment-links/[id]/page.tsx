import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { db } from "@/lib/db/client";
import { payments } from "@/lib/db/schema";
import { requirePermission } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/rbac";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { env } from "@/lib/env";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { CopyButton } from "@/components/ui/copy-button";
import { ActionButton } from "@/components/ui/action-button";
import { togglePaymentLinkAction } from "@/app/actions/payment-links";
import { ButtonLink } from "@/components/ui/button";
import { paymentLinks } from "@/lib/db/schema";

export default async function PaymentLinkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("payment:read");
  const { id } = await params;

  const [link] = await db
    .select()
    .from(paymentLinks)
    .where(and(eq(paymentLinks.id, id), eq(paymentLinks.organizationId, ctx.organization.id)))
    .limit(1);
  if (!link) notFound();

  const linkPayments = await db
    .select()
    .from(payments)
    .where(and(eq(payments.paymentLinkId, link.id), eq(payments.organizationId, ctx.organization.id)))
    .orderBy(desc(payments.createdAt))
    .limit(50);

  const collected = linkPayments.filter((p) => p.status === "succeeded").reduce((sum, p) => sum + p.amountMinor, 0);
  const successCount = linkPayments.filter((p) => p.status === "succeeded").length;
  const publicUrl = `${env.appUrl}/pay/${link.publicReference}`;
  const canWrite = hasPermission(ctx.role, "payment:write");
  const expired = link.expiresAt ? link.expiresAt < new Date() : false;

  return (
    <div className="space-y-5">
      <Link href="/dashboard/payment-links" className="inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Payment links
      </Link>

      <PageHeader
        eyebrow="Payment link"
        title={link.title}
        description={link.description ?? undefined}
        actions={
          <>
            <StatusBadge status={expired ? "expired" : link.status} />
            <ButtonLink href={`/pay/${link.publicReference}`} target="_blank" size="sm" variant="secondary">
              <ExternalLink className="h-3.5 w-3.5" /> Preview checkout
            </ButtonLink>
            {canWrite ? (
              <ActionButton
                action={togglePaymentLinkAction.bind(null, link.id, link.status as "active" | "disabled")}
                variant={link.status === "active" ? "danger" : "primary"}
              >
                {link.status === "active" ? "Disable link" : "Enable link"}
              </ActionButton>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader title="Payments" description={`${successCount} successful · ${formatMoney(collected, link.currency)} collected`} />
          {linkPayments.length === 0 ? (
            <CardBody>
              <p className="text-[13px] text-muted">No payments have started on this link yet.</p>
            </CardBody>
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>Reference</Th>
                  <Th>Customer</Th>
                  <Th>Status</Th>
                  <Th align="right">Amount</Th>
                </tr>
              </thead>
              <tbody>
                {linkPayments.map((payment) => (
                  <Tr key={payment.id}>
                    <Td>
                      <Link href={`/dashboard/payments/${payment.id}`} className="font-mono text-[11.5px] text-accent hover:underline">
                        {payment.internalReference}
                      </Link>
                      <span className="block text-[10.5px] text-muted">{formatDateTime(payment.createdAt)}</span>
                    </Td>
                    <Td className="max-w-[160px] truncate">{payment.customerName ?? payment.customerEmail ?? "Guest"}</Td>
                    <Td><StatusBadge status={payment.status} /></Td>
                    <Td align="right">{formatMoney(payment.amountMinor, payment.currency)}</Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Share" />
            <CardBody className="space-y-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.06em] text-muted">Public link</p>
                <p className="mt-1 break-all rounded bg-surface-2 px-2 py-1.5 font-mono text-[11px]">{publicUrl}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <CopyButton value={publicUrl} label="Copy link" />
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(`${link.title}: ${publicUrl}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center rounded-lg border border-border px-2.5 text-[12px] font-medium text-muted-strong hover:bg-surface-2"
                  >
                    Share on WhatsApp
                  </a>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-[12px]">
                <div>
                  <p className="text-muted">Amount</p>
                  <p className="font-medium">
                    {link.allowVariableAmount
                      ? `${formatMoney(link.minAmountMinor ?? 0, link.currency)} – ${formatMoney(link.maxAmountMinor ?? 0, link.currency)}`
                      : formatMoney(link.amountMinor ?? 0, link.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-muted">Currency</p>
                  <p className="font-medium">{link.currency}</p>
                </div>
                <div>
                  <p className="text-muted">Expires</p>
                  <p className="font-medium">{link.expiresAt ? formatDateTime(link.expiresAt) : "Never"}</p>
                </div>
                <div>
                  <p className="text-muted">Variable amount</p>
                  <p className="font-medium">{link.allowVariableAmount ? "Yes" : "No"}</p>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Conversion" />
            <CardBody className="text-[12.5px]">
              <p className="text-muted">
                {linkPayments.length === 0
                  ? "No checkout attempts yet."
                  : `${successCount} of ${linkPayments.length} checkout attempts succeeded (${Math.round((successCount / linkPayments.length) * 100)}%).`}
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-muted">
                Counts include attempts that are still pending. Pending attempts are not failures.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
