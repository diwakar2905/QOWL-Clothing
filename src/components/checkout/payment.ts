"use client";

import { api } from "@/lib/client-api";

export type PaymentInit = { provider: "razorpay" | "mock"; keyId?: string; providerOrderId: string; amount: number; currency: "INR"; prefill: { name: string; email: string; contact: string } };
type GatewayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
export type PaymentOutcome = { status: "paid" | "on_hold" } | { status: "failed" | "dismissed"; message: string };

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void; on: (ev: string, cb: (r: { error?: { description?: string } }) => void) => void };
  }
}

function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Couldn't load the payment window. Check your connection and try again."));
    document.body.appendChild(s);
  });
}

async function verify(r: GatewayResponse): Promise<PaymentOutcome> {
  // Server verifies the signature AND fetches the payment from the gateway.
  const res = await api<{ status: string }>("/api/payments/verify", { body: r });
  if (res.status === "paid" || res.status === "on_hold") return { status: res.status };
  if (res.status === "failed") return { status: "failed", message: "Your payment didn't go through. You haven't been charged by us." };
  return { status: "paid" };
}

export async function runPayment(init: PaymentInit, mock?: (providerOrderId: string) => Promise<"success" | "failure" | "dismissed">): Promise<PaymentOutcome> {
  if (init.provider === "mock") {
    const choice = mock ? await mock(init.providerOrderId) : "dismissed";
    if (choice === "dismissed") {
      await api("/api/payments/failed", { body: { providerOrderId: init.providerOrderId } }).catch(() => {});
      return { status: "dismissed", message: "Payment was cancelled. Your items are held for a few minutes." };
    }
    const r = await api<GatewayResponse & { status: string; error: string | null }>("/api/payments/mock/simulate", { body: { providerOrderId: init.providerOrderId, outcome: choice } });
    if (r.status === "failed") {
      await api("/api/payments/failed", { body: { providerOrderId: init.providerOrderId } }).catch(() => {});
      return { status: "failed", message: r.error ?? "Payment failed." };
    }
    return verify(r);
  }

  await loadRazorpay();
  return new Promise<PaymentOutcome>((resolve) => {
    let settled = false;
    const done = (o: PaymentOutcome) => {
      if (!settled) {
        settled = true;
        resolve(o);
      }
    };
    const rzp = new window.Razorpay!({
      key: init.keyId,
      amount: init.amount,
      currency: init.currency,
      order_id: init.providerOrderId,
      name: "QOWL",
      description: "Order payment",
      image: "/brand/icon-512.png",
      prefill: init.prefill,
      theme: { color: "#073D2D" },
      handler: (resp: GatewayResponse) => {
        verify(resp).then(done).catch((e: Error) => done({ status: "failed", message: e.message }));
      },
      modal: {
        ondismiss: () => {
          api("/api/payments/failed", { body: { providerOrderId: init.providerOrderId } }).catch(() => {});
          done({ status: "dismissed", message: "Payment window closed. Your items are held for a few minutes." });
        },
      },
    });
    rzp.on("payment.failed", (r) => {
      // Razorpay lets the customer retry inside the modal; record and wait for dismiss/success.
      api("/api/payments/failed", { body: { providerOrderId: init.providerOrderId } }).catch(() => {});
      void r;
    });
    rzp.open();
  });
}
