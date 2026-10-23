import Link from "next/link";
import { Inbox, Package, Store } from "lucide-react";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders, products } from "@/lib/db/schema";
import { requirePermission } from "@/lib/auth/context";
import { getStorefront } from "@/services/storefront";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { StorefrontForm, ProductForm } from "@/components/dashboard/commerce-forms";
import { CopyButton } from "@/components/ui/copy-button";
import { Alert } from "@/components/ui/feedback";
import { env } from "@/lib/env";
import { DialogTrigger } from "@/components/ui/dialog";
import { buttonClasses } from "@/components/ui/button";
import { slugify } from "@/lib/ids";

export default async function StorefrontPage() {
  const ctx = await requirePermission("product:write");
  const storefront = await getStorefront(ctx.organization.id);
  const [items, recentOrders] = await Promise.all([
    db.select().from(products).where(eq(products.organizationId, ctx.organization.id)).orderBy(desc(products.createdAt)),
    db
      .select()
      .from(orders)
      .where(and(eq(orders.organizationId, ctx.organization.id), eq(orders.status, "paid")))
      .orderBy(desc(orders.createdAt))
      .limit(5),
  ]);

  const publishedUrl = storefront ? `${env.appUrl}/store/${storefront.slug}` : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Storefront"
        description="A hosted storefront with real inventory controls. Orders are confirmed only after verified payment."
        actions={
          storefront?.status === "published" ? (
            <ButtonLink href={`/store/${storefront.slug}`} target="_blank" size="sm" variant="secondary">
              <Store className="h-3.5 w-3.5" /> View live storefront
            </ButtonLink>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader title={storefront ? "Storefront settings" : "Create your storefront"} description="Publish when you are ready for customers." />
          <CardBody>
            <StorefrontForm
              storefront={storefront}
              suggestedSlug={slugify(`${ctx.organization.slug}-store`, 32)}
            />
          </CardBody>
        </Card>

        <div className="space-y-4">
          {storefront ? (
            <Card>
              <CardHeader title="Public link" action={<Badge tone={storefront.status === "published" ? "success" : "neutral"}>{storefront.status}</Badge>} />
              <CardBody className="space-y-3">
                {publishedUrl ? (
                  <>
                    <p className="break-all rounded bg-surface-2 px-2 py-1.5 font-mono text-[11px]">{publishedUrl}</p>
                    <CopyButton value={publishedUrl} label="Copy storefront link" />
                  </>
                ) : null}
                {storefront.status !== "published" ? (
                  <Alert tone="warning">
                    Your storefront is not published. Customers will see “not available” until you publish it.
                  </Alert>
                ) : null}
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Products" action={<span className="text-[11px] text-muted">{items.length} total</span>} />
            <CardBody className="space-y-2">
              {items.slice(0, 5).map((product) => (
                <div key={product.id} className="flex items-center justify-between gap-2 text-[12.5px]">
                  <span className="min-w-0 truncate">{product.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="tabular text-muted">{formatMoney(product.priceMinor, product.currency)}</span>
                    <StatusBadge status={product.status} />
                  </span>
                </div>
              ))}
              {items.length === 0 ? <p className="text-[12.5px] text-muted">No products yet.</p> : null}
              <DialogTrigger
                label={<><Package className="h-3.5 w-3.5" /> Add product</>}
                className={buttonClasses("secondary", "sm", "mt-2")}
                title="Add a product"
                description="Active products appear in your published storefront."
                wide
              >
                <ProductForm />
              </DialogTrigger>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Recent paid orders" action={<Link href="/dashboard/orders" className="text-[11.5px] font-medium text-accent hover:underline">All orders</Link>} />
            <CardBody className="space-y-2">
              {recentOrders.length === 0 ? (
                <p className="flex items-center gap-2 text-[12.5px] text-muted">
                  <Inbox className="h-3.5 w-3.5" /> No paid orders yet.
                </p>
              ) : (
                recentOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="truncate">{order.customerName}</span>
                    <span className="flex items-center gap-2">
                      <span className="tabular">{formatMoney(order.totalMinor, order.currency)}</span>
                      <span className="text-muted">{formatDateTime(order.createdAt)}</span>
                    </span>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader title="All products" />
        {items.length === 0 ? (
          <CardBody>
            <p className="text-[13px] text-muted">Add your first product to start selling.</p>
          </CardBody>
        ) : (
          <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((product) => (
              <div key={product.id} className="rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[13px] font-medium">{product.name}</p>
                  <StatusBadge status={product.status} />
                </div>
                <p className="mt-1 text-[13px] tabular">{formatMoney(product.priceMinor, product.currency)}</p>
                {product.trackInventory ? (
                  <p className="text-[11px] text-muted">{product.inventoryQuantity} in stock</p>
                ) : null}
                <DialogTrigger
                  label="Edit"
                  className={buttonClasses("ghost", "sm", "mt-2 px-0 text-accent")}
                  title={`Edit ${product.name}`}
                  wide
                >
                  <ProductForm product={product} />
                </DialogTrigger>
              </div>
            ))}
          </CardBody>
        )}
      </Card>
    </div>
  );
}
