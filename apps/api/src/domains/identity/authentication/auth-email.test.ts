import { ConfigProvider, Effect, Layer } from "effect";

import { loadAuthEmailConfig } from "./auth-email-config.js";
import {
  AuthEmailConfigurationError,
  AuthEmailDeliveryError,
} from "./auth-email-errors.js";
import { AuthEmailSender, AuthEmailTransport } from "./auth-email.js";
import type { TransportMessage } from "./auth-email.js";

describe("auth email sender password reset delivery", () => {
  it("composes the expected password reset message", async () => {
    const sentMessages: TransportMessage[] = [];

    const result = await Effect.runPromise(
      AuthEmailSender.sendPasswordResetEmail({
        recipientEmail: "alice@example.com",
        recipientName: "Alice",
        resetUrl: "https://app.task-tracker.localhost/reset?token=abc123",
      }).pipe(
        Effect.provide(
          AuthEmailSender.Default.pipe(
            Layer.provide(
              Layer.succeed(AuthEmailTransport, {
                send: (message) =>
                  Effect.sync(() => {
                    sentMessages.push(message);
                  }),
              })
            )
          )
        )
      )
    );

    expect(result).toBeUndefined();
    expect(sentMessages).toStrictEqual([
      {
        to: "alice@example.com",
        subject: "Reset your password",
        text: [
          "Hello Alice,",
          "",
          "Use this link to reset your password:",
          "https://app.task-tracker.localhost/reset?token=abc123",
        ].join("\n"),
        html: [
          "<p>Hello Alice,</p>",
          '<p><a href="https://app.task-tracker.localhost/reset?token=abc123">Reset your password</a></p>',
        ].join(""),
      },
    ]);
  }, 10_000);

  it("maps provider failures into PasswordResetDeliveryError", async () => {
    const result = await Effect.runPromise(
      AuthEmailSender.sendPasswordResetEmail({
        recipientEmail: "alice@example.com",
        recipientName: "Alice",
        resetUrl: "https://app.task-tracker.localhost/reset?token=abc123",
      }).pipe(
        Effect.either,
        Effect.provide(
          AuthEmailSender.Default.pipe(
            Layer.provide(
              Layer.succeed(AuthEmailTransport, {
                send: () =>
                  Effect.fail(
                    new AuthEmailDeliveryError({
                      message: "Provider request failed",
                      cause: "upstream timeout",
                    })
                  ),
              })
            )
          )
        )
      )
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      return;
    }

    expect(result.left).toMatchObject({
      _tag: "PasswordResetDeliveryError",
      message: "Failed to deliver password reset email",
      recipientEmail: "alice@example.com",
      cause: "Provider request failed",
    });
  }, 10_000);
});

describe("auth email config loading", () => {
  it("requires auth email config through Config", async () => {
    const result = Effect.runPromise(
      loadAuthEmailConfig.pipe(
        Effect.withConfigProvider(ConfigProvider.fromMap(new Map()))
      )
    );

    await expect(result).rejects.toThrow(/AUTH_EMAIL_FROM/);
  }, 10_000);

  it("loads auth email config with defaults", async () => {
    const config = await Effect.runPromise(
      loadAuthEmailConfig.pipe(
        Effect.withConfigProvider(
          ConfigProvider.fromMap(
            new Map([
              ["AUTH_EMAIL_FROM", "auth@task-tracker.localhost"],
              ["RESEND_API_KEY", "re_test_123"],
            ])
          )
        )
      )
    );

    expect(config).toStrictEqual({
      from: "auth@task-tracker.localhost",
      fromName: "Task Tracker",
      resendApiKey: "re_test_123",
    });
  }, 10_000);

  it("maps config failures into AuthEmailConfigurationError", async () => {
    const result = await Effect.runPromise(
      loadAuthEmailConfig.pipe(
        Effect.withConfigProvider(
          ConfigProvider.fromMap(
            new Map([
              ["AUTH_EMAIL_FROM", "auth@task-tracker.localhost"],
              ["RESEND_API_KEY", ""],
            ])
          )
        ),
        Effect.either
      )
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      return;
    }

    expect(result.left).toBeInstanceOf(AuthEmailConfigurationError);
    expect(result.left.message).toMatch(/RESEND_API_KEY/);
  }, 10_000);
});
