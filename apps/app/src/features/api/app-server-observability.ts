import {
  CEIRD_REQUEST_ID_HEADER,
  CF_RAY_HEADER,
  isHttpStatus,
  readErrorName,
  readHttpStatus,
  readIntegerProperty,
  readSafeCorrelationId,
  readStringProperty,
} from "@ceird/observability-core";

import { readCurrentAppStartRequestContext } from "#/lib/app-start-context";
import { emitAppEffectLog } from "#/lib/effect-log";

import {
  APP_API_ORIGIN_RESOLUTION_ERROR_TAG,
  APP_API_REQUEST_ERROR_TAG,
} from "./app-api-errors";

const CEIRD_ERROR_TAG_PREFIX = "@ceird/";
const APP_SERVER_OPERATION_FAILURE_BUCKETS = [
  "api_origin_unresolved",
  "app_api_request_failed",
  "auth_origin_unresolved",
  "domain_error",
  "invalid_upstream_payload",
  "missing_auth_cookie",
  "server_operation_failed",
  "transport_failure",
  "upstream_status",
] as const;
const APP_SERVER_OPERATION_FAILURE_METADATA: unique symbol = Symbol(
  "@ceird/app/server-operation-failure"
);
const APP_SERVER_OPERATION_FAILURE_OBSERVED: unique symbol = Symbol(
  "@ceird/app/server-operation-failure-observed"
);

export type AppServerOperationFailureBucket =
  (typeof APP_SERVER_OPERATION_FAILURE_BUCKETS)[number];

export interface AppServerOperationFailureMetadata {
  readonly bucket: AppServerOperationFailureBucket;
  readonly status?: number | undefined;
}

interface AppServerOperationFailureMetadataCarrier {
  readonly [APP_SERVER_OPERATION_FAILURE_METADATA]?: unknown;
  readonly [APP_SERVER_OPERATION_FAILURE_OBSERVED]?: unknown;
}

export interface AppServerOperationContext {
  readonly cfRay?: string | undefined;
  readonly operation: string;
  readonly requestId?: string | undefined;
  readonly targetOrigin?: string | undefined;
}

export async function observeAppServerOperation<Response>(
  context: AppServerOperationContext,
  execute: () => Response | Promise<Response>
): Promise<Response> {
  const start = performance.now();

  try {
    return await execute();
  } catch (error) {
    reportAppServerOperationFailure(context, error, start);
    throw error;
  }
}

export function makeAppServerOperationContext(input: {
  readonly cfRay?: string | undefined;
  readonly getRequestHeader?:
    | ((name: string) => string | undefined)
    | undefined;
  readonly operation: string;
  readonly requestId?: string | undefined;
  readonly targetOrigin?: string | undefined;
}): AppServerOperationContext {
  const startContext = readCurrentAppStartRequestContext();
  const cfRay =
    readSafeCorrelationId(input.cfRay) ??
    readSafeCorrelationId(input.getRequestHeader?.(CF_RAY_HEADER)) ??
    readSafeCorrelationId(startContext?.cfRay);
  const requestId =
    readSafeCorrelationId(input.requestId) ??
    readSafeCorrelationId(input.getRequestHeader?.(CEIRD_REQUEST_ID_HEADER)) ??
    readSafeCorrelationId(startContext?.requestId) ??
    cfRay;
  const targetOrigin = readSafeTargetOrigin(input.targetOrigin);

  return {
    operation: input.operation,
    ...(requestId ? { requestId } : {}),
    ...(cfRay ? { cfRay } : {}),
    ...(targetOrigin ? { targetOrigin } : {}),
  };
}

export function reportAppServerOperationFailure(
  context: AppServerOperationContext,
  error: unknown,
  start: number
) {
  markAppServerOperationFailureObserved(error);
  emitAppEffectLog({
    annotations: {
      operation: context.operation,
      ...(context.requestId ? { requestId: context.requestId } : {}),
      ...(context.cfRay ? { cfRay: context.cfRay } : {}),
      ...(context.targetOrigin ? { targetOrigin: context.targetOrigin } : {}),
      durationMs: Math.max(0, Math.round(performance.now() - start)),
      ...classifyAppServerOperationError(error),
    },
    level: "warning",
    message: "App server operation failed",
  });
}

