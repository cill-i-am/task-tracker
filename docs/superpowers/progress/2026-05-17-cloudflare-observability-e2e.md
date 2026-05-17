# Cloudflare Observability E2E Notes

Date: 2026-05-17

Goal: test `app.ceird.app` end to end while watching Cloudflare app/API Worker
telemetry, identify logging and observability gaps, and turn them into an
implementation plan.

## Live Workers

- App Worker: `ceird-production-app`
- API Worker: `ceird-production-api`
- Cloudflare tails used: `pnpm dlx wrangler@latest tail <worker> --format=json`

## Covered So Far

- Unauthenticated app entry at `/login`
- Login validation and invalid login
- Signup validation
- Protected route redirects for `/`, `/jobs`, `/sites`, `/members`,
  `/activity`, `/organization/settings`, and `/settings`
- Forgot-password page and unknown-email success copy
- Invalid reset-token route
- Invalid verify-email route
- Invalid invitation route
- API `GET /health`, `GET /`, protected `GET /jobs`, `GET /sites`,
  `GET /activity`
- OAuth protected-resource metadata endpoints
- Unauthenticated `GET /mcp` and `POST /mcp`

Authenticated disposable account/org flow is approved by the user but has not
completed onboarding yet.

Disposable account created:

- Email pattern: `codex-e2e-<timestamp>@example.com`
- Email pattern: `codex-e2e-<timestamp>@example.com`
- App route reached after signup: `/create-organization`
- API telemetry showed `POST /api/auth/sign-up/email` returning 200 and an auth
  email send attempt/outcome through the Cloudflare email binding.

Disposable organization creation is currently blocked:

- Attempted names:
  - `Codex E2E 20260517140040`
  - `Codex Field Ops 646483`
  - `Codex Field Ops 119888`
- UI stayed on `/create-organization` and displayed:
  `We couldn't create your team. Please try again.`
- App Worker telemetry showed:
  - `POST https://app.ceird.app/_serverFn/REDACTED`
  - status 200
  - `x-tsr-serverfn: true`
  - referer `https://app.ceird.app/create-organization`
  - `logs: []`
- API Worker tail stayed silent for the retry, which means the failure likely
  happens inside the app server function before it reaches `api.ceird.app`.
- Navigating the newly signed-up browser session to `/jobs` redirected to
  `/login`. App Worker telemetry showed only the app `GET /jobs` 307 and
  `GET /login` 200, again with `logs: []` and no matching API Worker request.
  This suggests server-side session lookup is affected by the same app-to-API
  resolution problem.

## Findings

### Live production refresh confirms the deploy blocker

Refreshed live production testing on 2026-05-17 using Worker tails plus a
headless Playwright fallback, because the in-app Browser could navigate and
inspect `app.ceird.app` but still could not type text due its missing virtual
clipboard.

Disposable account from the refreshed attempt:

- Email pattern: `codex-e2e-<timestamp>@example.com`
- Attempted organization pattern: `Codex Field Ops <suffix>`

Observed browser flow:

- `GET https://app.ceird.app/signup` rendered and hydrated.
- `POST https://api.ceird.app/api/auth/sign-up/email` returned 200.
- App reached `https://app.ceird.app/create-organization`.
- `POST https://app.ceird.app/_serverFn/REDACTED` returned 200.
- UI displayed `We couldn't create your team. Please try again.`
- No matching `POST /api/auth/organization/create` appeared in the API Worker
  tail for the create-team attempt.

Observed Cloudflare Worker versions during the refresh were captured from the
tail output, but exact version IDs are intentionally omitted from this
committable progress note.

Telemetry observations from the refresh:

- App Worker events for `/signup`, `/forgot-password`, and `_serverFn` still
  had `logs: []`, confirming the deployed app Worker does not yet have
  app-level request/server-function logging.
- API Worker logged `Rate limiting skipped: could not determine client IP
address` on `POST /api/auth/sign-up/email`, even though the event headers
  included `cf-connecting-ip` and `x-real-ip`.
- API Worker logged `http.method`, `http.path`, `http.status`, and duration,
  but did not annotate logs with app/API request correlation fields such as
  `x-ceird-request-id` or `cf-ray`.
- Auth email queue telemetry showed a successful Cloudflare email binding
  outcome for the `example.com` verification email, with recipient domain and
  delivery key but no raw email address.

Conclusion: the latest production evidence still proves the same blocking gap.
Live authenticated E2E cannot proceed past organization onboarding until the
local app/API observability and app server API-origin fixes are deployed.

### Better Auth cannot resolve client IPs on Cloudflare

Observed in `ceird-production-api` logs during auth POSTs:

```text
Rate limiting skipped: could not determine client IP address. Ensure your runtime forwards a trusted client IP header and configure `advanced.ipAddress.ipAddressHeaders` if needed.
```

The same Cloudflare tail event includes `cf-connecting-ip` and `x-real-ip`, so
the Worker receives a usable client IP but Better Auth is not configured to read
it.

Fix suggestion:

- Update `apps/api/src/domains/identity/authentication/config.ts` so
  `advanced.ipAddress.ipAddressHeaders` includes `cf-connecting-ip` first, with
  an intentional fallback such as `x-real-ip`.
