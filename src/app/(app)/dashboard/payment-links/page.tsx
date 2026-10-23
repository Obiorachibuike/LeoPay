import Link from "next/link";
import { Link2, Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth/context";
import { listPaymentLinks } from "@/services/payment-links";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";

export default async function PaymentLinksPage() {
  const ctx = await requirePermission("payment:read");
  const { rows } = await listPaymentLinks(ctx.organization.id, { page: 1, pageSize: 100 });
  const canWrite = ctx.permissions.includes("payment:write");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Payment links"
        description="Hosted checkout pages you can share anywhere. Amounts are validated on the server."
        actions={canWrite ? <ButtonLink href="/dashboard/payment-links/new" size="sm"><Plus className="h-3.5 w-3.5" /> New link</ButtonLink> : null}
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={<Link2 className="h-5 w-5" />}
            title="No payment links yet"
            description="Create a link with a fixed or customer-chosen amount, then share it. You can disable or expire it at any time."
            action={canWrite ? <ButtonLink href="/dashboard/payment-links/new">Create your first link</ButtonLink> : undefined}
          />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Title</Th>
                <Th>Amount</Th>
                <Th>Status</Th>
                <Th align="right">Collected</Th>
                <Th>Created</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ link, collectedMinor, successCount }) => (
                <Tr key={link.id}>
                  <Td>
                    <Link href={`/dashboard/payment-links/${link.id}`} className="font-medium text-foreground hover:text-accent">
                      {link.title}
                    </Link>
                    <span className="block font-mono text-[10.5px] text-muted">{link.publicReference}</span>
                  </Td>
                  <Td>
                    {link.allowVariableAmount
                      ? `${formatMoney(link.minAmountMinor ?? 0, link.currency)} – ${formatMoney(link.maxAmountMinor ?? 0, link.currency)}`
                      : formatMoney(link.amountMinor ?? 0, link.currency)}
                  </Td>
                  <Td>
                    <StatusBadge status={link.expiresAt && link.expiresAt < new Date() ? "expired" : link.status} />
                  </Td>
                  <Td align="right">
                    {formatMoney(Number(collectedMinor), link.currency)}
                    <span className="block text-[10.5px] text-muted">{successCount} paid</span>
                  </Td>
                  <Td className="whitespace-nowrap text-muted">{formatDate(link.createdAt)}</Td>
                  <Td align="right">
                    <Link href={`/dashboard/payment-links/${link.id}`} className="text-[12px] font-medium text-accent hover:underline">
                      Manage
                    </Link>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
