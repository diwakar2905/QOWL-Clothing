"use client";

import type { ComponentProps } from "react";
import { Input, Select, Textarea, Checkbox } from "./form";
import { useFieldError } from "./action-form";

/** Inputs that pick up server-side field errors from the surrounding ActionForm. */
export function AInput(props: ComponentProps<typeof Input> & { name: string }) {
  const err = useFieldError(props.name);
  return <Input {...props} error={props.error ?? err} />;
}
export function ATextarea(props: ComponentProps<typeof Textarea> & { name: string }) {
  const err = useFieldError(props.name);
  return <Textarea {...props} error={props.error ?? err} />;
}
export function ASelect(props: ComponentProps<typeof Select> & { name: string }) {
  const err = useFieldError(props.name);
  return <Select {...props} error={props.error ?? err} />;
}
export function ACheckbox(props: ComponentProps<typeof Checkbox> & { name: string }) {
  const err = useFieldError(props.name);
  return <Checkbox {...props} error={props.error ?? err} />;
}
