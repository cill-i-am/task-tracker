import { Config, Effect } from "effect";

import { AuthEmailConfigurationError } from "./auth-email-errors.js";

export interface AuthEmailConfig {
  readonly from: string;
  readonly fromName: string;
  readonly resendApiKey: string;
}

export const loadAuthEmailConfig = Config.all({
  from: Config.string("AUTH_EMAIL_FROM"),
  fromName: Config.string("AUTH_EMAIL_FROM_NAME").pipe(
    Config.withDefault("Task Tracker")
  ),
  resendApiKey: Config.string("RESEND_API_KEY").pipe(
    Config.validate({
      message: "RESEND_API_KEY must not be empty",
      validation: (value) => value.trim().length > 0,
    })
  ),
}).pipe(
  Effect.mapError(
    (cause) =>
      new AuthEmailConfigurationError({
        message: cause.toString(),
      })
  )
);
