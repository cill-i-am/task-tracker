import {
  allocateSandboxPorts,
  buildSandboxUrls,
  deriveSandboxIdentity,
  makeHealthPayload,
  makeSandboxResourceNames,
  reconcileSandboxRecord,
} from "./index.js";

describe("deriveSandboxIdentity()", () => {
  it("derives a stable sandbox id and slug from the repo and worktree path", () => {
    const repoRoot = "/Users/me/task-tracker";
    const worktreePath = "/Users/me/task-tracker/.worktrees/agent-one";

    const first = deriveSandboxIdentity({ repoRoot, worktreePath });
    const second = deriveSandboxIdentity({ repoRoot, worktreePath });

    expect(first).toStrictEqual(second);
    expect(first.worktreeName).toBe("agent-one");
    expect(first.hostnameSlug).toBe("agent-one");
    expect(first.sandboxId).toMatch(/^[a-f0-9]{12}$/);
  }, 10_000);

  it("adds a hash suffix when the preferred hostname slug is already taken", () => {
    const identity = deriveSandboxIdentity({
      repoRoot: "/Users/me/task-tracker",
      worktreePath: "/Users/me/task-tracker/.worktrees/Agent One",
      takenSlugs: new Set(["agent-one"]),
    });

    expect(identity.hostnameSlug).toMatch(/^agent-one-[a-f0-9]{6}$/);
  }, 10_000);
});

describe("makeSandboxResourceNames()", () => {
  it("builds deterministic Docker resource names from the sandbox id", () => {
    expect(makeSandboxResourceNames("abc123def456")).toStrictEqual({
      containerPrefix: "tt-sbx-abc123def456",
      network: "tt-sbx-abc123def456",
      postgresVolume: "tt-sbx-abc123def456-pg",
      appContainer: "tt-sbx-abc123def456-app",
      apiContainer: "tt-sbx-abc123def456-api",
      postgresContainer: "tt-sbx-abc123def456-postgres",
      appNodeModulesVolume: "tt-sbx-abc123def456-app-node-modules",
      apiNodeModulesVolume: "tt-sbx-abc123def456-api-node-modules",
      pnpmStoreVolume: "tt-sbx-pnpm-store",
    });
  }, 10_000);
});

describe("reconcileSandboxRecord()", () => {
  it("marks a previously ready sandbox as degraded when containers are missing", () => {
    const record = {
      sandboxId: "abc123def456",
      worktreePath: "/Users/me/task-tracker/.worktrees/agent-one",
      repoRoot: "/Users/me/task-tracker",
      hostnameSlug: "agent-one",
      status: "ready" as const,
      containers: {
        app: "tt-sbx-abc123def456-app",
        api: "tt-sbx-abc123def456-api",
        postgres: "tt-sbx-abc123def456-postgres",
      },
      ports: {
        app: 4300,
        api: 4301,
        postgres: 5439,
      },
      hostnames: {
        app: "agent-one.app.task-tracker.localhost",
        api: "agent-one.api.task-tracker.localhost",
      },
      timestamps: {
        createdAt: "2026-04-01T10:00:00.000Z",
        updatedAt: "2026-04-01T10:05:00.000Z",
      },
    };

    const reconciled = reconcileSandboxRecord(record, {
      containersPresent: new Set(["tt-sbx-abc123def456-postgres"]),
      portsInUse: new Set([5439]),
      now: "2026-04-01T10:10:00.000Z",
    });

    expect(reconciled.status).toBe("degraded");
    expect(reconciled.missingResources).toStrictEqual(["app", "api"]);
    expect(reconciled.timestamps.updatedAt).toBe("2026-04-01T10:10:00.000Z");
  }, 10_000);
});

describe("makeHealthPayload()", () => {
  it("creates the shared app/api health payload", () => {
    expect(makeHealthPayload("app", "abc123def456")).toStrictEqual({
      ok: true,
      service: "app",
      sandboxId: "abc123def456",
    });
  }, 10_000);
});

describe("allocateSandboxPorts()", () => {
  it("reuses existing ports when they are still available", () => {
    expect(
      allocateSandboxPorts({
        existing: {
          app: 4300,
          api: 4301,
          postgres: 5439,
        },
        inUsePorts: new Set([9999]),
      })
    ).toStrictEqual({
      app: 4300,
      api: 4301,
      postgres: 5439,
    });
  }, 10_000);

  it("reallocates only the ports that are already taken", () => {
    expect(
      allocateSandboxPorts({
        existing: {
          app: 4300,
          api: 4301,
          postgres: 5439,
        },
        inUsePorts: new Set([4300, 5439]),
      })
    ).toStrictEqual({
      app: 4302,
      api: 4301,
      postgres: 5440,
    });
  }, 10_000);
});

describe("buildSandboxUrls()", () => {
  it("prefers friendly portless hostnames when aliases are healthy", () => {
    expect(
      buildSandboxUrls(
        {
          hostnameSlug: "agent-one",
          ports: {
            app: 4300,
            api: 4301,
            postgres: 5439,
          },
        },
        {
          aliasesHealthy: true,
          proxyPort: 1355,
        }
      )
    ).toStrictEqual({
      app: "https://agent-one.app.task-tracker.localhost:1355",
      api: "https://agent-one.api.task-tracker.localhost:1355",
      postgres: "postgresql://127.0.0.1:5439/task_tracker",
      fallbackApp: "http://127.0.0.1:4300",
      fallbackApi: "http://127.0.0.1:4301",
    });
  }, 10_000);

  it("falls back to loopback URLs when aliases are unavailable", () => {
    expect(
      buildSandboxUrls(
        {
          hostnameSlug: "agent-one",
          ports: {
            app: 4300,
            api: 4301,
            postgres: 5439,
          },
        },
        {
          aliasesHealthy: false,
          proxyPort: 1355,
        }
      )
    ).toStrictEqual({
      app: "http://127.0.0.1:4300",
      api: "http://127.0.0.1:4301",
      postgres: "postgresql://127.0.0.1:5439/task_tracker",
      fallbackApp: "http://127.0.0.1:4300",
      fallbackApi: "http://127.0.0.1:4301",
    });
  }, 10_000);
});
