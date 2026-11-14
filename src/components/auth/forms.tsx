"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, FormMessage, Input } from "@/components/ui/form";
import { forgotPasswordAction, loginAction, registerAction, resetPasswordAction, adminLoginAction } from "@/server/actions/auth";
import type { ActionResult } from "@/server/api";

type S = ActionResult<unknown> | null;
const fieldErr = (s: S, k: string) => (s && !s.ok ? s.error.fields?.[k] : undefined);
const formErr = (s: S) => (s && !s.ok && !s.error.fields ? s.error.message : null);

export function LoginForm({ next, staff }: { next?: string; staff?: boolean }) {
  const [state, action, pending] = useActionState<S, FormData>(staff ? adminLoginAction : loginAction, null);
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <Input name="email" type="email" label="Email" autoComplete="email" required error={fieldErr(state, "email")} />
      <Input name="password" type="password" label="Password" autoComplete="current-password" required error={fieldErr(state, "password")} />
      {formErr(state) && <FormMessage>{formErr(state)}</FormMessage>}
      <Button type="submit" className="w-full" size="lg" loading={pending}>Sign in</Button>
      {!staff && (
        <div className="flex justify-between text-sm">
          <Link href="/forgot-password" className="link-underline">Forgot password?</Link>
          <Link href={`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-forest link-underline">Create an account</Link>
        </div>
      )}
    </form>
  );
}

export function RegisterForm({ next, email }: { next?: string; email?: string }) {
  const [state, action, pending] = useActionState<S, FormData>(registerAction, null);
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <Input name="name" label="Full name" autoComplete="name" required error={fieldErr(state, "name")} />
      <Input name="email" type="email" label="Email" autoComplete="email" defaultValue={email} required error={fieldErr(state, "email")} />
      <Input name="password" type="password" label="Password" autoComplete="new-password" required hint="At least 10 characters, with letters and a number or symbol." error={fieldErr(state, "password")} />
      <Checkbox name="marketingOptIn" label="Email me about new drops and releases. I can unsubscribe anytime." />
      {formErr(state) && <FormMessage>{formErr(state)}</FormMessage>}
      <Button type="submit" className="w-full" size="lg" loading={pending}>Create account</Button>
      <p className="text-center text-xs text-stone">By creating an account you agree to our <Link href="/pages/terms-of-service" className="underline">Terms</Link> and <Link href="/pages/privacy-policy" className="underline">Privacy Policy</Link>.</p>
      <p className="text-center text-sm">Already have an account? <Link href="/login" className="text-forest link-underline">Sign in</Link></p>
    </form>
  );
}

export function ForgotForm() {
  const [state, action, pending] = useActionState<S, FormData>(forgotPasswordAction, null);
  if (state?.ok) return <FormMessage tone="success">{state.message}</FormMessage>;
  return (
    <form action={action} className="space-y-5" noValidate>
      <Input name="email" type="email" label="Email" autoComplete="email" required error={fieldErr(state, "_") ?? fieldErr(state, "email")} />
      {formErr(state) && <FormMessage>{formErr(state)}</FormMessage>}
      <Button type="submit" className="w-full" size="lg" loading={pending}>Send reset link</Button>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<S, FormData>(resetPasswordAction, null);
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="token" value={token} />
      <Input name="password" type="password" label="New password" autoComplete="new-password" required hint="At least 10 characters, with letters and a number or symbol." error={fieldErr(state, "_")} />
      <Input name="confirm" type="password" label="Confirm password" autoComplete="new-password" required error={fieldErr(state, "confirm")} />
      {formErr(state) && <FormMessage>{formErr(state)}</FormMessage>}
      <Button type="submit" className="w-full" size="lg" loading={pending}>Set new password</Button>
    </form>
  );
}