- Add a config/unit test proving `makeAuthenticationConfig` contains the
  Cloudflare header list.
- Add an integration-style auth request test that sends `cf-connecting-ip` and
  no `x-forwarded-for` and does not emit the rate-limit warning.

### Better Auth logs leak submitted email addresses

Observed in API telemetry:

```text
ERROR [Better Auth]: User not found { email: "<submitted-email>" }
ERROR [Better Auth]: Reset Password: User not found { email: "<submitted-email>" }
```

These are expected negative auth outcomes, but the submitted email appears in
Cloudflare logs. That is too much PII for routine operational telemetry.

Fix suggestion:

- Configure Better Auth `logger.log` to route through a Ceird auth logger.
  Implemented locally in `apps/api/src/domains/identity/authentication/auth.ts`.
- Redact known sensitive fields in logger args, including `email`, `password`,
  `token`, `code`, session/cookie material, and authorization headers.
  Implemented locally with unit coverage in `authentication.test.ts`.
- Downgrade expected credential/user-not-found outcomes to an info-level auth
  outcome bucket, while preserving warning/error levels for unexpected defects
  and delivery/provider failures. Implemented locally for credential and
  password-reset user-not-found buckets; Better Auth background task failures
  are now logged once with redacted arguments.

### API domain logs are structured; auth and MCP need boundary coverage

The jobs/sites/activity endpoints emitted useful structured Effect logs through
`observeApiOperation`, including:

- `apiDomain`
- `apiOperation`
- `apiService`
- `apiFailureTag`
- `apiFailureMessage`
- safe entity identifiers where present

Auth and MCP paths originally showed generic Better Auth logs or no logs beyond
Cloudflare invocation metadata.

Fix suggestion:

- Add a small auth/MCP observability wrapper near the API request boundary that
  records safe fields: domain, operation/route bucket, method, status, duration,
  and expected failure bucket. Implemented locally for MCP pre-router responses
  in `apps/api/src/server.ts`; Better Auth expected failure buckets and
  redaction are implemented locally in
  `apps/api/src/domains/identity/authentication/auth.ts`.
- Keep raw payloads, query strings, cookies, tokens, and email addresses out of
  logs.
- Wrap MCP unauthorized responses and protected-resource metadata responses so
  they can be counted without parsing raw URLs. Implemented locally with
  `MCP HTTP response` / `MCP HTTP error response` logs carrying method, status,
  duration, redacted path, `x-ceird-request-id`, and `cf-ray`.

### App Worker has invocation telemetry but no app-level request logs

The app Worker tail shows Cloudflare invocation metadata and redirect statuses,
but `logs: []` for app requests. There is no app-level explanation for route
guards, session lookup results, server-render failures, or route loader
failures.

Fix suggestion:

- Wrap `apps/app/src/server.ts` `fetch` with structured request logging:
  method, pathname, status, duration, redirect target for 3xx responses, and a
  correlation id. Implemented locally in `apps/app/src/server.ts`, covered by
  `apps/app/src/server.test.ts`.
- Redact query strings by default, or bucket known safe search params.
- Add route loader logging for protected-route redirects and API-load failures.
- Add React route/error-boundary reporting for user-visible failures.

### App server functions can fail before API calls with no useful telemetry

The disposable organization flow hit a generic create-team failure. Cloudflare
only showed a redacted TanStack server-function invocation on the app Worker:

```text
POST https://app.ceird.app/_serverFn/REDACTED
status=200
x-tsr-serverfn=true
logs=[]
```

No matching API Worker request appeared during the retry. Source inspection
shows a likely production bug: `apps/app/src/lib/api-origin.server.ts` only
reads `globalThis.process?.env?.API_ORIGIN`, while the app build defines
`__SERVER_API_ORIGIN__` in `apps/app/vite.config.ts` and the Cloudflare stack
passes `API_ORIGIN` as Worker env. If `process.env` is unavailable in the
Worker runtime, server helpers such as organization creation cannot resolve the
auth/API base URL and fail before making a fetch.

Fix suggestion:

- Update `readConfiguredServerApiOrigin` to read the build-time
  `__SERVER_API_ORIGIN__` define, with the existing `process.env.API_ORIGIN`
  path retained for tests and non-Cloudflare runtimes.
- Add tests that simulate a Cloudflare build with no `process.env` but a
  defined `__SERVER_API_ORIGIN__`.
- Add a small structured log around app server helpers so failures include a
  safe operation name like `OrganizationsServer.createOrganization`, an error
  bucket such as `api_origin_unresolved`, status/duration when a fetch occurs,
  and the request correlation id. Implemented locally in
  `apps/app/src/features/api/app-server-observability.ts` and wired through the
  shared app API client, server session lookup, and organization server helpers.
- Consider returning a support-safe error code to the UI for server-function
  failures, while keeping the user-facing copy generic.

### App/API logs do not share an explicit correlation id

Cloudflare tail exposes `cf-ray`, but the app does not forward an app request id
to SSR API calls, and API logs do not consistently annotate it.

Fix suggestion:

- Derive `x-ceird-request-id` from `cf-ray` when present, otherwise generate a
  UUID. Implemented locally in the app server entry.
- Annotate app and API logs with `requestId`/`cfRay`. Implemented locally for
  app request logs and API request logs.
