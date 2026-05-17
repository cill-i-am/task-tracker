// @vitest-environment node

import { redirect } from "@tanstack/react-router";
import { Effect } from "effect";

import { withAppEffectLogSinkForTest } from "#/lib/effect-log";

import { AppApiRequestError } from "./app-api-errors";
import {
  observeAppRouteOperation,
  observeAppRouteSyncOperation,
} from "./app-route-observability";
import { reportAppServerOperationFailure } from "./app-server-observability";

describe("app route observability", () => {
  it("logs route loader failures with safe operation context", async () => {
    const logs: unknown[] = [];

    await withAppEffectLogSinkForTest(
      (entry) =>
        Effect.sync(() => {
          logs.push(entry);
        }),
      async () => {
        await expect(
          observeAppRouteOperation(
            {
              activeOrganizationSyncRequired: false,
              currentOrganizationRole: "owner",
              operation: "loadJobsRouteData",
              routeId: "/jobs",
            },
            () =>
              Promise.reject(
                new AppApiRequestError({
                  message: "Site pagination returned a repeated cursor.",
                })
              )
          )
        ).rejects.toBeInstanceOf(AppApiRequestError);
      }
    );

    expect(logs).toStrictEqual([
      {
        annotations: {
          activeOrganizationSyncRequired: false,
          currentOrganizationRole: "owner",
          durationMs: expect.any(Number),
          errorBucket: "app_api_request_failed",
          errorName: "@ceird/app/api/AppApiRequestError",
          errorTag: "@ceird/app/api/AppApiRequestError",
          operation: "loadJobsRouteData",
          routeId: "/jobs",
        },
        level: "warning",
        message: "App route operation failed",
      },
    ]);
  });

  it("logs synchronous route operation failures with safe context", async () => {
    const logs: unknown[] = [];

    await withAppEffectLogSinkForTest(
      (entry) =>
        Effect.sync(() => {
          logs.push(entry);
        }),
      () => {
        expect(() =>
          observeAppRouteSyncOperation(
            {
              operation: "loadSettingsRoute",
              routeId: "/organization/settings",
            },
            () => {
              throw new AppApiRequestError({
                message: "Site pagination returned a repeated cursor.",
              });
            }
          )
        ).toThrow("Site pagination returned a repeated cursor.");
      }
    );

    expect(logs).toStrictEqual([
      {
        annotations: {
          durationMs: expect.any(Number),
          errorBucket: "app_api_request_failed",
          errorName: "@ceird/app/api/AppApiRequestError",
          errorTag: "@ceird/app/api/AppApiRequestError",
          operation: "loadSettingsRoute",
          routeId: "/organization/settings",
        },
        level: "warning",
        message: "App route operation failed",
      },
    ]);
  });

  it("does not log router redirects as route operation failures", async () => {
    const logs: unknown[] = [];
    let result: unknown;

    await withAppEffectLogSinkForTest(
      (entry) =>
        Effect.sync(() => {
          logs.push(entry);
        }),
      () => {
        try {
          observeAppRouteSyncOperation(
            {
              operation: "assertRouteAccess",
              routeId: "/organization/settings",
            },
            () => {
              throw redirect({ to: "/" });
            }
          );
        } catch (error) {
          result = error;
        }
      }
    );

    expect(result).toBeDefined();
    expect(logs).toStrictEqual([]);
  });

  it("does not duplicate failures already observed at the app server operation boundary", async () => {
    const logs: unknown[] = [];
    const error = new AppApiRequestError({
      message: "Upstream request failed.",
    });

    await withAppEffectLogSinkForTest(
      (entry) =>
        Effect.sync(() => {
          logs.push(entry);
        }),
      async () => {
        reportAppServerOperationFailure(
          {
            operation: "JobsServer.listJobs",
            requestId: "66666666-6666-4666-8666-666666666666",
          },
          error,
          performance.now()
        );

        await expect(
          observeAppRouteOperation(
            {
              operation: "loadJobsRouteData",
              routeId: "/jobs",
            },
            () => Promise.reject(error)
          )
        ).rejects.toBe(error);
      }
    );

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      annotations: expect.objectContaining({
        operation: "JobsServer.listJobs",
      }),
      message: "App server operation failed",
    });
  });
});
