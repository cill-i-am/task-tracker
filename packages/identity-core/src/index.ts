import { ParseResult, Schema } from "effect";

export const ORGANIZATION_NAME_MIN_LENGTH = 2;
export const ORGANIZATION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const ACCOUNT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const OrganizationId = Schema.NonEmptyString.pipe(
  Schema.brand("@task-tracker/identity-core/OrganizationId")
);
export type OrganizationId = Schema.Schema.Type<typeof OrganizationId>;

export const ORGANIZATION_ROLES = [
  "owner",
  "admin",
  "member",
  "external",
] as const;
export const INTERNAL_ORGANIZATION_ROLES = [
  "owner",
  "admin",
  "member",
] as const;
export const ADMINISTRATIVE_ORGANIZATION_ROLES = ["owner", "admin"] as const;
export const INVITABLE_ORGANIZATION_ROLES = [
  "admin",
  "member",
  "external",
] as const;

export const OrganizationRole = Schema.Literal(...ORGANIZATION_ROLES);
export type OrganizationRole = Schema.Schema.Type<typeof OrganizationRole>;

export const AdministrativeOrganizationRole = Schema.Literal(
  ...ADMINISTRATIVE_ORGANIZATION_ROLES
);
export type AdministrativeOrganizationRole = Schema.Schema.Type<
  typeof AdministrativeOrganizationRole
>;

export const InternalOrganizationRole = Schema.Literal(
  ...INTERNAL_ORGANIZATION_ROLES
);
export type InternalOrganizationRole = Schema.Schema.Type<
  typeof InternalOrganizationRole
>;

export const InvitableOrganizationRole = Schema.Literal(
  ...INVITABLE_ORGANIZATION_ROLES
);
export type InvitableOrganizationRole = Schema.Schema.Type<
  typeof InvitableOrganizationRole
>;

export const OrganizationMemberRoleResponseSchema = Schema.Struct({
  role: OrganizationRole,
});
export type OrganizationMemberRoleResponse = Schema.Schema.Type<
  typeof OrganizationMemberRoleResponseSchema
>;

export const OrganizationSummarySchema = Schema.Struct({
  id: OrganizationId,
  name: Schema.String,
  slug: Schema.String,
});
export type OrganizationSummary = Schema.Schema.Type<
  typeof OrganizationSummarySchema
>;

export const OrganizationSummaryListSchema = Schema.Array(
  OrganizationSummarySchema
);
export type OrganizationSummaryList = Schema.Schema.Type<
  typeof OrganizationSummaryListSchema
>;

export const OrganizationNameSchema = Schema.Trim.pipe(
  Schema.minLength(ORGANIZATION_NAME_MIN_LENGTH)
);

export const OrganizationSlugSchema = Schema.Trim.pipe(
  Schema.minLength(2),
  Schema.pattern(ORGANIZATION_SLUG_PATTERN)
);

export const AccountEmailSchema = Schema.Trim.pipe(
  Schema.nonEmptyString(),
  Schema.pattern(ACCOUNT_EMAIL_PATTERN)
);
export type AccountEmail = Schema.Schema.Type<typeof AccountEmailSchema>;

export const AccountPasswordSchema = Schema.String.pipe(Schema.minLength(8));
export type AccountPassword = Schema.Schema.Type<typeof AccountPasswordSchema>;

export const AccountNameSchema = Schema.Trim.pipe(Schema.minLength(2));
export type AccountName = Schema.Schema.Type<typeof AccountNameSchema>;

export const LoginInputSchema = Schema.Struct({
  email: AccountEmailSchema,
  password: AccountPasswordSchema,
});
export type LoginInput = Schema.Schema.Type<typeof LoginInputSchema>;

export const SignupInputSchema = Schema.Struct({
  name: AccountNameSchema,
  email: AccountEmailSchema,
  password: AccountPasswordSchema,
  confirmPassword: AccountPasswordSchema,
}).pipe(
  Schema.filter((input) => input.password === input.confirmPassword),
  Schema.annotations({
    message: () => "Passwords must match",
  })
);
export type SignupInput = Schema.Schema.Type<typeof SignupInputSchema>;

export const PasswordResetRequestInputSchema = Schema.Struct({
  email: AccountEmailSchema,
});
export type PasswordResetRequestInput = Schema.Schema.Type<
  typeof PasswordResetRequestInputSchema
>;

export const PasswordResetInputSchema = Schema.Struct({
  password: AccountPasswordSchema,
  confirmPassword: AccountPasswordSchema,
}).pipe(
  Schema.filter((input) => input.password === input.confirmPassword),
  Schema.annotations({
    message: () => "Passwords must match",
  })
);
export type PasswordResetInput = Schema.Schema.Type<
  typeof PasswordResetInputSchema
>;

export const CreateOrganizationInputSchema = Schema.Struct({
  name: OrganizationNameSchema,
  slug: OrganizationSlugSchema,
});

export const UpdateOrganizationInputSchema = Schema.Struct({
  name: OrganizationNameSchema,
});

export type CreateOrganizationInput = Schema.Schema.Type<
  typeof CreateOrganizationInputSchema
>;

export type UpdateOrganizationInput = Schema.Schema.Type<
  typeof UpdateOrganizationInputSchema
>;

export const PublicInvitationPreviewSchema = Schema.Struct({
  email: Schema.String,
  organizationName: Schema.String,
  role: OrganizationRole,
});

export type PublicInvitationPreview = Schema.Schema.Type<
  typeof PublicInvitationPreviewSchema
>;

export const OrganizationMemberInviteInputSchema = Schema.Struct({
  email: AccountEmailSchema,
  role: InvitableOrganizationRole,
});
export type OrganizationMemberInviteInput = Schema.Schema.Type<
  typeof OrganizationMemberInviteInputSchema
