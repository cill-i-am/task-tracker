import {
  HttpClient,
  HttpClientRequest,
  HttpRouter,
  HttpServer,
  HttpServerResponse,
} from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { Effect, HashMap, LogLevel, Logger } from "effect";

import { withApiEffectLogSinkForTest } from "./domains/effect-log.js";
import { apiRequestLogger, makeApiWebHandler } from "./server.js";

function captureLogs() {
  const logs: unknown[] = [];
  const logger = Logger.make((input) => {
    logs.push({
      annotations: Object.fromEntries(HashMap.toEntries(input.annotations)),
      level: input.logLevel.label,
      message: input.message,
    });
  });

  return { logger, logs };
}

describe("API request logging", () => {
  it("logs request outcomes without query strings", async () => {
    const { logger, logs } = captureLogs();

    await Effect.gen(function* testRedactedRequestLogger() {
      yield* HttpRouter.empty.pipe(
        HttpRouter.get(
          "/api/auth/callback",
          HttpServerResponse.text("callback ok")
        ),
        HttpServer.serveEffect(apiRequestLogger)
      );

      const client = yield* HttpClient.HttpClient;
      const responseText = yield* client
        .get(
          "/api/auth/callback?token=secret-token&callbackURL=https%3A%2F%2Fexample.com"
        )
        .pipe(Effect.flatMap((response) => response.text));

      expect(responseText).toBe("callback ok");
    }).pipe(
      Effect.provide(Logger.replace(Logger.defaultLogger, logger)),
      Logger.withMinimumLogLevel(LogLevel.Trace),
      Effect.provide(NodeHttpServer.layerTest),
      Effect.scoped,
      Effect.runPromise
    );

    expect(logs).toHaveLength(1);
    expect(logs).toStrictEqual([
      {
        annotations: {
          "http.method": "GET",
          "http.path": "/api/auth/callback",
          "http.status": 200,
        },
        level: "INFO",
        message: ["Sent HTTP response"],
      },
    ]);
  });

  it("skips health probe logging", async () => {
    const { logger, logs } = captureLogs();

    await Effect.gen(function* testHealthProbeLogging() {
      yield* HttpRouter.empty.pipe(
        HttpRouter.get("/health", HttpServerResponse.text("ok")),
        HttpServer.serveEffect(apiRequestLogger)
      );

      const client = yield* HttpClient.HttpClient;
      const responseText = yield* client
        .get("/health")
        .pipe(Effect.flatMap((response) => response.text));

      expect(responseText).toBe("ok");
    }).pipe(
      Effect.provide(Logger.replace(Logger.defaultLogger, logger)),
      Logger.withMinimumLogLevel(LogLevel.Trace),
      Effect.provide(NodeHttpServer.layerTest),
      Effect.scoped,
      Effect.runPromise
    );

    expect(logs).toStrictEqual([]);
  });

  it("annotates request logs with app and Cloudflare request ids", async () => {
    const { logger, logs } = captureLogs();

    await Effect.gen(function* testRequestIdLogging() {
      yield* HttpRouter.empty.pipe(
        HttpRouter.get("/jobs", HttpServerResponse.text("jobs ok")),
        HttpServer.serveEffect(apiRequestLogger)
      );

      const client = yield* HttpClient.HttpClient;
      const responseText = yield* HttpClientRequest.get("/jobs")
        .pipe(
          HttpClientRequest.setHeader(
            "x-ceird-request-id",
            "11111111-1111-4111-8111-111111111111"
          ),
          HttpClientRequest.setHeader("cf-ray", "abcdef0123456789-DUB"),
          client.execute
        )
        .pipe(Effect.flatMap((response) => response.text));

      expect(responseText).toBe("jobs ok");
    }).pipe(
      Effect.provide(Logger.replace(Logger.defaultLogger, logger)),
      Logger.withMinimumLogLevel(LogLevel.Trace),
      Effect.provide(NodeHttpServer.layerTest),
      Effect.scoped,
      Effect.runPromise
    );

    expect(logs).toStrictEqual([
      {
        annotations: {
          "http.cf_ray": "abcdef0123456789-DUB",
          "http.method": "GET",
          "http.path": "/jobs",
          "http.request_id": "11111111-1111-4111-8111-111111111111",
          "http.status": 200,
        },
        level: "INFO",
        message: ["Sent HTTP response"],
      },
    ]);
  });

  it("omits unsafe inbound correlation headers from request logs", async () => {
    const { logger, logs } = captureLogs();

    await Effect.gen(function* testUnsafeRequestIdLogging() {
      yield* HttpRouter.empty.pipe(
        HttpRouter.get("/jobs", HttpServerResponse.text("jobs ok")),
        HttpServer.serveEffect(apiRequestLogger)
      );

      const client = yield* HttpClient.HttpClient;
      const responseText = yield* HttpClientRequest.get("/jobs")
        .pipe(
          HttpClientRequest.setHeader("x-ceird-request-id", "Bearer secret"),
          HttpClientRequest.setHeader("cf-ray", "codex-e2e@example.com"),
          client.execute
        )
        .pipe(Effect.flatMap((response) => response.text));

      expect(responseText).toBe("jobs ok");
    }).pipe(
      Effect.provide(Logger.replace(Logger.defaultLogger, logger)),
      Logger.withMinimumLogLevel(LogLevel.Trace),
      Effect.provide(NodeHttpServer.layerTest),
      Effect.scoped,
      Effect.runPromise
    );

    expect(logs).toStrictEqual([
      {
        annotations: {
          "http.method": "GET",
          "http.path": "/jobs",
          "http.status": 200,
        },
        level: "INFO",
        message: ["Sent HTTP response"],
      },
    ]);
  });
});

