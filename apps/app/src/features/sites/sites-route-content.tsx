import type { OrganizationId } from "@ceird/identity-core";
import type { SitesOptionsResponse } from "@ceird/sites-core";
import type { ReactNode } from "react";

import type { OrganizationViewer } from "#/features/organizations/organization-viewer";
import { SitesPage } from "#/features/sites/sites-page";

import { SitesStateProvider } from "./sites-state";

export function SitesRouteContent({
  activeOrganizationId,
  children,
  options,
  viewer,
}: {
  readonly activeOrganizationId: OrganizationId;
  readonly children?: ReactNode;
  readonly options: SitesOptionsResponse;
  readonly viewer: OrganizationViewer;
}) {
  return (
    <SitesStateProvider
      key={activeOrganizationId}
      activeOrganizationId={activeOrganizationId}
      options={options}
    >
      <SitesPage viewer={viewer}>{children}</SitesPage>
    </SitesStateProvider>
  );
}