>;

const NullableString = Schema.NullOr(Schema.String);
const NullableOrganizationId = Schema.NullOr(OrganizationId);

export const BetterAuthSessionSchema = Schema.Struct({
  session: Schema.Struct({
    id: Schema.String,
    createdAt: Schema.String,
    updatedAt: Schema.String,
    userId: Schema.String,
    expiresAt: Schema.String,
    token: Schema.String,
    ipAddress: Schema.optional(NullableString),
    userAgent: Schema.optional(NullableString),
    activeOrganizationId: Schema.optional(NullableString),
  }),
  user: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    email: Schema.String,
    image: Schema.optional(NullableString),
    emailVerified: Schema.Boolean,
    createdAt: Schema.String,
    updatedAt: Schema.String,
  }),
});
export type BetterAuthSession = Schema.Schema.Type<
  typeof BetterAuthSessionSchema
>;

export const OrganizationAccessSessionSchema = Schema.Struct({
  session: Schema.Struct({
    id: Schema.String,
    createdAt: Schema.String,
    updatedAt: Schema.String,
    userId: Schema.String,
    expiresAt: Schema.String,
    token: Schema.String,
    ipAddress: Schema.optional(NullableString),
    userAgent: Schema.optional(NullableString),
    activeOrganizationId: Schema.optional(NullableOrganizationId),
  }),
  user: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    email: Schema.String,
    image: Schema.optional(NullableString),
    emailVerified: Schema.Boolean,
    createdAt: Schema.String,
    updatedAt: Schema.String,
  }),
});
export type OrganizationAccessSession = Schema.Schema.Type<
  typeof OrganizationAccessSessionSchema
>;

export function maskInvitationEmail(email: string) {
  const [localPart, domainPart] = email.split("@");

  if (!localPart || !domainPart) {
    return "***";
  }

  const [domainLabel, ...domainSuffix] = domainPart.split(".");
  const maskedDomainLabel = domainLabel ? `${domainLabel[0]}***` : "***";

  return `${localPart[0]}***@${maskedDomainLabel}${domainSuffix.length > 0 ? `.${domainSuffix.join(".")}` : ""}`;
}

export function decodeLoginInput(input: unknown): LoginInput {
  return ParseResult.decodeUnknownSync(LoginInputSchema)(input);
}

export function decodeSignupInput(input: unknown): SignupInput {
  return ParseResult.decodeUnknownSync(SignupInputSchema)(input);
}

export function decodePasswordResetRequestInput(
  input: unknown
): PasswordResetRequestInput {
  return ParseResult.decodeUnknownSync(PasswordResetRequestInputSchema)(input);
}

export function decodePasswordResetInput(input: unknown): PasswordResetInput {
  return ParseResult.decodeUnknownSync(PasswordResetInputSchema)(input);
}

export function decodeOrganizationMemberInviteInput(
  input: unknown
): OrganizationMemberInviteInput {
  return ParseResult.decodeUnknownSync(OrganizationMemberInviteInputSchema)(
    input
  );
}

export function decodeBetterAuthSession(input: unknown): BetterAuthSession {
  return ParseResult.decodeUnknownSync(BetterAuthSessionSchema)(input);
}

export function decodeOrganizationAccessSession(
  input: unknown
): OrganizationAccessSession {
  return ParseResult.decodeUnknownSync(OrganizationAccessSessionSchema)(input);
}

export function decodeCreateOrganizationInput(
  input: unknown
): CreateOrganizationInput {
  return ParseResult.decodeUnknownSync(CreateOrganizationInputSchema)(input);
}

export function decodeUpdateOrganizationInput(
  input: unknown
): UpdateOrganizationInput {
  return ParseResult.decodeUnknownSync(UpdateOrganizationInputSchema)(input, {
    onExcessProperty: "error",
  });
}

export function decodePublicInvitationPreview(
  input: unknown
): PublicInvitationPreview {
  return ParseResult.decodeUnknownSync(PublicInvitationPreviewSchema)(input);
}

export function decodeOrganizationId(input: unknown): OrganizationId {
  return ParseResult.decodeUnknownSync(OrganizationId)(input);
}

export function decodeOrganizationRole(input: unknown): OrganizationRole {
  return ParseResult.decodeUnknownSync(OrganizationRole)(input);
}

const administrativeOrganizationRoleSet = new Set<OrganizationRole>(
  ADMINISTRATIVE_ORGANIZATION_ROLES
);
const internalOrganizationRoleSet = new Set<OrganizationRole>(
  INTERNAL_ORGANIZATION_ROLES
);

export function isAdministrativeOrganizationRole(
  role: OrganizationRole
): boolean {
  return administrativeOrganizationRoleSet.has(role);
}

export function isInternalOrganizationRole(
  role: OrganizationRole
): role is InternalOrganizationRole {
  return internalOrganizationRoleSet.has(role);
}

export function isExternalOrganizationRole(
  role: OrganizationRole
): role is "external" {
  return role === "external";
}

export function decodeOrganizationMemberRoleResponse(
  input: unknown
): OrganizationMemberRoleResponse {
  return ParseResult.decodeUnknownSync(OrganizationMemberRoleResponseSchema)(
    input
  );
}

export function decodeOrganizationSummary(input: unknown): OrganizationSummary {
  return ParseResult.decodeUnknownSync(OrganizationSummarySchema)(input);
}

export function decodeOrganizationSummaryList(
  input: unknown
): OrganizationSummaryList {
  return ParseResult.decodeUnknownSync(OrganizationSummaryListSchema)(input);
}
