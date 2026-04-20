import { ConfigProvider, Effect } from "effect";

import {
  AuthEmailRejectedError,
  AuthEmailRequestError,
} from "./auth-email-errors.js";
import type { TransportMessage } from "./auth-email.js";
import { makeCloudflareAuthEmailTransport } from "./cloudflare-auth-email-transport.js";

function makeConfigProvider() {
  return ConfigProvider.fromMap(
    new Map([
      ["AUTH_EMAIL_FROM", "auth@task-tracker.localhost"],
      ["AUTH_EMAIL_FROM_NAME", "Task Tracker Auth"],
      ["CLOUDFLARE_ACCOUNT_ID", "account_123"],
      ["CLOUDFLARE_API_TOKEN", "token_123"],
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

describe("makeCloudflareAuthEmailTransport()", () => {
  it("uses the configured Cloudflare account path and sender payload", async () => {
    const requests: unknown[] = [];

    await Effect.runPromise(
      Effect.flatMap(
        makeCloudflareAuthEmailTransport({
          cloudflare: {
            post: (path, options) => {
              requests.push({ path, options });

              return Promise.resolve({
                result: {
                  delivered: ["alice@example.com"],
                  permanent_bounces: [],
                  queued: [],
                },
              });
            },
          },
        }),
        (transport) => transport.send(makeMessage())
      ).pipe(Effect.withConfigProvider(makeConfigProvider()))
    );

    expect(requests).toStrictEqual([
      {
        path: "/accounts/account_123/email/sending/send",
        options: {
          body: {
            from: {
              address: "auth@task-tracker.localhost",
              name: "Task Tracker Auth",
            },
            to: ["alice@example.com"],
            subject: "Reset your password",
            text: "Reset link",
            html: "<p>Reset link</p>",
            headers: undefined,
          },
        },
      },
    ]);
  }, 10_000);

  it("passes through the delivery key as a custom Cloudflare header", async () => {
    const requests: unknown[] = [];

    await Effect.runPromise(
      Effect.flatMap(
        makeCloudflareAuthEmailTransport({
          cloudflare: {
            post: (path, options) => {
              requests.push({ path, options });

              return Promise.resolve({
                result: {
                  delivered: [],
                  permanent_bounces: [],
                  queued: ["alice@example.com"],
                },
              });
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

    expect(requests).toStrictEqual([
      {
        path: "/accounts/account_123/email/sending/send",
        options: {
          body: {
            from: {
              address: "auth@task-tracker.localhost",
              name: "Task Tracker Auth",
            },
            to: ["alice@example.com"],
            subject: "Reset your password",
            text: "Reset link",
            html: "<p>Reset link</p>",
            headers: {
              "X-Task-Tracker-Delivery-Key":
                "password-reset/user-123/token-abc123",
            },
          },
        },
      },
    ]);
  }, 10_000);

  it("maps permanent bounces into AuthEmailRejectedError", async () => {
    const result = await Effect.runPromise(
      Effect.flatMap(
        makeCloudflareAuthEmailTransport({
          cloudflare: {
            post: () =>
              Promise.resolve({
                result: {
                  delivered: [],
                  permanent_bounces: ["alice@example.com"],
                  queued: [],
                },
              }),
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
      cause: "Cloudflare permanently bounced alice@example.com",
    });
  }, 10_000);

  it("maps Cloudflare request failures into AuthEmailRequestError", async () => {
    const result = await Effect.runPromise(
      Effect.flatMap(
        makeCloudflareAuthEmailTransport({
          cloudflare: {
            post: () => Promise.reject(new Error("socket hang up")),
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
