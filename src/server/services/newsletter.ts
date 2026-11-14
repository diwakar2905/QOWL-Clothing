import "server-only";
import { db } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";
import { emailSchema } from "@/lib/validation";
import { AppError } from "@/lib/errors";
import { enqueueEmail } from "@/server/notifications/outbox";
import { getSetting } from "./settings";
import { enforce } from "./rate-limit";

const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";

/**
 * Subscribe with recorded consent. With double opt-in (default), the address
 * stays PENDING until confirmed. Responses never reveal whether an address is
 * already subscribed.
 */
export async function subscribe(emailRaw: string, ctx: { ip: string; source?: string; consent: boolean }) {
  if (!ctx.consent) throw new AppError("CONSENT_REQUIRED", "Please tick the consent box to subscribe.");
  await enforce(`newsletter:ip:${ctx.ip}`, 8, 3600, "Too many sign-ups from this network. Please try later.");
  const email = emailSchema.parse(emailRaw);
  await enforce(`newsletter:email:${sha256(email)}`, 3, 86400);
  const cfg = await getSetting("newsletter");
  const existing = await db.newsletterSubscriber.findUnique({ where: { email } });
  if (existing?.status === "SUBSCRIBED") return { status: "ok" as const, pending: false };
  const confirmToken = randomToken(24);
  const unsubToken = randomToken(24);
  const doubleOptIn = cfg.doubleOptIn;
  const data = {
    status: doubleOptIn ? ("PENDING" as const) : ("SUBSCRIBED" as const),
    consentText: cfg.consentText,
    consentAt: new Date(),
    source: ctx.source?.slice(0, 40),
    confirmTokenHash: doubleOptIn ? sha256(confirmToken) : null,
    unsubscribeTokenHash: sha256(unsubToken),
    confirmedAt: doubleOptIn ? null : new Date(),
    unsubscribedAt: null,
  };
  const sub = existing ? await db.newsletterSubscriber.update({ where: { email }, data }) : await db.newsletterSubscriber.create({ data: { email, ...data } });
  if (doubleOptIn) {
    await enqueueEmail({
      template: "newsletter_confirm",
      to: email,
      vars: { link: `${appUrl()}/newsletter/confirm?token=${confirmToken}`, unsubscribeLink: `${appUrl()}/newsletter/unsubscribe?token=${unsubToken}` },
      dedupeKey: `newsletter_confirm:${sub.id}:${sha256(confirmToken).slice(0, 12)}`,
    });
  }
  return { status: "ok" as const, pending: doubleOptIn };
}

export async function confirmSubscription(token: string) {
  if (!token || token.length > 100) return false;
  const sub = await db.newsletterSubscriber.findUnique({ where: { confirmTokenHash: sha256(token) } });
  if (!sub) return false;
  await db.newsletterSubscriber.update({ where: { id: sub.id }, data: { status: "SUBSCRIBED", confirmedAt: new Date(), confirmTokenHash: null } });
  return true;
}

export async function unsubscribe(token: string) {
  if (!token || token.length > 100) return false;
  const sub = await db.newsletterSubscriber.findUnique({ where: { unsubscribeTokenHash: sha256(token) } });
  if (!sub) return false;
  await db.newsletterSubscriber.update({ where: { id: sub.id }, data: { status: "UNSUBSCRIBED", unsubscribedAt: new Date(), confirmTokenHash: null } });
  return true;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  // Neutralise spreadsheet formula injection and escape quotes.
  const cell = (v: string | number | null | undefined) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\n") + "\n";
}

export async function exportSubscribersCsv() {
  const subs = await db.newsletterSubscriber.findMany({ orderBy: { createdAt: "asc" } });
  return toCsv([
    ["email", "status", "consent_at", "confirmed_at", "unsubscribed_at", "source", "consent_text"],
    ...subs.map((s) => [s.email, s.status, s.consentAt.toISOString(), s.confirmedAt?.toISOString(), s.unsubscribedAt?.toISOString(), s.source, s.consentText]),
  ]);
}
