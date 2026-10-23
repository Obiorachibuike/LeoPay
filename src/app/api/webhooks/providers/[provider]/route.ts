import { providerForName } from "@/lib/providers";
import type { ProviderName } from "@/lib/providers";
import { processProviderWebhook } from "@/services/payments";
import { logger } from "@/lib/logger";
import { toErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Provider webhook endpoint.
 *
 * The signature is verified against the raw body before anything is parsed.
 * Settlement never trusts the payload's status: handlers re-fetch the
 * transaction from the provider. Duplicate deliveries are ignored by the
 * unique (provider, event_id) constraint.
 */
export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: providerName } = await params;

  let provider;
  try {
    provider = providerForName(providerName);
  } catch {
    return Response.json({ error: "Unknown provider" }, { status: 404 });
  }

  const rawBody = await request.text();
  const verification = provider.verifyWebhook(rawBody, request.headers);
  if (!verification.valid) {
    logger.warn("Rejected provider webhook", { provider: providerName, reason: verification.reason });
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object") throw new Error("bad shape");
    payload = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const eventType = String(payload.event ?? payload.type ?? "unknown");
  const data = (payload.data ?? {}) as Record<string, unknown>;
  const eventId = String(data.id ?? data.reference ?? payload.id ?? `${eventType}:${Date.now()}`);

  try {
    const result = await processProviderWebhook({
      provider: providerName as ProviderName,
      eventId,
      eventType,
      payload,
    });
    return Response.json({ received: true, ...result });
  } catch (error) {
    const normalized = toErrorResponse(error);
    logger.error("Provider webhook processing error", { provider: providerName, eventId, message: normalized.message });
    // Non-2xx makes the provider retry; processing is idempotent so that is safe.
    return Response.json({ error: normalized.message }, { status: 500 });
  }
}

export async function GET() {
  // Some providers probe endpoints; never reveal configuration details.
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
