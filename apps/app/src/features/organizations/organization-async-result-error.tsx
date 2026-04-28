"use client";

import type { Result } from "@effect-atom/atom-react";
import { Cause } from "effect";

export function OrganizationAsyncResultError({
  result,
}: {
  readonly result: Result.Result<unknown, unknown>;
}) {
  if (result._tag !== "Failure") {
    return null;
  }

  const error = Cause.squash(result.cause);

  return (
    <p role="alert" className="text-sm text-destructive">
      {error instanceof Error ? error.message : "Request failed."}
    </p>
  );
}
