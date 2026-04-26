import { createFileRoute, useRouteContext } from "@tanstack/react-router";

import { requireOrganizationAdministrationAccess } from "#/features/organizations/organization-access";
import { OrganizationSettingsPage } from "#/features/organizations/organization-settings-page";

export const Route = createFileRoute("/_app/_org/settings")({
  staticData: {
    breadcrumb: {
      label: "Settings",
      to: "/settings",
    },
  },
  beforeLoad: async () => {
    await requireOrganizationAdministrationAccess();
  },
  component: SettingsRoute,
});

function SettingsRoute() {
  const { activeOrganization } = useRouteContext({ from: "/_app/_org" });

  if (!activeOrganization) {
    throw new Error("Organization settings require an active organization.");
  }

  return <OrganizationSettingsPage organization={activeOrganization} />;
}