- Forward `x-ceird-request-id` from app server helpers into API requests.
  Implemented locally in `server-api-forwarded-headers.ts`,
  `app-api-client.ts`, server session lookup, and organization server helpers.
- Include the id in sanitized error responses only when it is useful for support.

### Observability sampling is hard-coded

Alchemy enables logs, invocation logs, and traces for both deployables, but the
current stack does not expose stage-level sampling controls.

Fix suggestion:

- Add infra config for `CEIRD_WORKER_LOG_SAMPLE_RATE` and
  `CEIRD_WORKER_TRACE_SAMPLE_RATE`. Implemented locally in
  `packages/infra/src/stages.ts`.
- Apply Cloudflare `head_sampling_rate` separately for app/API logs and traces.
  Implemented locally through a shared Worker observability helper in
  `packages/infra/src/cloudflare-stack.ts`.
- Default production to a modest trace sample while keeping errors and important
  auth/security outcomes logged deliberately. Implemented locally after review:
  production now defaults log and trace sampling to `0.1`, preview defaults to
  full capture, and Cloudflare invocation logs default off because they can
  include full provider request URLs outside Ceird's redaction path.

### External sandbox E2E runs were too parallel for auth-heavy flows

The full Playwright suite initially failed against the shared sandbox with 19/22
tests passing. The failing cases were auth/onboarding flows that timed out
waiting for signup hydration or workspace home after org creation. A one-worker
run of the same suite then passed all 22 tests, and sandbox API logs showed
successful `POST /api/auth/sign-up/email`, `POST /api/auth/organization/create`,
and `POST /api/auth/organization/set-active` responses during the same flows.

Fix suggestion:

- Keep the normal local/CI web-server path parallel, but set Playwright
  `workers: 1` when `PLAYWRIGHT_USE_EXTERNAL_SERVER=1` points at an already
  running sandbox. Implemented locally in `apps/app/playwright.config.ts`.
- Harden route-modal E2E steps so they scope fields to the visible dialog and
  fail at the UI transition that disappeared, rather than timing out on a later
  unscoped label. Implemented locally in
  `apps/app/e2e/organization-settings.test.ts`.
- Continue treating production Cloudflare Worker evidence separately from
  sandbox E2E. The sandbox verifies the local app/API behavior, while production
  still needs the deployed Worker logs, `cf-ray`, and `x-ceird-request-id`
  propagation confirmed after deploy.

### Review-swarm follow-ups

Read-only review agents found several issues in the local observability patch;
the material ones are now being fixed locally:

- TanStack Start's default CSRF request middleware is not injected when a custom
  `src/start.ts` instance exists. Fix: explicitly register server-function
  CSRF request middleware after the app request observability middleware so
  CSRF failures still produce one redacted app request log.
- Public inbound `x-ceird-request-id` and `cf-ray` values were trusted too
  broadly. Fix: centralize safe correlation-id decoding in
  `@ceird/observability-core`; app context, app-to-API forwarded headers, API
  request logs, and MCP logs now drop unsafe or oversized values before logging
  or forwarding them.
- Failed app server helper calls could be logged again by route-loader
  observers. Fix: mark helper-observed error objects and suppress duplicate
  route warning logs.
- Browser-side jobs pagination still lacked the repeated-cursor/page-count guard
  already added to server-side helpers. Fix: port the same guard to browser and
  jobs-specific SSR helpers.
- The guarded live production E2E used a fixed password and attached generated
  test account/resource identifiers. Fix: use a high-entropy per-run password,
  redact identifiers in the attached summary, and assert the collected
  production response summary covers app server functions plus key API route
  families without unexpected HTTP errors.

## Implementation Plan Draft

1. Fix Better Auth IP detection and test it. Implemented locally:
   `apps/api/src/domains/identity/authentication/config.ts` now configures
   `cf-connecting-ip`, `x-real-ip`, and `x-forwarded-for`; covered by
   `authentication.test.ts`.
2. Introduce a Ceird auth logger that redacts sensitive fields and buckets
   expected failures. Implemented locally in
   `apps/api/src/domains/identity/authentication/auth.ts`, covered by
   `authentication.test.ts`.
3. Add auth and MCP operation observability at the API boundary. Implemented
   locally for Better Auth expected-failure buckets/redaction and MCP
   pre-router response logs; deeper per-auth-route success buckets remain an
   optional follow-up.
4. Fix app server API origin resolution for Cloudflare server functions.
   Implemented locally: `apps/app/src/lib/api-origin.server.ts` now falls back
   to the Vite `__SERVER_API_ORIGIN__` define when `process.env.API_ORIGIN` is
   unavailable; covered by `api-origin.test.ts`.
5. Add app Worker request logging, server-function helper logs, and
   route-loader/error-boundary logs. App Worker request logging now uses
   TanStack Start global request middleware; server-function boundary logging
   uses global function middleware; helper failure logging and route-loader
   logging are implemented locally. Error-boundary logs remain open.
6. Add app/API request correlation via `x-ceird-request-id`. Implemented
   locally for app request logs, app-to-API forwarding, and API request logs.
