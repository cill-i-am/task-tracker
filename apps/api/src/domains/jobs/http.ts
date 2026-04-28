import { HttpApiBuilder } from "@effect/platform";
import { JobsApi } from "@task-tracker/jobs-core";
import { Effect, Layer } from "effect";

import {
  loadAuthenticationConfig,
  matchesTrustedOrigin,
} from "../identity/authentication/config.js";
import { ConfigurationService } from "./configuration-service.js";
import { JobsService } from "./service.js";
import { SiteGeocoder } from "./site-geocoder.js";
import { SitesService } from "./sites-service.js";

const JobsHandlersLive = HttpApiBuilder.group(JobsApi, "jobs", (handlers) =>
  Effect.gen(function* () {
    const jobsService = yield* JobsService;

    return handlers
      .handle("listJobs", ({ urlParams }) => jobsService.list(urlParams))
      .handle("getJobOptions", () => jobsService.getOptions())
      .handle("createJob", ({ payload }) => jobsService.create(payload))
      .handle("getJobDetail", ({ path }) =>
        jobsService.getDetail(path.workItemId)
      )
      .handle("patchJob", ({ path, payload }) =>
        jobsService.patch(path.workItemId, payload)
      )
      .handle("transitionJob", ({ path, payload }) =>
        jobsService.transition(path.workItemId, payload)
      )
      .handle("reopenJob", ({ path }) => jobsService.reopen(path.workItemId))
      .handle("addJobComment", ({ path, payload }) =>
        jobsService.addComment(path.workItemId, payload)
      )
      .handle("addJobVisit", ({ path, payload }) =>
        jobsService.addVisit(path.workItemId, payload)
      );
  })
);

const SitesHandlersLive = HttpApiBuilder.group(JobsApi, "sites", (handlers) =>
  Effect.gen(function* () {
    const sitesService = yield* SitesService;

    return handlers
      .handle("getSiteOptions", () => sitesService.getOptions())
      .handle("createSite", ({ payload }) => sitesService.create(payload))
      .handle("updateSite", ({ path, payload }) =>
        sitesService.update(path.siteId, payload)
      );
  })
);

const ServiceAreasHandlersLive = HttpApiBuilder.group(
  JobsApi,
  "serviceAreas",
  (handlers) =>
    Effect.gen(function* () {
      const configurationService = yield* ConfigurationService;

      return handlers
        .handle("listServiceAreas", () =>
          configurationService.listServiceAreas()
        )
        .handle("createServiceArea", ({ payload }) =>
          configurationService.createServiceArea(payload)
        )
        .handle("updateServiceArea", ({ path, payload }) =>
          configurationService.updateServiceArea(path.serviceAreaId, payload)
        );
    })
);

const RateCardsHandlersLive = HttpApiBuilder.group(
  JobsApi,
  "rateCards",
  (handlers) =>
    Effect.gen(function* () {
      const configurationService = yield* ConfigurationService;

      return handlers
        .handle("listRateCards", () => configurationService.listRateCards())
        .handle("createRateCard", ({ payload }) =>
          configurationService.createRateCard(payload)
        )
        .handle("updateRateCard", ({ path, payload }) =>
          configurationService.updateRateCard(path.rateCardId, payload)
        );
    })
);

export const JobsHttpLive = HttpApiBuilder.api(JobsApi).pipe(
  Layer.provide(
    Layer.unwrapEffect(
      Effect.gen(function* () {
        const config = yield* loadAuthenticationConfig;

        return HttpApiBuilder.middlewareCors({
          allowedOrigins: (origin) =>
            matchesTrustedOrigin(origin, config.trustedOrigins),
          credentials: true,
        });
      })
    )
  ),
  Layer.provide(JobsHandlersLive),
  Layer.provide(ServiceAreasHandlersLive),
  Layer.provide(RateCardsHandlersLive),
  Layer.provide(SitesHandlersLive),
  Layer.provide(SiteGeocoder.Default),
  Layer.provide(JobsService.Default),
  Layer.provide(ConfigurationService.Default),
  Layer.provide(SitesService.Default)
);
