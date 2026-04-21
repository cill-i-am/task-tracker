/* oxlint-disable eslint/max-classes-per-file, unicorn/no-array-method-this-argument */

import { Context, Effect, ParseResult, Schema } from "effect";

import type { AuthEmailDeliveryError } from "./auth-email-errors.js";
import {
  EmailVerificationDeliveryError,
  OrganizationInvitationDeliveryError,
  PasswordResetDeliveryError,
} from "./auth-email-errors.js";

const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_IDEMPOTENCY_KEY_MAX_LENGTH = 256;

function isValidEmailAddress(value: string) {
  return EMAIL_ADDRESS_PATTERN.test(value);
}

function isValidResetUrl(value: string) {
  try {
    const url = new URL(value);

    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.username.length === 0 &&
      url.password.length === 0 &&
      url.hostname.length > 0
    );
  } catch {
    return false;
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const EmailAddress = Schema.String.pipe(
  Schema.filter((value) => isValidEmailAddress(value), {
    message: () => "Expected a valid email address",
  })
);

const EmailIdempotencyKey = Schema.String.pipe(
  Schema.filter(
    (value) =>
      value.length > 0 && value.length <= RESEND_IDEMPOTENCY_KEY_MAX_LENGTH,
    {
      message: () =>
        `Expected a non-empty idempotency key up to ${RESEND_IDEMPOTENCY_KEY_MAX_LENGTH} characters`,
    }
  )
);

const ResetUrl = Schema.String.pipe(
  Schema.filter((value) => isValidResetUrl(value), {
    message: () => "Expected a valid http or https URL without credentials",
  })
);
const InvitationUrl = ResetUrl;
const InvitationRole = Schema.String.pipe(
  Schema.filter((value) => value.trim().length > 0, {
    message: () => "Expected a non-empty role",
  })
);

export const VerificationUrl = ResetUrl;

export const PasswordResetEmailInput = Schema.Struct({
  idempotencyKey: EmailIdempotencyKey,
  recipientEmail: EmailAddress,
  recipientName: Schema.String,
  resetUrl: ResetUrl,
});

export type PasswordResetEmailInput = Schema.Schema.Type<
  typeof PasswordResetEmailInput
>;

const decodePasswordResetEmailInput = Schema.decodeUnknown(
  PasswordResetEmailInput
);

export const OrganizationInvitationEmailInput = Schema.Struct({
  idempotencyKey: EmailIdempotencyKey,
  recipientEmail: EmailAddress,
  recipientName: Schema.String,
  organizationName: Schema.String,
  inviterEmail: EmailAddress,
  invitationUrl: InvitationUrl,
  role: InvitationRole,
});

export type OrganizationInvitationEmailInput = Schema.Schema.Type<
  typeof OrganizationInvitationEmailInput
>;

const decodeOrganizationInvitationEmailInput = Schema.decodeUnknown(
  OrganizationInvitationEmailInput
);

export const EmailVerificationEmailInput = Schema.Struct({
  idempotencyKey: EmailIdempotencyKey,
  recipientEmail: EmailAddress,
  recipientName: Schema.String,
  verificationUrl: VerificationUrl,
});

export type EmailVerificationEmailInput = Schema.Schema.Type<
  typeof EmailVerificationEmailInput
>;

const decodeEmailVerificationEmailInput = Schema.decodeUnknown(
  EmailVerificationEmailInput
);

function formatParseError(parseError: ParseResult.ParseError) {
  return ParseResult.TreeFormatter.formatErrorSync(parseError);
}

export interface TransportMessage {
  readonly html: string;
  readonly idempotencyKey?: string;
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

function decodeAuthEmailInput<Input, ErrorType>(options: {
  readonly rawInput: unknown;
  readonly decode: (
    input: unknown
  ) => Effect.Effect<Input, ParseResult.ParseError>;
  readonly onInvalidInput: (cause: string) => ErrorType;
}) {
  return options
    .decode(options.rawInput)
    .pipe(
      Effect.mapError((parseError) =>
        options.onInvalidInput(formatParseError(parseError))
      )
    );
}

function sendTransportMessage<ErrorType>(options: {
  readonly emailType:
    | "email-verification"
    | "organization-invitation"
    | "password-reset";
  readonly message: TransportMessage;
  readonly transport: {
    readonly send: (
      message: TransportMessage
    ) => Effect.Effect<void, AuthEmailDeliveryError>;
  };
  readonly onDeliveryFailure: (cause: string) => ErrorType;
}) {
  return Effect.gen(function* sendTransportMessageEffect() {
    yield* Effect.annotateCurrentSpan("auth.email.type", options.emailType);
    yield* Effect.annotateCurrentSpan(
      "auth.email.recipient",
      options.message.to
    );
    if (options.message.idempotencyKey) {
      yield* Effect.annotateCurrentSpan(
        "auth.email.idempotencyKey",
        options.message.idempotencyKey
      );
    }

    yield* options.transport
      .send(options.message)
      .pipe(
        Effect.catchTag("AuthEmailDeliveryError", (error) =>
          Effect.fail(options.onDeliveryFailure(error.message))
        )
      );
  });
}

export class AuthEmailSender extends Effect.Service<AuthEmailSender>()(
  "@task-tracker/domains/identity/authentication/AuthEmailSender",
  {
    accessors: true,
    effect: Effect.gen(function* effect() {
      const transport = yield* AuthEmailTransport;

      const sendPasswordResetEmail = Effect.fn(
        "AuthEmailSender.sendPasswordResetEmail"
      )(function* sendPasswordResetEmail(rawInput: unknown) {
        const input = yield* decodeAuthEmailInput({
          rawInput,
          decode: decodePasswordResetEmailInput,
          onInvalidInput: (cause) =>
            new PasswordResetDeliveryError({
              message: "Invalid password reset email input",
              cause,
            }),
        });

        const subject = "Reset your password";
        const text = [
          `Hello ${input.recipientName},`,
          "",
          "Use this link to reset your password:",
          input.resetUrl,
        ].join("\n");
        const html = [
          `<p>Hello ${escapeHtml(input.recipientName)},</p>`,
          `<p><a href="${escapeHtml(input.resetUrl)}">Reset your password</a></p>`,
        ].join("");

        yield* sendTransportMessage({
          emailType: "password-reset",
          message: {
            idempotencyKey: input.idempotencyKey,
            to: input.recipientEmail,
            subject,
            text,
            html,
          },
          transport,
          onDeliveryFailure: (cause) =>
            new PasswordResetDeliveryError({
              message: "Failed to deliver password reset email",
              cause,
            }),
        });
      });

      const sendOrganizationInvitationEmail = Effect.fn(
        "AuthEmailSender.sendOrganizationInvitationEmail"
      )(function* sendOrganizationInvitationEmail(rawInput: unknown) {
        const input = yield* decodeAuthEmailInput({
          rawInput,
          decode: decodeOrganizationInvitationEmailInput,
          onInvalidInput: (cause) =>
            new OrganizationInvitationDeliveryError({
              message: "Invalid organization invitation email input",
              cause,
            }),
        });

        const subject = `Join ${input.organizationName} on Task Tracker`;
        const text = [
          `Hello ${input.recipientName},`,
          "",
          `${input.inviterEmail} invited you to join ${input.organizationName} as a ${input.role}.`,
          "",
          input.invitationUrl,
        ].join("\n");
        const html = [
          `<p>Hello ${escapeHtml(input.recipientName)},</p>`,
          `<p>${escapeHtml(input.inviterEmail)} invited you to join ${escapeHtml(input.organizationName)} as a ${escapeHtml(input.role)}.</p>`,
          `<p><a href="${escapeHtml(input.invitationUrl)}">Accept invitation</a></p>`,
        ].join("");

        yield* sendTransportMessage({
          emailType: "organization-invitation",
          message: {
            idempotencyKey: input.idempotencyKey,
            to: input.recipientEmail,
            subject,
            text,
            html,
          },
          transport,
          onDeliveryFailure: (cause) =>
            new OrganizationInvitationDeliveryError({
              message: "Failed to deliver organization invitation email",
              cause,
            }),
        });
      });

      const sendEmailVerificationEmail = Effect.fn(
        "AuthEmailSender.sendEmailVerificationEmail"
      )(function* sendEmailVerificationEmail(rawInput: unknown) {
        const input = yield* decodeAuthEmailInput({
          rawInput,
          decode: decodeEmailVerificationEmailInput,
          onInvalidInput: (cause) =>
            new EmailVerificationDeliveryError({
              message: "Invalid verification email input",
              cause,
            }),
        });

        const subject = "Verify your email";
        const text = [
          `Hello ${input.recipientName},`,
          "",
          "Use this link to verify your email:",
          input.verificationUrl,
        ].join("\n");
        const html = [
          `<p>Hello ${escapeHtml(input.recipientName)},</p>`,
          `<p><a href="${escapeHtml(input.verificationUrl)}">Verify your email</a></p>`,
        ].join("");

        yield* sendTransportMessage({
          emailType: "email-verification",
          message: {
            idempotencyKey: input.idempotencyKey,
            to: input.recipientEmail,
            subject,
            text,
            html,
          },
          transport,
          onDeliveryFailure: (cause) =>
            new EmailVerificationDeliveryError({
              message: "Failed to deliver verification email",
              cause,
            }),
        });
      });

      return {
        sendOrganizationInvitationEmail,
        sendPasswordResetEmail,
        sendEmailVerificationEmail,
      };
    }),
  }
) {}
