import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { customers } from "@/lib/db/schema";
import { withApi, jsonResponse, parsePagination, readJson, apiError } from "@/lib/api";
import { serializeCustomer } from "@/lib/api-serialize";
import { customerSchema } from "@/lib/validation";
import { fieldErrorsApp } from "@/lib/actions";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withApi(request, "customers:read", async (ctx, url) => {
    const { limit, page } = parsePagination(url);
    const where = eq(customers.organizationId, ctx.organizationId);
    const [rows, total] = await Promise.all([
      db.select().from(customers).where(where).orderBy(desc(customers.createdAt)).limit(limit).offset((page - 1) * limit),
      db.select({ value: count() }).from(customers).where(where),
    ]);
    return jsonResponse({ data: rows.map(serializeCustomer), meta: { page, limit, total: Number(total[0]?.value ?? 0) } });
  });
}

export async function POST(request: Request) {
  return withApi(request, "customers:write", async (ctx) => {
    const body = await readJson(request);
    const parsed = customerSchema.safeParse({
      name: body.name,
      email: body.email || undefined,
      phone: body.phone || undefined,
    });
    if (!parsed.success) {
      return apiError(422, "VALIDATION_ERROR", "Check the request body", fieldErrorsApp(parsed.error));
    }
    if (parsed.data.email) {
      const [existing] = await db
        .select()
        .from(customers)
        .where(and(eq(customers.organizationId, ctx.organizationId), eq(customers.email, parsed.data.email)))
        .limit(1);
      if (existing) {
        const [updated] = await db
          .update(customers)
          .set({ name: parsed.data.name, phone: parsed.data.phone ?? existing.phone })
          .where(eq(customers.id, existing.id))
          .returning();
        return jsonResponse({ data: serializeCustomer(updated!), meta: { existed: true } });
      }
    }
    const [created] = await db
      .insert(customers)
      .values({
        organizationId: ctx.organizationId,
        name: parsed.data.name,
        email: parsed.data.email ?? null,
        phone: parsed.data.phone ?? null,
      })
      .returning();
    await audit({
      action: "customer.created",
      organizationId: ctx.organizationId,
      actorEmail: `api-key:${ctx.keyId}`,
      targetType: "customer",
      targetId: created!.id,
    });
    return jsonResponse({ data: serializeCustomer(created!) }, 201);
  });
}
