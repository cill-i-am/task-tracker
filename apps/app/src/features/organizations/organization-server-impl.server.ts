import {
  createOrganizationSlugFromName,
  decodeOrganizationMemberRoleResponse,
  decodeOrganizationSummary,
  decodeOrganizationSummaryList,
  OrganizationId,
  UserId,
} from "@ceird/identity-core";
import type {
  CreateOrganizationNameInput,
  OrganizationId as OrganizationIdType,
  OrganizationMemberRoleResponse,
  OrganizationSummary,
} from "@ceird/identity-core";
import { Schema } from "effect";

import {
  makeAppServerOperationFailure,
  makeAppServerOperationContext,
  observeAppServerOperation,
} from "#/features/api/app-server-observability";
import { resolveConfiguredServerAuthBaseURL } from "#/lib/auth-client.server";
import {
  normalizeServerApiCookieHeader,
  readServerApiForwardedHeadersFromRequest,
} from "#/lib/server-api-forwarded-headers";
import type { ServerApiForwardedHeaders } from "#/lib/server-api-forwarded-headers";

const NullableString = Schema.NullOr(Schema.String);
const NullableOrganizationId = Schema.NullOr(OrganizationId);
const ORGANIZATION_SLUG_CONFLICT_MARKERS = [
  "ORGANIZATION_ALREADY_EXISTS",
  "ORGANIZATION_SLUG_ALREADY_TAKEN",
  "Organization already exists",
  "Organization slug already taken",
] as const;

const OrganizationAccessSessionSchema = Schema.Struct({
  session: Schema.Struct({
    id: Schema.String,
    createdAt: Schema.String,
    updatedAt: Schema.String,
    userId: UserId,
    expiresAt: Schema.String,
    token: Schema.String,
    ipAddress: Schema.optional(NullableString),
    userAgent: Schema.optional(NullableString),
    activeOrganizationId: Schema.optional(NullableOrganizationId),
  }),
  user: Schema.Struct({
    id: UserId,
    name: Schema.String,
    email: Schema.String,
    image: Schema.optional(NullableString),
    emailVerified: Schema.Boolean,
    createdAt: Schema.String,
    updatedAt: Schema.String,
  }),
});

export type OrganizationAccessSession = Schema.Schema.Type<
  typeof OrganizationAccessSessionSchema
>;

export type OrganizationMemberRole = OrganizationMemberRoleResponse;

interface ServerAuthRequest {
  cookie: string;
  authBaseURL: string;
  forwardedHeaders?: ServerApiForwardedHeaders;
}

export async function createCurrentServerOrganizationDirect(
  input: CreateOrganizationNameInput
): Promise<OrganizationSummary> {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  return await observeAppServerOperation(
    makeAppServerOperationContext({
      getRequestHeader,
      operation: "OrganizationsServer.createOrganization",
      targetOrigin: readServerAuthBaseURL(),
    }),
    async () => {
      const authRequest = readServerAuthRequestStrict(getRequestHeader);
      const baseSlug = createOrganizationSlugFromName(input.name);
      const response = await postCreateOrganization(authRequest, {
        name: input.name,
        slug: baseSlug,
      });

      if (response.ok) {
        await forwardAuthResponseCookies(response);
        return await readCreatedOrganization(response);
      }

      if (await isOrganizationSlugConflictResponse(response)) {
        const retryResponse = await postCreateOrganization(authRequest, {
          name: input.name,
          slug: `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`,
        });

        if (retryResponse.ok) {
          await forwardAuthResponseCookies(retryResponse);
          return await readCreatedOrganization(retryResponse);
        }

        throw makeAppServerOperationFailure({
          bucket: "upstream_status",
          message: `Organization creation failed with status ${retryResponse.status}.`,
          status: retryResponse.status,
        });
      }

      throw makeAppServerOperationFailure({
        bucket: "upstream_status",
        message: `Organization creation failed with status ${response.status}.`,
        status: response.status,
      });
    }
  );
}

