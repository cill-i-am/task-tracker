/* oxlint-disable eslint/max-classes-per-file */

import { Context, Effect, Schema } from "effect";

import type { AuthEmailDeliveryError } from "./auth-email-errors.js";
import { PasswordResetDeliveryError } from "./auth-email-errors.js";

const EmailAddress = Schema.String.pipe(
  Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
);

const AbsoluteUrl = Schema.String.pipe(Schema.pattern(/^https?:\/\//));

export const PasswordResetEmailInput = Schema.Struct({
  recipientEmail: EmailAddress,
  recipientName: Schema.String,
  resetUrl: AbsoluteUrl,
});

export type PasswordResetEmailInput = Schema.Schema.Type<
  typeof PasswordResetEmailInput
>;

export interface TransportMessage {
  readonly html: string;
  readonly subject: string;
  readonly text: string;
  readonly to: string;
}

export class AuthEmailTransport extends Context.Tag(
  "@task-tracker/domains/identity/authentication/AuthEmailTransport"
)<
  AuthEmailTransport,
  {
    readonly send: (
      message: TransportMessage
    ) => Effect.Effect<void, AuthEmailDeliveryError>;
  }
>() {}

export class AuthEmailSender extends Effect.Service<AuthEmailSender>()(
  "@task-tracker/domains/identity/authentication/AuthEmailSender",
  {
    accessors: true,
    effect: Effect.gen(function* effect() {
      const transport = yield* AuthEmailTransport;

      const sendPasswordResetEmail = Effect.fn(
        "AuthEmailSender.sendPasswordResetEmail"
      )(function* sendPasswordResetEmail(input: PasswordResetEmailInput) {
        const subject = "Reset your password";
        const text = [
          `Hello ${input.recipientName},`,
          "",
          "Use this link to reset your password:",
          input.resetUrl,
        ].join("\n");
        const html = [
          `<p>Hello ${input.recipientName},</p>`,
          `<p><a href="${input.resetUrl}">Reset your password</a></p>`,
        ].join("");

        yield* transport
          .send({
            to: input.recipientEmail,
            subject,
            text,
            html,
          })
          .pipe(
            Effect.mapError(
              (error) =>
                new PasswordResetDeliveryError({
                  message: "Failed to deliver password reset email",
                  recipientEmail: input.recipientEmail,
                  cause: error.message,
                })
            )
          );
      });

      return { sendPasswordResetEmail };
    }),
  }
) {}
