import {
  buildInvitationContinuationSearch,
  clearInvitationSignupHandoff,
  getInvitationAcceptanceNavigationTarget,
  hasInvitationSignupHandoff,
  recordInvitationSignupHandoff,
  validateInvitationContinuationSearch,
} from "./invitation-continuation";

describe("invitation continuation", () => {
  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("reads the invitation id from route search", () => {
    expect(
      validateInvitationContinuationSearch({
        invitation: "inv_123",
      })
    ).toStrictEqual({
      invitation: "inv_123",
    });
  }, 10_000);

  it("drops invalid invitation continuation values", () => {
    expect(
      validateInvitationContinuationSearch({
        invitation: 123,
      })
    ).toStrictEqual({
      invitation: undefined,
    });
  }, 10_000);

  it("builds preserved auth search for an invitation", () => {
    expect(buildInvitationContinuationSearch("inv_123")).toStrictEqual({
      invitation: "inv_123",
    });
  }, 10_000);

  it("builds the accept-invitation navigation target", () => {
    expect(getInvitationAcceptanceNavigationTarget("inv_123")).toStrictEqual({
      params: {
        invitationId: "inv_123",
      },
      to: "/accept-invitation/$invitationId",
    });
  }, 10_000);

  it("tracks invitation signup handoff in session storage", () => {
    expect(hasInvitationSignupHandoff("inv_123")).toBeFalsy();

    recordInvitationSignupHandoff("inv_123");

    expect(hasInvitationSignupHandoff("inv_123")).toBeTruthy();
    expect(hasInvitationSignupHandoff("other_invitation")).toBeFalsy();

    clearInvitationSignupHandoff("inv_123");

    expect(hasInvitationSignupHandoff("inv_123")).toBeFalsy();
  }, 10_000);
});
