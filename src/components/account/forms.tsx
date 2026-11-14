"use client";

import { ActionForm } from "@/components/ui/action-form";
import { AInput, ACheckbox } from "@/components/ui/fields";
import { updateProfileAction, changePasswordAction, requestDeletionAction, updatePreferencesAction } from "@/server/actions/account";

export function ProfileForm({ name, phone, marketingOptIn, email }: { name: string; phone: string; marketingOptIn: boolean; email: string }) {
  return (
    <ActionForm action={updateProfileAction} className="space-y-4">
      <AInput name="email" label="Email" value={email} readOnly disabled hint="Contact customer care to change your account email." />
      <AInput name="name" label="Full name" defaultValue={name} autoComplete="name" required />
      <AInput name="phone" label="Mobile number" defaultValue={phone} autoComplete="tel-national" optional />
      <ACheckbox name="marketingOptIn" defaultChecked={marketingOptIn} label="Email me about new drops and releases." />
    </ActionForm>
  );
}

export function PreferencesForm({ optIn }: { optIn: boolean }) {
  return (
    <ActionForm action={updatePreferencesAction}>
      <ACheckbox name="marketingOptIn" defaultChecked={optIn} label="Send me emails about new drops, restocks and exclusive releases." />
    </ActionForm>
  );
}

export function PasswordForm() {
  return (
    <ActionForm action={changePasswordAction} className="space-y-4" resetOnSuccess submitLabel="Change password">
      <AInput name="current" type="password" label="Current password" autoComplete="current-password" required />
      <AInput name="next" type="password" label="New password" autoComplete="new-password" hint="At least 10 characters, with letters and a number or symbol." required />
      <AInput name="confirm" type="password" label="Confirm new password" autoComplete="new-password" required />
    </ActionForm>
  );
}

export function DeletionForm() {
  return (
    <ActionForm action={requestDeletionAction} submitLabel="Request deletion" submitVariant="danger" confirm="Request permanent deletion of your account?">
      <AInput name="confirm" label="Type DELETE to confirm" autoComplete="off" required />
    </ActionForm>
  );
}
