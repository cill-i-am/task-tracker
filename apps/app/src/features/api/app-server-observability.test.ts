import { Effect } from "effect";

import { withAppEffectLogSinkForTest } from "#/lib/effect-log";

import {
  makeAppServerOperationFailure,
  makeAppServerOperationContext,
  observeAppServerOperation,
  reportAppServerOperationFailure,
} from "./app-server-observability";

describe("app server observability", () => {
  it("logs failed server operations with correlation fields and status buckets", async () => {
    const logs: unknown[] = [];
    const context = makeAppServerOperationContext({
      cfRay: "0123456789abcdef-DUB",
      operation: "OrganizationsServer.createOrganization",
      targetOrigin: "https://api.ceird.app/api/auth?token=secret",
    });

    const error = makeAppServerOperationFailure({
      bucket: "upstream_status",
      message: "Organization creation failed with status 503.",
      status: 503,
    });

    await withAppEffectLogSinkForTest(
      (entry) =>
        Effect.sync(() => {
          logs.push(entry);
        }),
      async () => {
        await expect(
          observeAppServerOperation(context, () => {
            throw error;
          })
        ).rejects.toBe(error);
      }
    );

    expect(logs).toStrictEqual([
      {
        annotations: expect.objectContaining({
          cfRay: "0123456789abcdef-DUB",
          durationMs: expect.any(Number),
          errorBucket: "upstream_status",
          errorName: "Error",
          operation: "OrganizationsServer.createOrganization",
          requestId: "0123456789abcdef-DUB",
          status: 503,
          targetOrigin: "https://api.ceird.app/api/auth",
        }),
        level: "warning",
        message: "App server operation failed",
      },
    ]);
    expect(JSON.stringify(logs)).not.toContain("secret");
  }, 1000);

  it("reports swallowed server helper failures without leaking the raw error message", async () => {
    const logs: unknown[] = [];
    const context = makeAppServerOperationContext({
      operation: "AuthServer.getSession",
      requestId: "55555555-5555-4555-8555-555555555555",
      targetOrigin: "https://api.ceird.app/api/auth",
    });

    await withAppEffectLogSinkForTest(
      (entry) =>
        Effect.sync(() => {
          logs.push(entry);
        }),
      () => {
        reportAppServerOperationFailure(
          context,
          new Error("Session lookup for codex-e2e@example.com failed."),
          performance.now()
        );
      }
    );

    expect(logs).toStrictEqual([
      {
        annotations: expect.objectContaining({
          errorBucket: "server_operation_failed",
          operation: "AuthServer.getSession",
          requestId: "55555555-5555-4555-8555-555555555555",
        }),
        level: "warning",
        message: "App server operation failed",
      },
    ]);
    expect(JSON.stringify(logs)).not.toContain("codex-e2e@example.com");
  }, 1000);
});
