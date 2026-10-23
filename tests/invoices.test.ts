import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { invoices } from "@/lib/db/schema";
import { ensureSchema, resetDb } from "./helpers/db";
import { makeOrganization, makeUser } from "./helpers/factories";
import { computeInvoiceTotals, createInvoice, getInvoiceWithItems, startInvoiceCheckout, updateInvoiceStatus } from "@/services/invoices";
import { createPaymentLink, setPaymentLinkStatus, startLinkCheckout } from "@/services/payment-links";
import { verifyAndSettlePayment } from "@/services/payments";
import { setMockCheckoutOutcome } from "@/lib/providers/mock";

beforeEach(async () => {
  await resetDb();
  await ensureSchema();
});

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    customerName: "Lagos Property Group",
    customerEmail: "accounts@example.test",
    currency: "NGN" as const,
    items: [
      { description: "Design", quantity: 2, unitAmountMinor: 100_000 },
      { description: "Site visit", quantity: 1, unitAmountMinor: 50_000 },
    ],
    discountMinor: 25_000,
    taxRateBps: 750,
    issueDate: new Date().toISOString().slice(0, 10),
    status: "issued" as const,
    ...overrides,
  };
}

describe("invoice totals", () => {
  it("computes totals from integer minor units with tax applied after discount", () => {
    const totals = computeInvoiceTotals({
      items: [
        { quantity: 2, unitAmountMinor: 100_000 },
        { quantity: 1, unitAmountMinor: 50_000 },
      ],
      discountMinor: 25_000,
      taxRateBps: 750,
    });
    expect(totals.subtotalMinor).toBe(250_000);
    expect(totals.taxMinor).toBe(Math.round((250_000 - 25_000) * 0.075));
    expect(totals.totalMinor).toBe(250_000 - 25_000 + totals.taxMinor);
    expect(Number.isInteger(totals.totalMinor)).toBe(true);
  });

  it("rejects a discount larger than the subtotal", () => {
    expect(() =>
      computeInvoiceTotals({
        items: [{ quantity: 1, unitAmountMinor: 1000 }],
        discountMinor: 5000,
        taxRateBps: 0,
      }),
    ).toThrow();
  });
});

describe("invoice lifecycle", () => {
  it("issues sequential numbers per organization and recomputes totals server-side", async () => {
    const user = await makeUser({ verified: true });
    const org = await makeOrganization(user);
    const actor = { id: user.id, email: user.email };

    const first = await createInvoice({ organizationId: org.id, actorId: actor.id, actorEmail: actor.email, data: baseInput() });
    const second = await createInvoice({ organizationId: org.id, actorId: actor.id, actorEmail: actor.email, data: baseInput() });

    expect(first.invoiceNumber).toMatch(/^INV-\d{4}-\d{4}$/);
    expect(first.invoiceNumber).not.toBe(second.invoiceNumber);
    const expected = computeInvoiceTotals({
      items: baseInput().items.map(({ quantity, unitAmountMinor }) => ({ quantity, unitAmountMinor })),
      discountMinor: 25_000,
      taxRateBps: 750,
    });
    expect(first.totalMinor).toBe(expected.totalMinor);

    const rows = await db.select().from(invoices);
    expect(rows.length).toBe(2);
  });

  it("does not mark a draft invoice paid and keeps it unpayable", async () => {
    const user = await makeUser({ verified: true });
    const org = await makeOrganization(user);
    const actor = { id: user.id, email: user.email };
    const draft = await createInvoice({
      organizationId: org.id,
      actorId: actor.id,
      actorEmail: actor.email,
      data: baseInput({ status: "draft" }),
    });

    await expect(startInvoiceCheckout(draft.publicReference, "accounts@example.test")).rejects.toMatchObject({
      code: "CONFLICT",
    });

    const detail = await getInvoiceWithItems(org.id, draft.id);
    expect(detail?.invoice.status).toBe("draft");
    expect(detail?.invoice.amountPaidMinor).toBe(0);
  });

  it("marks a verified invoice payment as paid exactly once", async () => {
    const user = await makeUser({ verified: true });
    const org = await makeOrganization(user);
    const actor = { id: user.id, email: user.email };
    const invoice = await createInvoice({ organizationId: org.id, actorId: actor.id, actorEmail: actor.email, data: baseInput() });

    const checkout = await startInvoiceCheckout(invoice.publicReference, "accounts@example.test");
    await setMockCheckoutOutcome(checkout.payment.internalReference, "succeeded");
    const first = await verifyAndSettlePayment(checkout.payment.internalReference);
    const second = await verifyAndSettlePayment(checkout.payment.internalReference);

    expect(first.settled).toBe(true);
    expect(second.reason).toBe("already_settled");

    const detail = await getInvoiceWithItems(org.id, invoice.id);
    expect(detail?.invoice.status).toBe("paid");
    expect(detail?.invoice.amountPaidMinor).toBe(invoice.totalMinor);
  });

  it("cannot cancel a paid invoice", async () => {
    const user = await makeUser({ verified: true });
    const org = await makeOrganization(user);
    const actor = { id: user.id, email: user.email };
    const invoice = await createInvoice({ organizationId: org.id, actorId: actor.id, actorEmail: actor.email, data: baseInput() });
    const checkout = await startInvoiceCheckout(invoice.publicReference, "accounts@example.test");
    await setMockCheckoutOutcome(checkout.payment.internalReference, "succeeded");
    await verifyAndSettlePayment(checkout.payment.internalReference);

    await expect(updateInvoiceStatus(org.id, invoice.id, "cancelled", actor)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects a payment link that is disabled", async () => {
    const user = await makeUser({ verified: true });
    const org = await makeOrganization(user);
    const actor = { id: user.id, email: user.email };
    const link = await createPaymentLink({
      organizationId: org.id,
      actorId: user.id,
      actorEmail: user.email,
      data: {
        title: "Closed link",
        allowVariableAmount: false,
        amountMinor: 1000,
        currency: "NGN",
        successUrl: null,
        cancelUrl: null,
        expiresAt: null,
        collectCustomerPhone: false,
      },
    });

    await setPaymentLinkStatus({ organizationId: org.id, linkId: link.id, status: "disabled", actor });

    await expect(
      startLinkCheckout({ reference: link.publicReference, amountMinor: null, customerEmail: "x@example.test" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await expect(
      startLinkCheckout({ reference: "pl_does_not_exist", amountMinor: null, customerEmail: "x@example.test" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
