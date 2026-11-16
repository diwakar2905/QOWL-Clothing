import { SUPPORT_EMAIL } from "@/lib/brand";
/**
 * Default transactional templates. Admins can override subject/body per key
 * in Admin → Settings → Email templates. Placeholders use {{name}} syntax and
 * are HTML-escaped when rendered.
 */
export const DEFAULT_TEMPLATES: Record<string, { name: string; subject: string; body: string }> = {
  account_verification: {
    name: "Account verification",
    subject: "Verify your QOWL account",
    body: "Hi {{name}},\n\nConfirm your email address to finish setting up your QOWL account:\n\n{{link}}\n\nThis link expires in 24 hours. If you didn't create an account, you can ignore this email.",
  },
  account_exists: {
    name: "Sign-up attempt for an existing account",
    subject: "You already have a QOWL account",
    body: "Hi {{name}},\n\nSomeone (hopefully you) tried to create a QOWL account with this email address, but you already have one.\n\nSign in: {{loginLink}}\nForgot your password? Reset it here: {{resetLink}}\n\nIf this wasn't you, you can ignore this email — your account hasn't changed.",
  },
  password_reset: {
    name: "Password reset",
    subject: "Reset your QOWL password",
    body: "Hi {{name}},\n\nWe received a request to reset your password. Use the link below within 1 hour:\n\n{{link}}\n\nIf you didn't request this, you can ignore this email — your password won't change.",
  },
  order_confirmation: {
    name: "Order confirmation",
    subject: "Order {{orderNumber}} confirmed",
    body: "Hi {{name}},\n\nThank you for your order. We've received payment and your order {{orderNumber}} is confirmed.\n\n{{itemsSummary}}\n\nTotal paid: {{total}}\n\nView your order: {{link}}",
  },
  cod_order_placed: {
    name: "COD order placed",
    subject: "Order {{orderNumber}} placed — Cash on Delivery",
    body: "Hi {{name}},\n\nYour Cash on Delivery order {{orderNumber}} has been placed.\n\n{{itemsSummary}}\n\nAmount payable on delivery: {{total}}\n\nView your order: {{link}}",
  },
  payment_failed: {
    name: "Payment failed",
    subject: "Payment for order {{orderNumber}} was not completed",
    body: "Hi {{name}},\n\nYour payment for order {{orderNumber}} was not completed and you have not been charged by us. If money was debited, your bank or the payment gateway will reverse it per their timelines.\n\nYou can try again from your bag: {{link}}",
  },
  order_shipped: {
    name: "Order shipped",
    subject: "Order {{orderNumber}} has shipped",
    body: "Hi {{name}},\n\nYour order {{orderNumber}} is on its way with {{courier}}.\nTracking number: {{awb}}\n\nTrack your order: {{link}}",
  },
  out_for_delivery: {
    name: "Out for delivery",
    subject: "Order {{orderNumber}} is out for delivery",
    body: "Hi {{name}},\n\nYour order {{orderNumber}} is out for delivery today.\n\nTrack your order: {{link}}",
  },
  order_delivered: {
    name: "Delivered",
    subject: "Order {{orderNumber}} delivered",
    body: "Hi {{name}},\n\nYour order {{orderNumber}} has been delivered. We hope you wear it your way.\n\nView your order: {{link}}",
  },
  order_cancelled: {
    name: "Order cancelled",
    subject: "Order {{orderNumber}} cancelled",
    body: "Hi {{name}},\n\nYour order {{orderNumber}} has been cancelled. {{reason}}\n\nIf you paid online, any refund due will be processed to your original payment method; we'll email you when it's initiated.\n\n{{link}}",
  },
  return_requested: {
    name: "Return/exchange requested",
    subject: "We've received your {{type}} request {{returnNumber}}",
    body: "Hi {{name}},\n\nWe've received your {{type}} request {{returnNumber}} for order {{orderNumber}}. Our team will review it and update you by email.\n\n{{link}}",
  },
  return_update: {
    name: "Return/exchange status update",
    subject: "Update on your {{type}} request {{returnNumber}}",
    body: "Hi {{name}},\n\nYour {{type}} request {{returnNumber}} is now: {{status}}.\n{{note}}\n\n{{link}}",
  },
  refund_initiated: {
    name: "Refund initiated",
    subject: "Refund initiated for order {{orderNumber}}",
    body: "Hi {{name}},\n\nWe've initiated a refund of {{amount}} for order {{orderNumber}} to your original payment method. Banks typically take 5–7 working days to reflect it.\n\n{{link}}",
  },
  refund_completed: {
    name: "Refund completed",
    subject: "Refund processed for order {{orderNumber}}",
    body: "Hi {{name}},\n\nYour refund of {{amount}} for order {{orderNumber}} has been processed.{{reference}}\n\n{{link}}",
  },
  newsletter_confirm: {
    name: "Newsletter confirmation",
    subject: "Confirm your QOWL subscription",
    body: "Confirm that you'd like to hear about new QOWL drops and releases:\n\n{{link}}\n\nIf you didn't sign up, ignore this email and you won't be subscribed.\n\nUnsubscribe at any time: {{unsubscribeLink}}",
  },
  account_deletion_requested: {
    name: "Account deletion requested",
    subject: "We've received your account deletion request",
    body: "Hi {{name}},\n\nWe've received your request to delete your QOWL account. Our team will process it and confirm by email. Order and invoice records we are legally required to keep will be retained and anonymised where possible.",
  },
};

export type TemplateKey = keyof typeof DEFAULT_TEMPLATES;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function interpolate(text: string, vars: Record<string, string | number | undefined | null>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => (vars[k] === undefined || vars[k] === null ? "" : String(vars[k])));
}

/** Renders plain-text template to a minimal branded HTML email with escaping. */
export function renderEmail(subjectT: string, bodyT: string, vars: Record<string, string | number | undefined | null>) {
  const subject = interpolate(subjectT, vars).replace(/[\r\n]+/g, " ").slice(0, 200);
  const text = `${interpolate(bodyT, vars)}\n\nQuestions? Write to ${SUPPORT_EMAIL}`;
  const htmlBody = esc(text.replace(/\n\nQuestions\? Write to [^\n]+$/, ""))
    .split(/\n{2,}/)
    .map((para) => `<p style="margin:0 0 16px">${para.replace(/\n/g, "<br>").replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}" style="color:#073D2D">${u}</a>`)}</p>`)
    .join("");
  const html = `<!doctype html><html><body style="margin:0;background:#F7F4EC;font-family:Helvetica,Arial,sans-serif;color:#262626">
<div style="max-width:560px;margin:0 auto;padding:32px 24px">
<div style="font-family:Georgia,serif;letter-spacing:.3em;font-size:20px;color:#073D2D;margin-bottom:24px">QOWL</div>
<div style="font-size:15px;line-height:1.6">${htmlBody}</div>
<hr style="border:none;border-top:1px solid #E5E3DE;margin:24px 0">
<div style="font-size:12px;color:#6b6b6b">This is a transactional email about your QOWL account or order. Need help? <a href="mailto:${SUPPORT_EMAIL}" style="color:#073D2D">${SUPPORT_EMAIL}</a></div>
</div></body></html>`;
  return { subject, text, html };
}
