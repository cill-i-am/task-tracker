"use client";

import { useMatches } from "@tanstack/react-router";
import type { OrganizationRole } from "@task-tracker/identity-core";

export function useCurrentOrganizationRoleFromMatches() {
  return useMatches({
    select: (matches) => {
      const orgMatch = matches.find(
        (match) => match.routeId === "/_app/_org" || match.id === "/_app/_org"
      );
      const context = orgMatch?.context as
        | { readonly currentOrganizationRole?: unknown }
        | undefined;
      const role = context?.currentOrganizationRole;

      return isOrganizationRole(role) ? role : undefined;
    },
  });
}

function isOrganizationRole(input: unknown): input is OrganizationRole {
  return input === "owner" || input === "admin" || input === "member";
}
