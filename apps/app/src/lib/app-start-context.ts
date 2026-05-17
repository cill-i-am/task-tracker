import {
  CEIRD_REQUEST_ID_HEADER,
  CF_RAY_HEADER,
  readSafeCorrelationId,
} from "@ceird/observability-core";
import { getGlobalStartContext } from "@tanstack/react-start";

export interface AppStartRequestContext {
  readonly cfRay?: string | undefined;
  readonly requestId: string;
}

export function makeAppStartRequestContext(
  request: Request
): AppStartRequestContext {
  const cfRay = readHeader(request, CF_RAY_HEADER);
  const requestId =
    readHeader(request, CEIRD_REQUEST_ID_HEADER) ??
    cfRay ??
    crypto.randomUUID();

  return {
    requestId,
    ...(cfRay ? { cfRay } : {}),
  };
}

export function readCurrentAppStartRequestContext():
  | Partial<AppStartRequestContext>
  | undefined {
  try {
    return readAppStartRequestContext(getGlobalStartContext());
  } catch {
    return undefined;
  }
}

export function readAppStartRequestContext(
  value: unknown
): Partial<AppStartRequestContext> | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const context = value as Record<string, unknown>;
  const requestId = readNonEmptyString(context.requestId);
  const cfRay = readNonEmptyString(context.cfRay);

  if (!requestId && !cfRay) {
    return undefined;
  }

  return {
    ...(requestId ? { requestId } : {}),
    ...(cfRay ? { cfRay } : {}),
  };
}

function readHeader(request: Request, name: string) {
  return readSafeCorrelationId(request.headers.get(name));
}

function readNonEmptyString(value: unknown) {
  return readSafeCorrelationId(value);
}
