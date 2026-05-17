import { Effect } from "effect";

import { makeAppStartRequestContext } from "#/lib/app-start-context";
import { withAppEffectLogSinkForTest } from "#/lib/effect-log";

import {
  appRequestObservabilityMiddleware,
  appServerFunctionCsrfMiddleware,
  appServerFunctionObservabilityMiddleware,
  observeAppStartRequest,
  observeAppStartServerFunction,
  startInstance,
} from "./start";

describe("TanStack Start observability middleware", () => {
  it("registers global request and server-function middleware", async () => {
    const options = await startInstance.getOptions();

    expect(options.requestMiddleware).toStrictEqual([
      appRequestObservabilityMiddleware,
      appServerFunctionCsrfMiddleware,
    ]);
    expect(options.functionMiddleware).toStrictEqual([
      appServerFunctionObservabilityMiddleware,
    ]);
  });

  it("logs request outcomes with redacted paths and Cloudflare correlation", async () => {
    const logs: unknown[] = [];
    const request = new Request("https://app.ceird.app/jobs?token=secret", {
      headers: {
        "cf-ray": "0123456789abcdef-DUB",
      },
    });
    const requestContext = makeAppStartRequestContext(request);

    const result = await withAppEffectLogSinkForTest(
      (logEntry) =>
        Effect.sync(() => {
          logs.push(logEntry);
        }),
      () =>
        observeAppStartRequest(
          {
            handlerType: "serverFn",
            pathname: "/_serverFn/redacted?token=secret",
            request,
            requestContext,
            serverFnMeta: {
              name: "getCurrentServerOrganizationSessionFn",
            },
          },
          () => ({
            response: new Response("ok", {
              headers: {
                "x-tsr-serverfn": "true",
              },
            }),
          })
        )
    );

    expect(result.response.status).toBe(200);
    expect(logs).toStrictEqual([
      {
        annotations: expect.objectContaining({
          cfRay: "0123456789abcdef-DUB",
          durationMs: expect.any(Number),
          handlerType: "serverFn",
          method: "GET",
          path: "/_serverFn/redacted",
          requestId: "0123456789abcdef-DUB",
          serverFunction: true,
          serverFunctionName: "getCurrentServerOrganizationSessionFn",
          status: 200,
        }),
        level: "info",
        message: "App request completed",
      },
    ]);
  }, 1000);

  it("generates a safe request id when inbound correlation headers are unsafe", () => {
    const requestContext = makeAppStartRequestContext(
      new Request("https://app.ceird.app/jobs", {
        headers: {
          "cf-ray": "codex-e2e@example.com",
          "x-ceird-request-id": "Bearer secret-token",
        },
      })
    );

    expect(requestContext.cfRay).toBeUndefined();
    expect(requestContext.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it("logs redirects without leaking redirect query strings", async () => {
    const logs: unknown[] = [];
    const request = new Request("https://app.ceird.app/jobs", {
      headers: {
        "cf-ray": "fedcba9876543210-DUB",
      },
    });

    await withAppEffectLogSinkForTest(
      (logEntry) =>
        Effect.sync(() => {
          logs.push(logEntry);
        }),
      () =>
        observeAppStartRequest(
          {
            handlerType: "router",
            pathname: "/jobs",
            request,
            requestContext: makeAppStartRequestContext(request),
          },
          () => ({
            response: new Response(null, {
              headers: {
                location:
                  "/login?callbackURL=https%3A%2F%2Fapp.ceird.app%2Fjobs",
              },
              status: 307,
            }),
          })
        )
    );

    expect(logs).toStrictEqual([
      {
        annotations: expect.objectContaining({
          handlerType: "router",
          redirectLocation: "/login",
          requestId: "fedcba9876543210-DUB",
          status: 307,
        }),
        level: "info",
        message: "App request completed",
      },
    ]);
  }, 1000);

  it("does not duplicate server-function success logs from the function middleware boundary", async () => {
    const logs: unknown[] = [];

    const result = await withAppEffectLogSinkForTest(
      (logEntry) =>
        Effect.sync(() => {
          logs.push(logEntry);
        }),
      () =>
        observeAppStartServerFunction(
          {
            context: {
              cfRay: "0123456789abcdef-DUB",
              requestId: "11111111-1111-4111-8111-111111111111",
            },
            method: "POST",
            serverFnMeta: {
              name: "createCurrentServerOrganization",
            },
          },
          () => "ok"
        )
    );

    expect(result).toBe("ok");
    expect(logs).toStrictEqual([]);
  }, 1000);

  it("buckets server-function boundary failures without raw error messages", async () => {
    const logs: unknown[] = [];

    await expect(
      withAppEffectLogSinkForTest(
        (logEntry) =>
          Effect.sync(() => {
            logs.push(logEntry);
          }),
        () =>
          observeAppStartServerFunction(
            {
              context: {
                requestId: "22222222-2222-4222-8222-222222222222",
              },
              method: "GET",
              serverFnMeta: {
                name: "getCurrentServerOrganizationsFn",
              },
            },
            () => {
              throw new TypeError("fetch failed with a raw URL");
            }
          )
      )
    ).rejects.toThrow(TypeError);

    expect(logs).toStrictEqual([
      {
        annotations: expect.objectContaining({
          errorBucket: "transport_failure",
          errorName: "TypeError",
          requestId: "22222222-2222-4222-8222-222222222222",
          serverFunctionName: "getCurrentServerOrganizationsFn",
        }),
        level: "warning",
        message: "App server function failed",
      },
    ]);
    expect(JSON.stringify(logs)).not.toContain("fetch failed with a raw URL");
  }, 1000);
});
