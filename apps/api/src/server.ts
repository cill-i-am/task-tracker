import { createServer } from "node:http";

import {
  CEIRD_REQUEST_ID_HEADER,
  CF_RAY_HEADER,
  readSafeCorrelationId,
  readSafeRequestPath,
} from "@ceird/observability-core";
import { makeHealthPayloadFromSandboxIdInput } from "@ceird/sandbox-core";
import {
  HttpApp,
  HttpApiBuilder,
  HttpMiddleware,
  HttpServer,
  HttpServerError,
  HttpServerRequest,
} from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { Config, Context, Effect, Layer } from "effect";

import { emitApiEffectLog } from "./domains/effect-log.js";
import {
  AuthenticationHttpLive,
  AuthenticationLive,
} from "./domains/identity/authentication/auth.js";
import { loadAuthenticationConfig } from "./domains/identity/authentication/config.js";
import { JobsHttpLive } from "./domains/jobs/http.js";
import { LabelsHttpLive } from "./domains/labels/http.js";
import { makeMcpWebHandler } from "./domains/mcp/http.js";
import { SiteGeocoder } from "./domains/sites/geocoder.js";
import { SitesHttpLive } from "./domains/sites/http.js";
import { AppApi } from "./http-api.js";
import { AppDatabaseRuntimeLive } from "./platform/database/database.js";

const RuntimeConfig = Config.all({
  sandboxId: Config.string("SANDBOX_ID").pipe(
    Config.withDefault("000000000000")
  ),
}).pipe(Effect.orDie);

const SystemLive = HttpApiBuilder.group(AppApi, "system", (handlers) =>
  handlers
    .handle("root", () => Effect.succeed("ceird api"))
    .handle("health", () =>
      RuntimeConfig.pipe(
        Effect.map(({ sandboxId }) =>
          makeHealthPayloadFromSandboxIdInput("api", sandboxId)
        )
      )
    )
);

const makeApiHandlersLive = () =>
  HttpApiBuilder.api(AppApi).pipe(
    Layer.provide(
      Layer.mergeAll(
        SystemLive,
        AuthenticationHttpLive,
        JobsHttpLive,
        LabelsHttpLive,
        SitesHttpLive
      )
    )
  );

type ApiDatabaseRuntimeLive = typeof AppDatabaseRuntimeLive;
type ApiAuthenticationLive = typeof AuthenticationLive;
type ApiBaseLive = Layer.Layer<never, never, never>;
type ApiSiteGeocoderLive = Layer.Layer<SiteGeocoder, unknown, never>;

interface RequestLogSource {
  readonly headers: Headers | Record<string, string | undefined>;
  readonly method: string;
  readonly url: string;
}

export const makeApiLive = (
  databaseRuntimeLive: ApiDatabaseRuntimeLive,
  authenticationLive: ApiAuthenticationLive = AuthenticationLive,
  siteGeocoderLive: ApiSiteGeocoderLive = SiteGeocoder.Local
) =>
  makeApiHandlersLive().pipe(
    Layer.provide(
      Layer.mergeAll(
        databaseRuntimeLive,
        authenticationLive.pipe(Layer.provide(databaseRuntimeLive)),
        siteGeocoderLive
      )
    )
  );

export const ApiLive = makeApiLive(AppDatabaseRuntimeLive, AuthenticationLive);

export const ServerConfig = Config.all({
  host: Config.string("HOST").pipe(Config.withDefault("0.0.0.0")),
  port: Config.port("PORT").pipe(Config.withDefault(3000)),
});

export const apiRequestLogger: typeof HttpMiddleware.logger =
  HttpMiddleware.make((httpApp) => {
    let counter = 0;

    return Effect.withFiberRuntime((fiber) => {
      const request = Context.unsafeGet(
        fiber.currentContext,
        HttpServerRequest.HttpServerRequest
      );
      const path = readSafeRequestPath(request.url);

      counter += 1;

      return Effect.withLogSpan(
        Effect.flatMap(Effect.exit(httpApp), (exit) => {
          if (
            fiber.getFiberRef(HttpMiddleware.loggerDisabled) ||
            shouldSkipRequestLog(path)
          ) {
            return exit;
          }

          const status =
            exit._tag === "Failure"
              ? HttpServerError.causeResponseStripped(exit.cause)[0].status
              : exit.value.status;
          const log =
            status >= 500
              ? Effect.logWarning("Sent HTTP error response")
              : Effect.logInfo("Sent HTTP response");

          return Effect.zipRight(
            log.pipe(
              Effect.annotateLogs(
                makeHttpRequestLogAnnotations(request, path, status)
              )
            ),
            exit
          );
        }),
        `http.request.${counter}`
      );
    });
  });

