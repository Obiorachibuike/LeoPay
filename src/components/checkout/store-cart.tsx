"use client";

import { useActionState, useMemo, useState } from "react";
import { Minus, Plus, ShoppingCart } from "lucide-react";
import { publicStoreCheckoutAction, type StoreCheckoutState } from "@/app/actions/commerce";
import { Field, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { formatMoney } from "@/lib/money";

const initial: StoreCheckoutState = { ok: false, message: "" };

type Product = {
  id: string;
  name: string;
  description: string | null;
  priceMinor: number;
  currency: string;
  trackInventory: boolean;
  inventoryQuantity: number;
  imageUrl: string | null;
};

export function StoreCart({ slug, currency, products }: { slug: string; currency: string; products: Product[] }) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [state, action, pending] = useActionState(publicStoreCheckoutAction, initial);

  const lines = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, quantity]) => {
          const product = products.find((item) => item.id === id);
          return product ? { product, quantity } : null;
        })
        .filter((line): line is { product: Product; quantity: number } => line !== null),
    [cart, products],
  );

  const total = lines.reduce((sum, line) => sum + line.product.priceMinor * line.quantity, 0);

  const setQuantity = (product: Product, next: number) => {
    const stockCap = product.trackInventory ? product.inventoryQuantity : Number.MAX_SAFE_INTEGER;
    const clamped = Math.max(0, Math.min(stockCap, next));
    setCart((current) => {
      const copy = { ...current };
      if (clamped === 0) delete copy[product.id];
      else copy[product.id] = clamped;
      return copy;
    });
  };

  const itemsJson = JSON.stringify(lines.map((line) => ({ productId: line.product.id, quantity: line.quantity })));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {products.map((product) => {
          const quantity = cart[product.id] ?? 0;
          const soldOut = product.trackInventory && product.inventoryQuantity <= 0;
          return (
            <div key={product.id} className="flex flex-col rounded-xl border border-border bg-surface p-4">
              {product.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.imageUrl} alt="" className="mb-3 h-32 w-full rounded-lg object-cover" />
              ) : null}
              <p className="text-[14px] font-semibold">{product.name}</p>
              {product.description ? <p className="mt-1 line-clamp-2 text-[12px] text-muted">{product.description}</p> : null}
              <p className="mt-2 text-[15px] font-semibold tabular">{formatMoney(product.priceMinor, product.currency)}</p>
              {product.trackInventory ? (
                <p className="text-[11px] text-muted">{soldOut ? "Out of stock" : `${product.inventoryQuantity} available`}</p>
              ) : null}
              <div className="mt-3 flex items-center gap-2">
                {quantity > 0 ? (
                  <>
                    <button type="button" aria-label={`Remove one ${product.name}`} onClick={() => setQuantity(product, quantity - 1)} className="grid h-8 w-8 place-items-center rounded-md border border-border">
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-6 text-center text-[13px] tabular">{quantity}</span>
                  </>
                ) : null}
                <button
                  type="button"
                  disabled={soldOut || quantity >= (product.trackInventory ? product.inventoryQuantity : Number.MAX_SAFE_INTEGER)}
                  onClick={() => setQuantity(product, quantity + 1)}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <form action={action} className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <input type="hidden" name="storefrontSlug" value={slug} />
        <input type="hidden" name="items" value={itemsJson} />
        <div className="flex items-center justify-between">
          <p className="inline-flex items-center gap-1.5 text-[13px] font-semibold">
            <ShoppingCart className="h-4 w-4" /> Cart
          </p>
          <p className="text-[14px] font-semibold tabular">{formatMoney(total, currency)}</p>
        </div>

        {lines.length === 0 ? (
          <p className="text-[12.5px] text-muted">Add a product to continue.</p>
        ) : (
          <ul className="divide-y divide-border text-[12.5px]">
            {lines.map((line) => (
              <li key={line.product.id} className="flex justify-between py-1.5">
                <span>{line.product.name} × {line.quantity}</span>
                <span className="tabular">{formatMoney(line.product.priceMinor * line.quantity, currency)}</span>
              </li>
            ))}
          </ul>
        )}

        {state.message ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
        {state.redirectUrl ? (
          <a href={state.redirectUrl} className="block rounded-lg bg-[var(--brand)] px-4 py-2.5 text-center text-[13px] font-medium text-[var(--brand-foreground)]">
            Continue to payment
          </a>
        ) : null}

        <Field label="Full name" htmlFor="cart-name" error={state.errors?.["customerName"]}>
          <Input id="cart-name" name="customerName" autoComplete="name" required />
        </Field>
        <Field label="Email" htmlFor="cart-email" hint="Your receipt is sent here." error={state.errors?.["customerEmail"]}>
          <Input id="cart-email" name="customerEmail" type="email" autoComplete="email" required />
        </Field>
        <Field label="Phone" htmlFor="cart-phone" hint="Optional" error={state.errors?.["customerPhone"]}>
          <Input id="cart-phone" name="customerPhone" type="tel" autoComplete="tel" />
        </Field>
        <Field label="Delivery note" htmlFor="cart-note" hint="Optional — address or pickup instructions." error={state.errors?.["deliveryNote"]}>
          <Textarea id="cart-note" name="deliveryNote" rows={2} />
        </Field>

        <SubmitButton pending={pending} disabled={lines.length === 0} className="w-full">
          {pending ? "Creating order…" : `Checkout · ${formatMoney(total, currency)}`}
        </SubmitButton>
        <p className="text-center text-[11px] text-muted">
          Stock is reserved when you continue. The order is only confirmed once the provider verifies payment.
        </p>
      </form>
    </div>
  );
}
