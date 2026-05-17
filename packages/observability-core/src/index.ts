import { Deferred, Effect } from "effect";

export const CEIRD_REQUEST_ID_HEADER = "x-ceird-request-id" as const;
export const CF_RAY_HEADER = "cf-ray" as const;
const CORRELATION_ID_MAX_LENGTH = 128;
const UUID_CORRELATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CF_RAY_CORRELATION_ID_PATTERN = /^[0-9a-f]{16}-[a-z]{3}$/i;

export interface EffectLogEntry {
  readonly annotations?: Record<string, unknown> | undefined;
  readonly level: "error" | "info" | "warning";
  readonly message: string;
}

export type EffectLogSink<Entry extends EffectLogEntry = EffectLogEntry> = (
  entry: Entry
) => Effect.Effect<void, never, never>;

export function makeEffectLogEmitter<
  Entry extends EffectLogEntry = EffectLogEntry,
>() {
  let sink: EffectLogSink<Entry> = defaultEffectLogSink;
  let sinkScope: Promise<unknown> = Promise.resolve();

  return {
    emit(entry: Entry) {
      Effect.runSync(sink(entry));
    },
    async withSinkForTest<Result>(
      nextSink: EffectLogSink<Entry>,
      execute: () => Result | Promise<Result>
    ): Promise<Result> {
      const previousSinkScope = sinkScope;
      const nextSinkScope = Effect.runSync(Deferred.make<null>());
      sinkScope = Effect.runPromise(Deferred.await(nextSinkScope));

      await previousSinkScope;

      const previousSink = sink;
      sink = nextSink;

      try {
        return await execute();
      } finally {
        sink = previousSink;
        Effect.runSync(Deferred.succeed(nextSinkScope, null));
      }
    },
  };
}

export function readSafeCorrelationId(value: unknown) {
  if (typeof value !== "string") {
    return;
  }

  const trimmed = value.trim();

  if (
    trimmed.length === 0 ||
    trimmed.length > CORRELATION_ID_MAX_LENGTH ||
    (!UUID_CORRELATION_ID_PATTERN.test(trimmed) &&
      !CF_RAY_CORRELATION_ID_PATTERN.test(trimmed))
  ) {
    return;
  }

  return trimmed;
}

export function readSafeRequestPath(url: string) {
  const queryIndex = url.indexOf("?");
  const hashIndex = url.indexOf("#");
  const endIndex = Math.min(
    queryIndex === -1 ? url.length : queryIndex,
    hashIndex === -1 ? url.length : hashIndex
  );
  const pathOrUrl = url.slice(0, endIndex);

  if (pathOrUrl.startsWith("/")) {
    return pathOrUrl;
  }

  const protocolSeparatorIndex = pathOrUrl.indexOf("://");

  if (protocolSeparatorIndex === -1) {
    return pathOrUrl;
  }

  const pathnameStartIndex = pathOrUrl.indexOf("/", protocolSeparatorIndex + 3);

  return pathnameStartIndex === -1 ? "/" : pathOrUrl.slice(pathnameStartIndex);
}

export function readErrorName(error: unknown) {
  if (error instanceof Error) {
    return error.name;
  }

  if (typeof error === "object" && error !== null) {
    return "Object";
  }

  return typeof error;
}

export function readHttpStatus(value: unknown) {
  const status =
    readIntegerProperty(value, "status") ??
    readIntegerProperty(value, "statusCode");

  return isHttpStatus(status) ? status : undefined;
}

export function readStringProperty(value: unknown, property: string) {
  if (typeof value !== "object" || value === null || !(property in value)) {
    return;
  }

  const propertyValue = (value as Record<string, unknown>)[property];

  if (typeof propertyValue === "string" && propertyValue.length > 0) {
    return propertyValue;
  }
}

export function readIntegerProperty(value: unknown, property: string) {
  if (typeof value !== "object" || value === null || !(property in value)) {
    return;
  }

  const propertyValue = (value as Record<string, unknown>)[property];

  if (typeof propertyValue === "number" && Number.isInteger(propertyValue)) {
    return propertyValue;
  }
}

export function isHttpStatus(status: number | undefined): status is number {
  return status !== undefined && status >= 100 && status <= 599;
}

function defaultEffectLogSink<Entry extends EffectLogEntry>(entry: Entry) {
  return makeEffectLog(entry).pipe(
    Effect.annotateLogs(entry.annotations ?? {})
  );
}

function makeEffectLog(entry: EffectLogEntry) {
  if (entry.level === "error") {
    return Effect.logError(entry.message);
  }

  if (entry.level === "warning") {
    return Effect.logWarning(entry.message);
  }

  return Effect.logInfo(entry.message);
}
