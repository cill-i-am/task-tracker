import { JobsApiGroup, RateCardsApiGroup } from "@ceird/jobs-core";
import { LabelsApiGroup } from "@ceird/labels-core";
import { ServiceAreasApiGroup, SitesApiGroup } from "@ceird/sites-core";
import { HttpApi, HttpApiClient } from "@effect/platform";
import type { HttpClient } from "@effect/platform";
import { Effect } from "effect";

import { resolveApiOrigin } from "#/lib/api-origin";

import { AppApiOriginResolutionError } from "./app-api-errors";

const CeirdApi = HttpApi.make("CeirdApi")
  .add(JobsApiGroup)
  .add(RateCardsApiGroup)
  .add(LabelsApiGroup)
  .add(ServiceAreasApiGroup)
  .add(SitesApiGroup);

export interface AppApiClientOriginOptions {
  readonly apiOrigin?: string | undefined;
  readonly requestOrigin?: string | undefined;
}

export interface MakeAppApiClientOptions extends AppApiClientOriginOptions {
  readonly transformClient?:
    | ((httpClient: HttpClient.HttpClient) => HttpClient.HttpClient)
    | undefined;
}

export function resolveAppApiOrigin(
  options: AppApiClientOriginOptions = {}
): string | undefined {
  return resolveApiOrigin(options.requestOrigin, options.apiOrigin);
}

export function makeAppApiClient(options: MakeAppApiClientOptions = {}) {
  const apiOrigin = resolveAppApiOrigin(options);

  if (!apiOrigin) {
    return Effect.fail(
      new AppApiOriginResolutionError({
        message: "Cannot resolve the Ceird API origin.",
      })
    );
  }

  return HttpApiClient.make(CeirdApi, {
    baseUrl: apiOrigin,
    ...(options.transformClient
      ? { transformClient: options.transformClient }
      : {}),
  });
}

export type AppApiClient = Effect.Effect.Success<
  ReturnType<typeof makeAppApiClient>
>;
