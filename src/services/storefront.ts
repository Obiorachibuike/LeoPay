import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { db, transaction } from "@/lib/db/client";
import {
  inventoryMovements,
  orderItems,
  orders,
  organizations,
  products,
  storefronts,
  type Product,
  type Storefront,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { publicReference, slugify } from "@/lib/ids";
import { formatMoney } from "@/lib/money";
import { startCheckout } from "@/services/payments";
import { enqueueMerchantEvent } from "@/services/jobs";
import { audit } from "@/lib/audit";
import type { z } from "zod";
import type { productSchema, storefrontSchema, storeCheckoutSchema } from "@/lib/validation";

export type ProductInput = z.infer<typeof productSchema>;
export type StorefrontInput = z.infer<typeof storefrontSchema>;
export type StoreCheckoutInput = z.infer<typeof storeCheckoutSchema>;

const RESERVED_SLUGS = new Set([
  "api",
  "admin",
  "app",
  "auth",
  "checkout",
  "dashboard",
  "docs",
  "help",
  "login",
  "pay",
  "pricing",
  "register",
  "settings",
  "store",
  "support",
]);

export async function upsertStorefront(input: {
  organizationId: string;
  actor: { id: string; email: string };
  data: StorefrontInput;
}): Promise<Storefront> {
  if (RESERVED_SLUGS.has(input.data.slug)) {
    throw new AppError("VALIDATION_ERROR", "That storefront URL is reserved. Choose another.");
  }

  const [conflict] = await db
    .select({ id: storefronts.id, organizationId: storefronts.organizationId })
    .from(storefronts)
    .where(eq(storefronts.slug, input.data.slug))
    .limit(1);
  if (conflict && conflict.organizationId !== input.organizationId) {
    throw new AppError("CONFLICT", "This storefront URL is already taken");
  }

  const [existing] = await db
    .select()
    .from(storefronts)
    .where(eq(storefronts.organizationId, input.organizationId))
    .limit(1);

  let storefront: Storefront;
  if (existing) {
    const [updated] = await db
      .update(storefronts)
      .set({
        name: input.data.name,
        slug: input.data.slug,
        description: input.data.description ?? null,
        currency: input.data.currency,
        status: input.data.status,
      })
      .where(eq(storefronts.id, existing.id))
      .returning();
    storefront = updated!;
  } else {
    const [created] = await db
      .insert(storefronts)
      .values({
        organizationId: input.organizationId,
        name: input.data.name,
        slug: input.data.slug,
        description: input.data.description ?? null,
        currency: input.data.currency,
        status: input.data.status,
      })
      .returning();
    storefront = created!;
  }

  await audit({
    action: "storefront.updated",
    organizationId: input.organizationId,
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    targetType: "storefront",
    targetId: storefront.id,
    metadata: { slug: storefront.slug, status: storefront.status },
  });

  return storefront;
}

export async function getStorefront(organizationId: string): Promise<Storefront | null> {
  const [row] = await db
    .select()
    .from(storefronts)
    .where(eq(storefronts.organizationId, organizationId))
    .limit(1);
  return row ?? null;
}

export async function createProduct(input: {
  organizationId: string;
  actor: { id: string; email: string };
  data: ProductInput;
}): Promise<Product> {
  const [storefront] = await db
    .select()
    .from(storefronts)
    .where(eq(storefronts.organizationId, input.organizationId))
    .limit(1);

  const baseSlug = slugify(input.data.name, 40);
  let slug = baseSlug;
  for (let attempt = 1; attempt < 20; attempt++) {
    const [conflict] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.organizationId, input.organizationId), eq(products.slug, slug)))
      .limit(1);
    if (!conflict) break;
    slug = `${baseSlug}-${attempt + 1}`;
  }

  const [product] = await db
    .insert(products)
    .values({
      organizationId: input.organizationId,
      storefrontId: storefront?.id ?? null,
      name: input.data.name,
      slug,
      description: input.data.description ?? null,
      priceMinor: input.data.priceMinor,
      currency: input.data.currency,
      sku: input.data.sku ?? null,
      trackInventory: input.data.trackInventory,
      inventoryQuantity: input.data.inventoryQuantity,
      status: input.data.status,
      imageUrl: input.data.imageUrl ?? null,
    })
    .returning();

  if (input.data.trackInventory && input.data.inventoryQuantity > 0) {
    await db.insert(inventoryMovements).values({
      organizationId: input.organizationId,
      productId: product!.id,
      delta: input.data.inventoryQuantity,
      reason: "manual_adjustment",
      actorId: input.actor.id,
    });
  }

  await audit({
    action: "product.created",
    organizationId: input.organizationId,
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    targetType: "product",
    targetId: product!.id,
    metadata: { name: product!.name, priceMinor: product!.priceMinor, currency: product!.currency },
  });

  return product!;
}

