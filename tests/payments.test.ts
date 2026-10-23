import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  invoices,
  journalPostings,
  payments,
  paymentLinks,
  webhookDeliveries,
  webhookEndpoints,
  webhookEvents,
} from "@/lib/db/schema";
import { ensureSchema, resetDb } from "./helpers/db";
import { makeOrganization, makeUser } from "./helpers/factories";
import { createPaymentLink, startLinkCheckout } from "@/services/payment-links";
import { processProviderWebhook, verifyAndSettlePayment } from "@/services/payments";
import { setMockCheckoutOutcome } from "@/lib/providers/mock";
import { getBalances, verifyLedgerIntegrity } from "@/lib/ledger";
import { createInvoice, startInvoiceCheckout } from "@/services/invoices";
import { canonicalMerchantSignature } from "./helpers/signature";

beforeEach(async () => {
  await resetDb();
  await ensureSchema();
});

async function setupLink(amountMinor = 250000) {
  const user = await makeUser({ verified: true });
  const org = await makeOrganization(user);
  const link = await createPaymentLink({
    organizationId: org.id,
    actorId: user.id,
    actorEmail: user.email,
    data: {
      title: "Design retainer",
      description: "Monthly design retainer",
      allowVariableAmount: false,
      amountMinor,
      currency: "NGN",
      successUrl: null,
      cancelUrl: null,
      expiresAt: null,
      collectCustomerPhone: false,
    },
  });
  return { user, org, link };
}

describe("payment link checkout", () => {
  it("creates a pending payment and only settles after provider verification", async () => {
    const { org, link } = await setupLink(250000);

    const checkout = await startLinkCheckout({
      reference: link.publicReference,
      amountMinor: null,
      customerEmail: "ada@example.test",
      customerName: "Ada Obi",
    });

    expect(checkout.authorizationUrl).toContain("/checkout/test/");

    const [pending] = await db
      .select()
      .from(payments)
      .where(eq(payments.organizationId, org.id))
      .limit(1);
    expect(pending!.status).toBe("pending");
    expect(pending!.amountMinor).toBe(250000);

    // Before the provider confirms, verification must not settle the payment.
    const before = await verifyAndSettlePayment(pending!.internalReference);
    expect(before.settled).toBe(false);
    expect(before.payment.status).toBe("pending");

    await setMockCheckoutOutcome(pending!.internalReference, "succeeded");

    const settled = await verifyAndSettlePayment(pending!.internalReference);
    expect(settled.settled).toBe(true);
    expect(settled.payment.status).toBe("succeeded");
    expect(settled.payment.paidAt).toBeTruthy();
    expect(settled.payment.netMinor).toBe(250000);

    const integrity = await verifyLedgerIntegrity(org.id);
    expect(integrity.balanced).toBe(true);
    expect(integrity.entries).toBe(1);

    const balances = await getBalances(org.id, "NGN");
    expect(balances.find((b) => b.code === "4000")?.balanceMinor).toBe(250000);
    expect(balances.find((b) => b.code === "1000")?.balanceMinor).toBe(250000);

    // A second verification must be a no-op (idempotency).
    const again = await verifyAndSettlePayment(pending!.internalReference);
    expect(again.settled).toBe(true);
    const entries = await db.select().from(journalPostings);
    expect(entries.length).toBe(2); // gross debit/credit only, fee is zero
  });

  it("enforces variable amount bounds on the server", async () => {
    const user = await makeUser();
    const org = await makeOrganization(user);
    const link = await createPaymentLink({
      organizationId: org.id,
      actorId: user.id,
      actorEmail: user.email,
      data: {
        title: "Variable donation",
        allowVariableAmount: true,
        minAmountMinor: 10000,
        maxAmountMinor: 100000,
        currency: "NGN",
        successUrl: null,
        cancelUrl: null,
        expiresAt: null,
        collectCustomerPhone: false,
      },
    });

    await expect(
      startLinkCheckout({
        reference: link.publicReference,
        amountMinor: 500,
        customerEmail: "a@example.test",
      }),
    ).rejects.toThrow(/between/i);

    await expect(
      startLinkCheckout({
        reference: link.publicReference,
        amountMinor: 50000,
        customerEmail: "a@example.test",
      }),
    ).resolves.toBeTruthy();
  });

  it("rejects disabled and expired links", async () => {
    const { org, link } = await setupLink();
    await db.update(paymentLinks).set({ status: "disabled" }).where(eq(paymentLinks.id, link.id));
    await expect(
      startLinkCheckout({ reference: link.publicReference, amountMinor: null, customerEmail: "a@example.test" }),
    ).rejects.toThrow(/no longer accepting/i);

    await db
      .update(paymentLinks)
      .set({ status: "active", expiresAt: new Date(Date.now() - 1000) })
      .where(eq(paymentLinks.id, link.id));
    await expect(
      startLinkCheckout({ reference: link.publicReference, amountMinor: null, customerEmail: "a@example.test" }),
    ).rejects.toThrow(/expired/i);
    expect(org.id).toBeTruthy();
  });

  it("does not settle when the provider reports a different amount", async () => {
    const { org, link } = await setupLink(100000);
    const checkout = await startLinkCheckout({
      reference: link.publicReference,
      amountMinor: null,
      customerEmail: "ada@example.test",
    });

    // Simulate a provider that confirms a lower amount than requested.
    await db
      .update(payments)
      .set({ amountMinor: 50000 })
      .where(eq(payments.id, checkout.payment.id));
    await setMockCheckoutOutcome(checkout.payment.internalReference, "succeeded");

    const result = await verifyAndSettlePayment(checkout.payment.internalReference);
    expect(result.settled).toBe(false);
    expect(result.payment.status).toBe("failed");
    expect((await getBalances(org.id, "NGN")).length).toBe(0);

    const { reconciliationExceptions } = await import("@/lib/db/schema");
    const exceptions = await db.select().from(reconciliationExceptions).where(eq(reconciliationExceptions.organizationId, org.id));
    expect(exceptions.some((e) => e.type === "amount_mismatch")).toBe(true);
  });
});

