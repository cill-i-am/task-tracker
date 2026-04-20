import CloudflareApi, { APIError } from "cloudflare";
import { Effect, Layer } from "effect";

import { loadAuthEmailConfig } from "./auth-email-config.js";
import {
  AuthEmailRejectedError,
  AuthEmailRequestError,
} from "./auth-email-errors.js";
import { AuthEmailTransport } from "./auth-email.js";
import type { TransportMessage } from "./auth-email.js";

interface CloudflareSendEmailRequest {
  readonly from: string;
  readonly html: string;
  readonly subject: string;
  readonly text: string;
  readonly to: readonly [string, ...string[]];
}

interface CloudflareSendEmailResponse {
  readonly result?: {
    readonly delivered?: readonly string[] | null;
    readonly permanent_bounces?: readonly string[] | null;
    readonly queued?: readonly string[] | null;
  } | null;
}

interface CloudflareApiClient {
  readonly post: (
    path: string,
    options?: {
      readonly body?: CloudflareSendEmailRequest;
    }
  ) => PromiseLike<CloudflareSendEmailResponse>;
}

interface SingleRecipientResponseBuckets {
  readonly delivered: readonly string[];
  readonly permanentBounces: readonly string[];
  readonly queued: readonly string[];
}

function buildPayload(
  config: {
    readonly from: string;
    readonly fromName: string;
  },
  message: Omit<TransportMessage, "deliveryKey">
): CloudflareSendEmailRequest {
  return {
    from: `${config.fromName} <${config.from}>`,
    to: [message.to],
    subject: message.subject,
    text: message.text,
    html: message.html,
  };
}

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function decodeSingleRecipientResponseBuckets(
  response: CloudflareSendEmailResponse
): SingleRecipientResponseBuckets {
  const {result} = response;

  if (
    !result ||
    !isStringArray(result.delivered) ||
    !isStringArray(result.permanent_bounces) ||
    !isStringArray(result.queued)
  ) {
    throw new AuthEmailRequestError({
      message: "Auth email request failed",
      cause: "Cloudflare returned a malformed email send response",
    });
  }

  return {
    delivered: result.delivered,
    permanentBounces: result.permanent_bounces,
    queued: result.queued,
  };
}

function classifySingleRecipientResponse(
  response: CloudflareSendEmailResponse,
  recipient: string
) {
  const buckets = decodeSingleRecipientResponseBuckets(response);
  const deliveryOutcomes = [
    ...buckets.delivered.map((address) => ({
      address,
      bucket: "delivered" as const,
    })),
    ...buckets.queued.map((address) => ({
      address,
      bucket: "queued" as const,
    })),
    ...buckets.permanentBounces.map((address) => ({
      address,
      bucket: "permanent_bounces" as const,
    })),
  ];

  if (
    deliveryOutcomes.length !== 1 ||
    deliveryOutcomes[0]?.address !== recipient
  ) {
    throw new AuthEmailRequestError({
      message: "Auth email request failed",
      cause:
        "Cloudflare returned an unexpected single-recipient delivery status",
    });
  }

  return deliveryOutcomes[0].bucket;
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
      cause.errors.map((error) => error.message).join("; ") || cause.message;

    return new AuthEmailRequestError({
      message: "Auth email request failed",
      cause: providerMessage,
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
      cause: cause.message,
    });
  }

  return new AuthEmailRequestError({
    message: "Auth email request failed",
    cause: String(cause),
  });
}

export function makeCloudflareAuthEmailTransport(options?: {
  readonly cloudflare?: CloudflareApiClient;
}) {
  return Effect.gen(function* makeCloudflareAuthEmailTransportEffect() {
    const config = yield* loadAuthEmailConfig;
    const cloudflareClient = new CloudflareApi({
      apiToken: config.cloudflareApiToken,
    });
    const cloudflare = options?.cloudflare ?? {
      post: (
        path: string,
        request?: { readonly body?: CloudflareSendEmailRequest }
      ) =>
        cloudflareClient.post<
          CloudflareSendEmailRequest,
          CloudflareSendEmailResponse
        >(path, request),
    };

    return {
      send: (message: TransportMessage) =>
        Effect.log("Auth email transport send attempt", {
          provider: "cloudflare",
          recipient: message.to,
          deliveryKey: message.deliveryKey,
          outcomeBucket: "attempt",
        }).pipe(
          Effect.zipRight(
            Effect.tryPromise({
              try: async () => {
                const response = await cloudflare.post(
                  `/accounts/${config.cloudflareAccountId}/email/sending/send`,
                  {
                    body: buildPayload(config, message),
                  }
                );

                return classifySingleRecipientResponse(response, message.to);
              },
              catch: makeAuthEmailRequestError,
            })
          ),
          Effect.flatMap((outcomeBucket) =>
            outcomeBucket === "permanent_bounces"
              ? Effect.fail(
                  new AuthEmailRejectedError({
                    message: "Auth email was rejected",
                    cause: `Cloudflare permanently bounced ${message.to}`,
                  })
                )
              : Effect.log("Auth email transport send outcome", {
                  provider: "cloudflare",
                  recipient: message.to,
                  deliveryKey: message.deliveryKey,
                  outcomeBucket,
                })
          ),
          Effect.catchTags({
            AuthEmailRejectedError: (error) =>
              Effect.log("Auth email transport send outcome", {
                provider: "cloudflare",
                recipient: message.to,
                deliveryKey: message.deliveryKey,
                outcomeBucket: "permanent_bounces",
              }).pipe(Effect.zipRight(Effect.fail(error))),
            AuthEmailRequestError: (error) =>
              Effect.log("Auth email transport send outcome", {
                provider: "cloudflare",
                recipient: message.to,
                deliveryKey: message.deliveryKey,
                outcomeBucket: "request_failed",
              }).pipe(Effect.zipRight(Effect.fail(error))),
          }),
          Effect.asVoid
        ),
    };
  });
}

export const CloudflareAuthEmailTransportLive = Layer.effect(
  AuthEmailTransport,
  makeCloudflareAuthEmailTransport()
);
