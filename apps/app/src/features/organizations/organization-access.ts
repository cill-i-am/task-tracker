import { redirect } from "@tanstack/react-router";

import { authClient } from "#/lib/auth-client";

import { isServerEnvironment } from "../auth/runtime-environment";
import { getCurrentServerSession } from "../auth/server-session";
import {
  getCurrentServerOrganizationSession,
  getCurrentServerOrganizations,
  listCurrentServerOrganizations,
} from "./organization-server";

export interface OrganizationSummary {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
}

type Session = NonNullable<
  Awaited<ReturnType<typeof authClient.getSession>>["data"]
>;
type RawOrganization = NonNullable<
  Awaited<ReturnType<typeof authClient.organization.list>>["data"]
>[number];

async function getCurrentSession(): Promise<Session | null> {
  if (isServerEnvironment()) {
    const session = await getCurrentServerSession();

    if (session) {
      return session;
    }

    return await getCurrentServerOrganizationSession();
  }

  const session = await authClient.getSession();

  if (session.error) {
    throw session.error;
  }

  return session.data ?? null;
}

export async function listOrganizations(): Promise<
  readonly OrganizationSummary[]
> {
  if (isServerEnvironment()) {
    return await listCurrentServerOrganizations();
  }

  const organizations = await authClient.organization.list();

  if (organizations.error) {
    throw organizations.error;
  }

  if (!organizations.data) {
    throw new Error("Organization lookup returned no data.");
  }

  return organizations.data.map(toOrganizationSummary);
}

export async function ensureActiveOrganizationId() {
  const session = await getCurrentSession();

  if (!session) {
    throw redirect({ to: "/login" });
  }

  const { activeOrganizationId } = session.session;

  if (activeOrganizationId) {
    return {
      activeOrganizationId,
      session,
    };
  }

  const organizations = await resolveOrganizationListForAccess(
    await listOrganizations()
  );

  const [firstOrganization] = organizations;

  if (!firstOrganization) {
    throw redirect({ href: "/create-organization" });
  }

  return {
    activeOrganizationId: firstOrganization.id,
    session: withActiveOrganizationId(session, firstOrganization.id),
  };
}

export async function requireOrganizationAccess() {
  return await ensureActiveOrganizationId();
}

export async function redirectIfOrganizationReady() {
  const session = await getCurrentSession();

  if (!session) {
    throw redirect({ to: "/login" });
  }

  if (session.session.activeOrganizationId) {
    throw redirect({ to: "/" });
  }

  const organizations = await resolveOrganizationListForAccess(
    await listOrganizations()
  );

  if (organizations.length > 0) {
    throw redirect({ to: "/" });
  }
}

async function resolveOrganizationListForAccess(
  organizations: readonly OrganizationSummary[]
): Promise<readonly OrganizationSummary[]> {
  if (!isServerEnvironment() || organizations.length > 0) {
    return organizations;
  }

  const strictOrganizations = await getCurrentServerOrganizations();
  return strictOrganizations.map(toOrganizationSummary);
}

function toOrganizationSummary(
  organization: Pick<RawOrganization, "id" | "name" | "slug">
): OrganizationSummary {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
  };
}

function withActiveOrganizationId(
  session: Session,
  activeOrganizationId: string
) {
  return {
    ...session,
    session: {
      ...session.session,
      activeOrganizationId,
    },
  } satisfies Session;
}
