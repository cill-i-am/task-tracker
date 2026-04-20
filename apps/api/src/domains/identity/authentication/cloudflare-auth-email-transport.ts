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
  readonly from: {
    readonly address: string;
    readonly name: string;
  };
  readonly headers?: Record<string, string>;
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

const DELIVERY_KEY_HEADER = "X-Task-Tracker-Delivery-Key";

function buildPayload(
  config: {
    readonly from: string;
    readonly fromName: string;
  },
  message: TransportMessage
): CloudflareSendEmailRequest {
  return {
    from: {
      address: config.from,
      name: config.fromName,
    },
    headers: message.deliveryKey
      ? {
          [DELIVERY_KEY_HEADER]: message.deliveryKey,
        }
      : undefined,
    to: [message.to],
    subject: message.subject,
    text: message.text,
    html: message.html,
  };
}

function collectDeliveredRecipients(response: CloudflareSendEmailResponse) {
  return new Set([
    ...(response.result?.delivered ?? []),
    ...(response.result?.queued ?? []),
  ]);
}

function collectPermanentBounces(response: CloudflareSendEmailResponse) {
  if (!response.result?.permanent_bounces) {
    return new Set<string>();
  }

  return new Set(response.result.permanent_bounces);
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
        Effect.tryPromise({
          try: async () => {
            const response = await cloudflare.post(
              `/accounts/${config.cloudflareAccountId}/email/sending/send`,
              {
                body: buildPayload(config, message),
              }
            );

            const deliveredRecipients = collectDeliveredRecipients(response);

            if (deliveredRecipients.has(message.to)) {
              return;
            }

            const permanentBounces = collectPermanentBounces(response);

            if (permanentBounces.has(message.to)) {
              throw new AuthEmailRejectedError({
                message: "Auth email was rejected",
                cause: `Cloudflare permanently bounced ${message.to}`,
              });
            }

            throw new AuthEmailRequestError({
              message: "Auth email request failed",
              cause: "Cloudflare returned an unexpected delivery status",
            });
          },
          catch: makeAuthEmailRequestError,
        }),
    };
  });
}

export const CloudflareAuthEmailTransportLive = Layer.effect(
  AuthEmailTransport,
  makeCloudflareAuthEmailTransport()
);
