import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { idempotencyKeys, payments } from "@/lib/db/schema";
import { ensureSchema, resetDb } from "./helpers/db";
import { makeOrganization, makeUser } from "./helpers/factories";
import { createApiKey } from "@/services/api-keys";
import { createPaymentLink } from "@/services/payment-links";
import { POST as createCheckoutSession } from "@/app/api/v1/checkout/sessions/route";
import { GET as listPayments } from "@/app/api/v1/payments/route";
import { GET as listLinks, POST as createLinkRoute } from "@/app/api/v1/payment-links/route";
import { POST as providerWebhook } from "@/app/api/webhooks/providers/[provider]/route";
import { GET as health } from "@/app/api/v1/health/route";

beforeEach(async () => {
  await resetDb();
  await ensureSchema();
});

async function setup(scopes: string[] = ["payments:read", "payments:write", "payment_links:read", "payment_links:write"]) {
  const user = await makeUser({ verified: true });
  const org = await makeOrganization(user);
  const key = await createApiKey({
    organizationId: org.id,
    actor: { id: user.id, email: user.email },
    name: "Integration key",
    environment: "test",
    scopes,
  });
  return { user, org, key: key.key };
}

function apiRequest(path: string, key: string, init: RequestInit = {}) {
  return new Request(`http://localhost:3000${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

describe("API v1", () => {
  it("requires a key and enforces scopes", async () => {
    const { key } = await setup(["payments:read"]);
    const unauthorized = await listPayments(new Request("http://localhost:3000/api/v1/payments"));
    expect(unauthorized.status).toBe(401);

    const forbidden = await createLinkRoute(
      apiRequest("/api/v1/payment-links", key, {
        method: "POST",
        body: JSON.stringify({ title: "Nope", amount_minor: 1000 }),
      }),
    );
    expect(forbidden.status).toBe(403);

    const allowed = await listPayments(apiRequest("/api/v1/payments", key));
    expect(allowed.status).toBe(200);
    const body = (await allowed.json()) as { data: unknown[]; meta: { total: number } };
    expect(body.data).toEqual([]);
    expect(body.meta.total).toBe(0);
  });

  it("creates a checkout session once per idempotency key", async () => {
    const { key, org } = await setup();
    const body = JSON.stringify({
      amount_minor: 125000,
      currency: "NGN",
      customer: { email: "buyer@example.test", name: "Buyer" },
      description: "Consultation",
    });

    const first = await createCheckoutSession(
      apiRequest("/api/v1/checkout/sessions", key, { method: "POST", body, headers: { "idempotency-key": "idem-key-12345" } }),
    );
    expect(first.status).toBe(201);
    const payload = (await first.json()) as { data: { reference: string; authorization_url: string; amount_minor: number } };
    expect(payload.data.amount_minor).toBe(125000);
    expect(payload.data.authorization_url).toContain("/checkout/test/");

    const replay = await createCheckoutSession(
      apiRequest("/api/v1/checkout/sessions", key, { method: "POST", body, headers: { "idempotency-key": "idem-key-12345" } }),
    );
    expect(replay.status).toBe(201);
    const replayPayload = (await replay.json()) as { data: { reference: string } };
    expect(replayPayload.data.reference).toBe(payload.data.reference);

    const [stored] = await db.select().from(idempotencyKeys).where(eq(idempotencyKeys.organizationId, org.id));
    expect(stored?.requestHash).toBeTruthy();

    const created = await db.select().from(payments).where(eq(payments.organizationId, org.id));
    expect(created.length).toBe(1);
  });

  it("rejects the same idempotency key with a different body", async () => {
    const { key } = await setup();
    const first = await createCheckoutSession(
      apiRequest("/api/v1/checkout/sessions", key, {
        method: "POST",
        body: JSON.stringify({ amount_minor: 1000, customer: { email: "a@example.test" } }),
        headers: { "idempotency-key": "idem-conflict-1" },
      }),
    );
    expect(first.status).toBe(201);

    const conflict = await createCheckoutSession(
      apiRequest("/api/v1/checkout/sessions", key, {
        method: "POST",
        body: JSON.stringify({ amount_minor: 2000, customer: { email: "a@example.test" } }),
        headers: { "idempotency-key": "idem-conflict-1" },
      }),
    );
    expect(conflict.status).toBe(409);
  });

  it("validates customer email and amount before creating anything", async () => {
    const { key, org } = await setup();
    const badEmail = await createCheckoutSession(
      apiRequest("/api/v1/checkout/sessions", key, {
        method: "POST",
        body: JSON.stringify({ amount_minor: 1000, customer: { email: "nope" } }),
      }),
    );
    expect(badEmail.status).toBe(422);

    const badAmount = await createCheckoutSession(
      apiRequest("/api/v1/checkout/sessions", key, {
        method: "POST",
        body: JSON.stringify({ amount_minor: -5, customer: { email: "ok@example.test" } }),
      }),
    );
    expect(badAmount.status).toBe(422);
    expect((await db.select().from(payments).where(eq(payments.organizationId, org.id))).length).toBe(0);
  });

  it("validates payment-link payloads and lists only this organization's links", async () => {
    const { key, user, org } = await setup();
    await createPaymentLink({
      organizationId: org.id,
      actorId: user.id,
      actorEmail: user.email,
      data: {
        title: "Existing link",
        allowVariableAmount: false,
        amountMinor: 5000,
        currency: "NGN",
        successUrl: null,
        cancelUrl: null,
        expiresAt: null,
        collectCustomerPhone: false,
      },
    });

    const list = await listLinks(apiRequest("/api/v1/payment-links", key));
    const listBody = (await list.json()) as { data: Array<{ title: string }>; meta: { total: number } };
    expect(listBody.meta.total).toBe(1);
    expect(listBody.data[0]?.title).toBe("Existing link");

    const invalid = await createLinkRoute(
      apiRequest("/api/v1/payment-links", key, {
        method: "POST",
        body: JSON.stringify({ title: "x" }),
      }),
    );
    expect(invalid.status).toBe(422);
  });

  it("reports health without leaking secrets", async () => {
    const { key } = await setup();
    const response = await health(apiRequest("/api/v1/health", key));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('"status"');
    expect(text).not.toContain("AUTH_SECRET=");
  });
});

describe("provider webhook route", () => {
  it("rejects unsigned provider callbacks", async () => {
    const response = await providerWebhook(
      new Request("http://localhost:3000/api/webhooks/providers/paystack", {
        method: "POST",
        body: JSON.stringify({ event: "charge.success", data: { reference: "x" } }),
      }),
      { params: Promise.resolve({ provider: "paystack" }) },
    );
    expect(response.status).toBe(401);
  });

  it("404s for unknown providers", async () => {
    const response = await providerWebhook(
      new Request("http://localhost:3000/api/webhooks/providers/stripe", { method: "POST", body: "{}" }),
      { params: Promise.resolve({ provider: "stripe" }) },
    );
    expect(response.status).toBe(404);
  });
});