7. Add stage-level Cloudflare log/trace sampling config in infra. Implemented
   locally with `CEIRD_WORKER_LOG_SAMPLE_RATE` and
   `CEIRD_WORKER_TRACE_SAMPLE_RATE`; production defaults to `0.1`, preview
   defaults to `1`, and `CEIRD_WORKER_INVOCATION_LOGS_ENABLED` defaults to
   `false`.
8. Update `docs/architecture/api.md`, `docs/architecture/frontend.md`, and
   `docs/architecture/sandbox-and-infra.md` with the observability contract.
9. Verify with focused unit tests, API tests for auth headers/redaction, and a
   production or sandbox e2e pass with Cloudflare/sandbox logs. Full sandbox
   E2E is now green locally; production E2E remains blocked on deploy approval.

## Open Follow-Up From Live Testing

- Deploy the app/API fixes before continuing live production E2E; the current
  `app.ceird.app` deployment does not yet include the local app server origin
  fix or Better Auth client-IP fix.
- Complete disposable org creation after the app server API origin bug is
  deployed, then continue authenticated flows:
  organization home, verification reminder/resend, organization settings,
  service areas, rate cards, sites, jobs, job detail actions, activity, members,
  and sign out.
- Compare the resulting app/API telemetry against the gaps above and append any
  new findings here.

## Module-By-Module Best-Effort Observability Pass

Additional local pass after pausing deploy/env work:

- API request boundary: already covered by `apps/api/src/server.ts` request
  logs with redacted path, status, `x-ceird-request-id`, and `cf-ray`.
- API jobs, sites, service areas, labels, and rate-card modules: existing
  `observeApiOperation` wrappers were kept and improved with
  `apiFailureBucket` so Cloudflare queries and alerts do not depend on exact
  typed error strings.
- API auth module: retained the Ceird Better Auth logger with expected-failure
  buckets and redaction, plus Cloudflare client-IP header configuration.
- API MCP module: retained pre-router MCP response/error logs with method,
  status, duration, redacted path, request id, and Cloudflare ray.
- App request boundary: moved app Worker request telemetry into TanStack Start
  global request middleware in `apps/app/src/start.ts`, with status, duration,
  handler type, redirect path redaction, request id, and Cloudflare ray.
- App server-function boundary: added TanStack Start global function middleware
  in `apps/app/src/start.ts` so `_serverFn` RPCs and SSR-direct server-function
  calls emit safe function-name, method, duration, request id, and Cloudflare
  ray logs before helper-specific logs run.
- App server helpers: retained `app-server-observability` for SSR/API/Auth
  helper failures before or during upstream calls.
- App route-loader modules: added `app-route-observability` and wired it
  through `_app`, `_org`, home dashboard, jobs list/detail, sites list/detail,
  activity, and organization settings loaders. It logs server-side loader
  failures with route id, operation, duration, sync state, current role when
  available, and a stable error bucket; expected router redirects are skipped.
- TanStack Start guidance checked and applied: official Start observability and
  middleware docs recommend request/response middleware, server function
  logging, route performance monitoring, debug headers, and
  OpenTelemetry/New Relic hooks. The local Ceird implementation now uses
  `createStart` global request and function middleware in `src/start.ts`, with
  logs routed through Effect logging instead of raw `console.*`.
- App/API raw console pass: removed direct `console.info`, `console.warn`, and
  `console.error` calls from the app/API source tree observability paths by
  adding small Effect logging adapters in `apps/app/src/lib/effect-log.ts` and
  `apps/api/src/domains/effect-log.ts`. `rg "console\\.(log|info|warn|error)"
apps/app/src apps/api/src -g '*.ts' -g '*.tsx'` now returns no matches.
- Simplify pass follow-up: reduced repeated forwarded-header plumbing by adding
  `readServerApiForwardedHeadersFromRequest`, reused app API error-tag
  constants in route observability, fast-pathed unauthenticated server-session
  reads before building observability context, and hardened Better Auth log
  sanitization with cycle/depth/entry limits plus broader bearer/cookie/password
  string redaction.
- Simplify follow-ups completed:
  - Split the app API client into `app-api-client-core.ts`,
    browser-facing `app-api-client.ts`, and server-only
    `app-api-server-client.ts`, so server cookie and forwarded-header mutation
    no longer lives in the browser entry point.
  - Replaced app server-helper message-substring bucket detection with typed
    failure metadata via `makeAppServerOperationFailure` and
    `annotateAppServerOperationFailure`.
  - Extracted shared cross-app/API redacted path handling and Effect log sink
    factories into `@ceird/observability-core`.
- Additional simplify review fixes:
  - Defaulted production app hosts to `https` when synthesizing forwarded
    origins, while keeping loopback hosts on `http`.
  - Preserved upstream HTTP status codes for server-side app API telemetry when
    the Effect API client normalizes generic upstream failures.
  - Added jobs pagination cursor/page guards and bounded external-viewer job
    detail fan-out.
  - Bounded Better Auth log object redaction without enumerating full large
    objects twice, and added mixed-case sensitive-string redaction coverage.
  - Stopped duplicate Start server-function success logs; request middleware
    owns success telemetry while function middleware still logs failures.
  - Bounded live production E2E response collection and scrubbed exact
    disposable emails / Worker version IDs from this progress note.

## Deploy Readiness

