import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { runJobs } from "@/server/jobs";

/** Scheduler entry point. Protected by CRON_SECRET (Authorization: Bearer ...). */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, result: await runJobs() });
}
export const GET = POST;
