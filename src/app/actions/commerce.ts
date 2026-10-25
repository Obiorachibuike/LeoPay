"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createProduct, updateProduct, upsertStorefront, cancelOrder, createStoreOrder } from "@/services/storefront";
import { requirePermission } from "@/lib/auth/context";
import { fieldErrorsApp, toErrorResponse, type ActionResult } from "@/lib/actions";
import { productSchema, storefrontSchema, storeCheckoutSchema } from "@/lib/validation";
import { saveUploadedImage } from "@/services/uploads";

/**
 * An inline file upload wins over the "image URL" text field: if a merchant
 * attaches a photo we store it ourselves and ignore any pasted URL.
 */
async function resolveProductImage(organizationId: string, formData: FormData): Promise<string | null> {
  const file = formData.get("imageFile");
  if (file instanceof File && file.size > 0) {
    const stored = await saveUploadedImage({ organizationId, kind: "product", file });
    return stored.url;
  }
  const url = formData.get("imageUrl");
  return typeof url === "string" && url.trim() ? url.trim() : null;
}

export async function saveStorefrontAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await requirePermission("product:write");
    const parsed = storefrontSchema.safeParse({
      name: formData.get("name"),
      slug: String(formData.get("slug") ?? "").toLowerCase(),
      description: formData.get("description") || undefined,
      currency: formData.get("currency") || "NGN",
      status: formData.get("status") || "draft",
    });
    if (!parsed.success) {
      return { ok: false, message: "Check the highlighted fields.", errors: fieldErrorsApp(parsed.error) };
    }
    await upsertStorefront({
      organizationId: ctx.organization.id,
      actor: { id: ctx.user.id, email: ctx.user.email },
      data: parsed.data,
    });
    revalidatePath("/dashboard/storefront");
    return { ok: true, message: "Storefront saved." };
  } catch (error) {
    const response = toErrorResponse(error);
    return { ok: false, message: response.message, errors: response.details };
  }
}

export async function createProductAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await requirePermission("product:write");
    const trackInventory = formData.get("trackInventory") === "on";
    const imageUrl = await resolveProductImage(ctx.organization.id, formData);
    const parsed = productSchema.safeParse({
      name: formData.get("name"),
      description: formData.get("description") || undefined,
      priceMinor: Math.round(Number(formData.get("price") ?? 0) * 100),
      currency: formData.get("currency") || "NGN",
      sku: formData.get("sku") || undefined,
      trackInventory,
      inventoryQuantity: trackInventory ? Number(formData.get("inventoryQuantity") ?? 0) : 0,
      status: formData.get("status") || "draft",
      imageUrl,
    });
    if (!parsed.success) {
      return { ok: false, message: "Check the highlighted fields.", errors: fieldErrorsApp(parsed.error) };
    }
    await createProduct({
      organizationId: ctx.organization.id,
      actor: { id: ctx.user.id, email: ctx.user.email },
      data: parsed.data,
    });
    revalidatePath("/dashboard/products");
    return { ok: true, message: "Product created." };
  } catch (error) {
    const response = toErrorResponse(error);
    return { ok: false, message: response.message, errors: response.details };
  }
}

export async function updateProductAction(productId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await requirePermission("product:write");
    const trackInventory = formData.get("trackInventory") === "on";
    const imageUrl = await resolveProductImage(ctx.organization.id, formData);
    const parsed = productSchema.safeParse({
      name: formData.get("name"),
      description: formData.get("description") || undefined,
      priceMinor: Math.round(Number(formData.get("price") ?? 0) * 100),
      currency: formData.get("currency") || "NGN",
      sku: formData.get("sku") || undefined,
      trackInventory,
      inventoryQuantity: trackInventory ? Number(formData.get("inventoryQuantity") ?? 0) : 0,
      status: formData.get("status") || "draft",
      imageUrl,
    });
    if (!parsed.success) {
      return { ok: false, message: "Check the highlighted fields.", errors: fieldErrorsApp(parsed.error) };
    }
    await updateProduct({
      organizationId: ctx.organization.id,
      actor: { id: ctx.user.id, email: ctx.user.email },
      productId,
      data: parsed.data,
    });
    revalidatePath("/dashboard/products");
    return { ok: true, message: "Product updated." };
  } catch (error) {
    const response = toErrorResponse(error);
    return { ok: false, message: response.message, errors: response.details };
  }
}

export async function cancelOrderAction(orderId: string): Promise<ActionResult> {
  try {
    const ctx = await requirePermission("order:write");
    await cancelOrder({ organizationId: ctx.organization.id, orderId, reason: "cancelled_by_merchant" });
    revalidatePath("/dashboard/orders");
    return { ok: true, message: "Order cancelled and stock released." };
  } catch (error) {
    return { ok: false, message: toErrorResponse(error).message };
  }
}

/* ---------------------------------------------------------- public store --- */

export type StoreCheckoutState = ActionResult & { redirectUrl?: string };

export async function publicStoreCheckoutAction(_prev: StoreCheckoutState, formData: FormData): Promise<StoreCheckoutState> {
  try {
    const storefrontSlug = String(formData.get("storefrontSlug") ?? "");
    let items: Array<{ productId: string; quantity: number }>;
    try {
      items = JSON.parse(String(formData.get("items") ?? "[]"));
    } catch {
      return { ok: false, message: "Your cart could not be read. Please add items again." };
    }

    const parsed = storeCheckoutSchema.safeParse({
      items,
      customerName: formData.get("customerName"),
      customerEmail: formData.get("customerEmail"),
      customerPhone: formData.get("customerPhone") || undefined,
      deliveryNote: formData.get("deliveryNote") || undefined,
    });
    if (!parsed.success) {
      return { ok: false, message: "Check your details.", errors: fieldErrorsApp(parsed.error) };
    }

    const result = await createStoreOrder({ storefrontSlug, data: parsed.data });
    return { ok: true, message: "Redirecting to checkout", redirectUrl: result.authorizationUrl };
  } catch (error) {
    const response = toErrorResponse(error);
    return { ok: false, message: response.message, errors: response.details };
  }
}

export async function openStorefrontAction() {
  const ctx = await requirePermission("product:write");
  const { getStorefront } = await import("@/services/storefront");
  const storefront = await getStorefront(ctx.organization.id);
  if (storefront?.status === "published") redirect(`/store/${storefront.slug}`);
  redirect("/dashboard/storefront");
}
