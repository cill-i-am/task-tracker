/* eslint-disable max-classes-per-file, typescript-eslint/no-explicit-any */
import { createHash } from "node:crypto";

import { oauthProvider } from "@better-auth/oauth-provider";
import {
  isAdministrativeOrganizationRole,
  decodeCreateOrganizationInput,
  decodeOrganizationId,
  decodeOrganizationRole,
  decodePublicInvitationPreview,
  decodeUpdateOrganizationInput,
  UserId as UserIdSchema,
} from "@ceird/identity-core";
import type {
  OrganizationId,
  OrganizationRole,
  PublicInvitationPreview,
  UserId as UserIdType,
} from "@ceird/identity-core";
import { HttpApiBuilder, HttpApp } from "@effect/platform";
import { betterAuth } from "better-auth";
import type { BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import type { Role } from "better-auth/plugins/access";
import { jwt } from "better-auth/plugins/jwt";
import { organization } from "better-auth/plugins/organization";
import {
  adminAc,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";
import { and, eq, gt } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Context, Effect, Layer, Runtime, Schema } from "effect";

import { AppDatabase } from "../../../platform/database/database.js";
import { emitApiEffectLog } from "../../effect-log.js";
import { loadAuthEmailConfig } from "./auth-email-config.js";
import {
  AuthenticationEmailScheduler,
  AuthenticationEmailSchedulerLive,
} from "./auth-email-scheduler.js";
import type {
  EmailVerificationEmailInput,
  OrganizationInvitationEmailInput,
  PasswordResetEmailInput,
} from "./auth-email.js";
import { loadAuthenticationConfig, matchesTrustedOrigin } from "./config.js";
import type { AuthenticationConfig } from "./config.js";
import {
  authSchema,
  invitation as invitationTable,
  member as memberTable,
  organization as organizationTable,
  session as sessionTable,
} from "./schema.js";

export { matchesTrustedOrigin } from "./config.js";

const ORGANIZATION_INVITATION_EXPIRATION_SECONDS = 60 * 60 * 24 * 7;
const INVALID_ORGANIZATION_ROLE_MESSAGE =
  "Organization role must be one of owner, admin, member, or external.";
const BETTER_AUTH_ORGANIZATION_ROLES: Record<OrganizationRole, Role> = {
  admin: adminAc,
  external: memberAc,
  member: memberAc,
  owner: ownerAc,
};
const PUBLIC_INVITATION_PREVIEW_PATH_PATTERN =
  /^\/api\/public\/invitations\/([^/]+)\/preview$/;
const ADMINISTRATIVE_ORGANIZATION_ENDPOINT_PATHS = [
  "/organization/get-full-organization",
  "/organization/list-invitations",
  "/organization/list-members",
] as const;
const ORGANIZATION_UPDATE_INPUT_FIELDS = new Set(["name"]);
const SESSION_COOKIE_NAMES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
  "__Host-better-auth.session_token",
  "better-auth-session_token",
] as const;
const BETTER_AUTH_EXPECTED_FAILURE_BUCKETS = {
  "Credential account not found": "credential_account_not_found",
  "Invalid password": "invalid_password",
  "Password not found": "password_not_found",
  "Reset Password: User not found": "password_reset_user_not_found",
  "User not found": "user_not_found",
} as const;
const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const BEARER_TOKEN_PATTERN = /\bBearer\s+[^\s,;]+/gi;
const SENSITIVE_ASSIGNMENT_PATTERN =
  /\b(authorization|cookie|password|secret|session|token)\s*[:=]\s*[^,\s;]+/gi;
const SENSITIVE_LOG_KEY_PATTERN =
  /authorization|callback|code|cookie|email|password|redirect|secret|session|state|token|url/i;
const SENSITIVE_QUERY_PARAM_PATTERN =
  /([?&](?:access_token|callbackURL|callbackUrl|code|id_token|redirectTo|refresh_token|state|token)=)[^&\s]+/gi;
const MAX_BETTER_AUTH_LOG_DEPTH = 4;
const MAX_BETTER_AUTH_LOG_ENTRIES = 25;

