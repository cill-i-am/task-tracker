import { useForm } from "@tanstack/react-form";
import { Link, useNavigate } from "@tanstack/react-router";
import { Schema } from "effect";

import { Button, buttonVariants } from "#/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#/components/ui/empty";
import { FieldError, FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { authClient } from "#/lib/auth-client";

import {
  getErrorText,
  getFormErrorText,
  getPasswordResetFailureMessage,
  isInvalidPasswordResetTokenError,
} from "./auth-form-errors";
import { AuthFormField } from "./auth-form-field";
import {
  getForgotPasswordNavigationTarget,
  getLoginNavigationTarget,
} from "./auth-navigation";
import { decodePasswordResetInput, passwordResetSchema } from "./auth-schemas";
import { EntryShell, EntrySurfaceCard } from "./entry-shell";
import { decodePasswordResetSearch } from "./password-reset-search";
import type { PasswordResetSearch } from "./password-reset-search";

interface PasswordResetPageProps {
  readonly search?: PasswordResetSearch;
}

export function PasswordResetPage({ search }: PasswordResetPageProps) {
  const navigate = useNavigate();
  const normalizedSearch: PasswordResetSearch = decodePasswordResetSearch(
    search ?? {}
  );
  const { invitation, token } = normalizedSearch;
  const isInvitationFlow = Boolean(invitation);

  const form = useForm({
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
    validators: {
      onSubmit: Schema.standardSchemaV1(passwordResetSchema),
    },
    onSubmit: async ({ formApi, value }) => {
      if (!token) {
        return;
      }

      formApi.setErrorMap({
        onSubmit: undefined,
      });

      const input = decodePasswordResetInput(value);
      const result = await authClient.resetPassword({
        token,
        newPassword: input.password,
      });

      if (result.error) {
        if (isInvalidPasswordResetTokenError(result.error)) {
          await navigate({
            to: "/reset-password",
            search: {
              error: "INVALID_TOKEN",
              invitation,
              token: undefined,
            },
          });
          return;
        }

        formApi.setErrorMap({
          onSubmit: {
            form: getPasswordResetFailureMessage(result.error),
            fields: {},
          },
        });

        return;
      }

      await navigate(getLoginNavigationTarget(invitation));
    },
  });

  if (!token) {
    return (
      <EntryShell
        badge={isInvitationFlow ? "Invitation support" : "Password reset"}
        title="This reset link isn't valid anymore."
        description="Request a fresh link, then come back with a new password."
        supportingContent={
          <div className="flex flex-col gap-8">
            <div className="space-y-3">
              <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
                Recovery checkpoint
              </p>
              <p className="max-w-[48ch] text-sm/7 text-foreground/90">
                {isInvitationFlow
                  ? "A fresh reset link will send you back through the invited account flow once you set a new password."
                  : "Reset links expire. Request a new one to get back into the app safely."}
              </p>
            </div>

            <ol className="grid gap-4 text-sm/6 text-muted-foreground">
              <li className="border-t border-border/60 pt-4">
                1. Request the newest reset email.
              </li>
              <li className="border-t border-border/60 pt-4">
                2. Open the fresh link instead of an older email.
              </li>
              <li className="border-t border-border/60 pt-4">
                3.{" "}
                {isInvitationFlow
                  ? "Continue back to the invitation."
                  : "Sign in with the new password."}
              </li>
            </ol>
          </div>
        }
      >
        <EntrySurfaceCard
          badge="Expired link"
          className="max-w-lg"
          title="Reset link expired"
          description="This password reset link is invalid or has expired."
          footer={
            <div className="flex flex-col gap-3">
              <Link
                {...getForgotPasswordNavigationTarget(invitation)}
                className={buttonVariants({
                  className: "w-full",
                })}
              >
                Request a new reset link
              </Link>
              <Link
                {...getLoginNavigationTarget(invitation)}
                className={buttonVariants({
                  variant: "outline",
                  className: "w-full",
                })}
              >
                Back to login
              </Link>
            </div>
          }
        >
          <Empty className="min-h-0 bg-muted/20 px-6 py-8">
            <EmptyHeader>
              <EmptyTitle>Start again with a fresh link</EmptyTitle>
              <EmptyDescription>
                Request a new reset link to continue, or return to login.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </EntrySurfaceCard>
      </EntryShell>
    );
  }

  return (
    <EntryShell
      badge={isInvitationFlow ? "Invitation support" : "Password reset"}
      title="Choose a new password."
      description={
        isInvitationFlow
          ? "Save a new password, then continue back into the invitation flow."
          : "Save a new password, then sign back into the app."
      }
      supportingContent={
        <div className="flex flex-col gap-8">
          <div className="space-y-3">
            <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
              Finish recovery
            </p>
            <p className="max-w-[48ch] text-sm/7 text-foreground/90">
              {isInvitationFlow
                ? "Use a new password for the invited account, then continue right back to the workspace invitation."
                : "Choose a password you can reuse confidently the next time you sign in."}
            </p>
          </div>

          <dl className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-1 border-t border-border/60 pt-4">
              <dt className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
                Password rule
              </dt>
              <dd className="text-sm/6 text-muted-foreground">
                Use at least 8 characters.
              </dd>
            </div>

            <div className="space-y-1 border-t border-border/60 pt-4">
              <dt className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
                After save
              </dt>
              <dd className="text-sm/6 text-muted-foreground">
                {isInvitationFlow
                  ? "You'll return to sign in and continue the invitation."
                  : "You'll return to sign in with the new password."}
              </dd>
            </div>
          </dl>
        </div>
      }
    >
      <EntrySurfaceCard
        badge="Choose a new password"
        className="max-w-lg"
        title="Reset password"
        description="Choose a new password to finish signing in."
        footer={
          <Link
            {...getLoginNavigationTarget(invitation)}
            className={buttonVariants({
              variant: "link",
              className: "h-auto justify-start p-0 text-muted-foreground",
            })}
          >
            Back to login
          </Link>
        }
      >
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
            <form.Field name="password">
              {(field) => {
                const errorText = getErrorText(field.state.meta.errors);

                return (
                  <AuthFormField
                    label="New password"
                    htmlFor="password"
                    invalid={Boolean(errorText)}
                    descriptionText="Use 8 or more characters."
                    errorText={errorText}
                  >
                    <Input
                      id="password"
                      name={field.name}
                      type="password"
                      autoComplete="new-password"
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

            <form.Field name="confirmPassword">
              {(field) => {
                const errorText = getErrorText(field.state.meta.errors);

                return (
                  <AuthFormField
                    label="Confirm password"
                    htmlFor="confirmPassword"
                    invalid={Boolean(errorText)}
                    errorText={errorText}
                  >
                    <Input
                      id="confirmPassword"
                      name={field.name}
                      type="password"
                      autoComplete="new-password"
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
                {isSubmitting ? "Resetting password..." : "Reset password"}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </EntrySurfaceCard>
    </EntryShell>
  );
}
