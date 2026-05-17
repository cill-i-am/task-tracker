import type { OrganizationId, OrganizationRole } from "@ceird/identity-core";

import { getCurrentServerLabels } from "#/features/api/app-api-server";
import { observeAppRouteOperation } from "#/features/api/app-route-observability";
import type { ActiveOrganizationSync } from "#/features/organizations/organization-access";

interface SettingsRouteContext {
  readonly activeOrganizationId: OrganizationId;
  readonly activeOrganizationSync: ActiveOrganizationSync;
  readonly currentOrganizationRole?: OrganizationRole | undefined;
}

export async function loadSettingsRoute(context: SettingsRouteContext) {
  return await observeAppRouteOperation(
    {
      activeOrganizationSyncRequired: context.activeOrganizationSync.required,
      currentOrganizationRole: context.currentOrganizationRole,
      operation: "loadSettingsRoute",
      routeId: "/organization/settings",
    },
    async () => {
      if (context.activeOrganizationSync.required) {
        return {
          organizationLabels: [],
        };
      }

      const labels = await getCurrentServerLabels();

      return {
        organizationLabels: labels.labels,
      };
    }
  );
}
