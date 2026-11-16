import "server-only";
import { SUPPORT_EMAIL } from "@/lib/brand";
import { logger } from "@/lib/logger";

export interface EmailMessage { to: string; subject: string; html: string; text: string }
export interface EmailProvider { name: string; send(msg: EmailMessage): Promise<{ id?: string }> }

class ConsoleEmailProvider implements EmailProvider {
  name = "console";
  async send(msg: EmailMessage) {
    logger.info("email.console", { to: msg.to, subject: msg.subject, text: msg.text.slice(0, 2000) });
    return {};
  }
}

class ResendEmailProvider implements EmailProvider {
  name = "resend";
  constructor(private apiKey: string, private from: string, private replyTo?: string) {}
  async send(msg: EmailMessage) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text, reply_to: this.replyTo }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { id?: string };
    return { id: body.id };
  }
}

export function getEmailProvider(): EmailProvider {
  if (process.env.EMAIL_PROVIDER === "resend" && process.env.RESEND_API_KEY) {
    return new ResendEmailProvider(process.env.RESEND_API_KEY, process.env.EMAIL_FROM || `QOWL <${SUPPORT_EMAIL}>`, process.env.EMAIL_REPLY_TO || SUPPORT_EMAIL);
  }
  return new ConsoleEmailProvider();
}

/** SMS/WhatsApp interface. No provider is configured until DLT templates and consent flows are approved. */
export interface MessagingProvider { name: string; send(to: string, templateKey: string, vars: Record<string, string>): Promise<void> }
export function getMessagingProvider(): MessagingProvider | null {
  return null;
}