type AuthEmailFailureReporter = (error: unknown) => void;
type AuthEmailPromiseSender<Input> = (input: Input) => Promise<void>;
type BetterAuthLogger = NonNullable<BetterAuthOptions["logger"]>;
type BetterAuthLogLevel = Parameters<NonNullable<BetterAuthLogger["log"]>>[0];
interface AuthenticationSessionResult {
  readonly session: {
    readonly activeOrganizationId?: OrganizationId | null | undefined;
  } & Record<string, unknown>;
  readonly user: {
    readonly id: UserIdType;
  } & Record<string, unknown>;
}
interface BetterAuthSessionResult {
  readonly session: {
    readonly activeOrganizationId?: string | null | undefined;
  } & Record<string, unknown>;
  readonly user: {
    readonly id: string;
  } & Record<string, unknown>;
}
interface AuthenticationPluginOption {
  readonly id: string;
  readonly options?: unknown;
}

export interface CeirdAuthentication {
  api: {
    readonly getSession: (options: {
      readonly headers: Headers;
    }) => Promise<AuthenticationSessionResult | null>;
    readonly [endpoint: string]: unknown;
  };
  handler: (request: Request) => Promise<Response>;
  options: BetterAuthOptions & {
    readonly plugins: readonly AuthenticationPluginOption[];
    readonly user?: AuthenticationConfig["user"];
  };
}

export function maskInvitationEmail(email: string) {
  const [localPart, domainPart] = email.split("@");

  if (!localPart || !domainPart) {
    return "***";
  }

  const [domainLabel, ...domainSuffix] = domainPart.split(".");
  const maskedDomainLabel = domainLabel ? `${domainLabel[0]}***` : "***";

  return `${localPart[0]}***@${maskedDomainLabel}${domainSuffix.length > 0 ? `.${domainSuffix.join(".")}` : ""}`;
}

export function makeCeirdBetterAuthLogger(): BetterAuthLogger {
  return {
    level: "warn",
    disableColors: true,
    log(level, message, ...args) {
      const expectedFailureBucket =
        readExpectedBetterAuthFailureBucket(message);

      if (expectedFailureBucket) {
        emitApiEffectLog({
          annotations: {
            authEvent: "expected_auth_failure",
            authFailureBucket: expectedFailureBucket,
            betterAuthLevel: level,
          },
          level: "info",
          message: "Better Auth expected authentication failure",
        });
        return;
      }

      if (message === "Failed to run background task:") {
        emitApiEffectLog({
          annotations: {
            authEvent: "background_task_failed",
            betterAuthLevel: level,
            args: sanitizeBetterAuthLogArgs(args),
          },
          level: "warning",
          message: "Better Auth background task failed",
        });
        return;
      }

      emitApiEffectLog({
        annotations: {
          authEvent: "better_auth_log",
          betterAuthLevel: level,
          message: sanitizeBetterAuthLogString(message),
          args: sanitizeBetterAuthLogArgs(args),
        },
        level: readBetterAuthEffectLogLevel(level),
        message: "Better Auth log",
      });
    },
  };
}

function readBetterAuthEffectLogLevel(
  level: BetterAuthLogLevel
): "error" | "info" | "warning" {
  if (level === "error") {
    return "error";
  }

  if (level === "warn") {
    return "warning";
  }

  return "info";
}

function sanitizeBetterAuthLogArgs(args: readonly unknown[]) {
  const seen = new WeakSet<object>();
  const sanitizedArgs = args
    .slice(0, MAX_BETTER_AUTH_LOG_ENTRIES)
    .map((arg) => sanitizeBetterAuthLogValue(arg, seen, 0));

  return args.length > MAX_BETTER_AUTH_LOG_ENTRIES
    ? [...sanitizedArgs, "[truncated]"]
    : sanitizedArgs;
}