export async function getCurrentServerOrganizationSessionDirect(): Promise<OrganizationAccessSession | null> {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  return await observeAppServerOperation(
    makeAppServerOperationContext({
      getRequestHeader,
      operation: "OrganizationsServer.getSession",
      targetOrigin: readServerAuthBaseURL(),
    }),
    async () => {
      const authRequest = readServerSessionRequest(getRequestHeader);

      if (!authRequest) {
        return null;
      }

      const response = await fetch(
        new URL("get-session", `${authRequest.authBaseURL}/`),
        {
          headers: {
            accept: "application/json",
            cookie: authRequest.cookie,
            ...authRequest.forwardedHeaders,
          },
        }
      );

      if (!response.ok) {
        throw makeAppServerOperationFailure({
          bucket: "upstream_status",
          message: `Session lookup failed with status ${response.status}.`,
          status: response.status,
        });
      }

      const session = (await response.json()) as unknown;

      if (session === null) {
        return null;
      }

      return decodeOrganizationAccessSession(session);
    }
  );
}

export async function getCurrentServerOrganizationsDirect() {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  return await observeAppServerOperation(
    makeAppServerOperationContext({
      getRequestHeader,
      operation: "OrganizationsServer.listOrganizations",
      targetOrigin: readServerAuthBaseURL(),
    }),
    async () => {
      const authRequest = readServerAuthRequestStrict(getRequestHeader);
      const response = await fetchOrganizations(authRequest);

      if (!response.ok) {
        throw makeAppServerOperationFailure({
          bucket: "upstream_status",
          message: `Organization lookup failed with status ${response.status}.`,
          status: response.status,
        });
      }

      const organizations = (await response.json()) as unknown;

      if (!organizations) {
        throw makeAppServerOperationFailure({
          bucket: "invalid_upstream_payload",
          message: "Organization lookup returned no data.",
        });
      }

      return decodeOrganizationSummariesStrict(organizations);
    }
  );
}

export async function getCurrentServerOrganizationMemberRoleDirect(
  organizationId: OrganizationIdType
): Promise<OrganizationMemberRole> {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  return await observeAppServerOperation(
    makeAppServerOperationContext({
      getRequestHeader,
      operation: "OrganizationsServer.getMemberRole",
      targetOrigin: readServerAuthBaseURL(),
    }),
    async () => {
      const authRequest = readServerAuthRequestStrict(getRequestHeader);
      const response = await fetch(
        new URL(
          `organization/get-active-member-role?organizationId=${encodeURIComponent(
            organizationId
          )}`,
          `${authRequest.authBaseURL}/`
        ),
        {
          headers: {
            accept: "application/json",
            cookie: authRequest.cookie,
            ...authRequest.forwardedHeaders,
          },
        }
      );

      if (!response.ok) {
        throw makeAppServerOperationFailure({
          bucket: "upstream_status",
          message: `Organization member role lookup failed with status ${response.status}.`,
          status: response.status,
        });
      }

      const role = (await response.json()) as unknown;
      return decodeOrganizationMemberRole(role);
    }
  );
}

export async function setCurrentServerActiveOrganizationDirect(
  organizationId: OrganizationIdType
): Promise<void> {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  return await observeAppServerOperation(
    makeAppServerOperationContext({
      getRequestHeader,
      operation: "OrganizationsServer.setActiveOrganization",
      targetOrigin: readServerAuthBaseURL(),
    }),
    async () => {
      const authRequest = readServerAuthRequestStrict(getRequestHeader);
      const response = await fetch(
        new URL("organization/set-active", `${authRequest.authBaseURL}/`),
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            cookie: authRequest.cookie,
            ...authRequest.forwardedHeaders,
          },
          body: JSON.stringify({ organizationId }),
        }
      );

      if (!response.ok) {
        throw makeAppServerOperationFailure({
          bucket: "upstream_status",
          message: `Active organization sync failed with status ${response.status}.`,
          status: response.status,
        });
      }
    }
  );
}

function readServerSessionRequest(
  getRequestHeader: (name: string) => string | undefined
): ServerAuthRequest | null {
  const cookie = getRequestHeader("cookie");

  if (!cookie) {
    return null;
  }

  const authBaseURL = readServerAuthBaseURL();
  const forwardedHeaders =
    readServerApiForwardedHeadersFromRequest(getRequestHeader);

  if (!authBaseURL) {
    throw makeAppServerOperationFailure({
      bucket: "auth_origin_unresolved",
      message:
        "Cannot resolve the auth base URL for organization auth requests.",
    });
  }

  return {
    cookie: normalizeServerApiCookieHeader(cookie, authBaseURL),
    authBaseURL,
    forwardedHeaders,
  };
}

