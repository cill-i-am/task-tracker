import { Config, Effect } from "effect";

const SITE_GEOCODER_MODES = ["google", "stub"] as const;

export type SiteGeocoderMode = (typeof SITE_GEOCODER_MODES)[number];

export interface SiteGeocodingConfig {
  readonly googleMapsApiKey?: string;
  readonly mode: SiteGeocoderMode;
}

const siteGeocoderModeConfig = Config.string("SITE_GEOCODER_MODE").pipe(
  Config.withDefault("google"),
  Config.validate({
    message: `SITE_GEOCODER_MODE must be one of ${SITE_GEOCODER_MODES.join(", ")}`,
    validation: (value): value is SiteGeocoderMode =>
      SITE_GEOCODER_MODES.includes(value as SiteGeocoderMode),
  })
);

const googleMapsApiKeyConfig = Config.string("GOOGLE_MAPS_API_KEY").pipe(
  Config.validate({
    message: "GOOGLE_MAPS_API_KEY must not be empty",
    validation: (value) => value.trim().length > 0,
  })
);

export const loadGoogleMapsApiKey = googleMapsApiKeyConfig;

export const loadSiteGeocodingConfig = Effect.gen(
  function* loadSiteGeocodingConfigEffect() {
    const mode = yield* siteGeocoderModeConfig;

    if (mode === "stub") {
      return {
        mode,
      } satisfies SiteGeocodingConfig;
    }

    const googleMapsApiKey = yield* loadGoogleMapsApiKey;

    return {
      googleMapsApiKey,
      mode,
    } satisfies SiteGeocodingConfig;
  }
);
