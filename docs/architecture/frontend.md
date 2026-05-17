# Frontend Architecture

## Scope

`apps/app` is the browser and server-rendered web application. It is a
TanStack Start app using React 19, TanStack Router file routes, Effect clients,
Tailwind CSS, shadcn-style components, and Playwright E2E tests.

## Route Model

TanStack Router generates `apps/app/src/routeTree.gen.ts` from files in
`apps/app/src/routes`. Pathless `_app` and `_org` route files provide protected
layout and organization context without adding URL segments.

Current visible routes:

| URL                                | Route file                            | Purpose                                                       |
| ---------------------------------- | ------------------------------------- | ------------------------------------------------------------- |
| `/`                                | `_app._org.index.tsx`                 | Authenticated organization home.                              |
| `/login`                           | `login.tsx`                           | Sign in.                                                      |
| `/signup`                          | `signup.tsx`                          | Create account.                                               |
| `/forgot-password`                 | `forgot-password.tsx`                 | Request password reset.                                       |
| `/reset-password`                  | `reset-password.tsx`                  | Complete password reset.                                      |
| `/verify-email`                    | `verify-email.tsx`                    | Show email verification result.                               |
| `/accept-invitation/$invitationId` | `accept-invitation.$invitationId.tsx` | Accept organization invitation.                               |
| `/create-organization`             | `_app.create-organization.tsx`        | Create a team and optionally invite initial members.          |
| `/settings`                        | `_app.settings.tsx`                   | User settings.                                                |
| `/activity`                        | `_app._org.activity.tsx`              | Organization activity feed.                                   |
| `/jobs`                            | `_app._org.jobs.tsx`                  | Jobs list and saved views.                                    |
| `/jobs/new`                        | `_app._org.jobs.new.tsx`              | New job flow.                                                 |
| `/jobs/$jobId`                     | `_app._org.jobs.$jobId.tsx`           | Job detail route.                                             |
| `/members`                         | `_app._org.members.tsx`               | Organization members and invitations.                         |
| `/organization/settings`           | `_app._org.organization.settings.tsx` | Organization settings, service areas, rate cards, and labels. |
| `/sites`                           | `_app._org.sites.tsx`                 | Sites list.                                                   |
| `/sites/new`                       | `_app._org.sites.new.tsx`             | New site flow.                                                |
| `/sites/$siteId`                   | `_app._org.sites.$siteId.tsx`         | Site detail route.                                            |
| `/health`                          | `health.ts`                           | App health response for sandbox checks.                       |

`apps/app/src/router.tsx` configures scroll restoration, intent preloading, and
typed route registration. Breadcrumb labels are declared through route
`staticData`.

Domain-heavy routes keep the route file as the lightweight routing boundary.
When a loader needs API contracts, server helpers, Effect schemas, or other
large feature dependencies, put the loader implementation in the owning
`features/*/*-route-loader.ts` module, statically import that module from the
route file, and group the route `loader` and `component` with TanStack Router
`codeSplitGroupings`. Do not nest a dynamic `import()` inside the loader; that
adds another chunk fetch before the loader can start its API work. Canvas and
map-heavy feature views should also be loaded behind feature-level lazy
boundaries so the authenticated shell does not pull map libraries or
visualization code into the initial chunk.
Route `validateSearch` functions run in the route manifest, so they should stay
small and avoid importing domain API contracts or boundary schemas when a local
query-string parser can preserve the same behavior.

## Application Shell

`apps/app/src/routes/__root.tsx` owns the document shell. It injects the theme
initialization script before hydration, loads global CSS, wraps the app in
`TooltipProvider` and `HotkeysProvider`, and lazily loads TanStack devtools in
development.

The sidebar header shows the active organization in the authenticated app shell,
using `_app/_org` route data on organization routes and the `_app` session
fallback elsewhere. Multi-organization users can open the organization switcher
from the sidebar or with `G O`. The switcher calls Better Auth's organization
list and set-active client APIs through
`features/organizations/organization-access.ts`, then calls
`router.invalidate({ sync: true })` after a successful switch so `_app`,
`_app/_org`, and child route loaders refresh session, active organization, role,
and organization-owned data together. If Better Auth accepts the switch but the
router refresh fails, the app reloads to avoid showing stale organization data
against the new active session.

Authenticated layout and navigation live under:

- `features/auth/authenticated-app-layout.tsx`
- `features/auth/authenticated-shell-home.tsx`
- `components/app-layout.tsx`
- `components/app-sidebar.tsx`
- `components/app-navigation.ts`
- `components/nav-main.tsx`
- `components/nav-user.tsx`
- `components/app-page-header.tsx`

## Observability

