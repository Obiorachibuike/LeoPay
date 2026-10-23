"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import { createProductAction, saveStorefrontAction, updateProductAction, publicStoreCheckoutAction, type StoreCheckoutState } from "@/app/actions/commerce";
import { Field, Input, Select, Textarea, Checkbox } from "@/components/ui/form";
import { Button, SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { formatMoney } from "@/lib/money";
import type { ActionResult } from "@/lib/actions";
import type { Product, Storefront } from "@/lib/db/schema";

const initial: ActionResult = { ok: false, message: "" };

export function StorefrontForm({ storefront, suggestedSlug }: { storefront: Storefront | null; suggestedSlug: string }) {
  const [state, action, pending] = useActionState(saveStorefrontAction, initial);
  return (
    <form action={action} className="space-y-4">
      {state.message ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Storefront name" htmlFor="sf-name" error={state.errors?.name}>
          <Input id="sf-name" name="name" defaultValue={storefront?.name ?? ""} required />
        </Field>
        <Field
          label="Storefront URL"
          htmlFor="sf-slug"
          error={state.errors?.slug}
          hint="Lowercase letters, numbers and hyphens. Used in /store/…"
        >
          <Input id="sf-slug" name="slug" defaultValue={storefront?.slug ?? suggestedSlug} required />
        </Field>
      </div>
      <Field label="Description" htmlFor="sf-desc" optional error={state.errors?.description}>
        <Textarea id="sf-desc" name="description" rows={3} defaultValue={storefront?.description ?? ""} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Store currency" htmlFor="sf-currency">
          <Select id="sf-currency" name="currency" defaultValue={storefront?.currency ?? "NGN"}>
            <option value="NGN">NGN — Nigerian Naira</option>
          </Select>
        </Field>
        <Field label="Status" htmlFor="sf-status">
          <Select id="sf-status" name="status" defaultValue={storefront?.status ?? "draft"}>
            <option value="draft">Draft (not public)</option>
            <option value="published">Published</option>
            <option value="unpublished">Unpublished</option>
          </Select>
        </Field>
      </div>
      <SubmitButton pending={pending}>Save storefront</SubmitButton>
    </form>
  );
}

export function ProductForm({ product }: { product?: Product }) {
  const action = product ? updateProductAction.bind(null, product.id) : createProductAction;
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="space-y-4">
      {state.message ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Product name" htmlFor={`p-name-${product?.id ?? "new"}`} error={state.errors?.name}>
          <Input id={`p-name-${product?.id ?? "new"}`} name="name" defaultValue={product?.name ?? ""} required />
        </Field>
        <Field label="SKU" htmlFor={`p-sku-${product?.id ?? "new"}`} optional error={state.errors?.sku}>
          <Input id={`p-sku-${product?.id ?? "new"}`} name="sku" defaultValue={product?.sku ?? ""} />
        </Field>
      </div>
      <Field label="Description" htmlFor={`p-desc-${product?.id ?? "new"}`} optional error={state.errors?.description}>
        <Textarea id={`p-desc-${product?.id ?? "new"}`} name="description" rows={3} defaultValue={product?.description ?? ""} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Price" htmlFor={`p-price-${product?.id ?? "new"}`} error={state.errors?.priceMinor}>
          <Input
            id={`p-price-${product?.id ?? "new"}`}
            name="price"
            type="number"
            step="0.01"
            min="0.01"
            defaultValue={product ? (product.priceMinor / 100).toFixed(2) : ""}
            required
          />
        </Field>
        <Field label="Currency" htmlFor={`p-currency-${product?.id ?? "new"}`}>
          <Select id={`p-currency-${product?.id ?? "new"}`} name="currency" defaultValue={product?.currency ?? "NGN"}>
            <option value="NGN">NGN</option>
          </Select>
        </Field>
        <Field label="Status" htmlFor={`p-status-${product?.id ?? "new"}`}>
          <Select id={`p-status-${product?.id ?? "new"}`} name="status" defaultValue={product?.status ?? "draft"}>
            <option value="draft">Draft</option>
            <option value="active">Active (visible in store)</option>
            <option value="archived">Archived</option>
          </Select>
        </Field>
      </div>
      <Field label="Image URL" htmlFor={`p-img-${product?.id ?? "new"}`} optional error={state.errors?.imageUrl} hint="Use a hosted image URL. Uploads require object storage configuration.">
        <Input id={`p-img-${product?.id ?? "new"}`} name="imageUrl" type="url" defaultValue={product?.imageUrl ?? ""} placeholder="https://…" />
      </Field>
      <div className="rounded-lg border border-border bg-surface-2/40 p-3">
        <label className="flex items-start gap-2.5 text-[13px]">
          <Checkbox name="trackInventory" defaultChecked={product?.trackInventory ?? false} />
          <span>
            <span className="font-medium text-foreground">Track inventory</span>
            <span className="block text-[12px] text-muted">Stock is reserved at checkout to prevent overselling.</span>
          </span>
        </label>
        <div className="mt-3 max-w-[200px]">
          <Field label="Quantity available" htmlFor={`p-qty-${product?.id ?? "new"}`} error={state.errors?.inventoryQuantity}>
            <Input
              id={`p-qty-${product?.id ?? "new"}`}
              name="inventoryQuantity"
              type="number"
              min="0"
              step="1"
              defaultValue={product?.inventoryQuantity ?? 0}
            />
          </Field>
        </div>
      </div>
      <SubmitButton pending={pending}>{product ? "Save product" : "Create product"}</SubmitButton>
    </form>
  );
}

type CartLine = { id: string; name: string; priceMinor: number; quantity: number; max?: number };

export function StoreCart({
  products,
  currency,
  storefrontSlug,
}: {
  products: Array<{ id: string; name: string; priceMinor: number; description: string | null; imageUrl: string | null; inventoryQuantity: number; trackInventory: boolean }>;
  currency: string;
  storefrontSlug: string;
}) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(publicStoreCheckoutAction, { ok: false, message: "" } as StoreCheckoutState);
  const router = useRouter();

  useEffect(() => {
    if (state.ok && state.redirectUrl) router.push(state.redirectUrl);
  }, [state, router]);

  const lines: CartLine[] = Object.entries(cart)
    .filter(([, qty]) => qty > 0)
    .map(([id, quantity]) => {
      const product = products.find((p) => p.id === id)!;
      return { id, name: product.name, priceMinor: product.priceMinor, quantity, max: product.inventoryQuantity };
    });

  const total = lines.reduce((sum, line) => sum + line.priceMinor * line.quantity, 0);

  function setQuantity(id: string, quantity: number, max?: number) {
    setCart((prev) => ({
      ...prev,
      [id]: Math.max(0, max !== undefined ? Math.min(quantity, max) : quantity),
    }));
  }

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => {
          const soldOut = product.trackInventory && product.inventoryQuantity <= 0;
          return (
            <article key={product.id} className="surface-card flex flex-col overflow-hidden">
              <div className="aspect-[4/3] w-full border-b border-border bg-surface-2">
                {product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted">
                    <ShoppingBag className="h-7 w-7" aria-hidden />
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col p-4">
                <h3 className="text-[14px] font-semibold">{product.name}</h3>
                {product.description ? <p className="mt-1 line-clamp-2 text-[12.5px] text-muted">{product.description}</p> : null}
                <p className="mt-2 text-[15px] font-semibold tabular">{formatMoney(product.priceMinor, currency)}</p>
                <div className="mt-3 flex items-center gap-2">
                  {soldOut ? (
                    <span className="text-[12px] font-medium text-[var(--danger)]">Out of stock</span>
                  ) : (
                    <>
                      <div className="flex items-center rounded-lg border border-border">
                        <button
                          type="button"
                          className="px-2 py-1.5 text-muted hover:text-foreground"
                          aria-label={`Decrease ${product.name} quantity`}
                          onClick={() => setQuantity(product.id, (cart[product.id] ?? 0) - 1, product.trackInventory ? product.inventoryQuantity : undefined)}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="min-w-7 text-center text-[12.5px] tabular">{cart[product.id] ?? 0}</span>
                        <button
                          type="button"
                          className="px-2 py-1.5 text-muted hover:text-foreground"
                          aria-label={`Increase ${product.name} quantity`}
                          onClick={() => setQuantity(product.id, (cart[product.id] ?? 0) + 1, product.trackInventory ? product.inventoryQuantity : undefined)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
                        Add
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {lines.length > 0 ? (
        <div className="sticky bottom-0 z-20 mt-6 border-t border-border bg-surface/95 p-4 backdrop-blur">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-muted">
              {lines.reduce((sum, l) => sum + l.quantity, 0)} item(s) ·{" "}
              <span className="font-semibold text-foreground tabular">{formatMoney(total, currency)}</span>
            </p>
            <Button onClick={() => setOpen((v) => !v)}>{open ? "Hide checkout" : "Checkout"}</Button>
          </div>
        </div>
      ) : null}

      {open && lines.length > 0 ? (
        <form action={action} className="surface-card mx-auto mt-4 max-w-xl space-y-4 p-5">
          {state.message && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
          <input type="hidden" name="storefrontSlug" value={storefrontSlug} />
          <input type="hidden" name="items" value={JSON.stringify(lines.map((l) => ({ productId: l.id, quantity: l.quantity })))} />
          <h3 className="text-[15px] font-semibold">Your details</h3>
          <Field label="Full name" htmlFor="cart-name" error={state.errors?.customerName}>
            <Input id="cart-name" name="customerName" required autoComplete="name" />
          </Field>
          <Field label="Email" htmlFor="cart-email" error={state.errors?.customerEmail}>
            <Input id="cart-email" name="customerEmail" type="email" required autoComplete="email" />
          </Field>
          <Field label="Phone" htmlFor="cart-phone" optional>
            <Input id="cart-phone" name="customerPhone" autoComplete="tel" />
          </Field>
          <Field label="Delivery note" htmlFor="cart-note" optional>
            <Textarea id="cart-note" name="deliveryNote" rows={2} />
          </Field>
          <div className="flex items-center justify-between border-t border-border pt-3 text-[14px] font-semibold">
            <span>Total</span>
            <span className="tabular">{formatMoney(total, currency)}</span>
          </div>
          <SubmitButton pending={pending} className="w-full">
            Pay {formatMoney(total, currency)}
          </SubmitButton>
          <p className="text-[11px] text-muted">
            You will be redirected to the payment provider's secure checkout. Your order is confirmed only after payment
            verification.
          </p>
        </form>
      ) : null}
    </div>
  );
}
