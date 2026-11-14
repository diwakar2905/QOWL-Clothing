import { NextResponse } from "next/server";
import { handlePaymentWebhook } from "@/server/services/payments";
import { flushOutboxSoon, toApiError } from "@/server/api";

/** Payment gateway webhooks. Raw body is required for signature verification. */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const raw = await req.text();
  if (raw.length > 512 * 1024) return NextResponse.json({ ok: false }, { status: 413 });
  const sig = provider === "razorpay" ? req.headers.get("x-razorpay-signature") : req.headers.get("x-mock-signature");
  try {
    const r = await handlePaymentWebhook(provider, raw, req.headers, sig);
    flushOutboxSoon();
    return NextResponse.json({ ok: true, duplicate: r.duplicate });
  } catch (e) {
    const { status, error } = toApiError(e);
    return NextResponse.json({ ok: false, error: error.code }, { status });
  }
}