export async function updateProduct(input: {
  organizationId: string;
  actor: { id: string; email: string };
  productId: string;
  data: ProductInput;
}): Promise<void> {
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, input.productId), eq(products.organizationId, input.organizationId)))
    .limit(1);
  if (!product) throw new AppError("NOT_FOUND", "Product not found");

  await transaction(async (tx) => {
    await tx
      .update(products)
      .set({
        name: input.data.name,
        description: input.data.description ?? null,
        priceMinor: input.data.priceMinor,
        currency: input.data.currency,
        sku: input.data.sku ?? null,
        trackInventory: input.data.trackInventory,
        inventoryQuantity: input.data.inventoryQuantity,
        status: input.data.status,
        imageUrl: input.data.imageUrl ?? null,
      })
      .where(eq(products.id, input.productId));

    const delta = input.data.trackInventory ? input.data.inventoryQuantity - product.inventoryQuantity : 0;
    if (delta !== 0) {
      await tx.insert(inventoryMovements).values({
        organizationId: input.organizationId,
        productId: input.productId,
        delta,
        reason: "manual_adjustment",
        actorId: input.actor.id,
      });
    }
  });

  await audit({
    action: "product.updated",
    organizationId: input.organizationId,
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    targetType: "product",
    targetId: input.productId,
  });
}

/** Public storefront payload: published storefront and active products only. */
export async function getPublicStorefront(slug: string) {
  const [row] = await db
    .select({
      storefront: storefronts,
      organizationName: organizations.name,
      organizationStatus: organizations.status,
    })
    .from(storefronts)
    .innerJoin(organizations, eq(organizations.id, storefronts.organizationId))
    .where(eq(storefronts.slug, slug))
    .limit(1);

  if (!row || row.organizationStatus !== "active") return null;
  if (row.storefront.status !== "published") return null;

  const items = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.organizationId, row.storefront.organizationId),
        eq(products.status, "active"),
      ),
    )
    .orderBy(asc(products.name));

  return { storefront: row.storefront, organizationName: row.organizationName, products: items };
}

export async function getPublicProduct(slug: string, productSlug: string) {
  const data = await getPublicStorefront(slug);
  if (!data) return null;
  const product = data.products.find((p) => p.slug === productSlug);
  if (!product) return null;
  return { ...data, product };
}

/**
 * Creates an order and reserves inventory atomically to prevent overselling,
 * then initializes payment. If payment initialization fails the reservation is
 * released and the order cancelled.
 */