Non-deploying readiness checks on 2026-05-17:

- App Cloudflare production build passed with:
  `API_ORIGIN=https://api.ceird.app VITE_API_ORIGIN=https://api.ceird.app pnpm --filter app build:cloudflare`
- API TypeScript build passed with `pnpm --filter api build`.
- Infra typecheck passed with `pnpm --filter @ceird/infra check-types`.

Alchemy deployment is still approval-gated and has not been run. The
non-mutating plan command was attempted with:

```bash
pnpm --dir packages/infra exec node scripts/alchemy-env.mjs plan
```

It failed before rendering a plan because this local environment is missing
the current Ceird infra variables:

- `CEIRD_ZONE_NAME`
- a valid `NEON_DATABASE_URL`

The existing `.env.local` has several old `TASK_TRACKER_*` keys and Cloudflare
credentials, but not enough current Ceird/Neon stage config for Alchemy to plan
or deploy from this shell. Once those variables are present and the user has
explicitly approved deploy, rerun `alchemy plan`, then `pnpm infra:deploy`.

Stripe Projects was also checked as a possible source for the missing stage
config:

```bash
stripe projects status --json
stripe projects env
stripe projects llm-context
```

The CLI is authenticated, but this worktree does not have an initialized
Stripe Projects project config, so it cannot currently materialize the missing
Ceird deploy environment from here. Do not run `stripe projects init` without
operator intent; the repository already expects a specific project identity.

Post-deploy live verification checklist:

1. Start tails:
   `pnpm dlx wrangler@latest tail ceird-production-app --format=json` and
   `pnpm dlx wrangler@latest tail ceird-production-api --format=json`.
2. Run the guarded live production Playwright spec:

   ```bash
   PLAYWRIGHT_USE_EXTERNAL_SERVER=1 \
   PLAYWRIGHT_LIVE_PRODUCTION=1 \
   PLAYWRIGHT_BASE_URL=https://app.ceird.app \
   PLAYWRIGHT_API_URL=https://api.ceird.app \
   pnpm --filter app exec playwright test e2e/production-observability.live.test.ts --project=chromium --workers=1
   ```

   The spec creates a fresh disposable `codex-e2e-<timestamp>-<uuid>@example.com`
   account, a disposable organization, service area, rate-card line, site, job,
   comment, status change, visit, and invitee. It attaches a sanitized
   `live-production-observability-summary.json` artifact with app/API response
   paths and `_serverFn` paths redacted.

3. Confirm the app reaches workspace home after disposable organization
   creation.
4. Confirm verification banner/resend, organization settings, service areas,
   rate card, site creation, jobs happy path, members/invites, activity, and
   sign-out all complete.
5. Confirm telemetry now includes app request logs, server-function helper
   logs, Better Auth Cloudflare IP handling without the rate-limit warning,
   API request correlation fields, MCP boundary logs, and no submitted email
   addresses/tokens/cookies in application logs.

## Sandbox E2E Evidence

Sandbox used after local fixes:

- Sandbox: `codex-cloudflare-observability-e2e`
- App URL:
  `https://codex-cloudflare-observability-e2e.app.ceird.localhost:1355`
- API URL:
  `https://codex-cloudflare-observability-e2e.api.ceird.localhost:1355`
- Postgres URL: `postgresql://postgres:postgres@127.0.0.1:5441/ceird`

The first full Playwright run after local fixes passed 19/22 tests. The three
failures were auth/onboarding timeouts under full external-sandbox parallelism:
signup validation did not hydrate in time, signup org creation stayed in the
submitting state, and one verification-banner flow reached the app shell before
active-organization state had settled. Sandbox API logs showed successful auth
and organization API responses around these flows, making this a harness
contention issue rather than a local product failure.

The first parallel auth Playwright run also exposed a hydration helper issue:
`waitForSubmitHydration` only used enumerable React internals and timed out on
several auth pages even though the form was rendered. The helper was updated to
look at `Object.getOwnPropertyNames(...)` and to match submit buttons that rely
on the default `<button>` submit type.

After that harness fix, the focused sandbox auth run passed:

```bash
PLAYWRIGHT_USE_EXTERNAL_SERVER=1 \
PLAYWRIGHT_BASE_URL=https://codex-cloudflare-observability-e2e.app.ceird.localhost:1355 \
PLAYWRIGHT_API_URL=https://codex-cloudflare-observability-e2e.api.ceird.localhost:1355 \
PLAYWRIGHT_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5441/ceird \
pnpm --filter app exec playwright test e2e/auth.test.ts --project=chromium
```

Result: 12 auth/onboarding tests passed in 26.7s, including signup -> create
organization -> workspace home, login -> create organization, verification
resend, existing-org login, and password reset.

The same full sandbox suite was then run with one worker to remove external
sandbox contention:

```bash
PLAYWRIGHT_USE_EXTERNAL_SERVER=1 \
PLAYWRIGHT_BASE_URL=https://codex-cloudflare-observability-e2e.app.ceird.localhost:1355 \
PLAYWRIGHT_API_URL=https://codex-cloudflare-observability-e2e.api.ceird.localhost:1355 \
PLAYWRIGHT_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5441/ceird \
pnpm --filter app exec playwright test --project=chromium --workers=1
```