describe("MCP request logging", () => {
  it("logs pre-router MCP responses with redacted paths and request ids", async () => {
    await withAuthenticationEnvironment(async () => {
      const effectLogs: unknown[] = [];

      await withApiEffectLogSinkForTest(
        (entry) =>
          Effect.sync(() => {
            effectLogs.push(entry);
          }),
        async () => {
          const api = makeApiWebHandler();

          try {
            const response = await api.handler(
              new Request("https://api.ceird.example/mcp?access_token=secret", {
                headers: {
                  "cf-ray": "abcdef0123456789-DUB",
                  "x-ceird-request-id": "11111111-1111-4111-8111-111111111111",
                },
                method: "POST",
              })
            );

            expect(response.status).toBe(401);
          } finally {
            await api.dispose();
          }
        }
      );

      expect(effectLogs).toStrictEqual([
        {
          annotations: expect.objectContaining({
            apiDomain: "mcp",
            durationMs: expect.any(Number),
            "http.cf_ray": "abcdef0123456789-DUB",
            "http.method": "POST",
            "http.path": "/mcp",
            "http.request_id": "11111111-1111-4111-8111-111111111111",
            "http.status": 401,
          }),
          level: "info",
          message: "MCP HTTP response",
        },
      ]);
    });
  });
});

async function withAuthenticationEnvironment<Result>(
  operation: () => Result | Promise<Result>
) {
  const previousEnvironment = { ...process.env };

  delete process.env.AUTH_APP_ORIGIN;
  delete process.env.AUTH_RATE_LIMIT_ENABLED;
  delete process.env.BETTER_AUTH_BASE_URL;
  delete process.env.BETTER_AUTH_SECRET;
  delete process.env.DATABASE_URL;
  delete process.env.MCP_RESOURCE_URL;
  delete process.env.OAUTH_ISSUER_URL;
  delete process.env.PORTLESS_URL;

  Object.assign(process.env, {
    BETTER_AUTH_BASE_URL: "https://api.ceird.example/api/auth",
    BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
    DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
  });

  try {
    return await operation();
  } finally {
    process.env = previousEnvironment;
  }
}
