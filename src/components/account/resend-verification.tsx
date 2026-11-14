"use client";

import { useState, useTransition } from "react";
import { resendVerificationAction } from "@/server/actions/auth";

export function ResendVerification() {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return msg ? (
    <span className="text-xs">{msg}</span>
  ) : (
    <button type="button" disabled={pending} className="label link-underline text-forest" onClick={() => start(async () => { const r = await resendVerificationAction(); setMsg(r.ok ? r.message ?? "Sent." : r.error.message); })}>
      Resend link
    </button>
  );
}
