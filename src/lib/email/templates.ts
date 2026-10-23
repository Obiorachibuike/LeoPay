/**
 * Branded transactional email templates. Inline styles only (email clients),
 * with a text fallback. No sensitive financial details beyond what the
 * recipient already needs.
 */
import { formatMoney } from "@/lib/money";
import { env } from "@/lib/env";

type LayoutOptions = { title: string; preview?: string; body: string; action?: { label: string; url: string } };

function layout({ title, preview, body, action }: LayoutOptions): string {
  const button = action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0"><tr><td style="border-radius:8px;background:#10B981">
        <a href="${action.url}" style="display:inline-block;padding:12px 22px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#04110B;text-decoration:none">${action.label}</a>
      </td></tr></table>
      <p style="font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#64748B;margin:0 0 8px">
        If the button does not work, copy this link into your browser:<br />
        <a href="${action.url}" style="color:#0F766E;word-break:break-all">${action.url}</a>
      </p>`
    : "";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)}</title>${preview ? `<meta name="description" content="${escapeHtml(preview)}" />` : ""}</head>
<body style="margin:0;padding:0;background:#F1F5F9">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preview ?? "")}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:14px;overflow:hidden">
        <tr><td style="padding:24px 28px;border-bottom:1px solid #E2E8F0">
          <span style="font-family:Helvetica,Arial,sans-serif;font-size:19px;font-weight:700;color:#0B1220;letter-spacing:-0.3px">LeoPay</span>
          <span style="font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#64748B;margin-left:8px">Your Business. Your Money. Your Momentum.</span>
        </td></tr>
        <tr><td style="padding:28px">
          <h1 style="font-family:Helvetica,Arial,sans-serif;font-size:21px;line-height:1.3;margin:0 0 16px;color:#0F172A">${escapeHtml(title)}</h1>
          <div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#334155">${body}</div>
          ${button}
        </td></tr>
        <tr><td style="padding:18px 28px;background:#F8FAFC;border-top:1px solid #E2E8F0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#64748B">
          This message was sent by LeoPay. If you did not expect it, you can safely ignore it or contact
          <a href="mailto:support@leopay.app" style="color:#0F766E">support@leopay.app</a>.<br />
          Never share your password or API keys with anyone, including LeoPay staff.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type EmailContent = { subject: string; html: string; text: string };
export type EmailTemplate =
  | "welcome"
  | "verify_email"
  | "password_reset"
  | "security_alert"
  | "team_invitation"
  | "invoice_delivery"
  | "invoice_reminder"
  | "payment_confirmation"
  | "payment_failed"
  | "payout_update"
  | "support_acknowledgement";

const p = (text: string) => `<p style="margin:0 0 14px">${text}</p>`;

export const emailTemplates: Record<
  EmailTemplate,
  (data: Record<string, string | number>) => EmailContent
> = {
  welcome: (d) => ({
    subject: "Welcome to LeoPay",
    html: layout({
      title: `Welcome, ${escapeHtml(String(d.name))}`,
      body: `${p("Your LeoPay account is ready. Create your business workspace to start collecting payments, sending invoices and tracking every naira that moves through your business.")}
        ${p("Before you accept live payments, complete your business profile and connect a payment provider in Settings → Payments.")}
        ${p("<strong>Security tip:</strong> LeoPay will never ask for your password, card PIN or one-time codes.")}`,
      action: { label: "Open your dashboard", url: `${env.appUrl}/dashboard` },
    }),
    text: `Welcome, ${d.name}. Your LeoPay account is ready. Open your dashboard: ${env.appUrl}/dashboard`,
  }),
  verify_email: (d) => ({
    subject: "Verify your LeoPay email address",
    html: layout({
      title: "Verify your email address",
      body: `${p("Confirm your email address to secure your account and finish setting up your business workspace.")}
        ${p(`This link expires in ${escapeHtml(String(d.hours ?? 24))} hours.`)}`,
      action: { label: "Verify email", url: String(d.url) },
    }),
    text: `Verify your LeoPay email address: ${d.url} (expires in ${d.hours ?? 24} hours)`,
  }),
  password_reset: (d) => ({
    subject: "Reset your LeoPay password",
    html: layout({
      title: "Reset your password",
      body: `${p("We received a request to reset your LeoPay password. This link can be used once and expires in 60 minutes.")}
        ${p("If you did not request this, no action is needed. Your password has not changed.")}`,
      action: { label: "Choose a new password", url: String(d.url) },
    }),
    text: `Reset your LeoPay password: ${d.url} (expires in 60 minutes)`,
  }),
  security_alert: (d) => ({
    subject: "Security notice for your LeoPay account",
    html: layout({
      title: "Security notice",
      body: `${p(escapeHtml(String(d.message)))}
        ${p("If this was not you, reset your password immediately and contact support.")}`,
      action: { label: "Review account security", url: `${env.appUrl}/dashboard/settings/security` },
    }),
    text: `${d.message}\n\nReview your account: ${env.appUrl}/dashboard/settings/security`,
  }),
  team_invitation: (d) => ({
    subject: `${d.organization} invited you to LeoPay`,
    html: layout({
      title: `Join ${escapeHtml(String(d.organization))} on LeoPay`,
      body: `${p(`${escapeHtml(String(d.inviter))} invited you to join <strong>${escapeHtml(String(d.organization))}</strong> as a ${escapeHtml(String(d.role))}.`)}
        ${p("This invitation expires in 7 days.")}`,
      action: { label: "Accept invitation", url: String(d.url) },
    }),
    text: `${d.inviter} invited you to join ${d.organization} on LeoPay as ${d.role}. Accept: ${d.url}`,
  }),
  invoice_delivery: (d) => ({
    subject: `Invoice ${d.invoiceNumber} from ${d.organization}`,
    html: layout({
      title: `Invoice ${escapeHtml(String(d.invoiceNumber))}`,
      body: `${p(`${escapeHtml(String(d.organization))} sent you an invoice for <strong>${escapeHtml(String(d.amount))}</strong>.`)}
        ${p(`Due date: ${escapeHtml(String(d.dueDate))}`)}
        ${d.notes ? p(escapeHtml(String(d.notes))) : ""}`,
      action: { label: "View and pay invoice", url: String(d.url) },
    }),
    text: `Invoice ${d.invoiceNumber} from ${d.organization} for ${d.amount}. View: ${d.url}`,
  }),
  invoice_reminder: (d) => ({
    subject: `Reminder: invoice ${d.invoiceNumber} is due`,
    html: layout({
      title: "Friendly payment reminder",
      body: `${p(`Invoice <strong>${escapeHtml(String(d.invoiceNumber))}</strong> from ${escapeHtml(String(d.organization))} for ${escapeHtml(String(d.amount))} is awaiting payment.`)}
        ${p(`Due date: ${escapeHtml(String(d.dueDate))}`)}`,
      action: { label: "View invoice", url: String(d.url) },
    }),
    text: `Reminder: invoice ${d.invoiceNumber} for ${d.amount} from ${d.organization}. View: ${d.url}`,
  }),
  payment_confirmation: (d) => ({
    subject: `Payment received — ${d.amount}`,
    html: layout({
      title: "Payment received",
      body: `${p(`We received a payment of <strong>${escapeHtml(String(d.amount))}</strong> for ${escapeHtml(String(d.description))}.`)}
        ${p(`Reference: <strong>${escapeHtml(String(d.reference))}</strong>`)}
        ${p("This email is a notification, not a tax invoice or receipt.")}`,
      action: d.url ? { label: "View payment", url: String(d.url) } : undefined,
    }),
    text: `Payment received: ${d.amount} for ${d.description}. Reference: ${d.reference}`,
  }),
  payment_failed: (d) => ({
    subject: `Payment could not be completed — ${d.amount}`,
    html: layout({
      title: "Payment was not completed",
      body: `${p(`A payment of ${escapeHtml(String(d.amount))} for ${escapeHtml(String(d.description))} did not go through.`)}
        ${p(`Reference: ${escapeHtml(String(d.reference))}`)}
        ${p("No funds were captured. You can try again with the same or a different payment method.")}`,
      action: d.url ? { label: "View payment", url: String(d.url) } : undefined,
    }),
    text: `Payment of ${d.amount} could not be completed. Reference: ${d.reference}`,
  }),
  payout_update: (d) => ({
    subject: `Payout update — ${d.status}`,
    html: layout({
      title: `Payout ${escapeHtml(String(d.status))}`,
      body: `${p(`A payout of <strong>${escapeHtml(String(d.amount))}</strong> to ${escapeHtml(String(d.beneficiary))} is now <strong>${escapeHtml(String(d.status))}</strong>.`)}
        ${p(`Reference: ${escapeHtml(String(d.reference))}`)}
        ${d.message ? p(escapeHtml(String(d.message))) : ""}`,
      action: { label: "View payouts", url: `${env.appUrl}/dashboard/payouts` },
    }),
    text: `Payout ${d.reference} of ${d.amount} to ${d.beneficiary} is ${d.status}.`,
  }),
  support_acknowledgement: (d) => ({
    subject: "We received your LeoPay support request",
    html: layout({
      title: "Support request received",
      body: `${p(`Thanks ${escapeHtml(String(d.name))}, our team has received your message about “${escapeHtml(String(d.subject))}”.`)}
        ${p("We usually reply within one business day. If your issue involves a payment, include the reference in your reply.")}
        ${p("If you believe your account is compromised, reset your password and email security@leopay.app immediately.")}`,
    }),
    text: `Thanks ${d.name}, we received your support request: ${d.subject}.`,
  }),
};

export function renderMoney(minor: number, currency: string): string {
  return formatMoney(minor, currency);
}
