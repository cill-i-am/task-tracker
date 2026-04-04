import { Effect } from "effect";

import { getSandboxPreflightMessage } from "./cli.js";
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
});
