# Authentication Next Steps

This document captures the next auth milestones after the initial email/password foundation in `docs/architecture/auth.md`.

The direction stays the same: keep Better Auth as the native source of truth for auth behavior, and add project-specific layers only when they solve a real product need.

## Near-Term Milestones

### App-Level Route Enforcement

The next step is to enforce auth at the app boundary for protected routes.

The goal is to make unauthenticated access fail early and predictably, without spreading auth checks through every page component.

### Authenticated Shell Behavior

Once protected routes are in place, the authenticated shell should own the redirect strategy.

That includes clear behavior for:

- unauthenticated users entering protected areas
- authenticated users landing on auth pages
- redirect targets after sign-in, sign-up, and sign-out

The shell should remain the place where app-wide auth decisions are coordinated, not duplicated.

### Sign-Out Entry Points

The app chrome should surface sign-out in the places users expect it.

That likely means a small set of obvious entry points rather than hiding sign-out deep inside settings or profile flows.

### Session-Aware Loading States

The UI should handle session resolution explicitly.

Protected screens need a brief loading state while the session is being determined, so the app does not flash the wrong content or redirect too early.

## User-Facing Auth Flows

### Password Reset

Password reset is the next major account recovery flow.

This should follow the native Better Auth model first, with the app only adding what it needs for user experience and email delivery.

### Email Verification

Email verification should follow password reset as a core trust-building step.

The focus is on confirming ownership of the email address and making the sign-in experience more reliable over time.

### Auth Transactional Email

Password reset and email verification both depend on transactional email.

The mail integration should be treated as shared infrastructure for auth, not a one-off feature tucked into a single screen.

### Better Auth Screen Success and Error States

The auth screens need deliberate handling for success and failure states.

That includes:

- clear submit feedback
- success confirmation after actions like sign-up or reset requests
- understandable error states for invalid credentials, expired links, and rejected requests

The aim is to keep the native Better Auth flow intact while making the UI feel complete and trustworthy.

## Later Milestones

### Social Auth

Social login should stay a later addition.

It becomes worthwhile once there is a clear product or adoption reason, not simply because the auth stack can support it.

### Organization, Role, and Permission Awareness

Org-aware and permission-aware auth should come after the core account flows are stable.

That is the right time to introduce workspace membership, role checks, and permission-aware UI or route behavior.

### App-Facing Viewer Helpers, If Needed

If the native Better Auth shape eventually feels too low-level for the app, a small viewer or session helper can be added later.

That should remain a fallback, not the default architecture. The first choice should still be direct Better Auth usage.

## Roadmap Rule

Each new auth layer should answer one question:

does this remove real friction for users or developers, or is it only adding abstraction?

If the answer is not clear, the safer choice is to stay close to Better Auth and defer the extra layer.
