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

interface ServerAuthRequest {
  cookie: string;
  authBaseURL: string;
}

export const getCurrentServerOrganizationSession = createServerOnlyFn(
  async (): Promise<OrganizationAccessSession | null> => {
    const authRequest = readServerSessionRequest();

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

export const listCurrentServerOrganizations = createServerOnlyFn(async () => {
  const authRequest = readServerAuthRequest();

  if (!authRequest) {
    return [] as const;
  }

  const response = await fetchOrganizations(authRequest);

  if (!response.ok) {
    return [] as const;
  }

  const organizations = (await response.json()) as unknown;
  return decodeOrganizationSummariesOrEmpty(organizations);
});

export const getCurrentServerOrganizations = createServerOnlyFn(async () => {
  const authRequest = readServerAuthRequestStrict();
  const response = await fetchOrganizations(authRequest);

  if (!response.ok) {
    throw new Error(
      `Organization lookup failed with status ${response.status}.`
    );
  }

  const organizations = (await response.json()) as unknown;

  if (!organizations) {
    throw new Error("Organization lookup returned no data.");
  }

  return decodeOrganizationSummariesStrict(organizations);
});

function readServerSessionRequest(): ServerAuthRequest | null {
  const cookie = getRequestHeader("cookie");

  if (!cookie) {
    return null;
  }

  const authBaseURL = readServerAuthBaseURL();

  if (!authBaseURL) {
    throw new Error(
      "Cannot resolve the auth base URL for organization auth requests."
    );
  }

  return { cookie, authBaseURL };
}

function readServerAuthRequest(): ServerAuthRequest | null {
  const cookie = getRequestHeader("cookie");
  const authBaseURL = readServerAuthBaseURL();

  if (!cookie || !authBaseURL) {
    return null;
  }

  return { cookie, authBaseURL };
}

function readServerAuthRequestStrict(): ServerAuthRequest {
  const cookie = getRequestHeader("cookie");

  if (!cookie) {
    throw new Error(
      "Cannot list organizations without the current auth cookie."
    );
  }

  const authBaseURL = readServerAuthBaseURL();

  if (!authBaseURL) {
    throw new Error(
      "Cannot resolve the auth base URL for organization auth requests."
    );
  }

  return { cookie, authBaseURL };
}

function readServerAuthBaseURL(): string | undefined {
  const serverAuthOrigin = readServerAuthOrigin();

  return resolveAuthBaseURL(
    `${getRequestProtocol()}://${getRequestHost()}`,
    serverAuthOrigin
  );
}

function readServerAuthOrigin(): string | undefined {
  if (typeof __SERVER_AUTH_ORIGIN__ === "string") {
    return __SERVER_AUTH_ORIGIN__;
  }

  const authOrigin = process.env.AUTH_ORIGIN;
  return typeof authOrigin === "string" ? authOrigin : undefined;
}

async function fetchOrganizations(authRequest: ServerAuthRequest) {
  return await fetch(
    new URL("organization/list", `${authRequest.authBaseURL}/`),
    {
      headers: {
        accept: "application/json",
        cookie: authRequest.cookie,
      },
    }
  );
}

function decodeOrganizationSummariesOrEmpty(
  organizations: unknown
): readonly OrganizationSummary[] {
  if (!organizations) {
    return [];
  }

  try {
    return Schema.decodeUnknownSync(OrganizationSummaryListSchema)(
      organizations
    );
  } catch {
    return [];
  }
}

function decodeOrganizationSummariesStrict(
  organizations: unknown
): readonly OrganizationSummary[] {
  try {
    return Schema.decodeUnknownSync(OrganizationSummaryListSchema)(
      organizations
    );
  } catch {
    throw new Error("Organization lookup returned an invalid payload.");
  }
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

  const { activeOrganizationId } = value.session;

  return (
    activeOrganizationId === undefined ||
    activeOrganizationId === null ||
    typeof activeOrganizationId === "string"
  );
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}
