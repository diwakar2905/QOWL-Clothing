import "server-only";

export type GatewayPaymentStatus = "created" | "authorized" | "captured" | "failed" | "refunded";

export type GatewayPayment = {
  id: string;
  orderId: string;
  status: GatewayPaymentStatus;
  amount: number;
  currency: string;
  method?: string | null;
  errorCode?: string | null;
  errorDescription?: string | null;
};

export type GatewayRefund = { id: string; paymentId: string; amount: number; status: "pending" | "processed" | "failed" };

export type NormalisedEvent =
  | { kind: "payment.captured" | "payment.authorized" | "payment.failed" | "order.paid"; eventId: string; payment: GatewayPayment }
  | { kind: "refund.processed" | "refund.failed" | "refund.created"; eventId: string; refund: GatewayRefund }
  | { kind: "ignored"; eventId: string; type: string };

export interface PaymentGateway {
  readonly name: "razorpay" | "mock";
  createOrder(input: { amount: number; currency: "INR"; receipt: string; notes: Record<string, string> }): Promise<{ id: string; amount: number }>;
  verifyCheckoutSignature(input: { orderId: string; paymentId: string; signature: string }): boolean;
  fetchPayment(paymentId: string): Promise<GatewayPayment>;
  fetchOrderPayments(orderId: string): Promise<GatewayPayment[]>;
  capture(paymentId: string, amount: number): Promise<GatewayPayment>;
  refund(input: { paymentId: string; amount: number; receipt: string; notes: Record<string, string> }): Promise<GatewayRefund>;
  verifyWebhook(rawBody: string, signature: string | null): boolean;
  parseWebhook(rawBody: string, headers: Headers): NormalisedEvent;
  publicConfig(): { provider: "razorpay" | "mock"; keyId?: string };
}

export class GatewayError extends Error {
  constructor(message: string, public status?: number, public retriable = false) {
    super(message);
    this.name = "GatewayError";
  }
}
