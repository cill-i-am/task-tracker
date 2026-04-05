import { HttpApiBuilder, HttpApp } from "@effect/platform";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Context, Effect, Layer } from "effect";

import { AuthEmailSender } from "./auth-email.js";
import type { PasswordResetEmailInput } from "./auth-email.js";
import { loadAuthenticationConfig } from "./config.js";
import type { AuthenticationConfig } from "./config.js";
import {
  AuthenticationDatabase,
  AuthenticationDatabaseLive,
} from "./database.js";
import { ResendAuthEmailTransportLive } from "./resend-auth-email-transport.js";
import { authSchema } from "./schema.js";

export function createAuthentication(options: {
  readonly config: AuthenticationConfig;
  readonly database: NodePgDatabase<typeof authSchema>;
  readonly sendPasswordResetEmail: (
    input: PasswordResetEmailInput
  ) => Promise<void>;
}) {
  const { config, database, sendPasswordResetEmail } = options;
  const { databaseUrl: _databaseUrl, ...authConfig } = config;

  return betterAuth({
    ...authConfig,
    advanced: {
      backgroundTasks: {
        handler: scheduleAuthenticationBackgroundTask,
      },
    },
    database: drizzleAdapter(database, {
      provider: "pg",
      schema: authSchema,
    }),
    emailAndPassword: {
      ...authConfig.emailAndPassword,
      sendResetPassword: ({ token, user, url }) =>
        sendPasswordResetEmail({
          idempotencyKey: `password-reset/${user.id}/${token}`,
          recipientEmail: user.email,
          recipientName: user.name ?? user.email,
          resetUrl: url,
        } as const satisfies PasswordResetEmailInput),
    },
  });
}

export type AuthenticationService = ReturnType<typeof createAuthentication>;

function scheduleAuthenticationBackgroundTask(task: Promise<unknown>) {
  // Follow-up tracked in TSK-37: replace this temporary in-process
  // queueMicrotask scheduler with a durable background queue so auth email
  // delivery survives process restarts and can be retried independently of
  // the request lifecycle.
  queueMicrotask(async () => {
    try {
      await task;
    } catch (error) {
      console.error("Authentication background task failed", {
        error: serializeBackgroundTaskError(error),
      });
    }
  });
}

function serializeBackgroundTaskError(error: unknown) {
  if (typeof error === "object" && error !== null) {
    return {
      cause:
        "cause" in error && typeof error.cause === "string"
          ? error.cause
          : undefined,
      message:
        "message" in error && typeof error.message === "string"
          ? error.message
          : String(error),
      tag: "_tag" in error && typeof error._tag === "string" ? error._tag : "",
    };
  }

  return {
    message: String(error),
  };
}

function matchesTrustedOrigin(
  origin: string,
  trustedOrigins: readonly string[]
) {
  return trustedOrigins.some((pattern) => {
    if (!pattern.includes("*") && !pattern.includes("?")) {
      return pattern === origin;
    }

    const escapedPattern = pattern.replaceAll(/[.+^${}()|[\]\\]/g, "\\$&");
    const matcher = escapedPattern
      .replaceAll("\\*", ".*")
      .replaceAll("\\?", ".");

    return new RegExp(`^${matcher}$`).test(origin);
  });
}

function appendVaryHeader(headers: Headers, value: string) {
  const current = headers.get("Vary");

  if (!current) {
    headers.set("Vary", value);
    return;
  }

  const values = new Set([
    ...current
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0),
    value,
  ]);
  headers.set("Vary", [...values].join(", "));
}

function withAuthenticationCors(
  handler: (request: Request) => Promise<Response>,
  trustedOrigins: readonly string[]
) {
  return async (request: Request) => {
    const origin = request.headers.get("origin");
    const isTrustedOrigin =
      typeof origin === "string" &&
      matchesTrustedOrigin(origin, trustedOrigins);

    if (request.method === "OPTIONS") {
      if (!isTrustedOrigin) {
        return new Response(null, { status: 403 });
      }

      const response = new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Allow-Headers":
            request.headers.get("access-control-request-headers") ??
            "content-type",
          "Access-Control-Allow-Methods":
            request.headers.get("access-control-request-method") ??
            "GET, POST, OPTIONS",
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Max-Age": "600",
        },
      });

      appendVaryHeader(response.headers, "Origin");
      appendVaryHeader(response.headers, "Access-Control-Request-Headers");

      return response;
    }

    const response = await handler(request);

    if (!isTrustedOrigin) {
      return response;
    }

    const corsResponse = new Response(response.body, response);
    corsResponse.headers.set("Access-Control-Allow-Credentials", "true");
    corsResponse.headers.set("Access-Control-Allow-Origin", origin);
    appendVaryHeader(corsResponse.headers, "Origin");

    return corsResponse;
  };
}

export class Authentication extends Context.Tag(
  "@task-tracker/domains/identity/authentication/Authentication"
)<Authentication, AuthenticationService>() {}

export const AuthenticationLive = Layer.scoped(
  Authentication,
  Effect.gen(function* AuthenticationLive() {
    const config = yield* loadAuthenticationConfig;
    const databaseContext = yield* Layer.build(AuthenticationDatabaseLive);
    const authEmailContext = yield* Layer.build(
      AuthEmailSender.Default.pipe(Layer.provide(ResendAuthEmailTransportLive))
    );
    const { db } = Context.get(databaseContext, AuthenticationDatabase);
    const authEmailSender = Context.get(authEmailContext, AuthEmailSender);

    return createAuthentication({
      config,
      database: db,
      sendPasswordResetEmail: (input) =>
        Effect.runPromise(authEmailSender.sendPasswordResetEmail(input)),
    });
  })
);

export const AuthenticationHttpLive = HttpApiBuilder.Router.use((router) =>
  Effect.gen(function* mountAuthenticationHttp() {
    const auth = yield* Authentication;
    const config = yield* loadAuthenticationConfig;

    // Effect strips mount prefixes by default. Better Auth expects to receive
    // its configured basePath, so we preserve the full /api/auth prefix here.
    yield* router.mountApp(
      "/api/auth",
      HttpApp.fromWebHandler(
        withAuthenticationCors(auth.handler, config.trustedOrigins)
      ),
      {
        includePrefix: true,
      }
    );
  })
).pipe(Layer.provide(AuthenticationLive));
