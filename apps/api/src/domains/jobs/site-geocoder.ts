import {
  IsoDateTimeString as IsoDateTimeStringSchema,
  SiteGeocodingFailedError,
  SiteLatitudeSchema,
  SiteLongitudeSchema,
} from "@task-tracker/jobs-core";
import type {
  CreateSiteInput,
  IsoDateTimeStringType,
  SiteGeocodingProvider,
  SiteLatitude,
  SiteLongitude,
} from "@task-tracker/jobs-core";
import { Effect, Layer, Schema } from "effect";

import {
  loadGoogleMapsApiKey,
  loadSiteGeocodingConfig,
} from "./site-geocoding-config.js";

const GOOGLE_GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const SITE_GEOCODING_FAILED_MESSAGE =
  "We could not locate that site address. Check the Eircode and address details.";

const GoogleGeocodeLocationSchema = Schema.Struct({
  lat: SiteLatitudeSchema,
  lng: SiteLongitudeSchema,
});

const GoogleGeocodeResponseSchema = Schema.Struct({
  results: Schema.optional(Schema.Array(Schema.Unknown)),
  status: Schema.String,
});

const decodeGoogleGeocodeResponse = Schema.decodeUnknown(
  GoogleGeocodeResponseSchema
);
const decodeGoogleGeocodeLocation = Schema.decodeUnknown(
  GoogleGeocodeLocationSchema
);
const decodeIsoDateTimeString = Schema.decodeUnknownSync(
  IsoDateTimeStringSchema
);

export interface GeocodedSiteLocation {
  readonly latitude: SiteLatitude;
  readonly longitude: SiteLongitude;
  readonly provider: SiteGeocodingProvider;
  readonly geocodedAt: IsoDateTimeStringType;
}

export type SiteGeocoderImplementation = {
  readonly geocode: (
    input: CreateSiteInput
  ) => Effect.Effect<GeocodedSiteLocation, SiteGeocodingFailedError>;
};

function makeSiteGeocodingFailedError(input: CreateSiteInput) {
  return new SiteGeocodingFailedError({
    country: input.country,
    eircode: input.eircode,
    message: SITE_GEOCODING_FAILED_MESSAGE,
  });
}

function serializeFailureCause(cause: unknown) {
  if (cause instanceof Error) {
    return cause.message;
  }

  return String(cause);
}

function logAndFailSiteGeocoding(input: CreateSiteInput, details: {
  readonly cause?: unknown;
  readonly httpStatus?: number;
  readonly reason: string;
  readonly providerStatus?: string;
}) {
  return Effect.logWarning("Site geocoding provider failed", {
    ...(details.cause === undefined
      ? {}
      : { failureCause: serializeFailureCause(details.cause) }),
    ...(details.httpStatus === undefined
      ? {}
      : { httpStatus: details.httpStatus }),
    provider: "google",
    ...(details.providerStatus === undefined
      ? {}
      : { providerStatus: details.providerStatus }),
    reason: details.reason,
    siteCountry: input.country,
  }).pipe(Effect.zipRight(Effect.fail(makeSiteGeocodingFailedError(input))));
}

function stableHash(value: string) {
  let hash = 2_166_136_261;

  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
}

function normalizeAddressPart(value: string | undefined) {
  return value?.trim().replaceAll(/\s+/g, " ");
}

function countryName(country: CreateSiteInput["country"]) {
  return country === "IE" ? "Ireland" : "United Kingdom";
}

function googleRegionBias(country: CreateSiteInput["country"]) {
  return country === "IE" ? "ie" : "uk";
}

function buildAddress(input: CreateSiteInput) {
  return [
    input.addressLine1,
    input.addressLine2,
    input.town,
    input.county,
    input.eircode,
    countryName(input.country),
  ]
    .map(normalizeAddressPart)
    .filter((part): part is string => part !== undefined && part.length > 0)
    .join(", ");
}

function nowIsoString() {
  return decodeIsoDateTimeString(new Date().toISOString());
}

export function makeStubSiteGeocoder(): SiteGeocoderImplementation {
  const geocode = Effect.fn("SiteGeocoder.Stub.geocode")(
    function* geocode(input: CreateSiteInput) {
      const hash = stableHash(buildAddress(input).toLowerCase());
      const latitude = 49 + (hash % 1_000_000) / 100_000;
      const longitude =
        -11 + (Math.floor(hash / 1_000_000) % 1_300_000) / 100_000;

      return {
        geocodedAt: nowIsoString(),
        latitude,
        longitude,
        provider: "stub",
      } satisfies GeocodedSiteLocation;
    }
  );

  return { geocode };
}

