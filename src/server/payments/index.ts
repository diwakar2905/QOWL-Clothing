import "server-only";
import { env } from "@/lib/env";
import type { PaymentGateway } from "./gateway";
import { RazorpayGateway } from "./razorpay";
import { MockGateway } from "./mock";

let instance: PaymentGateway | undefined;

export function getGateway(): PaymentGateway {
  if (instance) return instance;
  if (env.PAYMENT_PROVIDER === "mock") {
    if (env.NODE_ENV === "production") throw new Error("Mock payment gateway is disabled in production");
    instance = new MockGateway(env.MOCK_PAYMENT_SECRET!);
  } else {
    instance = new RazorpayGateway(env.RAZORPAY_KEY_ID!, env.RAZORPAY_KEY_SECRET!, env.RAZORPAY_WEBHOOK_SECRET!);
  }
  return instance;
}

export function getGatewayByName(name: string): PaymentGateway | null {
  const g = getGateway();
  return g.name === name ? g : null;
}

/** Test hook. */
export function __setGateway(g: PaymentGateway | undefined) {
  instance = g;
}

export { MockGateway } from "./mock";
export type { PaymentGateway } from "./gateway";