function sanitizeBetterAuthLogValue(
  value: unknown,
  seen: WeakSet<object>,
  depth: number
): unknown {
  if (typeof value === "string") {
    return sanitizeBetterAuthLogString(value);
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeBetterAuthLogString(value.message),
    };
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  if (seen.has(value)) {
    return "[circular]";
  }

  if (depth >= MAX_BETTER_AUTH_LOG_DEPTH) {
    return "[max-depth]";
  }

  seen.add(value);

  if (Array.isArray(value)) {
    const entries = value
      .slice(0, MAX_BETTER_AUTH_LOG_ENTRIES)
      .map((entry) => sanitizeBetterAuthLogValue(entry, seen, depth + 1));

    return value.length > MAX_BETTER_AUTH_LOG_ENTRIES
      ? [...entries, "[truncated]"]
      : entries;
  }

  try {
    const sanitizedEntries: [string, unknown][] = [];
    const source = value as Record<string, unknown>;

    for (const key in source) {
      if (!Object.hasOwn(source, key)) {
        continue;
      }

      if (sanitizedEntries.length >= MAX_BETTER_AUTH_LOG_ENTRIES) {
        sanitizedEntries.push(["__truncated", true]);
        break;
      }

      sanitizedEntries.push([
        key,
        SENSITIVE_LOG_KEY_PATTERN.test(key)
          ? "[redacted]"
          : sanitizeBetterAuthLogValue(source[key], seen, depth + 1),
      ]);
    }

    return Object.fromEntries(sanitizedEntries);
  } catch {
    return "[unserializable]";
  }
}

function sanitizeBetterAuthLogString(value: string) {
  return value
    .replaceAll(EMAIL_PATTERN, "[redacted-email]")
    .replaceAll(BEARER_TOKEN_PATTERN, "Bearer [redacted]")
    .replaceAll(SENSITIVE_ASSIGNMENT_PATTERN, "$1=[redacted]")
    .replaceAll(SENSITIVE_QUERY_PARAM_PATTERN, "$1[redacted]");
}

function readExpectedBetterAuthFailureBucket(message: string) {
  return Object.hasOwn(BETTER_AUTH_EXPECTED_FAILURE_BUCKETS, message)
    ? BETTER_AUTH_EXPECTED_FAILURE_BUCKETS[
        message as keyof typeof BETTER_AUTH_EXPECTED_FAILURE_BUCKETS
      ]
    : undefined;
}

export async function findPublicInvitationPreview(options: {
  readonly database: NodePgDatabase<typeof authSchema>;
  readonly invitationId: string;
  readonly now?: Date;
}): Promise<PublicInvitationPreview | null> {
  const rows = await options.database
    .select({
      email: invitationTable.email,
      organizationName: organizationTable.name,
      role: invitationTable.role,
    })
    .from(invitationTable)
    .innerJoin(
      organizationTable,
      eq(invitationTable.organizationId, organizationTable.id)
    )
    .where(
      and(
        eq(invitationTable.id, options.invitationId),
        eq(invitationTable.status, "pending"),
        gt(invitationTable.expiresAt, options.now ?? new Date())
      )
    )
    .limit(1);

  const [preview] = rows;

  if (!preview) {
    return null;
  }

  return decodePublicInvitationPreview({
    email: maskInvitationEmail(preview.email),
    organizationName: preview.organizationName,
    role: preview.role,
  });
}

function matchPublicInvitationPreviewPath(pathname: string) {
  const match = PUBLIC_INVITATION_PREVIEW_PATH_PATTERN.exec(pathname);
  return match?.[1];
}

function makePublicInvitationPreviewHandler(
  database: NodePgDatabase<typeof authSchema>
) {
  return async (request: Request) => {
    if (request.method !== "GET") {
      return new Response(null, { status: 404 });
    }

    const invitationId = matchPublicInvitationPreviewPath(
      new URL(request.url).pathname
    );

    if (!invitationId) {
      return new Response(null, { status: 404 });
    }

    const preview = await findPublicInvitationPreview({
      database,
      invitationId: decodeURIComponent(invitationId),
    });

    return Response.json(preview);
  };
}

function throwInvalidOrganizationInput(message: string): never {
  throw APIError.from("BAD_REQUEST", {
    code: "INVALID_ORGANIZATION_INPUT",
    message,
  });
}

function throwInvalidOrganizationRole(): never {
  throw APIError.from("BAD_REQUEST", {
    code: "INVALID_ORGANIZATION_ROLE",
    message: INVALID_ORGANIZATION_ROLE_MESSAGE,
  });
}

function decodeWritableOrganizationRole(input: unknown) {
  try {
    return decodeOrganizationRole(input);
  } catch {
    throwInvalidOrganizationRole();
  }
}