describe("provider webhooks", () => {
  it("ignores duplicate events and settles only once", async () => {
    const { org, link } = await setupLink(50000);
    const checkout = await startLinkCheckout({
      reference: link.publicReference,
      amountMinor: null,
      customerEmail: "ada@example.test",
    });
    await setMockCheckoutOutcome(checkout.payment.internalReference, "succeeded");

    const first = await processProviderWebhook({
      provider: "mock",
      eventId: "evt_1",
      eventType: "charge.success",
      payload: { event: "charge.success", data: { reference: checkout.payment.internalReference } },
    });
    expect(first.processed).toBe(true);

    const second = await processProviderWebhook({
      provider: "mock",
      eventId: "evt_1",
      eventType: "charge.success",
      payload: { event: "charge.success", data: { reference: checkout.payment.internalReference } },
    });
    expect(second.duplicate).toBe(true);

    const [payment] = await db.select().from(payments).where(eq(payments.id, checkout.payment.id));
    expect(payment!.status).toBe("succeeded");

    const integrity = await verifyLedgerIntegrity(org.id);
    expect(integrity.entries).toBe(1);

    const events = await db.select().from(webhookEvents).where(eq(webhookEvents.provider, "mock"));
    expect(events.length).toBe(1);
  });
});

describe("invoice payment", () => {
  it("marks an invoice paid only through a verified payment", async () => {
    const user = await makeUser({ verified: true });
    const org = await makeOrganization(user);

    const invoice = await createInvoice({
      organizationId: org.id,
      actorId: user.id,
      actorEmail: user.email,
      data: {
        customerName: "Chidi Ltd",
        customerEmail: "billing@chidi.test",
        currency: "NGN",
        items: [
          { description: "Consulting", quantity: 2, unitAmountMinor: 100000 },
          { description: "Hosting", quantity: 1, unitAmountMinor: 50000 },
        ],
        discountMinor: 10000,
        taxRateBps: 750,
        issueDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        notes: "Thank you",
        status: "issued",
      },
    });

    expect(invoice.subtotalMinor).toBe(250000);
    expect(invoice.taxMinor).toBe(18000); // 7.5% of 240000
    expect(invoice.totalMinor).toBe(258000);
    expect(invoice.status).toBe("issued");

    const checkout = await startInvoiceCheckout(invoice.publicReference);
    expect(checkout.payment.amountMinor).toBe(258000);

    const [stillIssued] = await db.select().from(invoices).where(eq(invoices.id, invoice.id));
    expect(stillIssued!.status).toBe("issued");

    await setMockCheckoutOutcome(checkout.payment.internalReference, "succeeded");
    await verifyAndSettlePayment(checkout.payment.internalReference);

    const [paid] = await db.select().from(invoices).where(eq(invoices.id, invoice.id));
    expect(paid!.status).toBe("paid");
    expect(paid!.amountPaidMinor).toBe(258000);

    // A paid invoice cannot be paid again.
    await expect(startInvoiceCheckout(invoice.publicReference)).rejects.toThrow(/already been paid/i);
  });
});

describe("merchant webhook outbox", () => {
  it("creates durable deliveries for subscribed endpoints", async () => {
    const { org, link } = await setupLink(30000);
    await db.insert(webhookEndpoints).values({
      organizationId: org.id,
      url: "https://example.test/webhook",
      secret: "whsec_test",
      eventTypes: ["payment.succeeded"],
    });

    const checkout = await startLinkCheckout({
      reference: link.publicReference,
      amountMinor: null,
      customerEmail: "ada@example.test",
    });
    await setMockCheckoutOutcome(checkout.payment.internalReference, "succeeded");
    await verifyAndSettlePayment(checkout.payment.internalReference);

    const deliveries = await db
      .select()
      .from(webhookDeliveries)
      .where(and(eq(webhookDeliveries.organizationId, org.id), eq(webhookDeliveries.eventType, "payment.succeeded")));
    expect(deliveries.length).toBe(1);
    expect(deliveries[0]!.status).toBe("pending");

    const body = JSON.stringify(deliveries[0]!.payload);
    expect(canonicalMerchantSignature("whsec_test", body)).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
  });
});
