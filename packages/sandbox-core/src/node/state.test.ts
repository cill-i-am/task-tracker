import { Schema } from "effect";

import { SandboxRegistryRecord } from "./state.js";

describe("sandbox registry record", () => {
  it("round-trips a compose-backed sandbox record", () => {
    const value = Schema.decodeUnknownSync(SandboxRegistryRecord)({
      sandboxId: "abc123def456",
      sandboxName: "agent-one",
      composeProjectName: "tt-sbx-agent-one",
      hostnameSlug: "agent-one",
      repoRoot: "/Users/me/task-tracker",
      worktreePath: "/Users/me/task-tracker/.worktrees/agent-one",
      betterAuthSecret: "0123456789abcdef0123456789abcdef",
      runtimeAssets: {
        devImage: "tt-sbx-task-tracker-dev:123456789abc",
        nodeModulesVolume: "tt-sbx-node-modules-123456789abc-def456789abc",
        pnpmStoreVolume: "tt-sbx-pnpm-store",
      },
      aliasesHealthy: true,
      ports: { app: 4300, api: 4301, postgres: 5439 },
      status: "ready",
      timestamps: {
        createdAt: "2026-04-05T09:00:00.000Z",
        updatedAt: "2026-04-05T09:05:00.000Z",
      },
    });

    expect(value.composeProjectName).toBe("tt-sbx-agent-one");
    expect(value.sandboxName).toBe("agent-one");
    expect(value.status).toBe("ready");
  }, 10_000);

  it("rejects records with invalid sandbox identifiers", () => {
    expect(() =>
      Schema.decodeUnknownSync(SandboxRegistryRecord)({
        sandboxId: "sandbox alpha",
        sandboxName: "agent-one",
        composeProjectName: "tt-sbx-agent-one",
        hostnameSlug: "agent-one",
        repoRoot: "/Users/me/task-tracker",
        worktreePath: "/Users/me/task-tracker/.worktrees/agent-one",
        betterAuthSecret: "0123456789abcdef0123456789abcdef",
        runtimeAssets: {
          devImage: "tt-sbx-task-tracker-dev:123456789abc",
          nodeModulesVolume: "tt-sbx-node-modules-123456789abc-def456789abc",
          pnpmStoreVolume: "tt-sbx-pnpm-store",
        },
        aliasesHealthy: true,
        ports: { app: 4300, api: 4301, postgres: 5439 },
        status: "ready",
        timestamps: {
          createdAt: "2026-04-05T09:00:00.000Z",
          updatedAt: "2026-04-05T09:05:00.000Z",
        },
      })
    ).toThrow(/sandboxId/);
  }, 10_000);
});