export function makeGoogleSiteGeocoder(options: { fetch?: typeof fetch } = {}) {
  return Effect.gen(function* makeGoogleSiteGeocoderEffect() {
    const googleMapsApiKey = yield* loadGoogleMapsApiKey;
    const fetchImplementation = options.fetch ?? globalThis.fetch;

    const geocode = Effect.fn("SiteGeocoder.Google.geocode")(
      function* geocode(input: CreateSiteInput) {
        const url = new URL(GOOGLE_GEOCODING_URL);
        url.searchParams.set("address", buildAddress(input));
        url.searchParams.set("region", googleRegionBias(input.country));
        url.searchParams.set("key", googleMapsApiKey);

        const response = yield* Effect.tryPromise({
          try: () => fetchImplementation(url),
          catch: (cause) => cause,
        }).pipe(
          Effect.catchAll((cause) =>
            logAndFailSiteGeocoding(input, {
              cause,
              reason: "fetch_failed",
            })
          )
        );

        if (!response.ok) {
          return yield* logAndFailSiteGeocoding(input, {
            httpStatus: response.status,
            reason: "http_error",
          });
        }

        const payload = yield* Effect.tryPromise({
          try: () => response.json() as Promise<unknown>,
          catch: (cause) => cause,
        }).pipe(
          Effect.catchAll((cause) =>
            logAndFailSiteGeocoding(input, {
              cause,
              reason: "json_decode_failed",
            })
          )
        );

        const decoded = yield* decodeGoogleGeocodeResponse(payload).pipe(
          Effect.catchAll((cause) =>
            logAndFailSiteGeocoding(input, {
              cause,
              reason: "response_parse_failed",
            })
          )
        );

        if (decoded.status === "ZERO_RESULTS") {
          return yield* logAndFailSiteGeocoding(input, {
            providerStatus: decoded.status,
            reason: "zero_results",
          });
        }

        if (decoded.status !== "OK") {
          return yield* logAndFailSiteGeocoding(input, {
            providerStatus: decoded.status,
            reason: "provider_status_not_ok",
          });
        }

        const firstResult = decoded.results?.[0];

        if (firstResult === undefined) {
          return yield* logAndFailSiteGeocoding(input, {
            providerStatus: decoded.status,
            reason: "first_result_missing",
          });
        }

        const location = yield* Effect.gen(function* decodeFirstLocation() {
          if (
            typeof firstResult !== "object" ||
            firstResult === null ||
            !("geometry" in firstResult)
          ) {
            return yield* logAndFailSiteGeocoding(input, {
              providerStatus: decoded.status,
              reason: "first_result_geometry_missing",
            });
          }

          const { geometry } = firstResult;

          if (
            typeof geometry !== "object" ||
            geometry === null ||
            !("location" in geometry)
          ) {
            return yield* logAndFailSiteGeocoding(input, {
              providerStatus: decoded.status,
              reason: "first_result_location_missing",
            });
          }

          return yield* decodeGoogleGeocodeLocation(geometry.location).pipe(
            Effect.catchAll((cause) =>
              logAndFailSiteGeocoding(input, {
                cause,
                providerStatus: decoded.status,
                reason: "first_result_location_parse_failed",
              })
            )
          );
        });

        return {
          geocodedAt: nowIsoString(),
          latitude: location.lat,
          longitude: location.lng,
          provider: "google",
        } satisfies GeocodedSiteLocation;
      }
    );

    return { geocode } satisfies SiteGeocoderImplementation;
  });
}

export class SiteGeocoder extends Effect.Service<SiteGeocoder>()(
  "@task-tracker/domains/jobs/SiteGeocoder",
  {
    accessors: true,
    effect: Effect.gen(function* SiteGeocoderLive() {
      const config = yield* loadSiteGeocodingConfig;

      if (config.mode === "stub") {
        return makeStubSiteGeocoder();
      }

      return yield* makeGoogleSiteGeocoder();
    }),
  }
) {}

export namespace SiteGeocoder {
  export const Stub = Layer.succeed(
    SiteGeocoder,
    SiteGeocoder.make(makeStubSiteGeocoder())
  );
}
