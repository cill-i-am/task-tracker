import { redirect } from "@tanstack/react-router";

import { authClient } from "#/lib/auth-client";

import { getLoginNavigationTarget } from "./auth-navigation";
import { isServerEnvironment } from "./runtime-environment";

async function getCurrentSession() {
  if (isServerEnvironment()) {
    const { getCurrentServerSession } = await import("./server-session");
    return await getCurrentServerSession();
  }

  const session = await authClient.getSession();
  return session.data ?? null;
}

export async function requireAuthenticatedSession() {
  const session = await getCurrentSession();

  if (!session) {
    throw redirect(getLoginNavigationTarget());
  }

  return session;
}