Server-side app requests use TanStack Start global middleware in
`apps/app/src/start.ts`; `apps/app/src/server.ts` remains the minimal
`createStartHandler` entry. Deployed app Workers rely on Cloudflare
observability logs and traces configured by the infra stack. The request
middleware emits a structured app request log with method, redacted path,
status, duration, handler type, Cloudflare ray, and `x-ceird-request-id`. Query
strings are not logged, and redirect locations are reduced to their path. A
global server-function middleware records every Start server-function boundary
with method, safe function name, duration, request id, and Cloudflare ray. App
observability boundaries emit through Effect logging via `lib/effect-log.ts`;
route loaders, server helpers, Start middleware, and the server entry should
not call `console.*` directly.
`src/start.ts` also explicitly registers server-function CSRF request
middleware because adding a custom Start instance replaces the framework
default in versions that provide one. Shared redacted path handling, safe
correlation-id validation, and the testable Effect log sink factory live in
`@ceird/observability-core` so app and API logs sanitize paths and externally
supplied headers consistently.

Server-side helper failures use the shared app server operation observer in
`features/api/app-server-observability.ts`. It logs the safe operation name,
duration, request id, Cloudflare ray when present, target origin without query
strings, and an error bucket such as `api_origin_unresolved`,
`missing_auth_cookie`, `upstream_status`, or `invalid_upstream_payload`. Raw
error messages are not written to the helper log. Helper-owned failures should
use `makeAppServerOperationFailure` or
`annotateAppServerOperationFailure` so buckets and statuses are explicit
metadata, not inferred from English message text.

Feature route loaders use `features/api/app-route-observability.ts` for
server-side loader failures. The observer records the route id, loader
operation, duration, organization sync state, current role when available, and a
stable error bucket. Router redirects are intentionally ignored by this helper,
because expected auth and role redirects are already visible through the app
request log's status and redacted redirect path. Failures that were already
observed by an app server helper are not logged again at the route boundary, so
one upstream outage does not produce multiple warning logs for the same request.

## Feature Folders

| Folder                   | Responsibility                                                                                                                                                                                                                                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `features/auth`          | Login, signup, password reset, email verification, route guards, redirects, auth UI, and server session helpers.                                                                                                                                                                                                                                   |
| `features/organizations` | Organization onboarding, active organization sync, settings, members, invitations, role access, service areas, rate cards, and labels.                                                                                                                                                                                                             |
| `features/jobs`          | Jobs list, create flow, detail drawer/sheet, state effects, API client bridge, saved views, location display, maps, collaborators, labels, comments, visits, and cost lines.                                                                                                                                                                       |
| `features/sites`         | Sites list, site create flow, detail sheet, and site API state. The first Sites index refresh intentionally uses only supported site fields: name, address, service area, and map readiness. Status, labels, lead, open job counts, saved views, updated timestamps, archive state, and bulk selection are product follow-ups, not placeholder UI. |
| `features/activity`      | Organization activity feed search and formatting.                                                                                                                                                                                                                                                                                                  |
| `features/settings`      | User settings page schemas, search, and UI.                                                                                                                                                                                                                                                                                                        |
| `features/command-bar`   | Command palette UI and global app actions.                                                                                                                                                                                                                                                                                                         |

Shared app components live in `src/components`. shadcn-style primitives live in
`src/components/ui`. Hotkey infrastructure lives in `src/hotkeys`.

## API Access From The App

Domain API access is contract-based:

- `features/api/app-api-client-core.ts` builds a composed Effect
  `HttpApiClient` from jobs, labels, sites, service-area, and rate-card API
  groups exported by `@ceird/jobs-core`, `@ceird/labels-core`, and
  `@ceird/sites-core`.
- `features/api/app-api-client.ts` is the browser entry point. It provides
  `fetch` with `credentials: "include"` and exposes browser request helpers.
- `features/api/app-api-server-client.ts` is the server entry point. It adds
  the current cookie and trusted forwarded headers, wraps requests in app
  server-operation observability, and forwards `x-ceird-request-id` to the API.
  App code imports site-owned DTOs from `@ceird/sites-core` and
  organization-label DTOs from `@ceird/labels-core`; `@ceird/jobs-core` only
  supplies job-owned DTOs and the job-label assignment contract.
- `features/jobs/jobs-server.ts` exposes isomorphic helpers. On the server it
  imports `jobs-server-ssr.ts`; in the browser it calls the same API through
  `fetch`.
- `features/jobs/jobs-server-ssr.ts` reads request headers, forwards cookies and
  proxy headers, and calls the API from the server runtime.

Organization and auth helpers call Better Auth endpoints directly because those
routes are owned by Better Auth rather than the jobs `HttpApi` contract:

