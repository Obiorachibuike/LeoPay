import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db/client";
import { invoices, payments, refunds } from "@/lib/db/schema";
import { requirePermission } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/rbac";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { RefundForm, VerifyPaymentButton } from "@/components/dashboard/payment-actions";
import { CopyButton } from "@/components/ui/copy-button";

export default async function PaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("payment:read");
  const { id } = await params;

  const [payment] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.id, id), eq(payments.organizationId, ctx.organization.id)))
    .limit(1);

  if (!payment) notFound();

  const refundRows = await db.select().from(refunds).where(eq(refunds.paymentId, payment.id));
  const refundedMinor = refundRows.filter((r) => r.status === "succeeded").reduce((sum, r) => sum + r.amountMinor, 0);
  const refundableMinor = payment.status === "succeeded" ? payment.amountMinor - refundedMinor : 0;

  const invoice = payment.invoiceId
    ? (await db.select().from(invoices).where(and(eq(invoices.id, payment.invoiceId), eq(invoices.organizationId, ctx.organization.id))).limit(1))[0]
    : undefined;

  const [eventCount] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(refunds)
    .where(eq(refunds.paymentId, payment.id));

  return (
    <div className="space-y-5">
      <Link href="/dashboard/payments" className="inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> All payments
      </Link>

      <PageHeader
        eyebrow="Payment"
        title={formatMoney(payment.amountMinor, payment.currency)}
        description={`Reference ${payment.internalReference}`}
        actions={
          <>
            <StatusBadge status={payment.status} />
            {payment.provider === "mock" ? <Badge tone="neutral">Test transaction</Badge> : null}
            {payment.status !== "succeeded" && payment.status !== "refunded" ? (
              <VerifyPaymentButton reference={payment.internalReference} />
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Transaction details" />
            <CardBody className="grid gap-3 sm:grid-cols-2">
              {[
                { label: "Amount", value: formatMoney(payment.amountMinor, payment.currency) },
                { label: "Status", value: payment.status.replaceAll("_", " ") },
                { label: "Provider", value: payment.provider },
                { label: "Provider reference", value: payment.providerReference ?? "—", mono: true },
                { label: "Internal reference", value: payment.internalReference, mono: true },
                { label: "Payment method", value: payment.paymentMethod ?? "—" },
                { label: "Channel", value: payment.channel?.replaceAll("_", " ") ?? "—" },
                { label: "Provider fee", value: payment.feeMinor !== null ? formatMoney(payment.feeMinor, payment.currency) : "Not supplied" },
                { label: "Net amount", value: payment.netMinor !== null ? formatMoney(payment.netMinor, payment.currency) : "—" },
                { label: "Created", value: formatDateTime(payment.createdAt) },
                { label: "Paid", value: payment.paidAt ? formatDateTime(payment.paidAt) : "—" },
                { label: "Refunded", value: formatMoney(refundedMinor, payment.currency) },
              ].map((row) => (
                <div key={row.label}>
                  <p className="text-[11px] uppercase tracking-[0.06em] text-muted">{row.label}</p>
                  <p className={`mt-0.5 text-[13px] capitalize ${row.mono ? "font-mono text-[11.5px] normal-case" : ""}`}>{row.value}</p>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Customer" />
            <CardBody className="space-y-2 text-[13px]">
              <p>{payment.customerName ?? "Guest checkout"}</p>
              <p className="text-muted">{payment.customerEmail ?? "No email provided"}</p>
              {typeof payment.metadata === "object" && payment.metadata && "customerPhone" in payment.metadata ? (
                <p className="text-muted">{String((payment.metadata as Record<string, unknown>).customerPhone ?? "")}</p>
              ) : null}
              {invoice ? (
                <p className="pt-2">
                  Related invoice:{" "}
                  <Link href={`/dashboard/invoices/${invoice.id}`} className="font-medium text-accent hover:underline">
                    {invoice.invoiceNumber}
                  </Link>
                </p>
              ) : null}
            </CardBody>
          </Card>

          {refundRows.length > 0 ? (
            <Card>
              <CardHeader title="Refunds" description={`${Number(eventCount?.value ?? 0)} refund record(s)`} />
              <CardBody className="space-y-2">
                {refundRows.map((refund) => (
                  <div key={refund.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 text-[12.5px] last:border-0 last:pb-0">
                    <span className="tabular">{formatMoney(refund.amountMinor, refund.currency)}</span>
                    <span className="text-muted">{refund.reason ?? "No reason given"}</span>
                    <StatusBadge status={refund.status} />
                    <span className="text-[11px] text-muted">{formatDateTime(refund.createdAt)}</span>
                  </div>
                ))}
              </CardBody>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          {payment.failureMessage ? (
            <Card>
              <CardHeader title="Failure information" />
              <CardBody>
                <p className="text-[12.5px] text-[var(--danger)]">{payment.failureMessage}</p>
                <p className="mt-1 text-[11px] text-muted">Code: {payment.failureCode ?? "unknown"}</p>
              </CardBody>
            </Card>
          ) : null}

          {hasPermission(ctx.role, "payment:refund") && refundableMinor > 0 ? (
            <Card>
              <CardHeader title="Issue a refund" description="Only the verified amount can be refunded." />
              <CardBody>
                <RefundForm paymentId={payment.id} refundableMinor={refundableMinor} currency={payment.currency} />
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Verification" description="Why this record can be trusted" />
            <CardBody className="space-y-2 text-[12px] text-muted">
              <p className="flex gap-2">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                Status is set only from the provider&apos;s authoritative verification response, never from a browser
                redirect.
              </p>
              <p className="flex gap-2">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                Amount and currency returned by the provider must match this record exactly.
              </p>
              <p className="flex gap-2">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                Duplicate provider events are ignored using the provider event identifier.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Actions" />
            <CardBody className="flex flex-wrap gap-2">
              <CopyButton value={payment.internalReference} label="Copy reference" />
              <CopyButton value={payment.providerReference ?? ""} label="Copy provider ref" />
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