function assertOrganizationUpdateOnlyChangesName(
  organizationUpdate: Record<string, unknown>
) {
  const unsupportedField = Object.keys(organizationUpdate).find(
    (field) => !ORGANIZATION_UPDATE_INPUT_FIELDS.has(field)
  );

  if (unsupportedField) {
    throwInvalidOrganizationInput("Only organization name can be updated.");
  }
}

function makePasswordResetDeliveryKey(input: {
  readonly token: string;
  readonly userId: string;
}) {
  const digest = createHash("sha256")
    .update(`password-reset:${input.userId}:${input.token}`)
    .digest("hex");

  return `password-reset/${digest}`;
}

function makeEmailVerificationDeliveryKey(input: {
  readonly token: string;
  readonly userId: string;
}) {
  const digest = createHash("sha256")
    .update(`email-verification:${input.userId}:${input.token}`)
    .digest("hex");

  return `email-verification/${digest}`;
}

function makeEmailChangeConfirmationDeliveryKey(input: {
  readonly token: string;
  readonly userId: string;
}) {
  const digest = createHash("sha256")
    .update(`email-change-confirmation:${input.userId}:${input.token}`)
    .digest("hex");

  return `email-change-confirmation/${digest}`;
}

export function createAuthentication(options: {
  readonly appOrigin: string;
  readonly backgroundTaskHandler: (task: Promise<unknown>) => void;
  readonly config: AuthenticationConfig;
  readonly database: NodePgDatabase<typeof authSchema>;
  readonly reportPasswordResetEmailFailure: (error: unknown) => void;
  readonly reportEmailChangeConfirmationFailure?: (error: unknown) => void;
  readonly reportOrganizationInvitationEmailFailure?: (error: unknown) => void;
  readonly sendOrganizationInvitationEmail: (
    input: OrganizationInvitationEmailInput
  ) => Promise<void>;
  readonly reportVerificationEmailFailure: (error: unknown) => void;
  readonly sendPasswordResetEmail: (
    input: PasswordResetEmailInput
  ) => Promise<void>;
  readonly sendVerificationEmail: (
    input: EmailVerificationEmailInput
  ) => Promise<void>;
}): CeirdAuthentication {
  const {
    config,
    database,
    sendOrganizationInvitationEmail,
    sendPasswordResetEmail,
    sendVerificationEmail,
  } = options;
  const {
    databaseUrl: _databaseUrl,
    mcpResourceUrl,
    oauthClientRegistrationDefaultScopes,
    oauthConsentPath,
    oauthIssuerUrl,
    oauthScopes,
    ...authConfig
  } = config;
  const loginPage = new URL("/login", options.appOrigin).toString();
  const consentPage = new URL(oauthConsentPath, options.appOrigin).toString();

  const auth = betterAuth({
    ...authConfig,
    advanced: {
      ...authConfig.advanced,
      backgroundTasks: {
        handler: options.backgroundTaskHandler,
      },
    },
    database: drizzleAdapter(database, {
      provider: "pg",
      schema: authSchema,
    }),
    disabledPaths: ["/token"],
    logger: makeCeirdBetterAuthLogger(),
    plugins: [
      jwt({
        disableSettingJwtHeader: true,
        jwt: {
          issuer: oauthIssuerUrl,
        },
      }),
      oauthProvider({
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        advertisedMetadata: {
          scopes_supported: [...oauthScopes],
        },
        clientRegistrationAllowedScopes: [...oauthScopes],
        clientRegistrationDefaultScopes: [
          ...oauthClientRegistrationDefaultScopes,
        ],
        consentPage,
        disableJwtPlugin: false,
        grantTypes: ["authorization_code", "refresh_token"],
        loginPage,
        scopes: [...oauthScopes],
        silenceWarnings: {
          oauthAuthServerConfig: true,
          openidConfig: true,
        },
        validAudiences: [authConfig.baseURL, mcpResourceUrl],
      }),
      organization({
        cancelPendingInvitationsOnReInvite: true,
        invitationExpiresIn: ORGANIZATION_INVITATION_EXPIRATION_SECONDS,
        roles: BETTER_AUTH_ORGANIZATION_ROLES,
        organizationHooks: {
          beforeCreateOrganization: ({ organization: nextOrganization }) => {
            let input;

            try {
              input = decodeCreateOrganizationInput(nextOrganization);
            } catch {
              throwInvalidOrganizationInput(
                "Organization name must be at least 2 characters long and the slug must use lowercase letters, numbers, and hyphens only."
              );
            }

            return Promise.resolve({
              data: {
                ...nextOrganization,
                name: input.name,
                slug: input.slug,
              },
            });
          },
          beforeUpdateOrganization: ({ organization: nextOrganization }) => {
            let input;

            assertOrganizationUpdateOnlyChangesName(nextOrganization);

            try {
              input = decodeUpdateOrganizationInput(nextOrganization);
            } catch {
              throwInvalidOrganizationInput(
                "Organization name must be at least 2 characters long."
              );
            }

            return Promise.resolve({
              data: {
                name: input.name,
              },
            });
          },
          beforeAddMember: ({ member: nextMember }) =>
            Promise.resolve({
              data: {
                ...nextMember,
                role: decodeWritableOrganizationRole(nextMember.role),
              },
            }),
          beforeUpdateMemberRole: ({ newRole }) =>
            Promise.resolve({
              data: {
                role: decodeWritableOrganizationRole(newRole),
              },
            }),
          beforeCreateInvitation: ({ invitation: nextInvitation }) =>
            Promise.resolve({
              data: {
                ...nextInvitation,
                role: decodeWritableOrganizationRole(nextInvitation.role),
              },
            }),
        },
        sendInvitationEmail: async (organizationInvitation) => {
          await deliverAuthEmail({
            reportFailure:
              options.reportOrganizationInvitationEmailFailure ??
              options.reportVerificationEmailFailure,
            send: sendOrganizationInvitationEmail,
            input: {
              deliveryKey: `organization-invitation/${organizationInvitation.id}`,
              invitationUrl: new URL(
                `/accept-invitation/${organizationInvitation.id}`,
                options.appOrigin
              ).toString(),
              inviterEmail: organizationInvitation.inviter.user.email,
              organizationName: organizationInvitation.organization.name,
              recipientEmail: organizationInvitation.email,
              recipientName: organizationInvitation.email,
              role: decodeOrganizationRole(organizationInvitation.role),
            } as const satisfies OrganizationInvitationEmailInput,
          });
        },
      }),
    ],
    emailAndPassword: {
      ...authConfig.emailAndPassword,
      sendResetPassword: async ({ token, user, url }) => {
        await deliverAuthEmail({
          reportFailure: options.reportPasswordResetEmailFailure,
          send: sendPasswordResetEmail,
          input: {
            deliveryKey: makePasswordResetDeliveryKey({
              token,
              userId: user.id,
            }),
            recipientEmail: user.email,
            recipientName: user.name ?? user.email,
            resetUrl: url,
          } as const satisfies PasswordResetEmailInput,
        });
      },
    },
    emailVerification: {
      ...authConfig.emailVerification,
      sendVerificationEmail: async ({ user, token, url }) => {
        await deliverAuthEmail({
          reportFailure: options.reportVerificationEmailFailure,
          send: sendVerificationEmail,
          input: {
            deliveryKey: makeEmailVerificationDeliveryKey({
              token,
              userId: user.id,
            }),
            recipientEmail: user.email,
            recipientName: user.name ?? user.email,
            verificationUrl: url,
          } as const satisfies EmailVerificationEmailInput,
        });
      },
    },
    user: {
      ...authConfig.user,
      changeEmail: {
        ...authConfig.user.changeEmail,
        sendChangeEmailConfirmation: async ({ user, token, url }) => {
          await deliverAuthEmail({
            reportFailure:
              options.reportEmailChangeConfirmationFailure ??
              options.reportVerificationEmailFailure,
            send: sendVerificationEmail,
            input: {
              deliveryKey: makeEmailChangeConfirmationDeliveryKey({
                token,
                userId: user.id,
              }),
              recipientEmail: user.email,
              recipientName: user.name ?? user.email,
              verificationUrl: url,
            } as const satisfies EmailVerificationEmailInput,
          });
        },
      },
    },
  });

  const ceirdAuth = auth as CeirdAuthentication;
  const getRawSession = (
    ceirdAuth.api.getSession as unknown as (options: {
      readonly headers: Headers;
    }) => Promise<BetterAuthSessionResult | null>
  ).bind(ceirdAuth.api);

  (
    ceirdAuth.api as {
      getSession: CeirdAuthentication["api"]["getSession"];
    }
  ).getSession = async (sessionOptions: { readonly headers: Headers }) =>
    decodeAuthenticationSessionResult(await getRawSession(sessionOptions));
  ceirdAuth.handler = withAuthenticationAuthorizationGuards(
    ceirdAuth.handler,
    database
  );

  return ceirdAuth;
}

