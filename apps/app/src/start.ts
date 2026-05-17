import { readSafeRequestPath } from "@ceird/observability-core";
import type { Method } from "@tanstack/react-start";
import { createMiddleware, createStart } from "@tanstack/react-start";

import type { AppStartRequestContext } from "#/lib/app-start-context";
import {
  makeAppStartRequestContext,
  readAppStartRequestContext,
} from "#/lib/app-start-context";
import { emitAppEffectLog } from "#/lib/effect-log";

interface AppStartRequestObservation {
  readonly handlerType: "router" | "serverFn";
  readonly pathname: string;
  readonly request: Request;
  readonly requestContext: AppStartRequestContext;
  readonly serverFnMeta?: AppServerFunctionMeta | undefined;
}

interface AppServerFunctionMeta {
  readonly filename?: string | undefined;
  readonly id?: string | undefined;
  readonly name?: string | undefined;
}

interface AppServerFunctionObservation {
  readonly context: unknown;
  readonly method: Method;
  readonly serverFnMeta: AppServerFunctionMeta;
}

interface AppStartRequestResult {
  readonly response: Response;
}

export const appRequestObservabilityMiddleware = createMiddleware().server(
  async ({ next, pathname, request, serverFnMeta }) => {
    const requestContext = makeAppStartRequestContext(request);

    return await observeAppStartRequest(
      {
        handlerType: readAppStartHandlerType(pathname, serverFnMeta),
        pathname,
        request,
        requestContext,
        serverFnMeta,
      },
      () =>
        next({
          context: requestContext,
        })
    );
  }
);

export const appServerFunctionObservabilityMiddleware = createMiddleware({
  type: "function",
}).server(({ context, method, next, serverFnMeta }) =>
  observeAppStartServerFunction(
    {
      context,
      method,
      serverFnMeta,
    },
    () => next()
  )
);

export const appServerFunctionCsrfMiddleware = createMiddleware().server(
  async ({ next, pathname, request, serverFnMeta }) => {
    if (readAppStartHandlerType(pathname, serverFnMeta) !== "serverFn") {
      return await next();
    }

    if (isCsrfRequestAllowed(request)) {
      return await next();
    }

    return new Response("Forbidden", { status: 403 });
  }
);

export const startInstance = createStart(() => ({
  functionMiddleware: [appServerFunctionObservabilityMiddleware],
  requestMiddleware: [
    appRequestObservabilityMiddleware,
    appServerFunctionCsrfMiddleware,
  ],
}));

export async function observeAppStartRequest<
  Result extends AppStartRequestResult,
>(
  observation: AppStartRequestObservation,
  execute: () => Result | Promise<Result>
): Promise<Result> {
  const start = performance.now();

  try {
    const result = await execute();
    logAppStartRequest("App request completed", observation, result, start);
    return result;
  } catch (error) {
    logAppStartRequestFailure(observation, error, start);
    throw error;
  }
}

export async function observeAppStartServerFunction<Result>(
  observation: AppServerFunctionObservation,
  execute: () => Result | Promise<Result>
): Promise<Result> {
  const start = performance.now();

  try {
    return await execute();
  } catch (error) {
    logAppStartServerFunctionFailure(observation, error, start);
    throw error;
  }
}

function logAppStartRequest(
  message: string,
  observation: AppStartRequestObservation,
  result: AppStartRequestResult,
  start: number
) {
  const details = makeAppStartRequestLogDetails(observation, start, {
    redirectLocation: readRedirectLocation(result.response),
    serverFunction: isServerFunctionRequest(observation, result.response),
    status: result.response.status,
  });

  emitAppEffectLog({
    annotations: details,
    level: result.response.status >= 500 ? "warning" : "info",
    message,
  });
}

function logAppStartRequestFailure(
  observation: AppStartRequestObservation,
  error: unknown,
  start: number
) {
  emitAppEffectLog({
    annotations: makeAppStartRequestLogDetails(observation, start, {
      ...classifyStartMiddlewareError(error),
      serverFunction: observation.handlerType === "serverFn",
      status: 500,
    }),
    level: "warning",
    message: "App request failed",
  });
}

