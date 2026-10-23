"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { webhookEndpoints } from "@/lib/db/schema";
import { generateToken } from "@/lib/crypto";
import { apiKeySchema, webhookEndpointSchema } from "@/lib/validation";
import { createApiKey, revokeApiKey } from "@/services/api-keys";
import { requirePermission } from "@/lib/auth/context";
import { validateWebhookUrlString } from "@/lib/ssrf";
import { redeliverWebhook } from "@/services/jobs";
import { audit } from "@/lib/audit";
import { fieldErrorsApp, toErrorResponse, type ActionResult } from "@/lib/actions";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";

export type ApiKeyResult = ActionResult & { secret?: string };

export async function createApiKeyAction(_prev: ApiKeyResult, formData: FormData): Promise<ApiKeyResult> {
  try {
    const ctx = await requirePermission("developer:manage");
    if (!ctx.user.emailVerifiedAt) {
      throw new AppError("FORBIDDEN", "Verify your email address before creating API keys");
    }
    const scopes = formData.getAll("scopes").map(String);
    const parsed = apiKeySchema.safeParse({
      name: formData.get("name"),
      environment: formData.get("environment") || "test",
      scopes,
    });
    if (!parsed.success) {
      return { ok: false, message: "Check the key details.", errors: fieldErrorsApp(parsed.error) };
    }
    const result = await createApiKey({
      organizationId: ctx.organization.id,
      actor: { id: ctx.user.id, email: ctx.user.email },
      name: parsed.data.name,
      environment: parsed.data.environment,
      scopes: parsed.data.scopes,
    });
    revalidatePath("/dashboard/developers");
    return { ok: true, message: "API key created. Copy it now — it will not be shown again.", secret: result.key };
  } catch (error) {
    const response = toErrorResponse(error);
    return { ok: false, message: response.message, errors: response.details };
  }
}

export async function revokeApiKeyAction(keyId: string): Promise<ActionResult> {
  try {
    const ctx = await requirePermission("developer:manage");
    await revokeApiKey({ organizationId: ctx.organization.id, keyId, actor: { id: ctx.user.id, email: ctx.user.email } });
    revalidatePath("/dashboard/developers");
    return { ok: true, message: "API key revoked." };
  } catch (error) {
    return { ok: false, message: toErrorResponse(error).message };
  }
}

export type WebhookResult = ActionResult & { secret?: string };

export async function createWebhookAction(_prev: WebhookResult, formData: FormData): Promise<WebhookResult> {
  try {
    const ctx = await requirePermission("developer:manage");
    const eventTypes = formData.getAll("eventTypes").map(String);
    const parsed = webhookEndpointSchema.safeParse({
      url: formData.get("url"),
      description: formData.get("description") || undefined,
      eventTypes,
    });
    if (!parsed.success) {
      return { ok: false, message: "Check the endpoint details.", errors: fieldErrorsApp(parsed.error) };
    }

    const safety = validateWebhookUrlString(parsed.data.url);
    if (!safety.safe) throw new AppError("VALIDATION_ERROR", safety.reason ?? "Unsafe webhook URL");

    const secret = `whsec_${generateToken(24)}`;
    const [endpoint] = await db
      .insert(webhookEndpoints)
      .values({
        organizationId: ctx.organization.id,
        url: parsed.data.url,
        description: parsed.data.description ?? null,
        secret,
        eventTypes: parsed.data.eventTypes,
        createdBy: ctx.user.id,
      })
      .returning();

    await audit({
      action: "webhook_endpoint.created",
      organizationId: ctx.organization.id,
      actorId: ctx.user.id,
      actorEmail: ctx.user.email,
      targetType: "webhook_endpoint",
      targetId: endpoint!.id,
      metadata: { url: parsed.data.url, eventTypes: parsed.data.eventTypes },
    });

    revalidatePath("/dashboard/developers");
    return { ok: true, message: "Webhook endpoint added.", secret };
  } catch (error) {
    const response = toErrorResponse(error);
    return { ok: false, message: response.message, errors: response.details };
  }
}

export async function deleteWebhookAction(endpointId: string): Promise<ActionResult> {
  try {
    const ctx = await requirePermission("developer:manage");
    await db
      .delete(webhookEndpoints)
      .where(and(eq(webhookEndpoints.id, endpointId), eq(webhookEndpoints.organizationId, ctx.organization.id)));
    await audit({
      action: "webhook_endpoint.deleted",
      organizationId: ctx.organization.id,
      actorId: ctx.user.id,
      actorEmail: ctx.user.email,
      targetType: "webhook_endpoint",
      targetId: endpointId,
    });
    revalidatePath("/dashboard/developers");
    return { ok: true, message: "Webhook endpoint removed." };
  } catch (error) {
    return { ok: false, message: toErrorResponse(error).message };
  }
}

export async function redeliverWebhookAction(deliveryId: string): Promise<ActionResult> {
  try {
    const ctx = await requirePermission("developer:manage");
    await redeliverWebhook(deliveryId, ctx.organization.id);
    if (env.enableInlineJobs) {
      const { runJobTick } = await import("@/services/jobs");
      await runJobTick().catch(() => undefined);
    }
    revalidatePath("/dashboard/developers");
    return { ok: true, message: "Delivery queued for retry." };
  } catch (error) {
    return { ok: false, message: toErrorResponse(error).message };
  }
}
