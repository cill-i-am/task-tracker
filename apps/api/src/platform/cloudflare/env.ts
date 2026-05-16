import type { AuthEmailQueueMessage } from "../../domains/identity/authentication/auth-email-queue.js";

export interface ApiWorkerEnv {
  readonly AUTH_APP_ORIGIN: string;
  readonly AUTH_EMAIL?: SendEmail;
  readonly AUTH_EMAIL_FROM: string;
  readonly AUTH_EMAIL_FROM_NAME?: string;
  readonly AUTH_EMAIL_QUEUE: Queue<AuthEmailQueueMessage>;
  readonly BETTER_AUTH_BASE_URL: string;
  readonly BETTER_AUTH_SECRET: string;
  readonly CLOUDFLARE_ACCOUNT_ID?: string;
  readonly CLOUDFLARE_API_TOKEN?: string;
  readonly DATABASE: Hyperdrive;
  readonly GOOGLE_MAPS_API_KEY: string;
  readonly MCP_RESOURCE_URL?: string;
  readonly NODE_ENV?: string;
  readonly OAUTH_ISSUER_URL?: string;
}

export function apiWorkerEnvConfigMap(env: ApiWorkerEnv) {
  return new Map(
    Object.entries({
      AUTH_APP_ORIGIN: env.AUTH_APP_ORIGIN,
      AUTH_EMAIL_FROM: env.AUTH_EMAIL_FROM,
      AUTH_EMAIL_FROM_NAME: env.AUTH_EMAIL_FROM_NAME,
      BETTER_AUTH_BASE_URL: env.BETTER_AUTH_BASE_URL,
      BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
      CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID,
      CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN,
      GOOGLE_MAPS_API_KEY: env.GOOGLE_MAPS_API_KEY,
      MCP_RESOURCE_URL: env.MCP_RESOURCE_URL,
      NODE_ENV: env.NODE_ENV,
      OAUTH_ISSUER_URL: env.OAUTH_ISSUER_URL,
    }).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}
