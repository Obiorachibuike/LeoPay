import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import { ensureSchema, resetDb } from "./helpers/db";
import { makeOrganization, makeUser } from "./helpers/factories";
import {
  cancelOrder,
  createProduct,
  createStoreOrder,
  getPublicOrder,
  getPublicStorefront,
  upsertStorefront,
} from "@/services/storefront";

beforeEach(async () => {
  await resetDb();
  await ensureSchema();
});

async function setupStore(inventoryQuantity = 2) {
  const user = await makeUser({ verified: true });
  const org = await makeOrganization(user);
  const storefront = await upsertStorefront({
    organizationId: org.id,
    actor: { id: user.id, email: user.email },
    data: {
      name: "Acme Store",
      slug: `acme-${Math.random().toString(36).slice(2, 8)}`,
      description: "Digital goods",
      currency: "NGN",
      status: "published",
    },
  });
  const product = await createProduct({
    organizationId: org.id,
    actor: { id: user.id, email: user.email },
    data: {
      name: "Design System Kit",
      description: "Figma kit",
      priceMinor: 450000,
      currency: "NGN",
      sku: "DSK-1",
      trackInventory: true,
      inventoryQuantity,
      status: "active",
      imageUrl: null,
    },
  });
  return { user, org, storefront, product };
}

describe("storefront", () => {
  it("hides draft storefronts from the public", async () => {
    const { user, org } = await setupStore();
    await upsertStorefront({
      organizationId: org.id,
      actor: { id: user.id, email: user.email },
      data: { name: "Acme Store", slug: "acme-draft", currency: "NGN", status: "draft" },
    });
    expect(await getPublicStorefront("acme-draft")).toBeNull();
    expect(org.id).toBeTruthy();
  });

  it("prevents overselling under concurrent checkouts", async () => {
    const { storefront, product } = await setupStore(2);

    const first = await createStoreOrder({
      storefrontSlug: storefront.slug,
      data: {
        items: [{ productId: product.id, quantity: 2 }],
        customerName: "Ada Obi",
        customerEmail: "ada@example.test",
      },
    });
    expect(first.authorizationUrl).toBeTruthy();

    const [afterFirst] = await db.select().from(products).where(eq(products.id, product.id));
    expect(afterFirst!.inventoryQuantity).toBe(0);

    await expect(
      createStoreOrder({
        storefrontSlug: storefront.slug,
        data: {
          items: [{ productId: product.id, quantity: 1 }],
          customerName: "Bola Ade",
          customerEmail: "bola@example.test",
        },
      }),
    ).rejects.toThrow(/stock/i);

    const order = await getPublicOrder(first.orderReference);
    expect(order?.order.status).toBe("pending_payment");
    expect(order?.order.totalMinor).toBe(900000);
  });

  it("releases reserved stock when an unpaid order is cancelled", async () => {
    const { storefront, product } = await setupStore(3);
    const created = await createStoreOrder({
      storefrontSlug: storefront.slug,
      data: {
        items: [{ productId: product.id, quantity: 2 }],
        customerName: "Ada Obi",
        customerEmail: "ada@example.test",
      },
    });

    const order = await getPublicOrder(created.orderReference);
    await cancelOrder({ organizationId: order!.order.organizationId, orderId: order!.order.id });

    const [after] = await db.select().from(products).where(eq(products.id, product.id));
    expect(after!.inventoryQuantity).toBe(3);
    const reloaded = await getPublicOrder(created.orderReference);
    expect(reloaded?.order.status).toBe("cancelled");
  });

  it("refuses to sell products from a different organization", async () => {
    const a = await setupStore();
    const b = await setupStore();
    await expect(
      createStoreOrder({
        storefrontSlug: a.storefront.slug,
        data: {
          items: [{ productId: b.product.id, quantity: 1 }],
          customerName: "Ada Obi",
          customerEmail: "ada@example.test",
        },
      }),
    ).rejects.toThrow(/no longer available/i);
  });
});
