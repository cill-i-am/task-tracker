import { SiteGeocodingFailedError } from "@task-tracker/jobs-core";
import type { CreateSiteInput } from "@task-tracker/jobs-core";
import { ConfigProvider, Effect } from "effect";

import { makeGoogleSiteGeocoder, SiteGeocoder } from "./site-geocoder.js";

const FAILED_MESSAGE =
  "We could not locate that site address. Check the Eircode and address details.";

const siteInput = {
  addressLine1: "1 Custom House Quay",
  addressLine2: "IFSC",
  county: "Dublin",
  country: "IE",
  eircode: "D01 W2R1",
  name: "Docklands Campus",
  town: "Dublin",
} satisfies CreateSiteInput;

const gbSiteInput = {
  addressLine1: "10 Downing Street",
  county: "Greater London",
  country: "GB",
  name: "Westminster Office",
  town: "London",
} satisfies CreateSiteInput;

function configProvider(values: ReadonlyMap<string, string>) {
  return ConfigProvider.fromMap(new Map(values));
}

function runWithConfig<Value, Error>(
  effect: Effect.Effect<Value, Error, never>,
  values: ReadonlyMap<string, string>
) {
  return Effect.runPromise(
    effect.pipe(Effect.withConfigProvider(configProvider(values)))
  );
}

function responseWithJson(payload: unknown, ok = true): Response {
  return {
    json: () => Promise.resolve(payload),
    ok,
  } as Response;
}

