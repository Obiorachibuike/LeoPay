/**
 * Shared Zod schemas. Every mutation validates input with one of these before
 * touching the database.
 */
import { z } from "zod";
import { CURRENCIES, isCurrencyCode } from "@/lib/money";

export const emailSchema = z
  .string()
  .trim()
  .min(3, "Enter your email address")
  .max(254)
  .email("Enter a valid email address")
  .transform((v) => v.toLowerCase());

export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(128, "Password must be 128 characters or fewer")
  .refine((v) => /[a-zA-Z]/.test(v) && /[0-9]/.test(v), "Password must include letters and numbers");

export const nameSchema = z.string().trim().min(2, "Name is too short").max(120);

export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine(isCurrencyCode, "Unsupported currency")
  .refine((code) => CURRENCIES[code as keyof typeof CURRENCIES].enabled, "This currency is not enabled")
  .transform((code) => code.toUpperCase());

export const optionalUrlSchema = z
  .union([z.string().trim().url("Enter a valid URL"), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

/** Amount in minor units (integer). Max ₦1bn equivalent guard in minor units. */
export const minorAmountSchema = z
  .number({ error: "Enter a valid amount" })
  .int("Amount must be a whole number of minor units")
  .positive("Amount must be greater than zero")
  .max(1_000_000_000_00, "Amount exceeds the supported maximum");

export const positiveIntSchema = z.number().int().positive().max(1_000_000);

export const phoneSchema = z
  .string()
  .trim()
  .min(7, "Enter a valid phone number")
  .max(20)
  .regex(/^[+0-9()\-\s]+$/, "Phone number contains invalid characters");

export const slugSchema = z
  .string()
  .trim()
  .min(3, "Slug must be at least 3 characters")
  .max(48)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Use lowercase letters, numbers and hyphens");

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/* --------------------------------------------------------------- auth ---- */

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  acceptTerms: z.literal(true, { error: "You must accept the terms of service" }),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(128),
});

export const resetRequestSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

/* ---------------------------------------------------------- organization -- */

export const ORGANIZATION_TYPES = [
  { value: "sole_proprietorship", label: "Sole proprietorship" },
  { value: "limited_company", label: "Limited company" },
  { value: "freelancer", label: "Freelancer / individual" },
  { value: "ngo", label: "Non-profit (NGO)" },
  { value: "other", label: "Other" },
] as const;

export const organizationSchema = z.object({
  name: z.string().trim().min(2, "Enter your business name").max(120),
  businessEmail: emailSchema.optional(),
  businessPhone: phoneSchema.optional(),
  countryCode: z.string().length(2).default("NG"),
  defaultCurrency: currencySchema.default("NGN"),
  businessType: z
    .enum(["sole_proprietorship", "limited_company", "freelancer", "ngo", "other"])
    .default("sole_proprietorship"),
  website: optionalUrlSchema,
});

export const businessDetailsSchema = organizationSchema.partial().extend({
  settlementBankName: z.string().trim().max(120).optional(),
  settlementAccountName: z.string().trim().max(160).optional(),
  settlementAccountNumber: z
    .string()
    .trim()
    .regex(/^\d{10}$/, "Enter a valid 10-digit account number")
    .optional(),
});

/* --------------------------------------------------------- payment link -- */

export const paymentLinkSchema = z
  .object({
    title: z.string().trim().min(2, "Enter a title").max(120),
    description: z.string().trim().max(1000).optional(),
    allowVariableAmount: z.boolean().default(false),
    amountMinor: z.number().int().positive().max(1_000_000_000_00).optional(),
    minAmountMinor: z.number().int().positive().optional(),
    maxAmountMinor: z.number().int().positive().optional(),
    currency: currencySchema.default("NGN"),
    successUrl: optionalUrlSchema,
    cancelUrl: optionalUrlSchema,
    expiresAt: z.string().datetime().optional().or(z.literal("")).transform((v) => (v ? v : null)),
    collectCustomerPhone: z.boolean().default(false),
  })
  .refine((v) => v.allowVariableAmount || typeof v.amountMinor === "number", {
    message: "Enter an amount or allow the customer to choose one",
    path: ["amountMinor"],
  })
  .refine((v) => !v.allowVariableAmount || ((v.minAmountMinor ?? 0) > 0 && (v.maxAmountMinor ?? 0) > 0), {
    message: "Set a minimum and maximum for variable amounts",
    path: ["minAmountMinor"],
  })
  .refine(
    (v) => !v.allowVariableAmount || (v.maxAmountMinor ?? 0) >= (v.minAmountMinor ?? 0),
    { message: "Maximum must be greater than or equal to minimum", path: ["maxAmountMinor"] },
  );

