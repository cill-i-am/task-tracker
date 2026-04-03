import type { ReactNode } from "react";

import { Field, FieldError, FieldLabel } from "#/components/ui/field";

export function AuthFormField(props: {
  readonly label: string;
  readonly htmlFor: string;
  readonly invalid: boolean;
  readonly errorText?: string;
  readonly children: ReactNode;
}) {
  const { children, errorText, htmlFor, invalid, label } = props;

  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      {children}
      {errorText ? <FieldError errors={[{ message: errorText }]} /> : null}
    </Field>
  );
}
