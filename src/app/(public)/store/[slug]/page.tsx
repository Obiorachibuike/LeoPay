import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Store } from "lucide-react";
import { getPublicStorefront } from "@/services/storefront";
import { StoreCart } from "@/components/checkout/store-cart";
import { Card, CardBody } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPublicStorefront(slug);
  if (!data) return { title: "Store not found" };
  return { title: data.storefront.name, description: data.storefront.description ?? undefined };
}

export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getPublicStorefront(slug);
  if (!data) notFound();
  const { storefront, products, organizationName } = data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="inline-flex items-center gap-1.5 text-[11.5px] uppercase tracking-[0.1em] text-muted">
            <Store className="h-3.5 w-3.5" /> {organizationName}
          </p>
          <h1 className="mt-1 text-[24px] font-semibold">{storefront.name}</h1>
          {storefront.description ? <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted">{storefront.description}</p> : null}
        </div>
        <Link href="/" className="text-[11.5px] text-muted hover:text-foreground">Powered by LeoPay</Link>
      </div>

      {products.length === 0 ? (
        <Card>
          <CardBody className="py-10 text-center text-[13px] text-muted">
            This storefront has no products available right now. Check back soon.
          </CardBody>
        </Card>
      ) : (
        <StoreCart
          slug={storefront.slug}
          currency={storefront.currency}
          products={products.map((product) => ({
            id: product.id,
            name: product.name,
            description: product.description,
            priceMinor: product.priceMinor,
            currency: product.currency,
            trackInventory: product.trackInventory,
            inventoryQuantity: product.inventoryQuantity,
            imageUrl: product.imageUrl,
          }))}
        />
      )}
    </div>
  );
}