export const checkoutFormSchema = z.object({
  amount: z.string().trim().optional(),
  name: z.string().trim().max(120).optional(),
  email: emailSchema.optional(),
  phone: z.string().trim().max(20).optional(),
});

/* --------------------------------------------------------------- invoice -- */

export const invoiceItemSchema = z.object({
  description: z.string().trim().min(1, "Enter a description").max(300),
  quantity: z.number().positive("Quantity must be greater than zero").max(100000),
  unitAmountMinor: z.number().int().min(0).max(1_000_000_000_00),
});

export const invoiceSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  customerName: z.string().trim().min(2, "Enter the customer name").max(160),
  customerEmail: emailSchema.optional(),
  currency: currencySchema.default("NGN"),
  items: z.array(invoiceItemSchema).min(1, "Add at least one line item").max(50),
  discountMinor: z.number().int().min(0).default(0),
  taxRateBps: z.number().int().min(0).max(5000).default(0),
  issueDate: z.string().min(8),
  dueDate: z.string().min(8).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional(),
  terms: z.string().trim().max(1000).optional(),
  status: z.enum(["draft", "issued"]).default("draft"),
});

/* --------------------------------------------------------------- product -- */

export const productSchema = z.object({
  name: z.string().trim().min(2, "Enter a product name").max(160),
  description: z.string().trim().max(2000).optional(),
  priceMinor: z.number().int().positive("Enter a price").max(1_000_000_000_00),
  currency: currencySchema.default("NGN"),
  sku: z.string().trim().max(64).optional(),
  trackInventory: z.boolean().default(false),
  inventoryQuantity: z.number().int().min(0).max(1_000_000).default(0),
  status: z.enum(["draft", "active", "archived"]).default("draft"),
  imageUrl: optionalUrlSchema,
});

export const storefrontSchema = z.object({
  name: z.string().trim().min(2, "Enter a storefront name").max(120),
  slug: slugSchema,
  description: z.string().trim().max(600).optional(),
  currency: currencySchema.default("NGN"),
  status: z.enum(["draft", "published", "unpublished"]).default("draft"),
});

export const storeCheckoutSchema = z.object({
  items: z
    .array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(50) }))
    .min(1, "Your cart is empty")
    .max(20),
  customerName: z.string().trim().min(2, "Enter your name").max(120),
  customerEmail: emailSchema,
  customerPhone: z.string().trim().max(20).optional(),
  deliveryNote: z.string().trim().max(500).optional(),
});

/* --------------------------------------------------------------- payout -- */

export const beneficiarySchema = z.object({
  name: z.string().trim().min(2, "Enter a beneficiary name").max(120),
  bankCode: z.string().trim().min(2, "Select a bank").max(20),
  bankName: z.string().trim().min(2).max(120),
  accountNumber: z.string().trim().regex(/^\d{10}$/, "Enter a valid 10-digit account number"),
});

export const payoutRequestSchema = z.object({
  beneficiaryId: z.string().uuid("Select a beneficiary"),
  amountMinor: z.number().int().positive("Enter an amount").max(1_000_000_000_00),
  currency: currencySchema.default("NGN"),
  reason: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
});

export const payoutDecisionSchema = z.object({
  payoutId: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(500).optional(),
});

/* ---------------------------------------------------------------- api ---- */

export const apiKeySchema = z.object({
  name: z.string().trim().min(2, "Enter a key name").max(80),
  environment: z.enum(["test", "live"]).default("test"),
  scopes: z.array(z.string().min(1)).min(1, "Select at least one scope").max(20),
});

export const webhookEndpointSchema = z.object({
  url: z
    .string()
    .trim()
    .url("Enter a valid HTTPS URL")
    .refine((u) => u.startsWith("https://") || process.env.NODE_ENV !== "production", "Webhook URLs must use HTTPS"),
  description: z.string().trim().max(200).optional(),
  eventTypes: z.array(z.string().min(1)).min(1, "Select at least one event").max(30),
});

export const customerSchema = z.object({
  name: z.string().trim().min(2, "Enter a customer name").max(160),
  email: emailSchema.optional(),
  phone: z.string().trim().max(20).optional(),
});

export const supportTicketSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(120),
  email: emailSchema,
  subject: z.string().trim().min(4, "Enter a subject").max(160),
  message: z.string().trim().min(20, "Please describe your issue in at least 20 characters").max(4000),
  reference: z.string().trim().max(80).optional(),
});

/** Formats Zod issues into a field->messages map for forms. */
export function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    out[key] = [...(out[key] ?? []), issue.message];
  }
  return out;
}
