import {
  decodeCreateOrganizationInput,
  decodeOrganizationRole,
  decodeUpdateOrganizationInput,
  isExternalOrganizationRole,
  isInternalOrganizationRole,
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
    expect(isInternalOrganizationRole("owner")).toBe(true);
    expect(isInternalOrganizationRole("admin")).toBe(true);
    expect(isInternalOrganizationRole("member")).toBe(true);
    expect(isInternalOrganizationRole("external")).toBe(false);

    expect(isExternalOrganizationRole("owner")).toBe(false);
    expect(isExternalOrganizationRole("admin")).toBe(false);
    expect(isExternalOrganizationRole("member")).toBe(false);
    expect(isExternalOrganizationRole("external")).toBe(true);
  }, 1000);
});
