/** Public JSON shapes for API responses. Minor units stay integers. */
import type { Customer, Invoice, Order, Payment, PaymentLink, Payout } from "@/lib/db/schema";
import { fromMinorUnits } from "@/lib/money";

export function serializePayment(payment: Payment) {
  return {
    id: payment.id,
    reference: payment.internalReference,
    provider: payment.provider,
    provider_reference: payment.providerReference,
    status: payment.status,
    amount_minor: payment.amountMinor,
    amount: fromMinorUnits(payment.amountMinor, payment.currency),
    fee_minor: payment.feeMinor,
    net_minor: payment.netMinor,
    currency: payment.currency,
    method: payment.paymentMethod,
    channel: payment.channel,
    customer: { email: payment.customerEmail, name: payment.customerName },
    failure: payment.failureCode ? { code: payment.failureCode, message: payment.failureMessage } : null,
    paid_at: payment.paidAt?.toISOString() ?? null,
    created_at: payment.createdAt.toISOString(),
  };
}

export function serializePaymentLink(link: PaymentLink) {
  return {
    id: link.id,
    reference: link.publicReference,
    title: link.title,
    description: link.description,
    status: link.status,
    amount_minor: link.amountMinor,
    allow_variable_amount: link.allowVariableAmount,
    min_amount_minor: link.minAmountMinor,
    max_amount_minor: link.maxAmountMinor,
    currency: link.currency,
    url: `/pay/${link.publicReference}`,
    expires_at: link.expiresAt?.toISOString() ?? null,
    created_at: link.createdAt.toISOString(),
  };
}

export function serializeInvoice(invoice: Invoice) {
  return {
    id: invoice.id,
    number: invoice.invoiceNumber,
    reference: invoice.publicReference,
    status: invoice.status,
    customer: { name: invoice.customerName, email: invoice.customerEmail },
    subtotal_minor: invoice.subtotalMinor,
    discount_minor: invoice.discountMinor,
    tax_minor: invoice.taxMinor,
    total_minor: invoice.totalMinor,
    amount_paid_minor: invoice.amountPaidMinor,
    currency: invoice.currency,
    issue_date: invoice.issueDate,
    due_date: invoice.dueDate,
    payment_url: `/i/${invoice.publicReference}`,
    created_at: invoice.createdAt.toISOString(),
  };
}

export function serializeCustomer(customer: Customer) {
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    created_at: customer.createdAt.toISOString(),
  };
}

export function serializePayout(payout: Payout, beneficiaryName?: string) {
  return {
    id: payout.id,
    reference: payout.internalReference,
    status: payout.status,
    amount_minor: payout.amountMinor,
    currency: payout.currency,
    beneficiary: beneficiaryName ?? null,
    failure_reason: payout.failureMessage,
    created_at: payout.createdAt.toISOString(),
  };
}

export function serializeOrder(order: Order) {
  return {
    id: order.id,
    reference: order.publicReference,
    status: order.status,
    amount_minor: order.totalMinor,
    currency: order.currency,
    customer: { name: order.customerName, email: order.customerEmail },
    items: null,
    created_at: order.createdAt.toISOString(),
  };
}
