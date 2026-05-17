declare const __SERVER_API_ORIGIN__: string | null | undefined;

export function readConfiguredServerApiOrigin(): string | undefined {
  return readProcessServerApiOrigin() ?? readBuildTimeServerApiOrigin();
}

function readProcessServerApiOrigin(): string | undefined {
  const origin = (
    globalThis as unknown as {
      readonly process?: {
        readonly env?: Record<string, string | undefined>;
      };
    }
  ).process?.env?.API_ORIGIN;

  return readNonEmptyOrigin(origin);
}

function readBuildTimeServerApiOrigin(): string | undefined {
  if (typeof __SERVER_API_ORIGIN__ !== "string") {
    return undefined;
  }

  return readNonEmptyOrigin(__SERVER_API_ORIGIN__);
}

function readNonEmptyOrigin(origin: string | null | undefined) {
  return typeof origin === "string" && origin.length > 0 ? origin : undefined;
}
