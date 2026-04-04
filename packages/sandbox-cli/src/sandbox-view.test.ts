import {
  formatSandboxStartupTimeoutLines,
  formatSandboxViewLines,
} from "./sandbox-view.js";

describe("formatSandboxViewLines()", () => {
  it("formats sandbox URLs and the Postgres connection string with explicit labels", () => {
    expect(
      formatSandboxViewLines("Sandbox ready", "feature-branch", {
        app: "https://feature-branch.app.task-tracker.localhost:1355",
        api: "https://feature-branch.api.task-tracker.localhost:1355",
        postgres: "postgresql://127.0.0.1:5439/task_tracker",
        fallbackApp: "http://127.0.0.1:4300",
        fallbackApi: "http://127.0.0.1:4301",
      })
    ).toStrictEqual([
      "Sandbox ready",
      "  slug: feature-branch",
      "  app url: https://feature-branch.app.task-tracker.localhost:1355",
      "  api url: https://feature-branch.api.task-tracker.localhost:1355",
      "  postgres url: postgresql://127.0.0.1:5439/task_tracker",
      "  app fallback url: http://127.0.0.1:4300",
      "  api fallback url: http://127.0.0.1:4301",
    ]);
  }, 10_000);
});

describe("formatSandboxStartupTimeoutLines()", () => {
  it("surfaces the fallback URLs, readiness snapshot, and next debug step", () => {
    expect(
      formatSandboxStartupTimeoutLines({
        hostnameSlug: "feature-branch",
        timeoutMs: 60_000,
        readiness: {
          postgres: true,
          api: false,
          app: false,
        },
        urls: {
          app: "https://feature-branch.app.task-tracker.localhost:1355",
          api: "https://feature-branch.api.task-tracker.localhost:1355",
          postgres: "postgresql://127.0.0.1:5439/task_tracker",
          fallbackApp: "http://127.0.0.1:4300",
          fallbackApi: "http://127.0.0.1:4301",
        },
      })
    ).toStrictEqual([
      "Sandbox startup timed out after 60 seconds.",
      "  slug: feature-branch",
      "  postgres ready: yes",
      "  api ready: no",
      "  app ready: no",
      "  postgres url: postgresql://127.0.0.1:5439/task_tracker",
      "  app fallback url: http://127.0.0.1:4300",
      "  api fallback url: http://127.0.0.1:4301",
      "  next step: pnpm sandbox:logs",
    ]);
  }, 10_000);
});
