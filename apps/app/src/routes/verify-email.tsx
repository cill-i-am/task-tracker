import { createFileRoute } from "@tanstack/react-router";

import { EmailVerificationPage } from "#/features/auth/email-verification-page";

export const Route = createFileRoute("/verify-email")({
  validateSearch: (search: Record<string, unknown>) => ({
    error: typeof search.error === "string" ? search.error : undefined,
    status: typeof search.status === "string" ? search.status : undefined,
  }),
  component: VerifyEmailRoute,
});

function VerifyEmailRoute() {
  const search = Route.useSearch();

  return <EmailVerificationPage search={search} />;
}
