/* oxlint-disable unicorn/no-array-method-this-argument */

import CloudflareApi, { APIError } from "cloudflare";
import type {
  EmailSendingSendParams,
  EmailSendingSendResponse,
} from "cloudflare/resources/email-sending/email-sending";
import { Array as Arr, Effect, Redacted, Schema } from "effect";

import type { CloudflareAuthEmailConfig } from "./auth-email-config.js";
import { loadCloudflareAuthEmailConfig } from "./auth-email-config.js";
import {
  AuthEmailRejectedError,
  AuthEmailRequestError,
} from "./auth-email-errors.js";
import {
  buildRecipientLogContext,
  buildRedactedRecipientDescription,
  makeDeliveryKeyDedupeStore,
  sanitizeProviderErrorMessage,
  sendWithDeliveryKeyDedupe,
} from "./auth-email-transport-helpers.js";
import type { TransportMessage } from "./auth-email-transport.js";

interface CloudflareEmailSendingClient {
  readonly send: (
    params: EmailSendingSendParams
  ) => PromiseLike<EmailSendingSendResponse>;
}

const CloudflareSingleRecipientResponseBuckets = Schema.Struct({
  delivered: Schema.Array(Schema.String),
  permanent_bounces: Schema.Array(Schema.String),
  queued: Schema.Array(Schema.String),
});

function buildPayload(
  config: {
    readonly cloudflareAccountId: string;
    readonly from: string;
    readonly fromName: string;
  },
  message: Omit<TransportMessage, "deliveryKey">
): EmailSendingSendParams {
  return {
    account_id: config.cloudflareAccountId,
    from: {
      address: config.from,
      name: config.fromName,
    },
    to: [message.to],
    subject: message.subject,
    text: message.text,
    html: message.html,
  };
}

const decodeSingleRecipientResponseBuckets = Schema.decodeUnknown(
  CloudflareSingleRecipientResponseBuckets
);

function classifySingleRecipientResponse(
  response: EmailSendingSendResponse,
  recipient: string
) {
  return decodeSingleRecipientResponseBuckets(response).pipe(
    Effect.mapError(
      () =>
        new AuthEmailRequestError({
          message: "Auth email request failed",
          cause: "Cloudflare returned a malformed email send response",
        })
    ),
    Effect.flatMap((buckets) => {
      const deliveryOutcomes = [
        ...Arr.map(buckets.delivered, (address) => ({
          address,
          bucket: "delivered" as const,
        })),
        ...Arr.map(buckets.queued, (address) => ({
          address,
          bucket: "queued" as const,
        })),
        ...Arr.map(buckets.permanent_bounces, (address) => ({
          address,
          bucket: "permanent_bounces" as const,
        })),
      ];

      if (
        deliveryOutcomes.length !== 1 ||
        deliveryOutcomes[0]?.address !== recipient
      ) {
        return Effect.fail(
          new AuthEmailRequestError({
            message: "Auth email request failed",
            cause:
              "Cloudflare returned an unexpected single-recipient delivery status",
          })
        );
      }

      return Effect.succeed(deliveryOutcomes[0].bucket);
    })
  );
}

function makeAuthEmailRequestError(cause: unknown) {
  if (
    cause instanceof AuthEmailRequestError ||
    cause instanceof AuthEmailRejectedError
  ) {
    return cause;
  }

  if (cause instanceof APIError) {
    const providerMessage =
      Arr.map(cause.errors, (error) => error.message).join("; ") ||
      cause.message;

    return new AuthEmailRequestError({
      message: "Auth email request failed",
      cause: sanitizeProviderErrorMessage(providerMessage),
    });
  }

  if (
    typeof cause === "object" &&
    cause !== null &&
    "message" in cause &&
    typeof cause.message === "string"
  ) {
    return new AuthEmailRequestError({
      message: "Auth email request failed",
      cause: sanitizeProviderErrorMessage(cause.message),
    });
  }

  return new AuthEmailRequestError({
    message: "Auth email request failed",
    cause: sanitizeProviderErrorMessage(String(cause)),
  });
}

export function makeCloudflareAuthEmailTransport(options?: {
  readonly config?: CloudflareAuthEmailConfig;
  readonly cloudflare?: CloudflareEmailSendingClient;
}) {
  return Effect.gen(function* makeCloudflareAuthEmailTransportEffect() {
    const config = options?.config ?? (yield* loadCloudflareAuthEmailConfig);
    const cloudflare =
      options?.cloudflare ??
      new CloudflareApi({
        apiToken: Redacted.value(config.cloudflareApiToken),
        accountId: config.cloudflareAccountId,
      }).emailSending;
    const deliveryKeyDedupe = makeDeliveryKeyDedupeStore();

    const send = Effect.fn("CloudflareAuthEmailTransport.send")(function* (
      message: TransportMessage
    ) {
      const logContext = {
        ...buildRecipientLogContext(message.to),
        provider: "cloudflare",
        deliveryKey: message.deliveryKey,
      };
      const logOutcome = (
        outcomeBucket:
          | "delivered"
          | "queued"
          | "permanent_bounces"
          | "request_failed"
          | "deduped"
      ) =>
        Effect.log("Auth email transport send outcome", {
          ...logContext,
          outcomeBucket,
        });
      const sendEffect = Effect.log("Auth email transport send attempt", {
        ...logContext,
        outcomeBucket: "attempt",
      }).pipe(
        Effect.zipRight(
          Effect.tryPromise({
            try: () => cloudflare.send(buildPayload(config, message)),
            catch: makeAuthEmailRequestError,
          })
        ),
        Effect.flatMap((response) =>
          classifySingleRecipientResponse(response, message.to)
        ),
        Effect.flatMap((outcomeBucket) =>
          outcomeBucket === "permanent_bounces"
            ? Effect.fail(
                new AuthEmailRejectedError({
                  message: "Auth email was rejected",
                  cause: `Cloudflare permanently bounced ${buildRedactedRecipientDescription(message.to)}`,
                })
              )
            : logOutcome(outcomeBucket)
        ),
        Effect.catchTags({
          AuthEmailRejectedError: (error) =>
            logOutcome("permanent_bounces").pipe(
              Effect.zipRight(Effect.fail(error))
            ),
          AuthEmailRequestError: (error) =>
            logOutcome("request_failed").pipe(
              Effect.annotateLogs({
                authEmailFailureCause: error.cause ?? error.message,
                authEmailFailureTag: error._tag,
              }),
              Effect.zipRight(Effect.fail(error))
            ),
        }),
        Effect.asVoid
      );

      // This is best-effort, process-local dedupe for the in-process background
      // task model; retryable failures are released so queue retries can attempt
      // delivery again.
      return yield* sendWithDeliveryKeyDedupe({
        deliveryKey: message.deliveryKey,
        dedupeStore: deliveryKeyDedupe,
        sendEffect,
        logDeduped: logOutcome("deduped").pipe(Effect.asVoid),
      });
    });

    return { send };
  });
}
