import { eq } from "drizzle-orm";
import { Wallet } from "lucide-react";
import { db } from "@/lib/db/client";
import { beneficiaries } from "@/lib/db/schema";
import { requirePermission } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/rbac";
import { computePayoutCapacity, listPayouts } from "@/services/payouts";
import { getBalances } from "@/lib/ledger";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState, Alert } from "@/components/ui/feedback";
import { ButtonLink } from "@/components/ui/button";
import { PayoutRequestForm } from "@/components/dashboard/payout-forms";
import { ActionButton } from "@/components/ui/action-button";
import { decidePayoutAction } from "@/app/actions/payouts";
import { providerStatus } from "@/lib/providers";

export default async function PayoutsPage() {
  const ctx = await requirePermission("payout:read");
  const currency = ctx.organization.defaultCurrency;
  const canRequest = hasPermission(ctx.role, "payout:request");
  const canApprove = hasPermission(ctx.role, "payout:approve");
  const provider = providerStatus().find((p) => p.active);

  const [capacity, rows, beneficiaryRows, balances] = await Promise.all([
    computePayoutCapacity(ctx.organization.id, currency),
    listPayouts(ctx.organization.id, { page: 1, pageSize: 50 }),
    db
      .select()
      .from(beneficiaries)
      .where(eq(beneficiaries.organizationId, ctx.organization.id)),
    getBalances(ctx.organization.id, currency),
  ]);

  const pendingApprovals = rows.filter((row) => row.payout.status === "pending_approval");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Payouts"
        description="Controlled payouts with verification, approval thresholds and separation of duties."
        actions={<ButtonLink href="/dashboard/beneficiaries" size="sm" variant="secondary">Manage beneficiaries</ButtonLink>}
      />

      {!provider?.configured ? (
        <Alert tone="warning" title="Payouts unavailable">
          No payment provider is configured with payout capability. Beneficiary verification and transfers are disabled
          until a provider is configured — LeoPay will not simulate a transfer.
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardBody>
          <p className="text-[12px] text-muted">Available (ledger estimate)</p>
          <p className="mt-1 text-[20px] font-semibold tabular">{formatMoney(capacity.availableMinor, currency)}</p>
          <p className="mt-1 text-[10.5px] leading-relaxed text-muted">Settled collections minus refunds and payouts. Not a provider-confirmed balance.</p>
        </CardBody></Card>
        <Card><CardBody>
          <p className="text-[12px] text-muted">Reserved for in-flight payouts</p>
          <p className="mt-1 text-[20px] font-semibold tabular">{formatMoney(capacity.pendingPayoutsMinor, currency)}</p>
        </CardBody></Card>
        <Card><CardBody>
          <p className="text-[12px] text-muted">Approval threshold</p>
          <p className="mt-1 text-[20px] font-semibold tabular">{formatMoney(ctx.organization.payoutApprovalThresholdMinor, currency)}</p>
          <p className="mt-1 text-[10.5px] text-muted">24h limit {formatMoney(ctx.organization.payoutDailyLimitMinor, currency)}</p>
        </CardBody></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Payout history" description={`${rows.length} record(s)`} />
          {rows.length === 0 ? (
            <CardBody>
              <EmptyState icon={<Wallet className="h-5 w-5" />} title="No payouts yet" description="Payouts appear here once requested. Every payout is recorded with its provider reference and approval history." />
            </CardBody>
          ) : (
            <TableWrap>
              <thead>
                <tr><Th>Reference</Th><Th>Beneficiary</Th><Th>Status</Th><Th>Requested</Th><Th align="right">Amount</Th></tr>
              </thead>
              <tbody>
                {rows.map(({ payout, beneficiaryName }) => (
                  <Tr key={payout.id}>
                    <Td className="font-mono text-[11.5px]">{payout.internalReference}</Td>
                    <Td>{beneficiaryName}</Td>
                    <Td><StatusBadge status={payout.status} /></Td>
                    <Td className="whitespace-nowrap text-muted">{formatDateTime(payout.createdAt)}</Td>
                    <Td align="right">{formatMoney(payout.amountMinor, payout.currency)}</Td>
                  </Tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>

        <div className="space-y-4">
          {canApprove && pendingApprovals.length > 0 ? (
            <Card>
              <CardHeader title="Awaiting approval" description="You cannot approve a payout you requested." />
              <CardBody className="space-y-3">
                {pendingApprovals.map(({ payout, beneficiaryName }) => (
                  <div key={payout.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[13px] font-medium">{formatMoney(payout.amountMinor, payout.currency)}</p>
                        <p className="text-[11.5px] text-muted">to {beneficiaryName} · requested {formatDateTime(payout.createdAt)}</p>
                      </div>
                      <StatusBadge status={payout.status} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <ActionButton action={decidePayoutAction.bind(null, payout.id, "approve")} variant="primary" size="sm" confirm="Approve this payout and send it to the provider?">
                        Approve & send
                      </ActionButton>
                      <ActionButton action={decidePayoutAction.bind(null, payout.id, "reject")} variant="danger" size="sm" confirm="Reject this payout?">
                        Reject
                      </ActionButton>
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Request a payout" description="Payouts move money — verify the beneficiary first." />
            <CardBody>
              {canRequest ? (
                <PayoutRequestForm
                  beneficiaries={beneficiaryRows.map((b) => ({
                    id: b.id,
                    name: b.name,
                    accountName: b.accountName,
                    last4: b.accountNumberLast4,
                    bankName: b.bankName,
                  }))}
                  availableMinor={capacity.availableMinor}
                  currency={currency}
                  approvalThresholdMinor={ctx.organization.payoutApprovalThresholdMinor}
                  canRequest={provider?.configured ?? false}
                />
              ) : (
                <p className="text-[12.5px] text-muted">Your role can view payouts but not request them.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Ledger clearing" />
            <CardBody className="space-y-2 text-[12.5px]">
              {balances.filter((b) => b.code === "1000" || b.code === "3100").map((b) => (
                <div key={b.code} className="flex justify-between">
                  <span className="text-muted">{b.name}</span>
                  <span className="tabular font-medium">{formatMoney(b.balanceMinor, currency)}</span>
                </div>
              ))}
              <p className="border-t border-border pt-2 text-[11px] leading-relaxed text-muted">
                Provider settlement timing, reserves and provider fees can mean the provider balance differs from this
                ledger figure. Reconciliation exceptions are surfaced in Transactions.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
