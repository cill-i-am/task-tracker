import { FetchHttpClient } from "@effect/platform";
import type { HttpClient } from "@effect/platform";
import { Effect, Layer } from "effect";

import { makeAppApiClient } from "./app-api-client-core";
import type { AppApiClient } from "./app-api-client-core";
import { normalizeAppApiError } from "./app-api-errors";
import type { AppApiError } from "./app-api-errors";

export type { AppApiClient } from "./app-api-client-core";

export function makeBrowserAppApiClient(origin?: string | undefined) {
  const requestOrigin =
    origin ??
    (typeof window === "undefined" ? undefined : window.location.origin);

  return makeAppApiClient({ requestOrigin });
}

export const BrowserAppApiHttpClientLive = Layer.mergeAll(
  FetchHttpClient.layer,
  Layer.succeed(FetchHttpClient.RequestInit, {
    credentials: "include" as const,
  })
);

export function provideBrowserAppApiHttp<A, E>(
  effect: Effect.Effect<
    A,
    E,
    HttpClient.HttpClient | FetchHttpClient.RequestInit
  >
): Effect.Effect<A, E, never> {
  return effect.pipe(Effect.provide(BrowserAppApiHttpClientLive));
}

export function makeBrowserAppApiRequest<Response, RequestError>(
  operation: string,
  execute: (client: AppApiClient) => Effect.Effect<Response, RequestError>
): Effect.Effect<
  Response,
  AppApiError,
  HttpClient.HttpClient | FetchHttpClient.RequestInit
> {
  return Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("app-api.operation", operation);
    const client = yield* makeBrowserAppApiClient();

    return yield* execute(client);
  }).pipe(Effect.withSpan(operation), Effect.mapError(normalizeAppApiError));
}

export function runBrowserAppApiRequest<Response, RequestError>(
  operation: string,
  execute: (client: AppApiClient) => Effect.Effect<Response, RequestError>
): Effect.Effect<Response, AppApiError, never> {
  return makeBrowserAppApiRequest(operation, execute).pipe(
    provideBrowserAppApiHttp
  );
}
