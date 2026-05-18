"use client";
import type { OrganizationAsyncResult } from "./organization-configuration-state";

export function OrganizationAsyncResultError({
  result,
}: {
  readonly result: OrganizationAsyncResult;
}) {
  if (!result.error) {
    return null;
  }

  return (
    <p role="alert" className="text-sm text-destructive">
      {result.error instanceof Error ? result.error.message : "Request failed."}
    </p>
  );
}
