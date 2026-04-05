import { validateSandboxName } from "@task-tracker/sandbox-core";

import { makePortlessAliasCommands } from "./portless.js";

describe("makePortlessAliasCommands()", () => {
  it("builds deterministic add and remove alias commands for app and api", () => {
    expect(
      makePortlessAliasCommands({
        sandboxName: validateSandboxName("agent-one"),
        ports: {
          app: 4300,
          api: 4301,
          postgres: 5439,
        },
      })
    ).toStrictEqual({
      add: [
        [
          "pnpm",
          "exec",
          "portless",
          "alias",
          "agent-one.app.task-tracker",
          "4300",
          "--force",
        ],
        [
          "pnpm",
          "exec",
          "portless",
          "alias",
          "agent-one.api.task-tracker",
          "4301",
          "--force",
        ],
      ],
      remove: [
        [
          "pnpm",
          "exec",
          "portless",
          "alias",
          "--remove",
          "agent-one.app.task-tracker",
        ],
        [
          "pnpm",
          "exec",
          "portless",
          "alias",
          "--remove",
          "agent-one.api.task-tracker",
        ],
      ],
    });
  }, 10_000);
});
