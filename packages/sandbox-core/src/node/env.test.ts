import { Effect, Either } from "effect";

import {
  SandboxEnvironmentError,
  loadSandboxSharedEnvironment,
} from "./env.js";

describe("loadSandboxSharedEnvironment()", () => {
  it("fails fast when required shared env is missing", async () => {
    const result = await Effect.runPromise(
      loadSandboxSharedEnvironment({
        repoRoot: "/repo",
        processEnv: {},
        readFile: () => Effect.succeed(""),
      }).pipe(Effect.either)
    );

    // eslint-disable-next-line vitest/prefer-strict-boolean-matchers, vitest/prefer-to-be-truthy
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isRight(result)) {
      throw new Error("Expected sandbox env loading to fail");
    }
    expect(result.left).toBeInstanceOf(SandboxEnvironmentError);
    expect(result.left.missing).toStrictEqual([
      "AUTH_EMAIL_FROM",
      "AUTH_EMAIL_FROM_NAME",
      "CLOUDFLARE_ACCOUNT_ID",
      "CLOUDFLARE_API_TOKEN",
    ]);
  }, 10_000);

  it("merges repo .env values and lets process env override them", async () => {
    const result = await Effect.runPromise(
      loadSandboxSharedEnvironment({
        repoRoot: "/repo",
        processEnv: {
          AUTH_EMAIL_FROM_NAME: "Override Sender",
        },
        readFile: (filePath) => {
          if (filePath.endsWith(".env")) {
            return Effect.succeed(
              [
                "AUTH_EMAIL_FROM=auth@example.com",
                'AUTH_EMAIL_FROM_NAME="Task Tracker"',
                "CLOUDFLARE_ACCOUNT_ID=cloudflare-account-live",
                "CLOUDFLARE_API_TOKEN=cloudflare-token-live",
                "# trailing comment should be ignored",
              ].join("\n")
            );
          }

          return Effect.succeed("");
        },
      })
    );

    expect(result).toStrictEqual({
      AUTH_EMAIL_FROM: "auth@example.com",
      AUTH_EMAIL_FROM_NAME: "Override Sender",
      CLOUDFLARE_ACCOUNT_ID: "cloudflare-account-live",
      CLOUDFLARE_API_TOKEN: "cloudflare-token-live",
    });
  }, 10_000);

  it("treats missing env files as optional inputs", async () => {
    const result = await Effect.runPromise(
      loadSandboxSharedEnvironment({
        repoRoot: "/repo",
        processEnv: {
          AUTH_EMAIL_FROM: "auth@example.com",
          AUTH_EMAIL_FROM_NAME: "Task Tracker",
          CLOUDFLARE_ACCOUNT_ID: "cloudflare-account-live",
          CLOUDFLARE_API_TOKEN: "cloudflare-token-live",
        },
        readFile: () =>
          Effect.fail(
            Object.assign(new Error("missing file"), { code: "ENOENT" })
          ),
      })
    );

    expect(result).toStrictEqual({
      AUTH_EMAIL_FROM: "auth@example.com",
      AUTH_EMAIL_FROM_NAME: "Task Tracker",
      CLOUDFLARE_ACCOUNT_ID: "cloudflare-account-live",
      CLOUDFLARE_API_TOKEN: "cloudflare-token-live",
    });
  }, 10_000);

  it("parses quoted dotenv values from repo env files", async () => {
    const result = await Effect.runPromise(
      loadSandboxSharedEnvironment({
        repoRoot: "/repo",
        processEnv: {},
        readFile: (filePath) => {
          if (filePath.endsWith(".env")) {
            return Effect.succeed(
              [
                "AUTH_EMAIL_FROM=auth@example.com",
                'AUTH_EMAIL_FROM_NAME="Task Tracker Sandbox"',
                "CLOUDFLARE_ACCOUNT_ID=cloudflare-account-live",
                "CLOUDFLARE_API_TOKEN=cloudflare-token-live",
              ].join("\n")
            );
          }

          return Effect.succeed("");
        },
      })
    );

    expect(result).toStrictEqual({
      AUTH_EMAIL_FROM: "auth@example.com",
      AUTH_EMAIL_FROM_NAME: "Task Tracker Sandbox",
      CLOUDFLARE_ACCOUNT_ID: "cloudflare-account-live",
      CLOUDFLARE_API_TOKEN: "cloudflare-token-live",
    });
  }, 10_000);

  it("fails when an env file cannot be read for reasons other than missing files", async () => {
    const result = await Effect.runPromise(
      loadSandboxSharedEnvironment({
        repoRoot: "/repo",
        processEnv: {
          AUTH_EMAIL_FROM: "auth@example.com",
          AUTH_EMAIL_FROM_NAME: "Task Tracker",
          CLOUDFLARE_ACCOUNT_ID: "cloudflare-account-live",
          CLOUDFLARE_API_TOKEN: "cloudflare-token-live",
        },
        readFile: () => Effect.fail(new Error("permission denied")),
      }).pipe(Effect.either)
    );

    // eslint-disable-next-line vitest/prefer-strict-boolean-matchers, vitest/prefer-to-be-truthy
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isRight(result)) {
      throw new Error("Expected sandbox env loading to fail");
    }
    expect(result.left.message).toMatch(/Failed to read sandbox env file/);
    expect(result.left.filePath).toBe("/repo/.env");
  }, 10_000);
});
