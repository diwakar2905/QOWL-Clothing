"use client";

import { createContext, useActionState, useContext, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./button";
import { FormMessage } from "./form";
import { useToast } from "./toast";
import type { ActionResult } from "@/server/api";

type Action = (prev: ActionResult<unknown> | null, form: FormData) => Promise<ActionResult<unknown>>;
const FieldErrors = createContext<Record<string, string>>({});
export const useFieldError = (name: string) => useContext(FieldErrors)[name];

/**
 * Progressive-enhancement form bound to a server action returning
 * ActionResult. Shows field errors (via context), a summary message, and an
 * optional toast on success.
 */
export function ActionForm({
  action,
  children,
  submitLabel = "Save",
  className,
  toast = true,
  resetOnSuccess,
  refresh = true,
  submitVariant = "primary",
  confirm,
  extraButtons,
}: {
  action: Action;
  children: ReactNode;
  submitLabel?: string;
  className?: string;
  toast?: boolean;
  resetOnSuccess?: boolean;
  refresh?: boolean;
  submitVariant?: "primary" | "outline" | "danger";
  confirm?: string;
  extraButtons?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const { push } = useToast();
  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      if (toast) push("success", state.message ?? "Saved.");
      if (resetOnSuccess) ref.current?.reset();
      if (refresh) router.refresh();
    }
  }, [state, toast, push, resetOnSuccess, refresh, router]);
  const fields = state && !state.ok ? state.error.fields ?? {} : {};
  return (
    <FieldErrors.Provider value={fields}>
      <form
        ref={ref}
        action={formAction}
        className={className}
        noValidate
        onSubmit={(e) => {
          if (confirm && !window.confirm(confirm)) e.preventDefault();
        }}
      >
        {children}
        {state && !state.ok && (
          <div className="mt-4">
            <FormMessage>{Object.keys(fields).length ? `${state.error.message} ${Object.entries(fields).filter(([k]) => k === "_" || !k).map(([, v]) => v).join(" ")}` : state.error.message}</FormMessage>
          </div>
        )}
        {state?.ok && !toast && state.message && <div className="mt-4"><FormMessage tone="success">{state.message}</FormMessage></div>}
        <div className="mt-5 flex flex-wrap gap-3">
          <Button type="submit" loading={pending} variant={submitVariant}>{submitLabel}</Button>
          {extraButtons}
        </div>
      </form>
    </FieldErrors.Provider>
  );
}
