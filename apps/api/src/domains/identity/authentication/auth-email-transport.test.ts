import { describe, expect, it, vi } from "@effect/vitest";
import type { EmailSendingSendParams } from "cloudflare/resources/email-sending/email-sending";
import { ConfigProvider, Effect, Layer } from "effect";

import { AuthEmailConfigurationError } from "./auth-email-errors.js";
import {
  AuthEmailTransport,
  makeLocalAuthEmailTransport,
} from "./auth-email-transport.js";
import type { TransportMessage } from "./auth-email-transport.js";

const message = {
  deliveryKey: "email-verification/test-delivery-key",
  html: "<p>Hello</p>",
  subject: "Verify your email",
  text: "Hello",
  to: "person@example.com",
} satisfies TransportMessage;

function runWithConfig<A, E>(
  effect: Effect.Effect<A, E, never>,
  config: Map<string, string>
) {
  return Effect.runPromise(
    effect.pipe(Effect.withConfigProvider(ConfigProvider.fromMap(config)))
  );
}

describe("auth email transport provider layers", () => {
  it("local layer falls back to development when Cloudflare credentials are absent", async () => {
    await expect(
      runWithConfig(
        AuthEmailTransport.send(message).pipe(
          Effect.provide(AuthEmailTransport.Local)
        ),
        new Map()
      )
    ).resolves.toBeUndefined();
  }, 10_000);

  it.each([
    ["missing token", new Map([["CLOUDFLARE_ACCOUNT_ID", "account_123"]])],
    ["missing account", new Map([["CLOUDFLARE_API_TOKEN", "token_123"]])],
    [
      "blank credentials",
      new Map([
        ["CLOUDFLARE_ACCOUNT_ID", "   "],
        ["CLOUDFLARE_API_TOKEN", "\t"],
      ]),
    ],
  ])(
    "local layer falls back to development with %s",
    async (_name, config) => {
      const send = vi.fn<() => Promise<never>>(() =>
        Promise.reject(new Error("Cloudflare should not be called"))
      );
      const localLayer = Layer.effect(
        AuthEmailTransport,
        makeLocalAuthEmailTransport({
          cloudflare: { send },
        })
      );

      await expect(
        runWithConfig(
          AuthEmailTransport.send(message).pipe(Effect.provide(localLayer)),
          config
        )
      ).resolves.toBeUndefined();

      expect(send).not.toHaveBeenCalled();
    },
    10_000
  );

  it("local layer uses Cloudflare API when required credentials are present", async () => {
    let sentPayload: EmailSendingSendParams | undefined;
    const localLayer = Layer.effect(
      AuthEmailTransport,
      makeLocalAuthEmailTransport({
        cloudflare: {
          send: (payload) => {
            sentPayload = payload;

            return Promise.resolve({
              delivered: [message.to],
              permanent_bounces: [],
              queued: [],
            });
          },
        },
      })
    );

    await runWithConfig(
      AuthEmailTransport.send(message).pipe(Effect.provide(localLayer)),
      new Map([
        ["AUTH_APP_ORIGIN", "https://app.ceird.localhost"],
        ["AUTH_EMAIL_FROM", "auth@ceird.localhost"],
        ["CLOUDFLARE_ACCOUNT_ID", "account_123"],
        ["CLOUDFLARE_API_TOKEN", "token_123"],
      ])
    );

    expect(sentPayload).toMatchObject({
      account_id: "account_123",
      subject: message.subject,
      text: message.text,
      html: message.html,
      to: [message.to],
    });
  }, 10_000);

  it("Cloudflare API layer fails fast when required config is missing", async () => {
    const result = await runWithConfig(
      AuthEmailTransport.send(message).pipe(
        Effect.provide(AuthEmailTransport.CloudflareApi),
        Effect.either
      ),
      new Map()
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      return;
    }

    expect(result.left).toBeInstanceOf(AuthEmailConfigurationError);
    expect(result.left.cause).toMatch(
      /AUTH_EMAIL_FROM|CLOUDFLARE_ACCOUNT_ID|CLOUDFLARE_API_TOKEN/
    );
  }, 10_000);
});
