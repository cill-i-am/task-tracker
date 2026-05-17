import {
  readErrorName,
  readHttpStatus,
  readStringProperty,
} from "@ceird/observability-core";
import { isRedirect } from "@tanstack/react-router";

import { emitAppEffectLog } from "#/lib/effect-log";

import {
  APP_API_ORIGIN_RESOLUTION_ERROR_TAG,
  APP_API_REQUEST_ERROR_TAG,
} from "./app-api-errors";
import { isAppServerOperationFailureObserved } from "./app-server-observability";

interface AppRouteOperationContext {
  readonly activeOrganizationSyncRequired?: boolean | undefined;
  readonly currentOrganizationRole?: string | undefined;
  readonly operation: string;
  readonly routeId: string;
}

export async function observeAppRouteOperation<Result>(
  context: AppRouteOperationContext,
  execute: () => Promise<Result>
): Promise<Result> {
  const start = performance.now();

  try {
    return await execute();
  } catch (error) {
    reportAppRouteOperationFailure(context, error, start);
    throw error;
  }
}

export function observeAppRouteSyncOperation<Result>(
  context: AppRouteOperationContext,
  execute: () => Result
): Result {
  const start = performance.now();

  try {
    return execute();
  } catch (error) {
    reportAppRouteOperationFailure(context, error, start);
    throw error;
  }
}

function reportAppRouteOperationFailure(
  context: AppRouteOperationContext,
  error: unknown,
  start: number
) {
  if (
    !isServerEnvironment() ||
    isRedirect(error) ||
    isAppServerOperationFailureObserved(error)
  ) {
    return;
  }

  emitAppEffectLog({
    annotations: {
      routeId: context.routeId,
      operation: context.operation,
      ...(context.activeOrganizationSyncRequired === undefined
        ? {}
        : {
            activeOrganizationSyncRequired:
              context.activeOrganizationSyncRequired,
          }),
      ...(context.currentOrganizationRole
        ? { currentOrganizationRole: context.currentOrganizationRole }
        : {}),
      durationMs: Math.max(0, Math.round(performance.now() - start)),
      ...classifyRouteOperationError(error),
    },
    level: "warning",
    message: "App route operation failed",
  });
}

function classifyRouteOperationError(error: unknown) {
  return {
    errorName: readErrorName(error),
    errorBucket: readRouteErrorBucket(error),
    ...readRouteErrorTag(error),
    ...readRouteErrorStatus(error),
  };
}

function readRouteErrorBucket(error: unknown) {
  const tag = readStringProperty(error, "_tag");

  if (tag === APP_API_ORIGIN_RESOLUTION_ERROR_TAG) {
    return "api_origin_unresolved";
  }

  if (tag === APP_API_REQUEST_ERROR_TAG) {
    return "app_api_request_failed";
  }

  if (tag?.startsWith("@ceird/")) {
    return "domain_error";
  }

  const status = readHttpStatus(error);

  if (status !== undefined) {
    return "route_http_status";
  }

  if (error instanceof TypeError) {
    return "transport_failure";
  }

  return "route_operation_failed";
}

function readRouteErrorTag(error: unknown) {
  const tag = readStringProperty(error, "_tag");

  return tag ? { errorTag: tag } : {};
}

function readRouteErrorStatus(error: unknown) {
  const status = readHttpStatus(error);

  return status === undefined ? {} : { status };
}

function isServerEnvironment() {
  return typeof window === "undefined";
}
