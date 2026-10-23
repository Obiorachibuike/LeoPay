/**
 * Development seed.
 *
 * Creates a demo organization with realistic, self-consistent records using the
 * same services the application uses. Payments are simulated with the mock
 * provider and are always tagged provider="mock"; nothing here pretends to be
 * live money. Refuses to run in production unless ALLOW_SEED=true.
 */
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { orders, payments, organizations, users } from "@/lib/db/schema";
import { registerUser } from "@/services/auth";
import { createOrganization, completeOnboarding } from "@/services/organizations";
import { createPaymentLink } from "@/services/payment-links";
import { createInvoice, startInvoiceCheckout } from "@/services/invoices";
import { upsertStorefront, createProduct, createStoreOrder } from "@/services/storefront";
import { startLinkCheckout } from "@/services/payment-links";
import { verifyAndSettlePayment } from "@/services/payments";
import { setMockCheckoutOutcome } from "@/lib/providers/mock";
import { createBeneficiary, requestPayout } from "@/services/payouts";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

const DEMO_EMAIL = process.env.SEED_EMAIL ?? "demo@leopay.test";
// No password literal is committed: generate one per run and print it, or set
// SEED_PASSWORD explicitly for a reproducible demo environment.
const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? randomBytes(12).toString("base64url");

async function settleWithMock(reference: string) {
  await setMockCheckoutOutcome(reference, "succeeded");
  const outcome = await verifyAndSettlePayment(reference);
  return outcome.payment;
}

