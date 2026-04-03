import { createFileRoute } from "@tanstack/react-router";

import { redirectIfAuthenticated } from "#/features/auth/redirect-if-authenticated";
import { SignupPage } from "#/features/auth/signup-page";

export const Route = createFileRoute("/signup")({
  beforeLoad: redirectIfAuthenticated,
  component: SignupPage,
});