export function isAppServerOperationFailureObserved(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as AppServerOperationFailureMetadataCarrier)[
      APP_SERVER_OPERATION_FAILURE_OBSERVED
    ] === true
  );
}

export function annotateAppServerOperationFailure<ErrorValue extends object>(
  error: ErrorValue,
  metadata: AppServerOperationFailureMetadata
): ErrorValue {
  Object.defineProperty(error, APP_SERVER_OPERATION_FAILURE_METADATA, {
    configurable: true,
    enumerable: false,
    value: normalizeAppServerOperationFailureMetadata(metadata),
  });

  return error;
}

export function makeAppServerOperationFailure(input: {
  readonly bucket: AppServerOperationFailureBucket;
  readonly cause?: unknown;
  readonly message: string;
  readonly status?: number | undefined;
}): Error {
  const error =
    input.cause === undefined
      ? new Error(input.message)
      : new Error(input.message, { cause: input.cause });

  return annotateAppServerOperationFailure(error, input);
}

function classifyAppServerOperationError(error: unknown) {
  const errorTag = readStringProperty(error, "_tag");
  const metadata = readAppServerOperationFailureMetadata(error);
  const status = metadata?.status ?? readHttpStatus(error);

  return {
    errorName: readErrorName(error),
    errorBucket:
      metadata?.bucket ?? readErrorBucket({ error, errorTag, status }),
    ...(errorTag ? { errorTag } : {}),
    ...(status === undefined ? {} : { status }),
  };
}

function readErrorBucket(input: {
  readonly error: unknown;
  readonly errorTag: string | undefined;
  readonly status: number | undefined;
}): AppServerOperationFailureBucket {
  if (input.errorTag === APP_API_ORIGIN_RESOLUTION_ERROR_TAG) {
    return "api_origin_unresolved";
  }

  if (input.status !== undefined) {
    return "upstream_status";
  }

  if (input.errorTag === APP_API_REQUEST_ERROR_TAG) {
    return "app_api_request_failed";
  }

  if (input.errorTag?.startsWith(CEIRD_ERROR_TAG_PREFIX)) {
    return "domain_error";
  }

  if (input.error instanceof TypeError) {
    return "transport_failure";
  }

  return "server_operation_failed";
}

function readAppServerOperationFailureMetadata(
  error: unknown
): AppServerOperationFailureMetadata | undefined {
  if (typeof error !== "object" || error === null) {
    return;
  }

  const metadata = (error as AppServerOperationFailureMetadataCarrier)[
    APP_SERVER_OPERATION_FAILURE_METADATA
  ];

  if (!isAppServerOperationFailureMetadata(metadata)) {
    return;
  }

  return metadata;
}

function isAppServerOperationFailureMetadata(
  metadata: unknown
): metadata is AppServerOperationFailureMetadata {
  if (typeof metadata !== "object" || metadata === null) {
    return false;
  }

  const bucket = readStringProperty(metadata, "bucket");
  const status = readIntegerProperty(metadata, "status");

  return (
    isAppServerOperationFailureBucket(bucket) &&
    (status === undefined || isHttpStatus(status))
  );
}

function normalizeAppServerOperationFailureMetadata(
  metadata: AppServerOperationFailureMetadata
): AppServerOperationFailureMetadata {
  if (!isHttpStatus(metadata.status)) {
    return { bucket: metadata.bucket };
  }

  return { bucket: metadata.bucket, status: metadata.status };
}

function isAppServerOperationFailureBucket(
  bucket: string | undefined
): bucket is AppServerOperationFailureBucket {
  return APP_SERVER_OPERATION_FAILURE_BUCKETS.includes(
    bucket as AppServerOperationFailureBucket
  );
}

function readSafeTargetOrigin(origin: string | undefined) {
  const value = readNonEmptyString(origin);

  if (!value) {
    return;
  }

  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    // Invalid configured origins are intentionally omitted from logs.
  }
}

function readNonEmptyString(value: string | undefined) {
  if (value && value.length > 0) {
    return value;
  }
}

function markAppServerOperationFailureObserved(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return;
  }

  try {
    Object.defineProperty(error, APP_SERVER_OPERATION_FAILURE_OBSERVED, {
      configurable: true,
      enumerable: false,
      value: true,
    });
  } catch {
    // Non-extensible error objects can still be logged; they just cannot
    // participate in duplicate route-log suppression.
  }
}