function decodeAuthenticationSessionResult(
  sessionResult: BetterAuthSessionResult | null
): AuthenticationSessionResult | null {
  if (sessionResult === null) {
    return null;
  }

  return {
    ...sessionResult,
    session: {
      ...sessionResult.session,
      activeOrganizationId: decodeOptionalSessionOrganizationId(
        sessionResult.session.activeOrganizationId
      ),
    },
    user: {
      ...sessionResult.user,
      id: Schema.decodeUnknownSync(UserIdSchema)(sessionResult.user.id),
    },
  };
}

function decodeOptionalSessionOrganizationId(
  organizationId: string | null | undefined
) {
  if (organizationId === null || organizationId === undefined) {
    return organizationId;
  }

  return decodeOrganizationId(organizationId);
}

function makeAuthenticationBackgroundTaskHandler() {
  return (task: Promise<unknown>) => {
    // Node/sandbox runtime only. The Cloudflare Worker runtime provides a
    // waitUntil-backed handler and schedules durable work through Queues.
    queueMicrotask(() => {
      void task;
    });
  };
}

export class AuthenticationBackgroundTaskHandler extends Context.Tag(
  "@ceird/domains/identity/authentication/AuthenticationBackgroundTaskHandler"
)<AuthenticationBackgroundTaskHandler, (task: Promise<unknown>) => void>() {}