Result: 22 sandbox E2E tests passed in 2.1m.

After updating `apps/app/playwright.config.ts` to serialize only
`PLAYWRIGHT_USE_EXTERNAL_SERVER=1` runs, and after hardening the long
organization-settings route-modal test, the default external-sandbox command
also passed:

```bash
PLAYWRIGHT_USE_EXTERNAL_SERVER=1 \
PLAYWRIGHT_BASE_URL=https://codex-cloudflare-observability-e2e.app.ceird.localhost:1355 \
PLAYWRIGHT_API_URL=https://codex-cloudflare-observability-e2e.api.ceird.localhost:1355 \
PLAYWRIGHT_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5441/ceird \
pnpm --filter app e2e
```

Result: 22 sandbox E2E tests passed in 2.1m.

Sandbox API logs during the run showed successful
`POST /api/auth/organization/create` responses and structured auth/email/API
request logs. This verifies the local functional onboarding path, but it does
not replace live Cloudflare Worker evidence: the sandbox app dev server does
not prove deployed app Worker request logs, Cloudflare `cf-ray`, or production
`x-ceird-request-id` propagation.

In-app Browser note: the Browser plugin was connected and navigated to the
sandbox signup page, but direct text entry was blocked by the browser runtime's
missing virtual clipboard. Automated Playwright provided the completed sandbox
E2E evidence instead.

## Local Verification

Latest local verification on 2026-05-17 after app/API observability changes:

- `pnpm --filter app test -- src/start.test.ts src/features/api/app-api-client.test.ts src/features/api/app-server-observability.test.ts src/features/api/app-api-server-ssr.test.ts src/features/auth/server-session.test.ts src/features/organizations/organization-server.test.ts src/features/jobs/jobs-server.test.ts`
  - 56 focused app observability and server-helper tests passed after moving app
    request/server-function telemetry into TanStack Start middleware.
- `pnpm --filter app check-types` - passed after adding `src/start.ts`,
  Start global middleware registration, and the route-tree `startInstance`
  type registration.
- `pnpm --filter api check-types` - passed after the app middleware pass.
- `pnpm lint` - 0 warnings and 0 errors after the app middleware pass.
- `pnpm format` - all matched files use the correct format after the app
  middleware pass.
- `rg "console\\.(log|info|warn|error)" apps/app/src apps/api/src -g '*.ts' -g '*.tsx'`
  - no matches after replacing app/API observability output with Effect logs.
- `git diff --check` - no whitespace errors after the app middleware pass.
- `API_ORIGIN=https://api.ceird.app VITE_API_ORIGIN=https://api.ceird.app pnpm --filter app build:cloudflare`
  - passed after the TanStack Start middleware registration; Vite still emits
    the pre-existing route warning for `oauth.consent.test.tsx` and chunk-size
    warnings.
- `pnpm --filter app test -- src/features/api/app-route-observability.test.ts src/features/api/app-api-server-ssr.test.ts src/features/auth/server-session.test.ts src/features/organizations/organization-server.test.ts`
  - 32 focused app tests passed after the simplify pass.
- `pnpm --filter api test -- src/domains/identity/authentication/authentication.test.ts`
  - 38 focused API auth tests passed after hardening Better Auth log
    sanitization.
- `pnpm --filter app check-types` and `pnpm --filter api check-types` - passed
  after the simplify pass.
- `pnpm lint`, `pnpm format`, and `git diff --check` - passed after the
  simplify pass.
- `rg "console\\.(log|info|warn|error)" apps/app/src apps/api/src -g '*.ts' -g '*.tsx'`
  - no matches after the simplify pass.
- `pnpm --filter app test` - 96 files, 660 tests passed.
- `pnpm --filter api test` - 29 files, 234 tests passed.
- `pnpm --filter api test` after Better Auth logger redaction - 29 files, 237
  tests passed.
- `pnpm --filter api test -- src/domains/identity/authentication/authentication.test.ts`
  - 38 tests passed.
- `pnpm --filter api test -- src/domains/identity/authentication/authentication.integration.test.ts`
  - 12 tests passed; expected credential failures logged as info buckets and
    background task failures logged with redacted args.
- `pnpm --filter app test -- src/features/api/app-server-observability.test.ts src/features/api/app-api-client.test.ts src/features/api/app-api-server-ssr.test.ts src/features/auth/server-session.test.ts src/features/organizations/organization-server.test.ts`
  - 43 tests passed after app server-helper failure logging.
- `pnpm --filter app test -- src/features/jobs/jobs-server.test.ts src/features/api/app-server-observability.test.ts src/features/api/app-api-client.test.ts src/features/api/app-api-server-ssr.test.ts src/features/auth/server-session.test.ts src/features/organizations/organization-server.test.ts`
  - 51 tests passed after quieting expected helper-failure logs in focused
    tests.
- `pnpm --filter app test` after app server-helper failure logging - 97 files,
  662 tests passed.
- `pnpm --filter app test -- src/server.test.ts` - post-review
  server-function marker fix passed.
- `pnpm --filter app check-types` - post-review app server wrapper type check
  passed.
- `pnpm --filter app check-types` - passed after app server-helper failure
  logging.