function logAppStartServerFunctionFailure(
  observation: AppServerFunctionObservation,
  error: unknown,
  start: number
) {
  emitAppEffectLog({
    annotations: {
      ...makeAppStartServerFunctionLogDetails(observation, start),
      ...classifyStartMiddlewareError(error),
    },
    level: "warning",
    message: "App server function failed",
  });
}

function makeAppStartRequestLogDetails(
  observation: AppStartRequestObservation,
  start: number,
  outcome: {
    readonly errorBucket?: string;
    readonly errorName?: string;
    readonly redirectLocation?: string;
    readonly serverFunction?: boolean;
    readonly status: number;
  }
) {
  const { request, requestContext, serverFnMeta } = observation;

  return {
    requestId: requestContext.requestId,
    ...(requestContext.cfRay ? { cfRay: requestContext.cfRay } : {}),
    method: request.method,
    path: readSafeRequestPath(observation.pathname),
    status: outcome.status,
    durationMs: Math.max(0, Math.round(performance.now() - start)),
    handlerType: observation.handlerType,
    ...(outcome.serverFunction ? { serverFunction: true } : {}),
    ...safeServerFunctionMeta(serverFnMeta),
    ...(outcome.redirectLocation
      ? { redirectLocation: outcome.redirectLocation }
      : {}),
    ...(outcome.errorName ? { errorName: outcome.errorName } : {}),
    ...(outcome.errorBucket ? { errorBucket: outcome.errorBucket } : {}),
  };
}

function makeAppStartServerFunctionLogDetails(
  observation: AppServerFunctionObservation,
  start: number
) {
  const requestContext = readAppStartRequestContext(observation.context);

  return {
    ...(requestContext?.requestId
      ? { requestId: requestContext.requestId }
      : {}),
    ...(requestContext?.cfRay ? { cfRay: requestContext.cfRay } : {}),
    method: observation.method,
    durationMs: Math.max(0, Math.round(performance.now() - start)),
    serverFunction: true,
    ...safeServerFunctionMeta(observation.serverFnMeta),
  };
}

function safeServerFunctionMeta(meta: AppServerFunctionMeta | undefined) {
  if (!meta?.name) {
    return {};
  }

  return {
    serverFunctionName: meta.name,
  };
}

function readAppStartHandlerType(
  pathname: string,
  serverFnMeta: AppServerFunctionMeta | undefined
): AppStartRequestObservation["handlerType"] {
  if (serverFnMeta || pathname.startsWith("/_serverFn")) {
    return "serverFn";
  }

  return "router";
}

function classifyStartMiddlewareError(error: unknown) {
  return {
    errorName: readStartMiddlewareErrorName(error),
    errorBucket:
      error instanceof TypeError
        ? "transport_failure"
        : "start_boundary_failure",
  };
}

function readStartMiddlewareErrorName(error: unknown) {
  if (error instanceof Error) {
    return error.name;
  }

  if (typeof error === "object" && error !== null) {
    return "Object";
  }

  return typeof error;
}

function isServerFunctionRequest(
  observation: AppStartRequestObservation,
  response?: Response
) {
  return (
    observation.handlerType === "serverFn" ||
    response?.headers.get("x-tsr-serverfn") === "true" ||
    observation.pathname.startsWith("/_serverFn")
  );
}

function readRedirectLocation(response: Response) {
  if (response.status < 300 || response.status >= 400) {
    return;
  }

  const location = response.headers.get("location");

  if (!location) {
    return;
  }

  return readSafeRequestPath(location);
}

function isCsrfRequestAllowed(request: Request) {
  const secFetchSite = request.headers.get("sec-fetch-site");

  if (secFetchSite !== null) {
    return secFetchSite === "same-origin";
  }

  const origin = request.headers.get("origin");
  const requestOrigin = new URL(request.url).origin;

  if (origin !== null) {
    return origin === requestOrigin;
  }

  const referer = request.headers.get("referer");

  return referer !== null && isRefererSameOrigin(referer, requestOrigin);
}

function isRefererSameOrigin(referer: string, requestOrigin: string) {
  if (referer === requestOrigin) {
    return true;
  }

  if (!referer.startsWith(requestOrigin)) {
    return false;
  }

  const nextCharacter = referer[requestOrigin.length];

  return (
    nextCharacter === undefined ||
    nextCharacter === "/" ||
    nextCharacter === "?" ||
    nextCharacter === "#"
  );
}
