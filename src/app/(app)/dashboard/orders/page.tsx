import { ShoppingBag } from "lucide-react";
import { requirePermission } from "@/lib/auth/context";
import { getOrderWithItems, listOrders } from "@/services/storefront";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { ActionButton } from "@/components/ui/action-button";
import { cancelOrderAction } from "@/app/actions/commerce";
import { DialogTrigger } from "@/components/ui/dialog";

export default async function OrdersPage() {
  const ctx = await requirePermission("order:read");
  const { rows } = await listOrders(ctx.organization.id, { page: 1, pageSize: 100 });
  const canWrite = ctx.permissions.includes("order:write");

  const details = await Promise.all(rows.slice(0, 30).map((order) => getOrderWithItems(ctx.organization.id, order.id)));

  return (
    <div className="space-y-5">
      <PageHeader title="Orders" description="Storefront orders. Paid orders have a verified payment attached." />
      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={<ShoppingBag className="h-5 w-5" />}
            title="No orders yet"
            description="When a customer checks out from your published storefront, the order appears here."
          />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Customer</Th>
                <Th>Status</Th>
                <Th>Items</Th>
                <Th>Created</Th>
                <Th align="right">Total</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {details.map((detail) =>
                detail ? (
                  <Tr key={detail.order.id}>
                    <Td className="font-mono text-[11.5px]">{detail.order.publicReference}</Td>
                    <Td>
                      <span className="block">{detail.order.customerName}</span>
                      <span className="block text-[10.5px] text-muted">{detail.order.customerEmail}</span>
                    </Td>
                    <Td><StatusBadge status={detail.order.status} /></Td>
                    <Td className="text-muted">{detail.items.reduce((sum, item) => sum + item.quantity, 0)}</Td>
                    <Td className="whitespace-nowrap text-muted">{formatDateTime(detail.order.createdAt)}</Td>
                    <Td align="right">{formatMoney(detail.order.totalMinor, detail.order.currency)}</Td>
                    <Td align="right">
                      <div className="flex items-center justify-end gap-2">
                        <DialogTrigger label="Details" className="text-[12px] font-medium text-accent hover:underline" title={`Order ${detail.order.publicReference}`} wide>
                          <div className="space-y-3 text-[13px]">
                            <div className="grid grid-cols-2 gap-2">
                              <p><span className="text-muted">Customer:</span> {detail.order.customerName}</p>
                              <p><span className="text-muted">Email:</span> {detail.order.customerEmail}</p>
                              <p><span className="text-muted">Status:</span> {detail.order.status}</p>
                              <p><span className="text-muted">Total:</span> {formatMoney(detail.order.totalMinor, detail.order.currency)}</p>
                            </div>
                            <ul className="divide-y divide-border rounded-lg border border-border">
                              {detail.items.map((item) => (
                                <li key={item.id} className="flex justify-between px-3 py-2 text-[12.5px]">
                                  <span>{item.nameSnapshot} × {item.quantity}</span>
                                  <span className="tabular">{formatMoney(item.amountMinor, detail.order.currency)}</span>
                                </li>
                              ))}
                            </ul>
                            {detail.order.deliveryNote ? (
                              <p className="text-[12px] text-muted">Delivery note: {detail.order.deliveryNote}</p>
                            ) : null}
                          </div>
                        </DialogTrigger>
                        {canWrite && detail.order.status === "pending_payment" ? (
                          <ActionButton
                            action={cancelOrderAction.bind(null, detail.order.id)}
                            variant="ghost"
                            confirm="Cancel this order and release reserved stock?"
                          >
                            Cancel
                          </ActionButton>
                        ) : null}
                      </div>
                    </Td>
                  </Tr>
                ) : null,
              )}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
