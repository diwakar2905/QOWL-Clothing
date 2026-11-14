"use client";

import Image from "next/image";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Upload, Loader2 } from "@/components/ui/icons";
import type { ActionResult } from "@/server/api";
import { uploadMediaAction } from "@/server/actions/admin/catalog";

/** Button that invokes a server action, with optional confirmation and toast feedback. */
export function ActionButton({ action, children, confirm, variant = "outline", size = "sm", successMessage, className, disabled }: { action: () => Promise<ActionResult<unknown>>; children: ReactNode; confirm?: string; variant?: "primary" | "outline" | "danger" | "ghost"; size?: "sm" | "md"; successMessage?: string; className?: string; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const { push } = useToast();
  const router = useRouter();
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      loading={pending}
      disabled={disabled}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(async () => {
          const r = await action();
          if (r.ok) {
            push("success", successMessage ?? r.message ?? "Done.");
            router.refresh();
          } else push("error", r.error.message);
        });
      }}
    >
      {children}
    </Button>
  );
}

/** Uploads an image via the media action and stores its URL in a hidden form field. */
export function MediaField({ name, label, defaultValue, folder = "cms", hint }: { name: string; label: string; defaultValue?: string | null; folder?: "cms" | "collections"; hint?: string }) {
  const [url, setUrl] = useState(defaultValue ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium">{label}</p>
      <input type="hidden" name={name} value={url} />
      <div className="flex items-start gap-3">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden border hairline bg-cream">{url && <Image src={url} alt="" fill sizes="96px" className="object-cover" />}</div>
        <div className="flex flex-col gap-2 text-xs">
          <label className="inline-flex cursor-pointer items-center gap-2 border hairline px-3 py-2 hover:border-forest">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} {url ? "Replace" : "Upload"}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" disabled={busy} onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setBusy(true);
              setErr(null);
              const fd = new FormData();
              fd.set("file", f);
              fd.set("folder", folder);
              const r = await uploadMediaAction(fd);
              setBusy(false);
              if (r.ok) setUrl((r.data as { url: string }).url);
              else setErr(r.error.message);
              e.target.value = "";
            }} />
          </label>
          {url && <button type="button" className="text-left text-danger" onClick={() => setUrl("")}>Remove</button>}
          <input value={url} onChange={(e) => setUrl(e.target.value)} className="w-56 border hairline bg-white/60 px-2 py-1" aria-label={`${label} URL`} placeholder="or paste /path or https:// URL" />
          {hint && <span className="text-stone">{hint}</span>}
          {err && <span className="text-danger" role="alert">{err}</span>}
        </div>
      </div>
    </div>
  );
}
