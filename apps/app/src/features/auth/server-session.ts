import { createServerOnlyFn } from "@tanstack/react-start";
import { decodeBetterAuthSession } from "@task-tracker/identity-core";
import type { BetterAuthSession } from "@task-tracker/identity-core";

import { resolveConfiguredServerAuthBaseURL } from "#/lib/auth-client.server";
import {
  normalizeServerApiCookieHeader,
  readServerApiForwardedHeaders,
} from "#/lib/server-api-forwarded-headers";

export const getCurrentServerSession = createServerOnlyFn(async () => {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const cookie = getRequestHeader("cookie");
  const authBaseURL = resolveConfiguredServerAuthBaseURL();
  const forwardedHeaders = readServerApiForwardedHeaders({
    host: getRequestHeader("host"),
    forwardedProto: getRequestHeader("x-forwarded-proto"),
  });

  if (!cookie || !authBaseURL) {
    return null;
  }

  const normalizedCookie = normalizeServerApiCookieHeader(cookie, authBaseURL);

  const response = await fetch(new URL("get-session", `${authBaseURL}/`), {
    headers: {
      accept: "application/json",
      cookie: normalizedCookie,
      ...forwardedHeaders,
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as unknown;

  if (payload === null) {
    return null;
  }

  return decodeServerAuthSession(payload);
});

function decodeServerAuthSession(payload: unknown): BetterAuthSession | null {
  try {
    return decodeBetterAuthSession(payload);
  } catch {
    return null;
  }
}
