# Authentication Extension Rules

This document is the companion to `docs/architecture/auth.md`.

`auth.md` describes how authentication works today.

This file describes how future authentication work should fit into the current
architecture without drifting into ad hoc wrappers or mixed concerns.

## How To Read This Document

This is not a promise of exact product roadmap order.

It is a set of architectural default rules:

- what kinds of auth work should come next
- where each kind of auth feature should live
- what we should preserve from the current design
- what changes would count as architectural drift

If product priorities change, the sequence can change. The fit rules should stay
stable unless we intentionally redesign auth.

## Core Extension Principle

Future auth work should preserve the current shape unless there is a strong
reason to change it:

1. Better Auth remains the source of truth for auth behavior.
2. `apps/api` continues to own auth runtime, persistence, and HTTP contract.
3. `apps/app` continues to own UI, routing, and session-aware UX.
4. App-specific wrappers should be added only when they remove real friction
   that the native Better Auth shape cannot reasonably handle on its own.

The default move is to extend the existing auth slice, not to invent a parallel
auth system.

## Default Planning Assumptions

Without extra product input, the safest default order is:

1. complete core account lifecycle flows
2. improve trust and recovery flows
3. add product-specific identity structure
4. add authorization only when the domain model requires it
5. add convenience wrappers only after repeated pain is visible

Translated to likely auth milestones:

1. password reset
2. email verification
3. transactional email infrastructure and auth success/error polish
4. organization or workspace-aware identity, if the product needs it
5. role and permission checks
6. social auth
7. app-facing viewer/session convenience helpers, only if still needed

That is a recommendation, not a hidden roadmap commitment.

## Non-Negotiable Rules For Future Work

These rules should hold unless we explicitly decide to replace the current
architecture.

### Keep Better Auth Native

We should continue to:

- use Better Auth endpoints directly
- use Better Auth client methods directly
- configure new auth capabilities in the existing auth slice first

We should avoid:

- creating duplicate custom auth endpoints that merely rename Better Auth
  behavior
- wrapping every Better Auth call in a custom service without a concrete need
- reshaping auth into app-specific abstractions too early

### Keep Auth Boundary Ownership Clear

Backend auth concerns belong in `apps/api`:

- provider configuration
- session behavior
- cookies
- auth persistence
- transactional auth policy
- auth-oriented rate limiting
- trusted origins and cross-origin rules

Frontend auth concerns belong in `apps/app`:

- screens
- route gating
- submit UX
- error presentation
- post-auth navigation
- authenticated shell behavior

Do not move policy into the app just because the UI is the first place it shows
up.

### Keep Route Semantics Simple

The current route split should remain the default:

- guest-only auth routes stay public
- product routes stay inside the authenticated app boundary

Until there is a compelling reason otherwise:

- account entry and recovery screens belong outside `/_app`
- post-login onboarding belongs inside the authenticated boundary
- route guards stay centralized, not copied into page components

### Preserve Fail-Closed / Fail-Open Behavior

Current auth routing has a deliberate asymmetry:

- protected routes fail closed
- guest-only routes fail open

Future auth screens and guards should preserve that intent:

- if a protected auth-dependent route cannot establish session state, redirect
  or block safely
- if a guest-only page cannot determine session state, prefer letting the user
  reach the auth UI

### Keep Redirect Logic Predictable

Current redirects are intentionally simple and fixed.

Do not add redirect-back or arbitrary return URL behavior casually.

If redirect-back is ever introduced, it should be an explicit architectural
change with:

- validation rules
- open-redirect protections
- documented route semantics

Not a one-off route-level convenience.

## Where Future Features Should Live

### Password Reset

Password reset should be the next recovery-oriented extension if we need a new
account lifecycle flow.

It should fit like this:

- Better Auth configuration and email delivery policy in `apps/api`
- public reset-request and reset-complete routes in `apps/app`
- the same form architecture already used by login and signup
- safe success and failure copy in the UI

Rules:

- treat reset as a public auth flow, not an authenticated in-app flow
- keep reset pages outside `/_app`
- prefer generic success messaging where enumeration risk exists
- reuse the existing validation and error-handling style