- `lib/auth-client.ts`
- `lib/auth-client.server.ts`
- `features/auth/server-session.ts`
- `features/organizations/organization-server.ts`
- `features/auth/sign-out.ts`

The `/create-organization` onboarding route stays outside the app shell while
the first workspace is created. The client submits only the team name to
`features/organizations/organization-server.ts`; that server helper generates
the Better Auth organization slug, forwards auth cookies from the Better Auth
response, decodes the created organization summary, and returns that summary to
the client. The same onboarding page then offers an optional invite-members
step before navigating into the app. Skipping or completing this step enters the
active workspace; invite creation uses Better Auth's
`authClient.organization.inviteMember` with the newly created organization ID.

The `/members` route uses Better Auth organization client methods directly for
both active members and pending invitations. It loads current members with
`authClient.organization.listMembers`, keeps pending invitation management on
`listInvitations`, `inviteMember`, and `cancelInvitation`, and uses
`updateMemberRole` and `removeMember` for member row actions. The route remains
owner/admin gated through organization route context; row actions stay
menu-driven instead of hotkey-driven because role changes and removals are
per-row administrative actions that benefit from explicit focus, labels, and
disabled/pending states over global shortcuts.

Use `lib/server-api-forwarded-headers.ts` when server-side calls need the API to
preserve the original browser host/protocol for trusted proxy and cookie logic.
Server-side app helpers resolve the API origin from `process.env.API_ORIGIN`
when a Node-like process env is available, and from the Vite build-time
`__SERVER_API_ORIGIN__` define in the Cloudflare Worker bundle. This keeps
TanStack Start server functions able to call the API in production where a
Node-style `process.env` object is not guaranteed.
Those helpers also forward `x-ceird-request-id` to the API, deriving it from
the incoming request id, TanStack Start global request context, or Cloudflare
`cf-ray` header when needed. Correlation headers are accepted only when they
match the shared safe request-id or Cloudflare Ray formats; unsafe values are
omitted or replaced with a generated request id before logging or forwarding.
If a server helper fails before or during the API/Auth request, the helper
observer logs the operation bucket so redacted TanStack server-function
invocations can be correlated with app-side failure context.

## State And Validation

Runtime payloads that cross the app/API boundary are decoded with shared Effect
schemas from `@ceird/jobs-core`, `@ceird/sites-core`, `@ceird/labels-core`, and
`@ceird/identity-core`.
Feature-local form/search schemas live next to the feature that owns them, for
example:

- `features/auth/auth-schemas.ts`
- `features/auth/password-reset-search.ts`
- `features/auth/email-verification-search.ts`
- `features/organizations/organization-schemas.ts`
- `features/organizations/organization-member-invite-schemas.ts`
- `features/settings/user-settings-schemas.ts`

UI state for API-backed feature workflows is kept in focused state modules such
as `jobs-state.ts`, `jobs-detail-state.ts`, `sites-state.ts`, and
`organization-configuration-state.ts`.

## Hotkeys

Keyboard access is part of feature work. Register shortcuts through the shared
hotkey layer:

- `hotkeys/hotkey-registry.ts`
- `hotkeys/use-app-hotkey.ts`
- `hotkeys/route-hotkeys.tsx`
- `hotkeys/shortcut-help-overlay.tsx`
- `hotkeys/hotkey-display.tsx`

New route navigation targets, primary workflow actions, command/menu items, and
icon-only controls should either register a shortcut or have an explicit reason
why a shortcut would be harmful or unnecessary. Show shortcuts with the shared
keycap and help overlay components.

`G O` opens the organization switcher only when more than one organization is
available.

## Styling

The app uses Tailwind CSS with shadcn-style primitives. Global styles,
theme tokens, and typography live in `src/styles.css`. The design direction is
documented in `PRODUCT.md`: calm, precise, light-mode-first, practical for
trades teams, and accessible.

Keep UI dense but readable. Prefer feature-complete controls and clear
workflow-specific layouts over decorative landing-page patterns.

## Tests

- Unit and component tests live next to routes, components, and features as
  `*.test.ts` or `*.test.tsx`.
- Vitest setup lives in `src/test/setup.ts`.
- Playwright config lives in `playwright.config.ts`.
- E2E tests live in `apps/app/e2e`.
- Page objects for E2E tests live in `apps/app/e2e/pages`.
- Auth E2E tests may read Better Auth verification tokens directly from the
  sandbox database using `PLAYWRIGHT_DATABASE_URL` so password-reset browser
  flows can cover the email-token handoff without depending on a mailbox.

Run app tests:

```bash
pnpm --filter app test
pnpm --filter app e2e
```
