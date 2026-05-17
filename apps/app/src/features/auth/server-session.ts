import { createServerOnlyFn } from "@tanstack/react-start";
import { Schema } from "effect";

import {
  makeAppServerOperationFailure,
  makeAppServerOperationContext,
  observeAppServerOperation,
  reportAppServerOperationFailure,
} from "#/features/api/app-server-observability";
import { resolveConfiguredServerAuthBaseURL } from "#/lib/auth-client.server";
import {
  normalizeServerApiCookieHeader,
  readServerApiForwardedHeadersFromRequest,
} from "#/lib/server-api-forwarded-headers";

const NullableString = Schema.NullOr(Schema.String);

const ServerAuthSessionSchema = Schema.Struct({
  session: Schema.Struct({
    id: Schema.String,
    createdAt: Schema.String,
    updatedAt: Schema.String,
    userId: Schema.String,
    expiresAt: Schema.String,
    token: Schema.String,
    ipAddress: Schema.optional(NullableString),
    userAgent: Schema.optional(NullableString),
    activeOrganizationId: Schema.optional(NullableString),
  }),
  user: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    email: Schema.String,
    image: Schema.optional(NullableString),
    emailVerified: Schema.Boolean,
    createdAt: Schema.String,
    updatedAt: Schema.String,
  }),
});

type ServerAuthSession = Schema.Schema.Type<typeof ServerAuthSessionSchema>;

export const getCurrentServerSession = createServerOnlyFn(async () => {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const cookie = getRequestHeader("cookie");

  if (!cookie) {
    return null;
  }

  const authBaseURL = resolveConfiguredServerAuthBaseURL();
  const operationContext = makeAppServerOperationContext({
    getRequestHeader,
    operation: "AuthServer.getSession",
    targetOrigin: authBaseURL,
  });
  const start = performance.now();

  return await observeAppServerOperation(operationContext, async () => {
    if (!authBaseURL) {
      reportAppServerOperationFailure(
        operationContext,
        makeAppServerOperationFailure({
          bucket: "auth_origin_unresolved",
          message: "Cannot resolve the auth base URL for session lookup.",
        }),
        start
      );
      return null;
    }

    const normalizedCookie = normalizeServerApiCookieHeader(
      cookie,
      authBaseURL
    );
    const forwardedHeaders =
      readServerApiForwardedHeadersFromRequest(getRequestHeader);

    const response = await fetch(new URL("get-session", `${authBaseURL}/`), {
      headers: {
        accept: "application/json",
        cookie: normalizedCookie,
        ...forwardedHeaders,
      },
    });

    if (!response.ok) {
      reportAppServerOperationFailure(
        operationContext,
        makeAppServerOperationFailure({
          bucket: "upstream_status",
          message: `Session lookup failed with status ${response.status}.`,
          status: response.status,
        }),
        start
      );
      return null;
    }

    const payload = (await response.json()) as unknown;

    if (payload === null) {
      return null;
    }

    const session = decodeServerAuthSession(payload);

    if (session === null) {
      reportAppServerOperationFailure(
        operationContext,
        makeAppServerOperationFailure({
          bucket: "invalid_upstream_payload",
          message: "Session lookup returned an invalid payload.",
        }),
        start
      );
    }

    return session;
  });
});

function decodeServerAuthSession(payload: unknown): ServerAuthSession | null {
  try {
    return Schema.decodeUnknownSync(ServerAuthSessionSchema)(payload);
  } catch {
    return null;
  }
}
