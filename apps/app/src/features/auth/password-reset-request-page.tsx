import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { Schema } from "effect";
import { useState } from "react";

import { Button, buttonVariants } from "#/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#/components/ui/empty";
import { FieldError, FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { authClient, buildPasswordResetRedirectTo } from "#/lib/auth-client";

import type { InvitationContinuationSearch } from "../organizations/invitation-continuation";
import {
  getErrorText,
  getFormErrorText,
  getPasswordResetRequestFailureMessage,
} from "./auth-form-errors";
import { AuthFormField } from "./auth-form-field";
import { getLoginNavigationTarget } from "./auth-navigation";
import type { LoginNavigationTarget } from "./auth-navigation";
import {
  decodePasswordResetRequestInput,
  passwordResetRequestSchema,
} from "./auth-schemas";
import { EntryShell, EntrySurfaceCard } from "./entry-shell";

const successCopy =
  "If an account exists for that email, a reset link will be sent.";

export function PasswordResetRequestPage({
  search,
}: {
  readonly search?: InvitationContinuationSearch;
}) {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const loginNavigationTarget: LoginNavigationTarget = getLoginNavigationTarget(
    search?.invitation
  );
  const isInvitationFlow = Boolean(search?.invitation);
  let shellDescription =
    "We'll send a reset link so you can choose a new password and get back in.";

  if (isInvitationFlow && isSubmitted) {
    shellDescription =
      "Use the latest reset email, then continue back into the invitation flow.";
  } else if (isInvitationFlow) {
    shellDescription =
      "Request a new reset link for the invited account and keep the handoff moving.";
  } else if (isSubmitted) {
    shellDescription = "Use the latest reset email to choose a new password.";
  }
  const form = useForm({
    defaultValues: {
      email: "",
    },
    validators: {
      onSubmit: Schema.standardSchemaV1(passwordResetRequestSchema),
    },
    onSubmit: async ({ formApi, value }) => {
      formApi.setErrorMap({
        onSubmit: undefined,
      });

      const input = decodePasswordResetRequestInput(value);
      const result = await authClient.requestPasswordReset({
        email: input.email,
        redirectTo: buildPasswordResetRedirectTo(
          window.location.origin,
          search?.invitation
        ),
      });

      if (result.error) {
        formApi.setErrorMap({
          onSubmit: {
            form: getPasswordResetRequestFailureMessage(result.error),
            fields: {},
          },
        });

        return;
      }

      setIsSubmitted(true);
    },
  });

  return (
    <EntryShell
      badge={isInvitationFlow ? "Invitation support" : "Password reset"}
      title={isSubmitted ? "Check your email." : "Reset your password."}
      description={shellDescription}
      supportingContent={
        <div className="flex flex-col gap-8">
          <div className="space-y-3">
            <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
              {isSubmitted ? "What to do next" : "Recovery flow"}
            </p>
            <p className="max-w-[48ch] text-sm/7 text-foreground/90">
              {isInvitationFlow
                ? "The reset link will bring you back through the invited account flow, so you can finish the setup with the right email."
                : "Reset links are the fastest way back into the app when you can't sign in with your current password."}
            </p>
          </div>

          <ol className="grid gap-4 text-sm/6 text-muted-foreground">
            <li className="border-t border-border/60 pt-4">
              1. Check your inbox for the newest reset email.
            </li>
            <li className="border-t border-border/60 pt-4">
              2. Open the link and choose a fresh password.
            </li>
            <li className="border-t border-border/60 pt-4">
              3.{" "}
              {isInvitationFlow
                ? "Continue back to the invitation."
                : "Sign back into the app."}
            </li>
          </ol>
        </div>
      }
    >
      <EntrySurfaceCard
        badge={isSubmitted ? "Email sent" : "Password reset"}
        className="max-w-lg"
        title={isSubmitted ? "Check your email" : "Forgot password?"}
        description={
          isSubmitted
            ? "Use the reset link in your inbox to continue."
            : "Enter your email and we'll send you a reset link."
        }
        footer={
          <Link
            {...loginNavigationTarget}
            className={buttonVariants({
              variant: isSubmitted ? "default" : "link",
              className: isSubmitted
                ? "w-full"
                : "h-auto justify-start p-0 text-muted-foreground",
            })}
          >
            Back to login
          </Link>
        }
      >
        {isInvitationFlow && !isSubmitted ? (
          <div className="rounded-2xl border border-border/70 bg-muted/35 px-4 py-3 text-sm/6 text-muted-foreground">
            Use the email address tied to the invitation so you can continue the
            handoff once the reset is complete.
          </div>
        ) : null}

        {isSubmitted ? (
          <Empty className="min-h-0 bg-muted/20 px-6 py-8">
            <EmptyHeader>
              <EmptyTitle>Reset link sent</EmptyTitle>
              <EmptyDescription>{successCopy}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <form
            className="flex flex-col gap-6"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <FieldGroup>
              <form.Field name="email">
                {(field) => {
                  const errorText = getErrorText(field.state.meta.errors);

                  return (
                    <AuthFormField
                      label="Email"
                      htmlFor="email"
                      invalid={Boolean(errorText)}
                      errorText={errorText}
                    >
                      <Input
                        id="email"
                        name={field.name}
                        type="email"
                        autoComplete="email"
                        placeholder="m@example.com"
                        value={field.state.value}
                        aria-invalid={Boolean(errorText) || undefined}
                        onBlur={field.handleBlur}
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                      />
                    </AuthFormField>
                  );
                }}
              </form.Field>
            </FieldGroup>

            <form.Subscribe selector={(state) => state.errorMap.onSubmit}>
              {(error) =>
                getFormErrorText(error) ? (
                  <FieldError>{getFormErrorText(error)}</FieldError>
                ) : null
              }
            </form.Subscribe>

            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Sending reset link..." : "Send reset link"}
                </Button>
              )}
            </form.Subscribe>
          </form>
        )}
      </EntrySurfaceCard>
    </EntryShell>
  );
}