- `pnpm --filter api check-types` - passed after Better Auth logger redaction.
- `pnpm --filter api test -- src/server.test.ts src/domains/mcp/http.test.ts src/domains/api-observability.test.ts`
  - 15 tests passed after MCP pre-router request logging.
- `pnpm --filter api check-types` - passed after MCP pre-router request
  logging.
- `pnpm --filter @ceird/infra test -- src/stages.test.ts` - Worker
  observability sampling config tests passed.
- `pnpm --filter @ceird/infra check-types` - passed after Worker
  observability sampling config.
- `pnpm check-types` - 10 packages passed after app/API/infra observability
  changes.
- `PLAYWRIGHT_USE_EXTERNAL_SERVER=1 ... pnpm --filter app exec playwright test e2e/auth.test.ts --project=chromium`
  - 12 sandbox auth/onboarding tests passed after the hydration-wait helper
    fix.
- `PLAYWRIGHT_USE_EXTERNAL_SERVER=1 ... pnpm --filter app exec playwright test --project=chromium --workers=1`
  - 22 sandbox E2E tests passed before making the external-server worker limit
    config-level.
- `PLAYWRIGHT_USE_EXTERNAL_SERVER=1 ... pnpm --filter app e2e`
  - 22 sandbox E2E tests passed after serializing external-server runs in
    Playwright config and hardening the organization-settings route-modal test.
- `pnpm --filter app check-types` - passed after the external-sandbox
  Playwright config and E2E route-modal hardening.
- `pnpm --filter app check-types` - passed after the E2E hydration helper fix.
- `API_ORIGIN=https://api.ceird.app VITE_API_ORIGIN=https://api.ceird.app pnpm --filter app build:cloudflare`
  - passed during deploy-readiness verification.
- `pnpm --filter api build` - passed during deploy-readiness verification.
- `pnpm --filter @ceird/infra check-types` - passed during deploy-readiness
  verification.
- `pnpm --dir packages/infra exec node scripts/alchemy-env.mjs plan` - blocked
  before rendering a plan because required local stage config is missing
  (`CEIRD_ZONE_NAME` and valid `NEON_DATABASE_URL`).
- `stripe projects status --json` - blocked with `NO_PROJECT_CONFIG` in this
  worktree, so Stripe Projects cannot currently pull the missing env here.
- `pnpm lint` - passed after making the observability patch lint-clean.
- `pnpm --filter app check-types` - passed after the lint cleanup.
- `pnpm --filter api check-types` - passed after the lint cleanup.
- `pnpm --filter app test -- src/features/api/app-server-observability.test.ts src/server.test.ts src/features/api/app-api-server-ssr.test.ts src/features/jobs/jobs-server.test.ts src/features/auth/server-session.test.ts src/features/organizations/organization-server.test.ts src/features/api/app-api-client.test.ts`
  - 53 focused app tests passed after the lint cleanup.
- `pnpm --filter api test -- src/server.test.ts src/domains/identity/authentication/authentication.test.ts`
  - 42 focused API tests passed after the lint cleanup.
- `PLAYWRIGHT_USE_EXTERNAL_SERVER=1 PLAYWRIGHT_BASE_URL=https://app.ceird.app PLAYWRIGHT_API_URL=https://api.ceird.app pnpm --filter app exec playwright test e2e/production-observability.live.test.ts --project=chromium`
  - the guarded live production spec stayed inert without
    `PLAYWRIGHT_LIVE_PRODUCTION=1`; 1 test skipped and no production account/org
    was created.
- `pnpm --filter app check-types` - passed after adding the guarded live
  production observability E2E spec.
- `pnpm lint` - 0 warnings and 0 errors after adding the guarded live
  production observability E2E spec.
- `pnpm --filter app test -- src/features/api/app-route-observability.test.ts src/features/api/app-server-observability.test.ts src/routes/-_app._org.index.test.tsx src/routes/-_app._org.sites.test.tsx src/routes/-_app._org.organization.settings.test.tsx`
  - 23 focused app route/helper observability tests passed after wiring
    route-loader failure logs.
- `pnpm --filter api test -- src/domains/api-observability.test.ts src/server.test.ts`
  - 6 focused API observability/request logging tests passed after adding
    `apiFailureBucket`.
- `pnpm --filter app check-types` - passed after the module-by-module app
  route-loader observability pass and again after the Effect logging adapter
  refactor.
- `pnpm --filter api check-types` - passed after the API failure-bucket
  observability pass and again after the Effect logging adapter refactor.
- `pnpm --filter app test -- src/lib/effect-log.ts src/features/api/app-route-observability.test.ts src/features/api/app-server-observability.test.ts src/server.test.ts src/routes/-_app._org.index.test.tsx src/routes/-_app._org.sites.test.tsx src/routes/-_app._org.organization.settings.test.tsx`
  - 25 focused app observability tests passed after replacing raw console calls
    with Effect logging adapters.
- `pnpm --filter api test -- src/domains/api-observability.test.ts src/server.test.ts src/domains/identity/authentication/authentication.test.ts`
  - 44 focused API observability/auth logging tests passed after replacing raw
    console calls with Effect logging adapters.
- `rg "console\\.(log|info|warn|error)" apps/app/src apps/api/src -g '*.ts' -g '*.tsx'`
  - no matches after the Effect logging refactor.