async function main() {
  if (env.isProduction && process.env.ALLOW_SEED !== "true") {
    console.error("Refusing to seed a production database. Set ALLOW_SEED=true only for a demo environment.");
    process.exit(1);
  }
  if (env.paymentProvider !== "mock") {
    console.error("The seed script only runs with PAYMENT_PROVIDER=mock.");
    process.exit(1);
  }

  await runMigrations(db);

  const [existing] = await db.select().from(users).where(eq(users.email, DEMO_EMAIL)).limit(1);
  if (existing) {
    console.log(`Seed skipped: ${DEMO_EMAIL} already exists.`);
    console.log("Sign in with the existing demo credentials, or remove the demo user to reseed.");
    process.exit(0);
  }

  const { user } = await registerUser({ name: "Ada Nwosu", email: DEMO_EMAIL, password: DEMO_PASSWORD });
  await db
    .update(users)
    .set({ emailVerifiedAt: new Date(), platformRole: "admin" })
    .where(eq(users.id, user.id));

  const organization = await createOrganization({
    userId: user.id,
    userEmail: user.email,
    userName: user.name,
    data: {
      name: "Aurora Interiors",
      businessEmail: "hello@aurora-interiors.test",
      businessPhone: "+2348012345678",
      countryCode: "NG",
      defaultCurrency: "NGN",
      businessType: "limited_company",
      website: null,
    },
  });
  await db
    .update(organizations)
    .set({
      verificationStatus: "verified",
      payoutApprovalThresholdMinor: 50_000_00,
      payoutDailyLimitMinor: 500_000_00,
      countryCode: "NG",
    })
    .where(eq(organizations.id, organization.id));
  await completeOnboarding(organization.id, { id: user.id, email: user.email });

  const actor = { id: user.id, email: user.email };
  const linkApi = { organizationId: organization.id, actorId: user.id, actorEmail: user.email };

  const depositLink = await createPaymentLink({
    ...linkApi,
    data: {
      title: "Design deposit",
      description: "Reserve your project slot with a 40% deposit.",
      allowVariableAmount: false,
      amountMinor: 185_000_00,
      currency: "NGN",
      collectCustomerPhone: true,
      minAmountMinor: undefined,
      maxAmountMinor: undefined,
      successUrl: null,
      cancelUrl: null,
      expiresAt: null,
    },
  });
  const consultLink = await createPaymentLink({
    ...linkApi,
    data: {
      title: "Virtual consultation",
      description: "30-minute session with a senior designer.",
      allowVariableAmount: false,
      amountMinor: 35_000_00,
      currency: "NGN",
      collectCustomerPhone: false,
      minAmountMinor: undefined,
      maxAmountMinor: undefined,
      successUrl: null,
      cancelUrl: null,
      expiresAt: null,
    },
  });
  const depositFlexible = await createPaymentLink({
    ...linkApi,
    data: {
      title: "Flexible payment",
      description: "Let the customer choose an amount within an agreed range.",
      allowVariableAmount: true,
      amountMinor: undefined,
      minAmountMinor: 5_000_00,
      maxAmountMinor: 1_000_000_00,
      currency: "NGN",
      collectCustomerPhone: false,
      successUrl: null,
      cancelUrl: null,
      expiresAt: null,
    },
  });

  // Two settled link payments.
  for (const [reference, email, name] of [
    [depositLink.publicReference, "chioma@example.test", "Chioma Eze"],
    [consultLink.publicReference, "tunde@example.test", "Tunde Bakare"],
  ] as const) {
    const checkout = await startLinkCheckout({
      reference,
      amountMinor: null,
      customerEmail: email,
      customerName: name,
    });
    await settleWithMock(checkout.payment.internalReference);
  }

  // Invoice: one issued, one draft.
  const issued = await createInvoice({
    organizationId: organization.id,
    actorId: user.id,
    actorEmail: user.email,
    data: {
      customerName: "Lagos Property Group",
      customerEmail: "accounts@lagosproperty.test",
      currency: "NGN",
      items: [
        { description: "Interior design — 3-bedroom apartment", quantity: 1, unitAmountMinor: 850_000_00 },
        { description: "Site supervision", quantity: 4, unitAmountMinor: 60_000_00 },
      ],
      discountMinor: 20_000_00,
      taxRateBps: 750,
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10),
      notes: "Payment by transfer or card through the link in this invoice.",
      terms: "50% deposit on acceptance.",
      status: "issued",
    },
  });

  const draftInvoice = await createInvoice({
    organizationId: organization.id,
    actorId: user.id,
    actorEmail: user.email,
    data: {
      customerName: "Lekki Loft Studio",
      customerEmail: "sade@lekkiloft.test",
      currency: "NGN",
      items: [{ description: "Furniture sourcing retainer", quantity: 1, unitAmountMinor: 240_000_00 }],
      discountMinor: 0,
      taxRateBps: 750,
      issueDate: new Date().toISOString().slice(0, 10),
      status: "draft",
    },
  });

  const invoiceCheckout = await startInvoiceCheckout(issued.publicReference, "accounts@lagosproperty.test");
  await settleWithMock(invoiceCheckout.payment.internalReference);

  // Storefront + products + one paid order.
  await upsertStorefront({
    organizationId: organization.id,
    actor: actor,
    data: {
      name: "Aurora Home",
      slug: "aurora-home",
      description: "Considered furniture and objects for calm, modern homes.",
      currency: "NGN",
      status: "published",
    },
  });

  const chair = await createProduct({
    organizationId: organization.id,
    actor,
    data: {
      name: "Osogbo lounge chair",
      description: "Solid iroko frame with hand-woven cane.",
      priceMinor: 320_000_00,
      currency: "NGN",
      sku: "AUR-CHAIR-01",
      trackInventory: true,
      inventoryQuantity: 6,
      status: "active",
      imageUrl: null,
    },
  });
  await createProduct({
    organizationId: organization.id,
    actor,
    data: {
      name: "Clay table lamp",
      description: "Unglazed terracotta with a linen shade.",
      priceMinor: 78_000_00,
      currency: "NGN",
      sku: "AUR-LAMP-02",
      trackInventory: true,
      inventoryQuantity: 14,
      status: "active",
      imageUrl: null,
    },
  });
  await createProduct({
    organizationId: organization.id,
    actor,
    data: {
      name: "Lagoon jute runner",
      description: "Hand-knotted jute, 2m.",
      priceMinor: 96_000_00,
      currency: "NGN",
      sku: "AUR-RUG-03",
      trackInventory: false,
      inventoryQuantity: 0,
      status: "active",
      imageUrl: null,
    },
  });

  const order = await createStoreOrder({
    storefrontSlug: "aurora-home",
    data: {
      items: [{ productId: chair.id, quantity: 2 }],
      customerName: "Ifeoma Obi",
      customerEmail: "ifeoma@example.test",
      customerPhone: "+2348098765432",
      deliveryNote: "Deliver to Ikoyi, weekday mornings.",
    },
  });
  const [orderRow] = await db.select().from(orders).where(eq(orders.publicReference, order.orderReference)).limit(1);
  const [orderPayment] = orderRow
    ? await db.select().from(payments).where(eq(payments.orderId, orderRow.id)).limit(1)
    : [];
  if (orderPayment) await settleWithMock(orderPayment.internalReference);

  // Beneficiary + one payout held for approval (demonstrates separation of duties).
  const beneficiary = await createBeneficiary({
    organizationId: organization.id,
    actor,
    data: { name: "Aurora Studio Account", bankCode: "058", bankName: "Guaranty Trust Bank", accountNumber: "0123456789" },
  });
  await requestPayout({
    organizationId: organization.id,
    actor,
    beneficiaryId: beneficiary.id,
    amountMinor: 60_000_00,
    currency: "NGN",
    reason: "Studio rent",
    dailyLimitMinor: 500_000_00,
    approvalThresholdMinor: 50_000_00,
  });

  console.log("\nLeoPay demo data created.\n");
  console.log(`  Email:    ${DEMO_EMAIL}`);
  console.log(`  Password: ${DEMO_PASSWORD}`);
  console.log(`  Workspace: ${organization.name} (${organization.slug})`);
  console.log(`  Payment link: /pay/${depositLink.publicReference}`);
  console.log(`  Invoice:      /i/${issued.publicReference}`);
  console.log(`  Draft invoice: ${draftInvoice.invoiceNumber} (not payable until issued)`);
  console.log(`  Storefront:   /store/aurora-home`);
  console.log(`  Flexible link: /pay/${depositFlexible.publicReference}\n`);
  console.log("All payments above were simulated with the mock provider (test mode).");
  process.exit(0);
}

main().catch((error) => {
  logger.error("Seed failed", { error: (error as Error).message });
  console.error(error);
  process.exit(1);
});
