import { createFileRoute } from "@tanstack/react-router";

import { LoginPage } from "#/features/auth/login-page";
import { redirectIfAuthenticated } from "#/features/auth/redirect-if-authenticated";

export const Route = createFileRoute("/login")({
  beforeLoad: redirectIfAuthenticated,
  component: LoginPage,
});
