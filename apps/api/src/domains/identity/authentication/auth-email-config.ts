import { Config, Effect } from "effect";

import { AuthEmailConfigurationError } from "./auth-email-errors.js";

const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmailAddress(value: string) {
  return EMAIL_ADDRESS_PATTERN.test(value);
}

export interface AuthEmailConfig {
  readonly cloudflareAccountId: string;
  readonly cloudflareApiToken: string;
  readonly from: string;
  readonly fromName: string;
}

export const loadAuthEmailConfig = Config.all({
  from: Config.string("AUTH_EMAIL_FROM").pipe(
    Config.validate({
      message: "AUTH_EMAIL_FROM must be a valid email address",
      validation: isValidEmailAddress,
    })
  ),
  fromName: Config.string("AUTH_EMAIL_FROM_NAME").pipe(
    Config.withDefault("Task Tracker")
  ),
  cloudflareAccountId: Config.string("CLOUDFLARE_ACCOUNT_ID").pipe(
    Config.validate({
      message: "CLOUDFLARE_ACCOUNT_ID must not be empty",
      validation: (value) => value.trim().length > 0,
    })
  ),
  cloudflareApiToken: Config.string("CLOUDFLARE_API_TOKEN").pipe(
    Config.validate({
      message: "CLOUDFLARE_API_TOKEN must not be empty",
      validation: (value) => value.trim().length > 0,
    })
  ),
}).pipe(
  Effect.mapError(
    (cause) =>
      new AuthEmailConfigurationError({
        message: "Invalid auth email configuration",
        cause: cause.toString(),
      })
  )
);
