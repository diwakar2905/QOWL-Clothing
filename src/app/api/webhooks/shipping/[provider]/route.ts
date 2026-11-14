import { NextResponse } from "next/server";
import { handleShippingWebhook } from "@/server/services/fulfillment";
import { toApiError } from "@/server/api";

export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  try {
    const raw = await req.text();
    if (raw.length > 256 * 1024) return NextResponse.json({ ok: false }, { status: 413 });
    const r = await handleShippingWebhook(provider, JSON.parse(raw), req.headers);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const { status, error } = toApiError(e);
    return NextResponse.json({ ok: false, error: error.code }, { status: status === 500 ? 500 : status });
  }
}
