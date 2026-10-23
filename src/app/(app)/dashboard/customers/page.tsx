import { desc, eq, sql } from "drizzle-orm";
import { Users } from "lucide-react";
import { db } from "@/lib/db/client";
import { customers, payments } from "@/lib/db/schema";
import { requirePermission } from "@/lib/auth/context";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/feedback";

export default async function CustomersPage() {
  const ctx = await requirePermission("customer:read");
  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      email: customers.email,
      phone: customers.phone,
      createdAt: customers.createdAt,
      collected: sql<number>`coalesce((select sum(${payments.amountMinor}) from ${payments} where ${payments.customerId} = ${customers.id} and ${payments.status} = 'succeeded'), 0)::bigint`,
      currency: sql<string | null>`(select ${payments.currency} from ${payments} where ${payments.customerId} = ${customers.id} limit 1)`,
    })
    .from(customers)
    .where(eq(customers.organizationId, ctx.organization.id))
    .orderBy(desc(customers.createdAt))
    .limit(200);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Customers"
        description="Customer records are created when someone pays or is invoiced. They are scoped to your organization only."
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title="No customers yet"
            description="Customers are added automatically when you create an invoice or a customer completes a checkout."
          />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Phone</Th>
                <Th>Added</Th>
                <Th align="right">Collected</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Tr key={row.id}>
                  <Td className="font-medium">{row.name}</Td>
                  <Td className="text-muted">{row.email ?? "—"}</Td>
                  <Td className="text-muted">{row.phone ?? "—"}</Td>
                  <Td className="whitespace-nowrap text-muted">{formatDate(row.createdAt)}</Td>
                  <Td align="right">{row.currency ? formatMoney(Number(row.collected), row.currency) : "—"}</Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
