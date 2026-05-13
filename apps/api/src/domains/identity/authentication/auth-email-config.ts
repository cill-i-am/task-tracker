import { Config, Effect, Option, Redacted } from "effect";

import { AuthEmailConfigurationError } from "./auth-email-errors.js";

const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CLOUDFLARE_ACCOUNT_ID_ENV = "CLOUDFLARE_ACCOUNT_ID";
const CLOUDFLARE_API_TOKEN_ENV = "CLOUDFLARE_API_TOKEN";

function isValidEmailAddress(value: string) {
  return EMAIL_ADDRESS_PATTERN.test(value);
}

function trimConfigString(value: string) {
  return value.trim();
}

function trimRedactedConfigString(value: Redacted.Redacted<string>) {
  return Redacted.make(Redacted.value(value).trim());
}

function isNonEmptyString(value: string) {
  return value.length > 0;
}

function isNonEmptyRedactedString(value: Redacted.Redacted<string>) {
  return Redacted.value(value).length > 0;
}

export interface AuthEmailConfig {
  readonly appOrigin: string;
  readonly from: string;
  readonly fromName: string;
}

export interface CloudflareAuthEmailCredentials {
  readonly cloudflareAccountId: string;
  readonly cloudflareApiToken: Redacted.Redacted<string>;
}

export interface CloudflareAuthEmailConfig
  extends AuthEmailConfig, CloudflareAuthEmailCredentials {}

const baseAuthEmailConfig = Config.all({
  appOrigin: Config.string("AUTH_APP_ORIGIN").pipe(
    Config.validate({
      message: "AUTH_APP_ORIGIN must be a valid absolute URL origin",
      validation: (value) => {
        try {
          const url = new URL(value);
          return (
            (url.protocol === "http:" || url.protocol === "https:") &&
            url.username.length === 0 &&
            url.password.length === 0 &&
            url.pathname === "/"
          );
        } catch {
          return false;
        }
      },
    })
  ),
  from: Config.string("AUTH_EMAIL_FROM").pipe(
    Config.validate({
      message: "AUTH_EMAIL_FROM must be a valid email address",
      validation: isValidEmailAddress,
    })
  ),
  fromName: Config.string("AUTH_EMAIL_FROM_NAME").pipe(
    Config.withDefault("Ceird")
  ),
});

const cloudflareAuthEmailCredentialsConfig = Config.all({
  cloudflareAccountId: Config.string(CLOUDFLARE_ACCOUNT_ID_ENV).pipe(
    Config.map(trimConfigString),
    Config.validate({
      message: "CLOUDFLARE_ACCOUNT_ID must not be empty",
      validation: isNonEmptyString,
    })
  ),
  cloudflareApiToken: Config.redacted(CLOUDFLARE_API_TOKEN_ENV).pipe(
    Config.map(trimRedactedConfigString),
    Config.validate({
      message: "CLOUDFLARE_API_TOKEN must not be empty",
      validation: isNonEmptyRedactedString,
    })
  ),
});

const optionalCloudflareAuthEmailCredentialsConfig = Config.all({
  cloudflareAccountId: Config.option(
    Config.string(CLOUDFLARE_ACCOUNT_ID_ENV).pipe(Config.map(trimConfigString))
  ),
  cloudflareApiToken: Config.option(
    Config.redacted(CLOUDFLARE_API_TOKEN_ENV).pipe(
      Config.map(trimRedactedConfigString)
    )
  ),
});

function mapAuthEmailConfigError<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return effect.pipe(
    Effect.mapError(
      (cause) =>
        new AuthEmailConfigurationError({
          message: "Invalid auth email configuration",
          cause: String(cause),
        })
    )
  );
}

export const loadAuthEmailConfig = mapAuthEmailConfigError(baseAuthEmailConfig);

export const loadCloudflareAuthEmailConfig = mapAuthEmailConfigError(
  Effect.all([baseAuthEmailConfig, cloudflareAuthEmailCredentialsConfig]).pipe(
    Effect.map(
      ([config, credentials]) =>
        ({
          ...config,
          ...credentials,
        }) satisfies CloudflareAuthEmailConfig
    )
  )
);

const optionalCloudflareAuthEmailCredentials =
  optionalCloudflareAuthEmailCredentialsConfig.pipe(
    Effect.map(({ cloudflareAccountId, cloudflareApiToken }) => {
      if (
        Option.isNone(cloudflareAccountId) ||
        Option.isNone(cloudflareApiToken)
      ) {
        return Option.none();
      }

      return !isNonEmptyString(cloudflareAccountId.value) ||
        !isNonEmptyRedactedString(cloudflareApiToken.value)
        ? Option.none()
        : Option.some({
            cloudflareAccountId: cloudflareAccountId.value,
            cloudflareApiToken: cloudflareApiToken.value,
          } satisfies CloudflareAuthEmailCredentials);
    })
  );

export const loadOptionalCloudflareAuthEmailConfig = mapAuthEmailConfigError(
  optionalCloudflareAuthEmailCredentials.pipe(
    Effect.flatMap((credentials) => {
      if (Option.isNone(credentials)) {
        return Effect.succeed(Option.none());
      }

      return baseAuthEmailConfig.pipe(
        Effect.map((config) =>
          Option.some({
            ...config,
            ...credentials.value,
          } satisfies CloudflareAuthEmailConfig)
        )
      );
    })
  )
);

export class AuthEmailConfigService extends Effect.Service<AuthEmailConfigService>()(
  "@ceird/domains/identity/authentication/AuthEmailConfigService",
  {
    effect: loadAuthEmailConfig,
  }
) {}
