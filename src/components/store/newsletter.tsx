"use client";

import { useState } from "react";
import { api, ApiCallError } from "@/lib/client-api";
import { ArrowRight, Loader2 } from "@/components/ui/icons";
import { Sparkle } from "@/components/ui/icons";
import type { Settings } from "@/server/services/settings";

export function NewsletterBand({ settings }: { settings: Settings["newsletter"] }) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<{ status: "idle" | "loading" | "done" | "error"; message?: string }>({ status: "idle" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consent) return setState({ status: "error", message: "Please tick the consent box to subscribe." });
    setState({ status: "loading" });
    try {
      const r = await api<{ pending: boolean }>("/api/newsletter", { body: { email, consent, source: "footer" } });
      setState({ status: "done", message: r.pending ? "Almost there — check your inbox to confirm your subscription." : "You're subscribed. Welcome to the QOWL world." });
      setEmail("");
    } catch (err) {
      const e2 = err as ApiCallError;
      setState({ status: "error", message: e2.error?.fields?.email ?? e2.message });
    }
  };

  return (
    <section aria-labelledby="newsletter-heading" className="haze on-dark relative overflow-hidden text-ivory">
      <div className="mx-auto max-w-3xl px-5 py-14 text-center sm:py-16">
        <Sparkle className="mx-auto mb-4 h-4 w-4 text-ivory" />
        <h2 id="newsletter-heading" className="display text-4xl sm:text-5xl">{settings.heading}</h2>
        <p className="mt-3 font-serif text-lg italic text-ivory/85">{settings.subheading}</p>
        {state.status === "done" ? (
          <p role="status" className="mx-auto mt-8 max-w-md border border-ivory/30 px-4 py-3 text-sm">{state.message}</p>
        ) : (
          <form onSubmit={submit} noValidate className="mx-auto mt-8 max-w-md text-left">
            <div className="flex">
              <label htmlFor="nl-email" className="sr-only">Email address</label>
              <input
                id="nl-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                aria-invalid={state.status === "error" || undefined}
                aria-describedby="nl-msg"
                className="h-12 min-w-0 flex-1 border border-ivory/50 bg-transparent px-4 text-sm text-ivory placeholder:text-ivory/60 focus:border-ivory focus:outline-none"
              />
              <button type="submit" disabled={state.status === "loading"} className="flex h-12 w-14 items-center justify-center bg-ivory text-forest hover:bg-cream disabled:opacity-60" aria-label="Subscribe">
                {state.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              </button>
            </div>
            <label className="mt-3 flex items-start gap-2.5 text-xs leading-snug text-ivory/80">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-ivory" />
              <span>{settings.consentText}</span>
            </label>
            <p id="nl-msg" role="alert" className="mt-2 min-h-4 text-xs text-[#f3c9c9]">{state.status === "error" ? state.message : ""}</p>
          </form>
        )}
      </div>
    </section>
  );
}