export const AuthenticationBackgroundTaskHandlerLive = Layer.succeed(
  AuthenticationBackgroundTaskHandler,
  makeAuthenticationBackgroundTaskHandler()
);

async function deliverAuthEmail<Input>(options: {
  readonly input: Input;
  readonly reportFailure: AuthEmailFailureReporter;
  readonly send: AuthEmailPromiseSender<Input>;
}) {
  try {
    await options.send(options.input);
  } catch (error) {
    try {
      options.reportFailure(error);
    } catch {
      // Observability must never replace the delivery failure Better Auth sees.
    }
    throw error;
  }
}

function makeEmailFailureReporter(
  runtime: Runtime.Runtime<never>,
  label: string
) {
  const runFork = Runtime.runFork(runtime);

  return (error: unknown) => {
    const serializedError = serializeBackgroundTaskError(error);

    runFork(
      Effect.logError("Authentication background email delivery failed").pipe(
        Effect.annotateLogs({
          authEmailFailureLabel: label,
          ...(serializedError.cause
            ? { authEmailFailureCause: serializedError.cause }
            : {}),
          authEmailFailureMessage: serializedError.message,
          ...(serializedError.tag
            ? { authEmailFailureTag: serializedError.tag }
            : {}),
        })
      )
    );
  };
}

function serializeBackgroundTaskError(error: unknown) {
  if (typeof error === "object" && error !== null) {
    return {
      cause:
        "cause" in error && typeof error.cause === "string"
          ? error.cause
          : undefined,
      message:
        "message" in error && typeof error.message === "string"
          ? error.message
          : String(error),
      tag: "_tag" in error && typeof error._tag === "string" ? error._tag : "",
    };
  }

  return {
    message: String(error),
  };
}

function appendVaryHeader(headers: Headers, value: string) {
  const current = headers.get("Vary");

  if (!current) {
    headers.set("Vary", value);
    return;
  }

  const values = new Set([
    ...current
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0),
    value,
  ]);
  headers.set("Vary", [...values].join(", "));
}

function withAuthenticationAuthorizationGuards(
  handler: (request: Request) => Promise<Response>,
  database: NodePgDatabase<typeof authSchema>
) {
  return async (request: Request) => {
    if (isAdministrativeOrganizationEndpointRequest(request)) {
      const access = await resolveAdministrativeOrganizationEndpointAccess(
        database,
        request
      );

      if (access === "nonAdministrative") {
        return Response.json(
          {
            code: "FORBIDDEN",
            message:
              "Only organization owners and admins can access organization administration.",
          },
          { status: 403 }
        );
      }
    }

    return handler(request);
  };
}

