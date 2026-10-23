import Link from "next/link";
import { Package, Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth/context";
import { listProducts, getStorefront } from "@/services/storefront";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { EmptyState, Alert } from "@/components/ui/feedback";
import { ButtonLink } from "@/components/ui/button";

export default async function ProductsPage() {
  const ctx = await requirePermission("product:read");
  const [items, storefront] = await Promise.all([listProducts(ctx.organization.id), getStorefront(ctx.organization.id)]);
  const canWrite = ctx.permissions.includes("product:write");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Products"
        description="Sell physical or digital products through your hosted storefront."
        actions={canWrite ? <ButtonLink href="/dashboard/storefront" size="sm"><Plus className="h-3.5 w-3.5" /> Add product</ButtonLink> : null}
      />
      {!storefront ? (
        <Alert tone="info" title="Create a storefront first">
          Products live inside a storefront.{" "}
          <Link href="/dashboard/storefront" className="font-medium underline">Set up your storefront</Link> to start adding
          products.
        </Alert>
      ) : null}
      <Card>
        {items.length === 0 ? (
          <EmptyState
            icon={<Package className="h-5 w-5" />}
            title="No products yet"
            description="Add a product with a price, optional inventory tracking and an image URL. Active products appear in your published storefront."
            action={canWrite ? <ButtonLink href="/dashboard/storefront">Go to storefront</ButtonLink> : undefined}
          />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th>Status</Th>
                <Th>SKU</Th>
                <Th>Inventory</Th>
                <Th align="right">Price</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((product) => (
                <Tr key={product.id}>
                  <Td>
                    <span className="font-medium">{product.name}</span>
                    <span className="block font-mono text-[10.5px] text-muted">/{product.slug}</span>
                  </Td>
                  <Td><StatusBadge status={product.status} /></Td>
                  <Td className="font-mono text-[11.5px] text-muted">{product.sku ?? "—"}</Td>
                  <Td>
                    {product.trackInventory ? (
                      <Badge tone={product.inventoryQuantity > 0 ? "neutral" : "danger"}>{product.inventoryQuantity} in stock</Badge>
                    ) : (
                      <span className="text-[12px] text-muted">Not tracked</span>
                    )}
                  </Td>
                  <Td align="right">{formatMoney(product.priceMinor, product.currency)}</Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