- `pnpm lint` - 0 warnings and 0 errors after the Effect logging refactor.
- `pnpm format` - all matched files use the correct format.
- `git diff --check` - no whitespace errors.

Additional focused verification after completing the simplify follow-ups:

- `pnpm --filter @ceird/observability-core test` - 10 shared observability
  tests passed after adding safe correlation-id decoding and serialized test log
  sinks.
- `pnpm --filter app test -- src/start.test.ts src/lib/server-api-forwarded-headers.test.ts src/features/api/app-route-observability.test.ts src/features/api/app-server-observability.test.ts src/features/api/app-api-client.test.ts src/features/api/app-api-server-ssr.test.ts src/features/jobs/jobs-server.test.ts src/features/auth/server-session.test.ts src/features/organizations/organization-server.test.ts`
  - 67 focused app middleware, API-helper, route-observability, jobs, auth, and
    organization tests passed after the review-swarm fixes.
- `pnpm --filter api test -- src/server.test.ts src/domains/identity/authentication/authentication.test.ts`
  - 44 focused API request logging/auth config tests passed after the
    review-swarm fixes.
- `pnpm --filter @ceird/infra test -- src/stages.test.ts` - 4 infra stage
  config tests passed after disabling invocation logs by default and making
  production sampling explicit.
- `pnpm check-types` - 11 workspace packages passed after the review-swarm
  fixes.
- `pnpm lint` - 0 warnings and 0 errors after the review-swarm fixes.
- `pnpm format` - all matched files use the correct format after the
  review-swarm fixes.
- `git diff --check` - no whitespace errors after the review-swarm fixes.
- `rg "console\\.(log|info|warn|error)" apps/app/src apps/api/src -g '*.ts' -g '*.tsx'`
  - no matches after the review-swarm fixes.
- `pnpm --filter @ceird/observability-core check-types` - passed.
- `pnpm --filter @ceird/observability-core test` - 4 shared observability
  helper tests passed, including query/fragment path redaction and temporary
  Effect log sink replacement.
- `pnpm --filter app test -- src/features/api/app-server-observability.test.ts src/features/api/app-api-client.test.ts src/features/api/app-api-server-ssr.test.ts src/features/auth/server-session.test.ts src/features/organizations/organization-server.test.ts`
  - 43 focused app API/client/server-helper observability tests passed.
- `pnpm --filter app check-types` - passed after the browser/server API client
  split and typed bucket changes.
- `pnpm --filter api check-types` - passed after switching API imports to the
  shared observability package.
- `pnpm --filter app test -- src/start.test.ts src/features/api/app-server-observability.test.ts`
  - 7 focused app middleware/helper tests passed after tightening shared path
    fragment redaction.
- `pnpm --filter api test -- src/server.test.ts`
  - 4 API request logging tests passed after tightening shared path fragment
    redaction.
- `pnpm --filter app test -- src/lib/server-api-forwarded-headers.test.ts src/features/api/app-api-client.test.ts src/features/api/app-api-server-ssr.test.ts src/features/api/app-server-observability.test.ts src/start.test.ts`
  - 33 focused app tests passed after the simplify review fixes.
- `pnpm --filter api test -- src/domains/identity/authentication/authentication.test.ts`
  - 38 auth logging/config tests passed after the simplify review fixes.
- `pnpm check-types` - 11 workspace packages passed after the simplify review
  fixes.
- `pnpm lint` - 0 warnings and 0 errors after the simplify review fixes.
- `pnpm format` - all matched files use the correct format after the simplify
  review fixes.
- `git diff --check` - no whitespace errors after the simplify review fixes.
- `rg "console\\.(log|info|warn|error)" apps/app/src apps/api/src -g '*.ts' -g '*.tsx'`
  - no matches after the simplify review fixes.
- `pnpm check-types` - 11 workspace packages passed after the final follow-up
  patch.
- `pnpm lint` - 0 warnings and 0 errors after the final follow-up patch.
- `pnpm format` - all matched files use the correct format after the final
  follow-up patch.
- `git diff --check` - no whitespace errors after the final follow-up patch.
- `rg "console\\.(log|info|warn|error)" apps/app/src apps/api/src -g '*.ts' -g '*.tsx'`
  - no matches after the final follow-up patch.

Earlier focused verification while developing the patch:

- `pnpm --filter app test -- src/lib/api-origin.test.ts`
- `pnpm --filter app test -- src/lib/api-origin.test.ts src/features/auth/server-session.test.ts src/features/organizations/organization-server.test.ts src/features/api/app-api-server-ssr.test.ts`
- `pnpm --filter app check-types`
- `API_ORIGIN=https://api.ceird.app VITE_API_ORIGIN=https://api.ceird.app pnpm --filter app build:cloudflare`
- `pnpm --filter api test -- src/domains/identity/authentication/authentication.test.ts`
- `pnpm --filter api check-types`
- `pnpm --filter api test`
- `pnpm format`
- `pnpm --filter app test -- src/server.test.ts src/features/api/app-api-client.test.ts src/features/api/app-api-server-ssr.test.ts src/features/auth/server-session.test.ts src/features/organizations/organization-server.test.ts`
- `pnpm --filter api test -- src/server.test.ts`