function readServerAuthRequestStrict(
  getRequestHeader: (name: string) => string | undefined
): ServerAuthRequest {
  const cookie = getRequestHeader("cookie");

  if (!cookie) {
    throw makeAppServerOperationFailure({
      bucket: "missing_auth_cookie",
      message: "Cannot list organizations without the current auth cookie.",
    });
  }

  const authBaseURL = readServerAuthBaseURL();
  const forwardedHeaders =
    readServerApiForwardedHeadersFromRequest(getRequestHeader);

  if (!authBaseURL) {
    throw makeAppServerOperationFailure({
      bucket: "auth_origin_unresolved",
      message:
        "Cannot resolve the auth base URL for organization auth requests.",
    });
  }

  return {
    cookie: normalizeServerApiCookieHeader(cookie, authBaseURL),
    authBaseURL,
    forwardedHeaders,
  };
}

function readServerAuthBaseURL(): string | undefined {
  return resolveConfiguredServerAuthBaseURL();
}

async function fetchOrganizations(authRequest: ServerAuthRequest) {
  return await fetch(
    new URL("organization/list", `${authRequest.authBaseURL}/`),
    {
      headers: {
        accept: "application/json",
        cookie: authRequest.cookie,
        ...authRequest.forwardedHeaders,
      },
    }
  );
}

async function postCreateOrganization(
  authRequest: ServerAuthRequest,
  input: { name: string; slug: string }
) {
  return await fetch(
    new URL("organization/create", `${authRequest.authBaseURL}/`),
    {
      body: JSON.stringify(input),
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        cookie: authRequest.cookie,
        ...authRequest.forwardedHeaders,
      },
      method: "POST",
    }
  );
}

async function isOrganizationSlugConflictResponse(response: Response) {
  if (response.status !== 400) {
    return false;
  }

  const bodyText = await response
    .clone()
    .text()
    .catch(() => "");

  return ORGANIZATION_SLUG_CONFLICT_MARKERS.some((marker) =>
    bodyText.includes(marker)
  );
}

async function forwardAuthResponseCookies(response: Response) {
  const setCookies = readSetCookieHeaders(response.headers);

  if (setCookies.length === 0) {
    return;
  }

  const { setResponseHeader } = await import("@tanstack/react-start/server");
  setResponseHeader("set-cookie", setCookies);
}

async function readCreatedOrganization(
  response: Response
): Promise<OrganizationSummary> {
  try {
    return decodeOrganizationSummary((await response.json()) as unknown);
  } catch {
    throw makeAppServerOperationFailure({
      bucket: "invalid_upstream_payload",
      message: "Organization creation returned an invalid payload.",
    });
  }
}

function readSetCookieHeaders(headers: Headers): string[] {
  const headersWithSetCookie = headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookies = headersWithSetCookie.getSetCookie?.();

  if (setCookies && setCookies.length > 0) {
    return setCookies;
  }

  const setCookie = headers.get("set-cookie");
  return setCookie ? [setCookie] : [];
}

function decodeOrganizationSummariesStrict(
  organizations: unknown
): readonly OrganizationSummary[] {
  try {
    return decodeOrganizationSummaryList(organizations);
  } catch {
    throw makeAppServerOperationFailure({
      bucket: "invalid_upstream_payload",
      message: "Organization lookup returned an invalid payload.",
    });
  }
}

function decodeOrganizationAccessSession(
  session: unknown
): OrganizationAccessSession {
  try {
    return Schema.decodeUnknownSync(OrganizationAccessSessionSchema)(session);
  } catch {
    throw makeAppServerOperationFailure({
      bucket: "invalid_upstream_payload",
      message: "Session lookup returned an invalid payload.",
    });
  }
}

function decodeOrganizationMemberRole(role: unknown): OrganizationMemberRole {
  try {
    return decodeOrganizationMemberRoleResponse(role);
  } catch {
    throw makeAppServerOperationFailure({
      bucket: "invalid_upstream_payload",
      message: "Organization member role lookup returned an invalid payload.",
    });
  }
}
