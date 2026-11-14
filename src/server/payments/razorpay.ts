import "server-only";
import { hmacSha256Hex, safeEqual, sha256 } from "@/lib/crypto";
import { GatewayError, type GatewayPayment, type GatewayRefund, type NormalisedEvent, type PaymentGateway } from "./gateway";

const API = "https://api.razorpay.com/v1";

type RzpPayment = { id: string; order_id: string; status: string; amount: number; currency: string; method?: string; error_code?: string | null; error_description?: string | null };
type RzpRefund = { id: string; payment_id: string; amount: number; status: string };

function mapPayment(p: RzpPayment): GatewayPayment {
  const status = (["created", "authorized", "captured", "failed", "refunded"].includes(p.status) ? p.status : "created") as GatewayPayment["status"];
  return { id: p.id, orderId: p.order_id, status, amount: p.amount, currency: p.currency, method: p.method ?? null, errorCode: p.error_code ?? null, errorDescription: p.error_description ?? null };
}
function mapRefund(r: RzpRefund): GatewayRefund {
  return { id: r.id, paymentId: r.payment_id, amount: r.amount, status: r.status === "processed" ? "processed" : r.status === "failed" ? "failed" : "pending" };
}

/**
 * Razorpay Orders/Payments/Refunds REST integration.
 * Docs: https://razorpay.com/docs/api/ — verified against the published
 * signature algorithms; live/sandbox calls require keys (see docs/INTEGRATIONS.md).
 */
export class RazorpayGateway implements PaymentGateway {
  readonly name = "razorpay" as const;
  constructor(private keyId: string, private keySecret: string, private webhookSecret: string, private fetchImpl: typeof fetch = fetch) {}

  private async call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    }).catch((e: Error) => {
      throw new GatewayError(`Razorpay network error: ${e.message}`, undefined, true);
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = text.slice(0, 300);
      try {
        msg = (JSON.parse(text) as { error?: { description?: string } }).error?.description ?? msg;
      } catch {}
      throw new GatewayError(`Razorpay ${res.status}: ${msg}`, res.status, res.status >= 500);
    }
    return JSON.parse(text) as T;
  }

  async createOrder(i: { amount: number; currency: "INR"; receipt: string; notes: Record<string, string> }) {
    const o = await this.call<{ id: string; amount: number }>("POST", "/orders", { amount: i.amount, currency: i.currency, receipt: i.receipt.slice(0, 40), notes: i.notes, payment_capture: 1 });
    return { id: o.id, amount: o.amount };
  }

  verifyCheckoutSignature(i: { orderId: string; paymentId: string; signature: string }) {
    if (!i.signature || !/^[a-f0-9]{64}$/.test(i.signature)) return false;
    return safeEqual(hmacSha256Hex(this.keySecret, `${i.orderId}|${i.paymentId}`), i.signature);
  }

  async fetchPayment(id: string) {
    return mapPayment(await this.call<RzpPayment>("GET", `/payments/${encodeURIComponent(id)}`));
  }

  async fetchOrderPayments(orderId: string) {
    const r = await this.call<{ items: RzpPayment[] }>("GET", `/orders/${encodeURIComponent(orderId)}/payments`);
    return r.items.map(mapPayment);
  }

  async capture(paymentId: string, amount: number) {
    return mapPayment(await this.call<RzpPayment>("POST", `/payments/${encodeURIComponent(paymentId)}/capture`, { amount, currency: "INR" }));
  }

  async refund(i: { paymentId: string; amount: number; receipt: string; notes: Record<string, string> }) {
    return mapRefund(await this.call<RzpRefund>("POST", `/payments/${encodeURIComponent(i.paymentId)}/refund`, { amount: i.amount, speed: "normal", receipt: i.receipt.slice(0, 40), notes: i.notes }));
  }

  verifyWebhook(rawBody: string, signature: string | null) {
    if (!signature || !/^[a-f0-9]{64}$/.test(signature)) return false;
    return safeEqual(hmacSha256Hex(this.webhookSecret, rawBody), signature);
  }

  parseWebhook(rawBody: string, headers: Headers): NormalisedEvent {
    const body = JSON.parse(rawBody) as { event: string; payload: { payment?: { entity: RzpPayment }; refund?: { entity: RzpRefund }; order?: { entity: { id: string } } } };
    // Razorpay sends a unique x-razorpay-event-id per event; fall back to a body hash.
    const eventId = headers.get("x-razorpay-event-id") ?? `sha256:${sha256(rawBody)}`;
    switch (body.event) {
      case "payment.captured":
      case "payment.authorized":
      case "payment.failed":
      case "order.paid":
        if (!body.payload.payment) return { kind: "ignored", eventId, type: body.event };
        return { kind: body.event, eventId, payment: mapPayment(body.payload.payment.entity) };
      case "refund.processed":
      case "refund.failed":
      case "refund.created":
        if (!body.payload.refund) return { kind: "ignored", eventId, type: body.event };
        return { kind: body.event, eventId, refund: mapRefund(body.payload.refund.entity) };
      default:
        return { kind: "ignored", eventId, type: body.event };
    }
  }

  publicConfig() {
    return { provider: "razorpay" as const, keyId: this.keyId };
  }
}
