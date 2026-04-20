import { ConfigProvider, Effect } from "effect";
import type { CreateEmailResponse } from "resend";

import {
  AuthEmailRejectedError,
  AuthEmailRequestError,
} from "./auth-email-errors.js";
import type { TransportMessage } from "./auth-email.js";
import { makeResendAuthEmailTransport } from "./resend-auth-email-transport.js";

function makeConfigProvider() {
  return ConfigProvider.fromMap(
    new Map([
      ["AUTH_EMAIL_FROM", "auth@task-tracker.localhost"],
      ["AUTH_EMAIL_FROM_NAME", "Task Tracker Auth"],
      ["CLOUDFLARE_ACCOUNT_ID", "account_123"],
      ["CLOUDFLARE_API_TOKEN", "token_123"],
      ["RESEND_API_KEY", "re_test_123"],
    ])
  );
}

function makeMessage(overrides?: Partial<TransportMessage>): TransportMessage {
  return {
    to: "alice@example.com",
    subject: "Reset your password",
    text: "Reset link",
    html: "<p>Reset link</p>",
    ...overrides,
  };
}

describe("makeResendAuthEmailTransport()", () => {
  it("uses the configured sender in the Resend payload", async () => {
    const sentPayloads: unknown[] = [];

    await Effect.runPromise(
      Effect.flatMap(
        makeResendAuthEmailTransport({
          resend: {
            emails: {
              send: (payload): Promise<CreateEmailResponse> => {
                sentPayloads.push(payload);

                return Promise.resolve({
                  data: { id: "email_123" },
                  error: null,
                  headers: null,
                });
              },
            },
          },
        }),
        (transport) => transport.send(makeMessage())
      ).pipe(Effect.withConfigProvider(makeConfigProvider()))
    );

    expect(sentPayloads).toStrictEqual([
      {
        from: "Task Tracker Auth <auth@task-tracker.localhost>",
        to: "alice@example.com",
        subject: "Reset your password",
        text: "Reset link",
        html: "<p>Reset link</p>",
      },
    ]);
  }, 10_000);

  it("passes through the transport delivery key to Resend", async () => {
    const sentOptions: unknown[] = [];

    await Effect.runPromise(
      Effect.flatMap(
        makeResendAuthEmailTransport({
          resend: {
            emails: {
              send: (
                _payload,
                options?: { readonly idempotencyKey?: string }
              ): Promise<CreateEmailResponse> => {
                sentOptions.push(options);

                return Promise.resolve({
                  data: { id: "email_123" },
                  error: null,
                  headers: null,
                });
              },
            },
          },
        }),
        (transport) =>
          transport.send({
            ...makeMessage(),
            deliveryKey: "password-reset/user-123/token-abc123",
          })
      ).pipe(Effect.withConfigProvider(makeConfigProvider()))
    );

    expect(sentOptions).toStrictEqual([
      {
        idempotencyKey: "password-reset/user-123/token-abc123",
      },
    ]);
  }, 10_000);

  it("maps resend failures into AuthEmailDeliveryError", async () => {
    const result = await Effect.runPromise(
      Effect.flatMap(
        makeResendAuthEmailTransport({
          resend: {
            emails: {
              send: (): Promise<CreateEmailResponse> =>
                Promise.resolve({
                  data: null,
                  error: {
                    message: "upstream timeout",
                    name: "application_error",
                    statusCode: 500,
                  },
                  headers: null,
                }),
            },
          },
        }),
        (transport) => transport.send(makeMessage())
      ).pipe(Effect.withConfigProvider(makeConfigProvider()), Effect.either)
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      return;
    }

    expect(result.left).toBeInstanceOf(AuthEmailRejectedError);
    expect(result.left).toMatchObject({
      _tag: "AuthEmailRejectedError",
      message: "Auth email was rejected",
      cause: "upstream timeout",
    });
  }, 10_000);

  it("maps rejected resend requests into AuthEmailRequestError", async () => {
    const result = await Effect.runPromise(
      Effect.flatMap(
        makeResendAuthEmailTransport({
          resend: {
            emails: {
              send: (): Promise<CreateEmailResponse> =>
                Promise.reject(new Error("socket hang up")),
            },
          },
        }),
        (transport) => transport.send(makeMessage())
      ).pipe(Effect.withConfigProvider(makeConfigProvider()), Effect.either)
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      return;
    }

    expect(result.left).toBeInstanceOf(AuthEmailRequestError);
    expect(result.left).toMatchObject({
      _tag: "AuthEmailRequestError",
      message: "Auth email request failed",
      cause: "socket hang up",
    });
  }, 10_000);
});