function shouldSkipRequestLog(path: string) {
  return path === "/health";
}

function makeHttpRequestLogAnnotations(
  request: RequestLogSource,
  path: string,
  status: number
) {
  const requestId = readRequestHeader(request, CEIRD_REQUEST_ID_HEADER);
  const cfRay = readRequestHeader(request, CF_RAY_HEADER);

  return {
    "http.method": request.method,
    "http.path": path,
    "http.status": status,
    ...((requestId ?? cfRay) ? { "http.request_id": requestId ?? cfRay } : {}),
    ...(cfRay ? { "http.cf_ray": cfRay } : {}),
  };
}

function readRequestHeader(request: RequestLogSource, name: string) {
  const { headers } = request;
  const value =
    typeof (headers as Headers).get === "function"
      ? (headers as Headers).get(name)
      : ((headers as Record<string, string | undefined>)[name] ??
        (headers as Record<string, string | undefined>)[name.toLowerCase()]);

  return readSafeCorrelationId(value);
}

async function handleMcpWebRequestWithLogging(
  request: Request,
  mcpWebHandler: (
    request: Request
  ) => Response | Promise<Response | null> | null
) {
  const startTime = performance.now();

  try {
    const response = await mcpWebHandler(request);

    if (response === null) {
      return null;
    }

    logMcpWebResponse(request, response.status, startTime);

    return response;
  } catch (error) {
    logMcpWebResponse(request, 500, startTime, error);
    throw error;
  }
}

function logMcpWebResponse(
  request: Request,
  status: number,
  startTime: number,
  error?: unknown
) {
  const path = readSafeRequestPath(request.url);
  const details = {
    apiDomain: "mcp",
    durationMs: Math.round(performance.now() - startTime),
    ...makeHttpRequestLogAnnotations(request, path, status),
    ...(error instanceof Error ? { errorName: error.name } : {}),
  };
  emitApiEffectLog({
    annotations: details,
    level: status >= 500 ? "warning" : "info",
    message: status >= 500 ? "MCP HTTP error response" : "MCP HTTP response",
  });
}

export const makeApiWebHandler = (
  databaseRuntimeLive: ApiDatabaseRuntimeLive = AppDatabaseRuntimeLive,
  authenticationLive: ApiAuthenticationLive = AuthenticationLive,
  siteGeocoderLive: ApiSiteGeocoderLive = SiteGeocoder.Local,
  baseLive: ApiBaseLive = Layer.empty
) => {
  const authConfig = Effect.runSync(
    loadAuthenticationConfig.pipe(Effect.provide(baseLive))
  );
  const runtimeLive = Layer.mergeAll(
    databaseRuntimeLive,
    authenticationLive.pipe(Layer.provide(databaseRuntimeLive)),
    siteGeocoderLive
  );
  const mcpWebHandler = makeMcpWebHandler({
    authConfig,
    baseLive,
    runtimeLive,
  });
  const apiLayer = Layer.mergeAll(
    makeApiLive(databaseRuntimeLive, authenticationLive, siteGeocoderLive),
    NodeHttpServer.layerContext
  ).pipe(Layer.provide(baseLive));
  const handler = HttpApiBuilder.toWebHandler(apiLayer, {
    middleware: apiRequestLogger,
  });

  return {
    dispose: handler.dispose,
    handler: async (request: Request) =>
      (await handleMcpWebRequestWithLogging(request, mcpWebHandler)) ??
      handler.handler(request),
  };
};

export const ServerLive = Layer.scopedDiscard(
  Effect.gen(function* runNodeServer() {
    const webHandler = yield* Effect.acquireRelease(
      Effect.sync(() => makeApiWebHandler()),
      ({ dispose }) => Effect.promise(() => dispose()).pipe(Effect.orDie)
    );

    yield* HttpApp.fromWebHandler(webHandler.handler).pipe(
      HttpServer.serveEffect()
    );
  })
).pipe(Layer.provide(NodeHttpServer.layerConfig(createServer, ServerConfig)));
