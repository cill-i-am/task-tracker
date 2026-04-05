import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { Effect } from "effect";

import {
  buildSandboxRuntimeAssets,
  resolveSandboxRuntimeAssets,
  toDockerNameSegment,
} from "./runtime-assets.js";

describe("toDockerNameSegment()", () => {
  it("normalizes repository names for docker resources", () => {
    expect(toDockerNameSegment("Task Tracker")).toBe("task-tracker");
    expect(toDockerNameSegment("___Task Tracker___")).toBe("task-tracker");
  }, 10_000);

  it("falls back to a safe default for empty names", () => {
    expect(toDockerNameSegment("   ")).toBe("sandbox");
  }, 10_000);
});

describe("buildSandboxRuntimeAssets()", () => {
  it("derives a shared dev image and lockfile-keyed node_modules volume", () => {
    expect(
      buildSandboxRuntimeAssets({
        repositorySlug: "task-tracker",
        assetHash: "1234567890abcdef1234567890abcdef",
        lockfileHash: "abcdef1234567890abcdef1234567890",
      })
    ).toStrictEqual({
      devImage: "tt-sbx-task-tracker-dev:1234567890ab",
      nodeModulesVolume: "tt-sbx-node-modules-1234567890ab-abcdef123456",
      pnpmStoreVolume: "tt-sbx-pnpm-store",
    });
  }, 10_000);

  it("resolves the same runtime assets for identical docker inputs in different worktrees", async () => {
    const tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "sandbox-runtime-assets-")
    );
    const firstWorktree = path.join(tempRoot, "worktree-a");
    const secondWorktree = path.join(tempRoot, "worktree-b");

    await createRuntimeAssetFixture(firstWorktree);
    await createRuntimeAssetFixture(secondWorktree);

    const [first, second] = await Promise.all([
      Effect.runPromise(
        resolveSandboxRuntimeAssets({
          repoRoot: "/Users/me/task-tracker",
          worktreePath: firstWorktree,
        })
      ),
      Effect.runPromise(
        resolveSandboxRuntimeAssets({
          repoRoot: "/Users/me/task-tracker",
          worktreePath: secondWorktree,
        })
      ),
    ]);

    expect(first).toStrictEqual(second);
  }, 10_000);
});

async function createRuntimeAssetFixture(worktreePath: string): Promise<void> {
  await fs.mkdir(path.join(worktreePath, "packages", "sandbox-cli", "docker"), {
    recursive: true,
  });
  await Promise.all([
    fs.writeFile(
      path.join(
        worktreePath,
        "packages",
        "sandbox-cli",
        "docker",
        "sandbox-dev.Dockerfile"
      ),
      "FROM node:22-bookworm-slim\n"
    ),
    fs.writeFile(
      path.join(
        worktreePath,
        "packages",
        "sandbox-cli",
        "docker",
        "sandbox-entrypoint.sh"
      ),
      "#!/bin/sh\nexec node /bootstrap.mjs\n"
    ),
    fs.writeFile(
      path.join(
        worktreePath,
        "packages",
        "sandbox-cli",
        "docker",
        "sandbox-bootstrap.mjs"
      ),
      "console.log('sandbox bootstrap');\n"
    ),
    fs.writeFile(
      path.join(worktreePath, "pnpm-lock.yaml"),
      "lockfileVersion: '9.0'\n"
    ),
  ]);
}
