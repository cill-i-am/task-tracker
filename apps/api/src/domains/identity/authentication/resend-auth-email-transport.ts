import { Config, Layer, Effect } from "effect";
import type { CreateEmailOptions, CreateEmailResponse } from "resend";
import { Resend as ResendClient } from "resend";

import { loadAuthEmailConfig } from "./auth-email-config.js";
import {
  AuthEmailConfigurationError,
  AuthEmailRejectedError,
  AuthEmailRequestError,
} from "./auth-email-errors.js";
import { AuthEmailTransport } from "./auth-email.js";
import type { TransportMessage } from "./auth-email.js";

interface ResendEmailsClient {
  readonly send: (
    payload: CreateEmailOptions,
    options?: {
      readonly idempotencyKey?: string;
    }
  ) => Promise<CreateEmailResponse>;
}

function formatFromAddress(from: string, fromName: string) {
  return `${fromName} <${from}>`;
}

function makeAuthEmailDeliveryError(cause: unknown) {
  if (
    cause instanceof AuthEmailRequestError ||
    cause instanceof AuthEmailRejectedError
  ) {
    return cause;
  }

  if (
    typeof cause === "object" &&
    cause !== null &&
    "message" in cause &&
    typeof cause.message === "string"
  ) {
    return new AuthEmailRequestError({
      message: "Auth email request failed",
      cause: cause.message,
    });
  }

  return new AuthEmailRequestError({
    message: "Auth email request failed",
    cause: String(cause),
  });
}

function buildPayload(
  message: TransportMessage,
  configuredSender: string
): CreateEmailOptions {
  return {
    from: configuredSender,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  };
}

const loadResendApiKey = Config.string("RESEND_API_KEY").pipe(
  Config.validate({
    message: "RESEND_API_KEY must not be empty",
    validation: (value) => value.trim().length > 0,
  }),
  Effect.mapError(
    (cause) =>
      new AuthEmailConfigurationError({
        message: "Invalid resend auth email transport configuration",
        cause: cause.toString(),
      })
  )
);

export function makeResendAuthEmailTransport(options?: {
  readonly resend?: {
    readonly emails: ResendEmailsClient;
  };
}) {
  return Effect.gen(function* makeResendAuthEmailTransportEffect() {
    const config = yield* loadAuthEmailConfig;
    const resendApiKey = yield* loadResendApiKey;
    const resend = options?.resend ?? new ResendClient(resendApiKey);
    const configuredSender = formatFromAddress(config.from, config.fromName);

    return {
      send: (message: TransportMessage) =>
        Effect.tryPromise({
          try: async () => {
            const response = await resend.emails.send(
              buildPayload(message, configuredSender),
              message.deliveryKey
                ? {
                    idempotencyKey: message.deliveryKey,
                  }
                : undefined
            );

            if (response.error) {
              throw new AuthEmailRejectedError({
                message: "Auth email was rejected",
                cause: response.error.message,
              });
            }
          },
          catch: makeAuthEmailDeliveryError,
        }),
    };
  });
}

export const ResendAuthEmailTransportLive = Layer.effect(
  AuthEmailTransport,
  makeResendAuthEmailTransport()
);
