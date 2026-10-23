import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { invoices, payments, products, refunds } from "@/lib/db/schema";
import { ensureSchema, resetDb } from "./helpers/db";
import { makeOrganization, makeUser } from "./helpers/factories";
import { createInvoice, getInvoiceWithItems } from "@/services/invoices";
import { createPaymentLink, startLinkCheckout } from "@/services/payment-links";
import { verifyAndSettlePayment, refundPayment } from "@/services/payments";
import { setMockCheckoutOutcome } from "@/lib/providers/mock";
import { createProduct, getOrderWithItems, listOrders, upsertStorefront } from "@/services/storefront";
import { listPaymentLinks, listPaymentLinks as listLinks } from "@/services/payment-links";

beforeEach(async () => {
  await resetDb();
  await ensureSchema();
});

async function twoOrganizations() {
  const ownerA = await makeUser({ verified: true });
  const orgA = await makeOrganization(ownerA, "Alpha Studio");
  const ownerB = await makeUser({ verified: true });
  const orgB = await makeOrganization(ownerB, "Beta Studio");
  return { ownerA, orgA, ownerB, orgB };
}

describe("organization isolation", () => {
  it("never returns another organization's invoice or items", async () => {
    const { ownerA, orgA, orgB } = await twoOrganizations();
    const invoice = await createInvoice({
      organizationId: orgA.id,
      actorId: ownerA.id,
      actorEmail: ownerA.email,
      data: {
        customerName: "Customer A",
        currency: "NGN",
        items: [{ description: "Work", quantity: 1, unitAmountMinor: 100000 }],
        discountMinor: 0,
        taxRateBps: 0,
        issueDate: new Date().toISOString().slice(0, 10),
        status: "issued",
      },
    });

    expect(await getInvoiceWithItems(orgA.id, invoice.id)).not.toBeNull();
    expect(await getInvoiceWithItems(orgB.id, invoice.id)).toBeNull();
  });

  it("scopes payment links and orders to their organization", async () => {
    const { ownerA, orgA, orgB } = await twoOrganizations();
    const link = await createPaymentLink({
      organizationId: orgA.id,
      actorId: ownerA.id,
      actorEmail: ownerA.email,
      data: {
        title: "Only for A",
        allowVariableAmount: false,
        amountMinor: 250000,
        currency: "NGN",
        successUrl: null,
        cancelUrl: null,
        expiresAt: null,
        collectCustomerPhone: false,
      },
    });

    expect((await listPaymentLinks(orgA.id, { page: 1, pageSize: 10 })).total).toBe(1);
    expect((await listLinks(orgB.id, { page: 1, pageSize: 10 })).total).toBe(0);
    expect(await listOrders(orgB.id, { page: 1, pageSize: 10 })).toMatchObject({ total: 0 });

    const storefront = await upsertStorefront({
      organizationId: orgA.id,
      actor: { id: ownerA.id, email: ownerA.email },
      data: { name: "Alpha", slug: `alpha-${Math.random().toString(36).slice(2, 8)}`, currency: "NGN", status: "published" },
    });
    const product = await createProduct({
      organizationId: orgA.id,
      actor: { id: ownerA.id, email: ownerA.email },
      data: {
        name: "Item",
        priceMinor: 5000,
        currency: "NGN",
        trackInventory: false,
        inventoryQuantity: 0,
        status: "active",
        imageUrl: null,
      },
    });
    expect(storefront.id).toBeTruthy();
    expect((await db.select().from(products).where(eq(products.id, product.id))).length).toBe(1);
    expect(await getOrderWithItems(orgB.id, "00000000-0000-4000-8000-000000000000")).toBeNull();
    void link;
  });

  it("refuses to refund a payment that belongs to another organization", async () => {
    const { ownerA, orgA, ownerB, orgB } = await twoOrganizations();
    const link = await createPaymentLink({
      organizationId: orgA.id,
      actorId: ownerA.id,
      actorEmail: ownerA.email,
      data: {
        title: "Alpha payment",
        allowVariableAmount: false,
        amountMinor: 150000,
        currency: "NGN",
        successUrl: null,
        cancelUrl: null,
        expiresAt: null,
        collectCustomerPhone: false,
      },
    });
    const checkout = await startLinkCheckout({
      reference: link.publicReference,
      amountMinor: null,
      customerEmail: "payer@example.test",
    });
    await setMockCheckoutOutcome(checkout.payment.internalReference, "succeeded");
    await verifyAndSettlePayment(checkout.payment.internalReference);

    await expect(
      refundPayment({
        organizationId: orgB.id,
        paymentId: checkout.payment.id,
        amountMinor: 1000,
        reason: "Not ours",
        actorId: ownerB.id,
        actorEmail: ownerB.email,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect((await db.select().from(refunds).where(eq(refunds.organizationId, orgB.id))).length).toBe(0);
    const [row] = await db.select().from(payments).where(eq(payments.id, checkout.payment.id));
    expect(row?.status).toBe("succeeded");
    expect((await db.select().from(invoices)).length).toBe(0);
  });
});
