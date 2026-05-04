import {
  decodeCreateOrganizationInput,
  decodeLoginInput,
  decodeOrganizationAccessSession,
  decodeOrganizationMemberInviteInput,
  decodeOrganizationRole,
  decodePasswordResetInput,
  decodePasswordResetRequestInput,
  decodeSignupInput,
  decodeUpdateOrganizationInput,
  isExternalOrganizationRole,
  isInternalOrganizationRole,
  maskInvitationEmail,
} from "./index.js";

describe("createOrganizationInputSchema", () => {
  it("trims valid organization inputs", () => {
    expect(
      decodeCreateOrganizationInput({
        name: "  Acme Field Ops  ",
        slug: "  acme-field-ops  ",
      })
    ).toStrictEqual({
      name: "Acme Field Ops",
      slug: "acme-field-ops",
    });
  }, 1000);

  it("rejects invalid organization slugs", () => {
    expect(() =>
      decodeCreateOrganizationInput({
        name: "Acme Field Ops",
        slug: "Acme Field Ops",
      })
    ).toThrow(/Expected/);
  }, 1000);
});

describe("updateOrganizationInputSchema", () => {
  it("trims a valid organization name update", () => {
    expect(
      decodeUpdateOrganizationInput({
        name: "  Northwind Field Ops  ",
      })
    ).toStrictEqual({
      name: "Northwind Field Ops",
    });
  }, 1000);

  it("rejects organization names shorter than the shared minimum", () => {
    expect(() =>
      decodeUpdateOrganizationInput({
        name: " A ",
      })
    ).toThrow(/Expected/);
  }, 1000);

  it("rejects fields outside the organization settings update contract", () => {
    expect(() =>
      decodeUpdateOrganizationInput({
        name: "Northwind Field Ops",
        slug: "northwind-field-ops",
      })
    ).toThrow(/is unexpected/);
  }, 1000);
});

describe("organization role boundary", () => {
  it("decodes external as an organization role", () => {
    expect(decodeOrganizationRole("external")).toBe("external");
  }, 1000);

  it("classifies internal and external organization roles", () => {
    expect(
      (["owner", "admin", "member", "external"] as const).map((role) =>
        isInternalOrganizationRole(role)
      )
    ).toStrictEqual([true, true, true, false]);
    expect(
      (["owner", "admin", "member", "external"] as const).map((role) =>
        isExternalOrganizationRole(role)
      )
    ).toStrictEqual([false, false, false, true]);
  }, 1000);
});

describe("account input schemas", () => {
  it("normalizes account email and name fields", () => {
    expect(
      decodeSignupInput({
        confirmPassword: "password123",
        email: " user@example.com ",
        name: " Example User ",
        password: "password123",
      })
    ).toStrictEqual({
      confirmPassword: "password123",
      email: "user@example.com",
      name: "Example User",
      password: "password123",
    });

    expect(
      decodeLoginInput({
        email: " user@example.com ",
        password: "password123",
      })
    ).toStrictEqual({
      email: "user@example.com",
      password: "password123",
    });
  }, 1000);

  it("rejects mismatched password confirmation values", () => {
    expect(() =>
      decodePasswordResetInput({
        confirmPassword: "different123",
        password: "password123",
      })
    ).toThrow(/Passwords must match/);
  }, 1000);

  it("decodes password reset request input", () => {
    expect(
      decodePasswordResetRequestInput({
        email: " person@example.com ",
      })
    ).toStrictEqual({
      email: "person@example.com",
    });
  }, 1000);
});

describe("organization member invite input", () => {
  it("decodes invitable organization roles", () => {
    expect(
      decodeOrganizationMemberInviteInput({
        email: " external@example.com ",
        role: "external",
      })
    ).toStrictEqual({
      email: "external@example.com",
      role: "external",
    });
  }, 1000);

  it("rejects owner invitations from member invite forms", () => {
    expect(() =>
      decodeOrganizationMemberInviteInput({
        email: "owner@example.com",
        role: "owner",
      })
    ).toThrow(/Expected/);
  }, 1000);
});

describe("auth session schemas", () => {
  it("decodes organization access sessions with a branded active organization", () => {
    expect(
      decodeOrganizationAccessSession({
        session: {
          activeOrganizationId: "org_123",
          createdAt: "2026-01-01T00:00:00.000Z",
          expiresAt: "2026-01-08T00:00:00.000Z",
          id: "session_123",
          token: "token_123",
          updatedAt: "2026-01-01T00:00:00.000Z",
          userId: "user_123",
        },
        user: {
          createdAt: "2026-01-01T00:00:00.000Z",
          email: "user@example.com",
          emailVerified: true,
          id: "user_123",
          name: "Example User",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      })
    ).toMatchObject({
      session: {
        activeOrganizationId: "org_123",
      },
      user: {
        email: "user@example.com",
      },
    });
  }, 1000);
});

describe("public invitation helpers", () => {
  it("masks invitation emails for public previews", () => {
    expect(maskInvitationEmail("member@example.com")).toBe("m***@e***.com");
    expect(maskInvitationEmail("a@b.co")).toBe("a***@b***.co");
    expect(maskInvitationEmail("invalid-email")).toBe("***");
  }, 1000);
});
