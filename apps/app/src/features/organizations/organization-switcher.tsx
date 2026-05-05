"use client";
import type { OrganizationSummary } from "./organization-access";

export function OrganizationSwitcher({
  activeOrganization,
}: {
  readonly activeOrganization?: OrganizationSummary | null;
}) {
  return <div>{activeOrganization?.name ?? "No organization"}</div>;
}