function isAdministrativeOrganizationEndpointRequest(request: Request) {
  const { pathname } = new URL(request.url);

  return (
    request.method === "GET" &&
    ADMINISTRATIVE_ORGANIZATION_ENDPOINT_PATHS.some(
      (endpointPath) =>
        pathname === endpointPath || pathname.endsWith(endpointPath)
    )
  );
}

async function resolveAdministrativeOrganizationEndpointAccess(
  database: NodePgDatabase<typeof authSchema>,
  request: Request
): Promise<"administrative" | "nonAdministrative" | "unknown"> {
  const sessionToken = extractBetterAuthSessionToken(
    request.headers.get("cookie")
  );

  if (sessionToken === undefined) {
    return "unknown";
  }

  const [session] = await database
    .select({
      activeOrganizationId: sessionTable.activeOrganizationId,
      userId: sessionTable.userId,
    })
    .from(sessionTable)
    .where(
      and(
        eq(sessionTable.token, sessionToken),
        gt(sessionTable.expiresAt, new Date())
      )
    )
    .limit(1);

  if (session === undefined) {
    return "unknown";
  }

  const organizationId = await resolveAdministrativeOrganizationTargetId(
    database,
    request,
    session.activeOrganizationId
  );

  if (organizationId === null) {
    return "nonAdministrative";
  }

  const [member] = await database
    .select({
      role: memberTable.role,
    })
    .from(memberTable)
    .where(
      and(
        eq(memberTable.organizationId, organizationId),
        eq(memberTable.userId, session.userId)
      )
    )
    .limit(1);

  if (member === undefined) {
    return "unknown";
  }

  return isAdministrativeOrganizationRole(decodeOrganizationRole(member.role))
    ? "administrative"
    : "nonAdministrative";
}

async function resolveAdministrativeOrganizationTargetId(
  database: NodePgDatabase<typeof authSchema>,
  request: Request,
  activeOrganizationId: string | null
): Promise<OrganizationId | null> {
  const { searchParams } = new URL(request.url);
  const organizationSlug = searchParams.get("organizationSlug");

  if (organizationSlug !== null) {
    const [organizationRow] = await database
      .select({
        id: organizationTable.id,
      })
      .from(organizationTable)
      .where(eq(organizationTable.slug, organizationSlug))
      .limit(1);

    return decodeAdministrativeOrganizationId(organizationRow?.id);
  }

  return decodeAdministrativeOrganizationId(
    searchParams.get("organizationId") ?? activeOrganizationId
  );
}

function decodeAdministrativeOrganizationId(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  try {
    return decodeOrganizationId(value);
  } catch {
    return null;
  }
}

function extractBetterAuthSessionToken(cookieHeader: string | null) {
  if (cookieHeader === null) {
    return;
  }

  for (const cookie of cookieHeader.split(";")) {
    const separatorIndex = cookie.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const name = cookie.slice(0, separatorIndex).trim();

    if (!isBetterAuthSessionCookieName(name)) {
      continue;
    }

    const rawValue = decodeCookieValue(cookie.slice(separatorIndex + 1).trim());
    const [token] = rawValue.split(".", 1);

    if (token && token.length > 0) {
      return token;
    }

    return;
  }
}

function isBetterAuthSessionCookieName(name: string) {
  return (
    SESSION_COOKIE_NAMES.includes(
      name as (typeof SESSION_COOKIE_NAMES)[number]
    ) ||
    name.endsWith("better-auth.session_token") ||
    name.endsWith("better-auth-session_token")
  );
}

