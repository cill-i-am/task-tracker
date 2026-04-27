export function readConfiguredServerApiOrigin(): string | undefined {
  return typeof __SERVER_API_ORIGIN__ === "string" ? __SERVER_API_ORIGIN__ : undefined;
}

