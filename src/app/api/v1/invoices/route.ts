import { withApi, jsonResponse, parsePagination, readJson, apiError } from "@/lib/api";
import { serializeInvoice } from "@/lib/api-serialize";
import { listInvoices, createInvoice } from "@/services/invoices";
import { invoiceSchema } from "@/lib/validation";
import { fieldErrorsApp } from "@/lib/actions";
import { sendInvoiceEmail } from "@/services/invoices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withApi(request, "invoices:read", async (ctx, url) => {
    const { limit, page } = parsePagination(url);
    const status = url.searchParams.get("status") ?? undefined;
    const { rows, total } = await listInvoices(ctx.organizationId, { page, pageSize: limit, status });
    return jsonResponse({ data: rows.map(serializeInvoice), meta: { page, limit, total } });
  });
}

export async function POST(request: Request) {
  return withApi(request, "invoices:write", async (ctx) => {
    const body = await readJson(request);
    const customer = (body.customer ?? {}) as Record<string, unknown>;
    const itemsRaw = Array.isArray(body.items) ? body.items : [];
    const items = itemsRaw.map((item) => {
      const row = (item ?? {}) as Record<string, unknown>;
      return {
        description: typeof row.description === "string" ? row.description : "",
        quantity: Number(row.quantity ?? 1),
        unitAmountMinor: Number(row.unit_amount_minor ?? 0),
      };
    });
    const parsed = invoiceSchema.safeParse({
      customerName: typeof customer.name === "string" ? customer.name : body.customer_name,
      customerEmail: typeof customer.email === "string" ? customer.email : undefined,
      currency: body.currency ?? "NGN",
      items,
      discountMinor: Number(body.discount_minor ?? 0),
      taxRateBps: Number(body.tax_rate_bps ?? 0),
      issueDate: String(body.issue_date ?? new Date().toISOString().slice(0, 10)),
      dueDate: typeof body.due_date === "string" ? body.due_date : null,
      notes: body.notes ?? undefined,
      terms: body.terms ?? undefined,
      status: body.status === "issued" ? "issued" : "draft",
    });
    if (!parsed.success) {
      return apiError(422, "VALIDATION_ERROR", "Check the request body", fieldErrorsApp(parsed.error));
    }
    const invoice = await createInvoice({
      organizationId: ctx.organizationId,
      actorId: ctx.keyId,
      actorEmail: `api-key:${ctx.keyId}`,
      data: parsed.data,
    });
    if (body.send === true && invoice.customerEmail) {
      await sendInvoiceEmail({
        organizationId: ctx.organizationId,
        invoiceId: invoice.id,
        actor: { id: null, email: `api-key:${ctx.keyId}` },
      }).catch(() => undefined);
    }
    return jsonResponse({ data: serializeInvoice(invoice) }, 201);
  });
}