### Email Verification

Email verification should follow the same boundary model as password reset.

It should fit like this:

- verification logic and token handling in `apps/api`
- verification status UI in public auth routes or transitional auth screens in
  `apps/app`
- account gating rules documented explicitly if verification becomes required

Rules:

- do not quietly make verification mandatory without documenting its effect on
  sign-in and session behavior
- if verification blocks product access, that is a route-policy change and
  should be treated as such
- verification messaging should remain user-safe and task-focused

### Transactional Auth Email

Auth email is shared infrastructure, not a screen-level detail.

It should live as backend auth infrastructure in `apps/api`, even if the first
user-visible change appears in a single route.

Rules:

- keep email sending policy close to auth configuration
- do not couple email delivery to a specific page component
- treat reset and verification mail as one auth-email concern, not separate
  mini-systems

### Social Auth

Social auth is additive identity surface, not a replacement for the current
model.

It should fit like this:

- provider configuration in the existing Better Auth backend slice
- provider buttons and callback UX in public auth routes
- the same session and protected-shell model after success

Rules:

- add providers only for product reasons, not because the library supports them
- keep provider-specific complexity inside auth configuration, not scattered
  through app routes
- do not let social auth force a second routing model for the app shell

### Organizations, Workspaces, Membership

If the product becomes multi-tenant, organization membership belongs after core
account flows are stable.

It should fit like this:

- identity remains authentication
- org membership becomes an authenticated domain concern layered on top
- onboarding into an organization happens after sign-in, inside the protected
  app boundary

Rules:

- do not treat organization onboarding as a public auth flow by default
- separate "can sign in" from "has completed workspace setup"
- keep organization state out of the core auth contract unless Better Auth
  requires it

### Roles and Permissions

Authorization is a later layer than authentication.

When roles and permissions arrive:

- keep authentication checks and authorization checks conceptually separate
- do not overload `requireAuthenticatedSession()` with permission logic
- introduce role or permission checks at route or domain boundaries with clear
  names and explicit intent

Rules:

- auth answers "who is this?"
- authorization answers "what may they do?"
- do not collapse those into one generic helper unless the helper stays
  extremely explicit

### Viewer / Session Convenience Helpers

App-facing helpers such as `/me`, `/viewer`, or richer session facades should be
treated as optional conveniences, not a default step.

They become justified only if one of these is true:

- the native Better Auth session shape causes repeated duplication
- multiple app surfaces need the same derived identity payload
- product logic needs app-owned composition beyond raw auth session data

Rules:

- add these only in response to repeated pain, not speculative neatness
- keep them thin and purpose-driven
- do not use them to shadow or replace Better Auth's own session contract

## What Would Count As Drift

These are warning signs that future auth work is moving away from the intended
architecture.

- adding custom auth endpoints that mostly proxy Better Auth
- moving auth policy into random UI components
- mixing organization, permission, and authentication rules into one helper
- adding redirect logic independently in multiple routes
- introducing separate session stores for app convenience
- treating every new auth capability as grounds for a new abstraction layer
- making guest flows and authenticated flows share the same shell without a
  clear reason

If a change pushes in one of these directions, stop and re-evaluate before
continuing.

## Questions To Ask Before Adding A New Auth Capability

Before implementing any new auth feature, we should be able to answer:

1. Is this authentication, recovery, onboarding, or authorization?
2. Does it belong in the public auth area or the protected app area?
3. Can Better Auth already do the core behavior natively?
4. What user state changes after success?
5. Should failures fail closed or fail open?
6. Does this require new rate limits, email, or origin policy?
7. Are we introducing a real abstraction, or only hiding the native contract?

If those answers are fuzzy, the design is probably still too fuzzy.

## Default Recommendation For The Next Auth Docs Or Tasks

If we continue extending auth soon, the highest-value next documents or
implementation tracks are:

1. password reset architecture and UX
2. email verification rules and account-state policy
3. transactional auth email infrastructure
4. organization-aware auth boundaries, if the product is heading multi-tenant

Those are the places where architectural clarity is most likely to matter next.