describe("SiteGeocoder", () => {
  it("stub mode resolves deterministic coordinates without Google key", async () => {
    const config = new Map([["SITE_GEOCODER_MODE", "stub"]]);

    const first = await runWithConfig(
      SiteGeocoder.geocode(siteInput).pipe(Effect.provide(SiteGeocoder.Default)),
      config
    );
    const second = await runWithConfig(
      SiteGeocoder.geocode(siteInput).pipe(Effect.provide(SiteGeocoder.Default)),
      config
    );

    expect(first).toMatchObject({
      latitude: second.latitude,
      longitude: second.longitude,
      provider: "stub",
    });
    expect(first.geocodedAt).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(first.geocodedAt))).toBe(false);
    expect(first.latitude).toBeGreaterThanOrEqual(-90);
    expect(first.latitude).toBeLessThanOrEqual(90);
    expect(first.longitude).toBeGreaterThanOrEqual(-180);
    expect(first.longitude).toBeLessThanOrEqual(180);
  });

  it("successful Google response maps to latitude/longitude/provider/geocodedAt", async () => {
    let requestedUrl: URL | undefined;
    const fetchImplementation = (async (url: URL) => {
      requestedUrl = url;

      return responseWithJson({
        results: [
          {
            geometry: {
              location: {
                lat: 53.3498,
                lng: -6.2603,
              },
            },
          },
        ],
        status: "OK",
      });
    }) as typeof fetch;

    const location = await runWithConfig(
      makeGoogleSiteGeocoder({ fetch: fetchImplementation }).pipe(
        Effect.flatMap((geocoder) => geocoder.geocode(siteInput))
      ),
      new Map([["GOOGLE_MAPS_API_KEY", "test-google-key"]])
    );

    expect(location).toMatchObject({
      latitude: 53.3498,
      longitude: -6.2603,
      provider: "google",
    });
    expect(location.geocodedAt).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(location.geocodedAt))).toBe(false);
    expect(requestedUrl).toBeDefined();
    if (requestedUrl === undefined) {
      return;
    }

    expect(requestedUrl.origin + requestedUrl.pathname).toBe(
      "https://maps.googleapis.com/maps/api/geocode/json"
    );
    expect(requestedUrl.searchParams.get("address")).toBe(
      "1 Custom House Quay, IFSC, Dublin, Dublin, D01 W2R1, Ireland"
    );
    expect(requestedUrl.searchParams.get("region")).toBe("ie");
    expect(requestedUrl.searchParams.get("key")).toBe("test-google-key");
  });

  it("Google request maps GB to uk region bias and United Kingdom address", async () => {
    let requestedUrl: URL | undefined;
    const fetchImplementation = (async (url: URL) => {
      requestedUrl = url;

      return responseWithJson({
        results: [
          {
            geometry: {
              location: {
                lat: 51.5034,
                lng: -0.1276,
              },
            },
          },
        ],
        status: "OK",
      });
    }) as typeof fetch;

    await runWithConfig(
      makeGoogleSiteGeocoder({ fetch: fetchImplementation }).pipe(
        Effect.flatMap((geocoder) => geocoder.geocode(gbSiteInput))
      ),
      new Map([["GOOGLE_MAPS_API_KEY", "test-google-key"]])
    );

    expect(requestedUrl).toBeDefined();
    if (requestedUrl === undefined) {
      return;
    }

    expect(requestedUrl.searchParams.get("address")).toBe(
      "10 Downing Street, London, Greater London, United Kingdom"
    );
    expect(requestedUrl.searchParams.get("region")).toBe("uk");
  });

  it("explicit Google factory requires a key even when default mode is stub", async () => {
    let fetchCalls = 0;
    const fetchImplementation = (async () => {
      fetchCalls += 1;

      return responseWithJson({
        results: [],
        status: "ZERO_RESULTS",
      });
    }) as typeof fetch;

    const result = await runWithConfig(
      makeGoogleSiteGeocoder({ fetch: fetchImplementation }).pipe(
        Effect.either
      ),
      new Map([["SITE_GEOCODER_MODE", "stub"]])
    );

    expect(result._tag).toBe("Left");
    expect(fetchCalls).toBe(0);
  });

  it("successful Google response ignores malformed later results", async () => {
    const fetchImplementation = (async () =>
      responseWithJson({
        results: [
          {
            geometry: {
              location: {
                lat: 53.3498,
                lng: -6.2603,
              },
            },
          },
          {
            geometry: {
              location: {
                lat: 123,
                lng: "not-a-number",
              },
            },
          },
        ],
        status: "OK",
      })) as typeof fetch;

    const location = await runWithConfig(
      makeGoogleSiteGeocoder({ fetch: fetchImplementation }).pipe(
        Effect.flatMap((geocoder) => geocoder.geocode(siteInput))
      ),
      new Map([["GOOGLE_MAPS_API_KEY", "test-google-key"]])
    );

    expect(location).toMatchObject({
      latitude: 53.3498,
      longitude: -6.2603,
      provider: "google",
    });
  });

  it("ZERO_RESULTS fails with SiteGeocodingFailedError", async () => {
    const fetchImplementation = (async () =>
      responseWithJson({
        results: [],
        status: "ZERO_RESULTS",
      })) as typeof fetch;

    const result = await runWithConfig(
      makeGoogleSiteGeocoder({ fetch: fetchImplementation }).pipe(
        Effect.flatMap((geocoder) => geocoder.geocode(siteInput)),
        Effect.either
      ),
      new Map([["GOOGLE_MAPS_API_KEY", "test-google-key"]])
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      return;
    }

    expect(result.left).toBeInstanceOf(SiteGeocodingFailedError);
    expect(result.left).toMatchObject({
      country: "IE",
      eircode: "D01 W2R1",
      message: FAILED_MESSAGE,
    });
  });

  it("malformed response fails with SiteGeocodingFailedError", async () => {
    const fetchImplementation = (async () =>
      responseWithJson({
        results: [
          {
            geometry: {
              location: {
                lat: 123,
                lng: -6.2603,
              },
            },
          },
        ],
        status: "OK",
      })) as typeof fetch;

    const result = await runWithConfig(
      makeGoogleSiteGeocoder({ fetch: fetchImplementation }).pipe(
        Effect.flatMap((geocoder) => geocoder.geocode(siteInput)),
        Effect.either
      ),
      new Map([["GOOGLE_MAPS_API_KEY", "test-google-key"]])
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      return;
    }

    expect(result.left).toBeInstanceOf(SiteGeocodingFailedError);
    expect(result.left.message).toBe(FAILED_MESSAGE);
  });

  it("provider request failure fails with SiteGeocodingFailedError", async () => {
    const fetchImplementation = (async () => {
      throw new Error("upstream timeout");
    }) as typeof fetch;

    const result = await runWithConfig(
      makeGoogleSiteGeocoder({ fetch: fetchImplementation }).pipe(
        Effect.flatMap((geocoder) => geocoder.geocode(siteInput)),
        Effect.either
      ),
      new Map([["GOOGLE_MAPS_API_KEY", "test-google-key"]])
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      return;
    }

    expect(result.left).toBeInstanceOf(SiteGeocodingFailedError);
    expect(result.left).toMatchObject({
      country: "IE",
      eircode: "D01 W2R1",
      message: FAILED_MESSAGE,
    });
  });
});
