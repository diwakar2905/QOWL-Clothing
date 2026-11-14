"use client";

import type { ComponentProps } from "react";
import { Input, Select, Textarea, Checkbox } from "./form";
import { useFieldError } from "./action-form";

/** Inputs that pick up server-side field errors from the surrounding ActionForm. */
export function AInput(props: ComponentProps<typeof Input> & { name: string }) {
  return <Input {...props} error={props.error ?? useFieldError(props.name)} />;
}
export function ATextarea(props: ComponentProps<typeof Textarea> & { name: string }) {
  return <Textarea {...props} error={props.error ?? useFieldError(props.name)} />;
}
export function ASelect(props: ComponentProps<typeof Select> & { name: string }) {
  return <Select {...props} error={props.error ?? useFieldError(props.name)} />;
}
export function ACheckbox(props: ComponentProps<typeof Checkbox> & { name: string }) {
  return <Checkbox {...props} error={props.error ?? useFieldError(props.name)} />;
}
