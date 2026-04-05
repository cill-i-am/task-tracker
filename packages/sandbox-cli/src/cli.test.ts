import { Effect, Option } from "effect";

import { getSandboxPreflightMessage, parseServiceOption } from "./cli.js";
import { SandboxPreflightError } from "./sandbox-preflight-error.js";

describe("getSandboxPreflightMessage()", () => {
  it("unwraps a SandboxPreflightError from an Effect failure exit", async () => {
    const exit = await Effect.runPromiseExit(
      Effect.fail(
        new SandboxPreflightError({
          message: "Sandbox startup timed out after 60 seconds.",
        })
      )
    );

    expect(getSandboxPreflightMessage(exit)).toBe(
      "Sandbox startup timed out after 60 seconds."
    );
  }, 10_000);

  it("ignores successful exits", async () => {
    const exit = await Effect.runPromiseExit(Effect.succeed("ok"));

    expect(getSandboxPreflightMessage(exit)).toBeUndefined();
  }, 10_000);

  it("surfaces the strict env validation failure", async () => {
    const exit = await Effect.runPromiseExit(
      Effect.fail(
        new SandboxPreflightError({
          message:
            "Missing AUTH_EMAIL_FROM in repo .env or process env. Sandbox startup stopped before compose launch.",
        })
      )
    );

    expect(getSandboxPreflightMessage(exit)).toMatch(/AUTH_EMAIL_FROM/);
  }, 10_000);
});

describe("parseServiceOption()", () => {
  it("fails fast when --service is invalid", async () => {
    await expect(
      Effect.runPromise(parseServiceOption(Option.some("invalid")))
    ).rejects.toThrow(/service/i);
  }, 10_000);
});
