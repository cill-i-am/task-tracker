import { redirect } from "@tanstack/react-router";

import { authClient } from "#/lib/auth-client";

import { isServerEnvironment } from "../auth/runtime-environment";
import type {
  OrganizationAccessSession,
  OrganizationSummary,
} from "./organization-server";
import {
  getCurrentServerOrganizationSession,
  getCurrentServerOrganizations,
} from "./organization-server";

type Session = OrganizationAccessSession;
type RawOrganization = NonNullable<
  Awaited<ReturnType<typeof authClient.organization.list>>["data"]
>[number];

type OrganizationAccessState = {
  session: Session;
  organizations: readonly OrganizationSummary[];
  organizationId: string | null;
} | null;

async function getCurrentSession(): Promise<Session | null> {
  if (isServerEnvironment()) {
    return await getCurrentServerOrganizationSession();
  }

  const session = await authClient.getSession();

  if (session.error) {
    throw session.error;
  }

  return session.data ?? null;
}

async function getCurrentOrganizations() {
  if (isServerEnvironment()) {
    return await getCurrentServerOrganizations();
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

async function getOrganizationAccessState(): Promise<OrganizationAccessState> {
  const session = await getCurrentSession();

  if (!session) {
    return null;
  }

  const activeOrganizationId = session.session.activeOrganizationId ?? null;

  if (activeOrganizationId) {
    return {
      session,
      organizations: [],
      organizationId: activeOrganizationId,
    };
  }

  const organizations = await getCurrentOrganizations();

  return {
    session,
    organizations,
    organizationId: organizations[0]?.id ?? null,
  };
}

export async function requireOrganizationAccess() {
  const access = await getOrganizationAccessState();

  if (!access) {
    throw redirect({ to: "/login" });
  }

  if (access.organizationId) {
    return access;
  }

  throw redirect({ href: "/create-organization" });
}

export async function redirectIfOrganizationReady() {
  const access = await getOrganizationAccessState();

  if (access?.organizationId) {
    throw redirect({ to: "/" });
  }
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