export async function createStoreOrder(input: {
  storefrontSlug: string;
  data: StoreCheckoutInput;
}): Promise<{ orderReference: string; authorizationUrl: string }> {
  const data = await getPublicStorefront(input.storefrontSlug);
  if (!data) throw new AppError("NOT_FOUND", "Storefront not found");
  const { storefront } = data;

  const prepared = await transaction(async (tx) => {
    const lineItems: Array<{ product: Product; quantity: number; amountMinor: number }> = [];

    for (const item of input.data.items) {
      const [product] = await tx
        .select()
        .from(products)
        .where(
          and(
            eq(products.id, item.productId),
            eq(products.organizationId, storefront.organizationId),
            eq(products.status, "active"),
          ),
        )
        .limit(1);
      if (!product) throw new AppError("NOT_FOUND", "One of the products is no longer available");
      if (product.currency !== storefront.currency) {
        throw new AppError("CONFLICT", "This product cannot be purchased in the storefront currency");
      }

      if (product.trackInventory) {
        const [reserved] = await tx
          .update(products)
          .set({ inventoryQuantity: sql`${products.inventoryQuantity} - ${item.quantity}` })
          .where(and(eq(products.id, product.id), sql`${products.inventoryQuantity} >= ${item.quantity}`))
          .returning({ id: products.id, inventoryQuantity: products.inventoryQuantity });
        if (!reserved) {
          throw new AppError("CONFLICT", `“${product.name}” does not have enough stock available`);
        }
        await tx.insert(inventoryMovements).values({
          organizationId: storefront.organizationId,
          productId: product.id,
          delta: -item.quantity,
          reason: "order_reserved",
        });
      }

      lineItems.push({ product, quantity: item.quantity, amountMinor: product.priceMinor * item.quantity });
    }

    const subtotalMinor = lineItems.reduce((sum, i) => sum + i.amountMinor, 0);
    const reference = publicReference.order();

    const [order] = await tx
      .insert(orders)
      .values({
        organizationId: storefront.organizationId,
        storefrontId: storefront.id,
        publicReference: reference,
        customerName: input.data.customerName,
        customerEmail: input.data.customerEmail,
        customerPhone: input.data.customerPhone ?? null,
        deliveryNote: input.data.deliveryNote ?? null,
        currency: storefront.currency,
        subtotalMinor,
        totalMinor: subtotalMinor,
        status: "pending_payment",
      })
      .returning();

    await tx.insert(orderItems).values(
      lineItems.map((line) => ({
        orderId: order!.id,
        productId: line.product.id,
        nameSnapshot: line.product.name,
        unitAmountMinor: line.product.priceMinor,
        quantity: line.quantity,
        amountMinor: line.amountMinor,
      })),
    );

    await enqueueMerchantEvent(tx, {
      organizationId: storefront.organizationId,
      type: "order.created",
      data: {
        id: order!.id,
        reference,
        total: subtotalMinor,
        currency: storefront.currency,
        customerEmail: input.data.customerEmail,
      },
    });

    return { order: order!, subtotalMinor };
  });

  try {
    const checkout = await startCheckout({
      organizationId: storefront.organizationId,
      amountMinor: prepared.subtotalMinor,
      currency: storefront.currency,
      customerEmail: input.data.customerEmail,
      customerName: input.data.customerName,
      channel: "storefront",
      orderId: prepared.order.id,
      metadata: { orderReference: prepared.order.publicReference },
    });
    return { orderReference: prepared.order.publicReference, authorizationUrl: checkout.authorizationUrl };
  } catch (error) {
    await cancelOrder({ organizationId: storefront.organizationId, orderId: prepared.order.id, reason: "checkout_failed" });
    throw error;
  }
}

/** Cancels an unpaid order and releases reserved stock. */
export async function cancelOrder(input: {
  organizationId: string;
  orderId: string;
  reason?: string;
}): Promise<void> {
  await transaction(async (tx) => {
    await tx.execute(sql`select id from orders where id = ${input.orderId} for update`);
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, input.orderId), eq(orders.organizationId, input.organizationId)))
      .limit(1);
    if (!order || order.status !== "pending_payment") return;

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    for (const item of items) {
      if (!item.productId) continue;
      await tx
        .update(products)
        .set({ inventoryQuantity: sql`${products.inventoryQuantity} + ${item.quantity}` })
        .where(and(eq(products.id, item.productId), eq(products.trackInventory, true)));
      await tx.insert(inventoryMovements).values({
        organizationId: input.organizationId,
        productId: item.productId,
        delta: item.quantity,
        reason: "order_released",
        orderId: order.id,
      });
    }

    await tx
      .update(orders)
      .set({ status: "cancelled" })
      .where(and(eq(orders.id, order.id), eq(orders.status, "pending_payment")));
  });
}

export async function getPublicOrder(reference: string) {
  const [order] = await db.select().from(orders).where(eq(orders.publicReference, reference)).limit(1);
  if (!order) return null;
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  return { order, items };
}

export async function listProducts(organizationId: string) {
  return db
    .select()
    .from(products)
    .where(eq(products.organizationId, organizationId))
    .orderBy(desc(products.createdAt));
}

export async function listOrders(organizationId: string, options: { page: number; pageSize: number }) {
  const where = eq(orders.organizationId, organizationId);
  const [rows, total] = await Promise.all([
    db
      .select()
      .from(orders)
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(options.pageSize)
      .offset((options.page - 1) * options.pageSize),
    db.select({ value: count() }).from(orders).where(where),
  ]);
  return { rows, total: Number(total[0]?.value ?? 0) };
}

export async function getOrderWithItems(organizationId: string, orderId: string) {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.organizationId, organizationId)))
    .limit(1);
  if (!order) return null;
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  return { order, items };
}

export function describeOrderTotal(minor: number, currency: string): string {
  return formatMoney(minor, currency);
}
