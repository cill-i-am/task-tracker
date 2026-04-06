import { createServerOnlyFn } from "@tanstack/react-start";
import {
  getRequestHeader,
  getRequestHost,
  getRequestProtocol,
} from "@tanstack/react-start/server";
import { Schema } from "effect";

import { resolveAuthBaseURL } from "#/lib/auth-client";
import type { createTaskTrackerAuthClient } from "#/lib/auth-client";

const OrganizationSummarySchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  slug: Schema.String,
});

const OrganizationSummaryListSchema = Schema.Array(OrganizationSummarySchema);

export type OrganizationSummary = Schema.Schema.Type<
  typeof OrganizationSummarySchema
>;

export type OrganizationAccessSession = NonNullable<
  Awaited<
    ReturnType<ReturnType<typeof createTaskTrackerAuthClient>["getSession"]>
  >["data"]
>;

export const getCurrentServerOrganizationSession = createServerOnlyFn(
  async (): Promise<OrganizationAccessSession | null> => {
    const authRequest = readServerAuthRequest();

    if (!authRequest) {
      return null;
    }

    const response = await fetch(
      new URL("get-session", `${authRequest.authBaseURL}/`),
      {
        headers: {
          accept: "application/json",
          cookie: authRequest.cookie,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Session lookup failed with status ${response.status}.`);
    }

    const session = (await response.json()) as unknown;

    if (session === null) {
      return null;
    }

    if (!isOrganizationAccessSession(session)) {
      throw new Error("Session lookup returned an invalid payload.");
    }

    return session;
  }
);

export const getCurrentServerOrganizations = createServerOnlyFn(async () => {
  const authRequest = readServerAuthRequest();

  if (!authRequest) {
    throw new Error(
      "Cannot list organizations without the current auth cookie."
    );
  }

  const response = await fetch(
    new URL("organization/list", `${authRequest.authBaseURL}/`),
    {
      headers: {
        accept: "application/json",
        cookie: authRequest.cookie,
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Organization lookup failed with status ${response.status}.`
    );
  }

  const organizations = (await response.json()) as unknown;

  if (!organizations) {
    throw new Error("Organization lookup returned no data.");
  }

  try {
    return Schema.decodeUnknownSync(OrganizationSummaryListSchema)(
      organizations
    );
  } catch {
    throw new Error("Organization lookup returned an invalid payload.");
  }
});

function readServerAuthRequest(): {
  cookie: string;
  authBaseURL: string;
} | null {
  const cookie = getRequestHeader("cookie");

  if (!cookie) {
    return null;
  }

  const serverAuthOrigin = readServerAuthOrigin();
  const authBaseURL = resolveAuthBaseURL(
    `${getRequestProtocol()}://${getRequestHost()}`,
    serverAuthOrigin
  );

  if (!authBaseURL) {
    throw new Error(
      "Cannot resolve the auth base URL for organization auth requests."
    );
  }

  return { cookie, authBaseURL };
}

function readServerAuthOrigin(): string | undefined {
  if (typeof __SERVER_AUTH_ORIGIN__ === "string") {
    return __SERVER_AUTH_ORIGIN__;
  }

  const authOrigin = process.env.AUTH_ORIGIN;
  return typeof authOrigin === "string" ? authOrigin : undefined;
}

function isOrganizationAccessSession(
  value: unknown
): value is OrganizationAccessSession {
  if (!isRecord(value)) {
    return false;
  }

  if (!isRecord(value.session) || !isRecord(value.user)) {
    return false;
  }

  if (typeof value.user.id !== "string") {
    return false;
  }

  if (typeof value.user.name !== "string") {
    return false;
  }

  if (typeof value.user.email !== "string") {
    return false;
  }

  const {activeOrganizationId} = value.session;

  return (
    activeOrganizationId === undefined ||
    activeOrganizationId === null ||
    typeof activeOrganizationId === "string"
  );
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}
