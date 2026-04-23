import { Link } from "@tanstack/react-router";

import { buttonVariants } from "#/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#/components/ui/empty";

import { getLoginNavigationTarget } from "./auth-navigation";
import type { EmailVerificationSearch } from "./email-verification-search";
import { EntryShell, EntrySurfaceCard } from "./entry-shell";

interface EmailVerificationPageProps {
  search?: EmailVerificationSearch;
}

export function EmailVerificationPage({ search }: EmailVerificationPageProps) {
  const isInvalidToken = search?.status !== "success";
  const title = isInvalidToken ? "Verification link invalid" : "Email verified";
  const description = isInvalidToken
    ? "This verification link is invalid or has expired. Request a fresh verification email from the app."
    : "Your email address is verified. You can continue in the app or sign in again if needed.";

  return (
    <EntryShell
      badge="Account status"
      title={
        isInvalidToken
          ? "This verification link can't be used."
          : "Your email is verified."
      }
      description={
        isInvalidToken
          ? "Open the app and request a fresh verification email when you're ready."
          : "Your account is ready to continue into the app."
      }
      supportingContent={
        <div className="flex flex-col gap-8">
          <div className="space-y-3">
            <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
              Status checkpoint
            </p>
            <p className="max-w-[48ch] text-sm/7 text-foreground/90">
              {isInvalidToken
                ? "Verification links expire. Request the newest email from inside the app before you try again."
                : "Verified accounts keep sign-in recovery, invitations, and teammate setup moving without extra friction."}
            </p>
          </div>

          <ol className="grid gap-4 text-sm/6 text-muted-foreground">
            <li className="border-t border-border/60 pt-4">
              1. {isInvalidToken ? "Open the app." : "Continue into the app."}
            </li>
            <li className="border-t border-border/60 pt-4">
              2.{" "}
              {isInvalidToken
                ? "Request a fresh verification email."
                : "Sign in again if you need a fresh session."}
            </li>
          </ol>
        </div>
      }
    >
      <EntrySurfaceCard
        badge={isInvalidToken ? "Verification issue" : "Verified"}
        className="max-w-lg"
        title={title}
        description={description}
        footer={
          <div className="flex flex-col gap-3">
            <Link to="/" className={buttonVariants({ className: "w-full" })}>
              Go to the app
            </Link>
            <Link
              {...getLoginNavigationTarget()}
              className={buttonVariants({
                className: "w-full",
                variant: "outline",
              })}
            >
              Back to login
            </Link>
          </div>
        }
      >
        <Empty className="min-h-0 bg-muted/20 px-6 py-8">
          <EmptyHeader>
            <EmptyTitle>
              {isInvalidToken
                ? "Request a fresh verification email"
                : "You can continue safely"}
            </EmptyTitle>
            <EmptyDescription>
              {isInvalidToken
                ? "Open the app and send a new verification email from your account settings or banner."
                : "Your email is verified. You can continue in the app or sign in again if you need a fresh session."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </EntrySurfaceCard>
    </EntryShell>
  );
}
