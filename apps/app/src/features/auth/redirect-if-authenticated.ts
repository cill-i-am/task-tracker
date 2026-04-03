import { redirect } from "@tanstack/react-router";

import { authClient } from "#/lib/auth-client";

export async function redirectIfAuthenticated() {
  const session = await authClient.getSession();

  if (session.data?.session) {
    throw redirect({ to: "/" });
  }
}
