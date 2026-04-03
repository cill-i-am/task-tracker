import { createAuthClient } from "better-auth/react";

const AUTH_BASE_PATH = "/api/auth";
const LOCAL_APP_PORT = "3000";
const LOCAL_API_PORT = "3001";

function toURL(input: string): URL | undefined {
  try {
    return new URL(input);
  } catch {
    return undefined;
  }
}

function mapAppOriginToApiOrigin(url: URL): URL {
  const mapped = new URL(url.toString());

  if (mapped.hostname.includes(".app.task-tracker.localhost")) {
    mapped.hostname = mapped.hostname.replace(
      ".app.task-tracker.localhost",
      ".api.task-tracker.localhost"
    );
    return mapped;
  }

  if (mapped.hostname === "app.task-tracker.localhost") {
    mapped.hostname = "api.task-tracker.localhost";
    return mapped;
  }

  if (
    (mapped.hostname === "127.0.0.1" || mapped.hostname === "localhost") &&
    mapped.port === LOCAL_APP_PORT
  ) {
    mapped.port = LOCAL_API_PORT;
    return mapped;
  }

  return mapped;
}

export function resolveAuthBaseURL(
  origin = globalThis.location?.origin
): string {
  const url = typeof origin === "string" ? toURL(origin) : undefined;

  if (!url) {
    return AUTH_BASE_PATH;
  }

  return new URL(AUTH_BASE_PATH, mapAppOriginToApiOrigin(url)).toString();
}

export const authClient = createAuthClient({
  basePath: AUTH_BASE_PATH,
  baseURL: resolveAuthBaseURL(),
});