function decodeCookieValue(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function withAuthenticationCors(
  handler: (request: Request) => Promise<Response>,
  trustedOrigins: readonly string[]
) {
  return async (request: Request) => {
    const origin = request.headers.get("origin");
    const isTrustedOrigin =
      typeof origin === "string" &&
      matchesTrustedOrigin(origin, trustedOrigins);

    if (request.method === "OPTIONS") {
      if (!isTrustedOrigin) {
        return new Response(null, { status: 403 });
      }

      const response = new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Allow-Headers":
            request.headers.get("access-control-request-headers") ??
            "content-type",
          "Access-Control-Allow-Methods":
            request.headers.get("access-control-request-method") ??
            "GET, POST, OPTIONS",
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Max-Age": "600",
        },
      });

      appendVaryHeader(response.headers, "Origin");
      appendVaryHeader(response.headers, "Access-Control-Request-Headers");

      return response;
    }

    const response = await handler(request);

    if (!isTrustedOrigin) {
      return response;
    }

    const corsResponse = new Response(response.body, response);
    corsResponse.headers.set("Access-Control-Allow-Credentials", "true");
    corsResponse.headers.set("Access-Control-Allow-Origin", origin);
    appendVaryHeader(corsResponse.headers, "Origin");

    return corsResponse;
  };
}

export class Authentication extends Effect.Service<Authentication>()(
  "@ceird/domains/identity/authentication/Authentication",
  {
    dependencies: [
      AuthenticationEmailSchedulerLive,
      AuthenticationBackgroundTaskHandlerLive,
    ],
    effect: Effect.gen(function* AuthenticationLive() {
      const authEmailConfig = yield* loadAuthEmailConfig;
      const config = yield* loadAuthenticationConfig;
      const { authDb } = yield* AppDatabase;
      const authEmailScheduler = yield* AuthenticationEmailScheduler;
      const runtime = yield* Effect.runtime<never>();
      const backgroundTaskHandler = yield* AuthenticationBackgroundTaskHandler;
      const reportPasswordResetEmailFailure = makeEmailFailureReporter(
        runtime,
        "Password reset email delivery failed"
      );
      const reportVerificationEmailFailure = makeEmailFailureReporter(
        runtime,
        "Verification email delivery failed"
      );
      const reportEmailChangeConfirmationFailure = makeEmailFailureReporter(
        runtime,
        "Email change confirmation delivery failed"
      );
      const reportOrganizationInvitationEmailFailure = makeEmailFailureReporter(
        runtime,
        "Organization invitation email delivery failed"
      );

      return createAuthentication({
        appOrigin: authEmailConfig.appOrigin,
        backgroundTaskHandler,
        config,
        database: authDb,
        reportEmailChangeConfirmationFailure,
        reportOrganizationInvitationEmailFailure,
        reportPasswordResetEmailFailure,
        sendOrganizationInvitationEmail:
          authEmailScheduler.sendOrganizationInvitationEmail,
        reportVerificationEmailFailure,
        sendPasswordResetEmail: authEmailScheduler.sendPasswordResetEmail,
        sendVerificationEmail: authEmailScheduler.sendVerificationEmail,
      });
    }),
  }
) {}

export const AuthenticationHttpLive = HttpApiBuilder.Router.use((router) =>
  Effect.gen(function* mountAuthenticationHttp() {
    const auth = yield* Authentication;
    const { authDb } = yield* AppDatabase;
    const config = yield* loadAuthenticationConfig;

    // Effect strips mount prefixes by default. Better Auth expects to receive
    // its configured basePath, so we preserve the full /api/auth prefix here.
    yield* router.mountApp(
      "/api/auth",
      HttpApp.fromWebHandler(
        withAuthenticationCors(auth.handler, config.trustedOrigins)
      ),
      {
        includePrefix: true,
      }
    );

    yield* router.mountApp(
      "/api/public",
      HttpApp.fromWebHandler(
        withAuthenticationCors(
          makePublicInvitationPreviewHandler(authDb),
          config.trustedOrigins
        )
      ),
      {
        includePrefix: true,
      }
    );
  })
);

export const makeAuthenticationLive = (
  emailSchedulerLive: typeof AuthenticationEmailSchedulerLive = AuthenticationEmailSchedulerLive,
  backgroundTaskHandlerLive: Layer.Layer<AuthenticationBackgroundTaskHandler> = AuthenticationBackgroundTaskHandlerLive
) =>
  Authentication.DefaultWithoutDependencies.pipe(
    Layer.provide(emailSchedulerLive),
    Layer.provide(backgroundTaskHandlerLive)
  );

export const AuthenticationLive = makeAuthenticationLive();
