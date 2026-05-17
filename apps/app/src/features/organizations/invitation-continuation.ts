export interface InvitationContinuationSearch {
  readonly invitation: string | undefined;
}

const INVITATION_SIGNUP_HANDOFF_PREFIX = "ceird.invitation-signup.";

export function validateInvitationContinuationSearch(
  search: Record<string, unknown>
): InvitationContinuationSearch {
  return {
    invitation:
      typeof search.invitation === "string" ? search.invitation : undefined,
  };
}

export function buildInvitationContinuationSearch(
  invitationId?: string
): InvitationContinuationSearch {
  return {
    invitation: invitationId,
  };
}

export function getInvitationAcceptanceNavigationTarget(invitationId: string) {
  return {
    to: "/accept-invitation/$invitationId" as const,
    params: {
      invitationId,
    },
  };
}

export function recordInvitationSignupHandoff(invitationId: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      getInvitationSignupHandoffKey(invitationId),
      "1"
    );
  } catch {
    // Session storage is only used to smooth the invitation auth handoff.
  }
}

export function hasInvitationSignupHandoff(invitationId: string) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return (
      window.sessionStorage.getItem(
        getInvitationSignupHandoffKey(invitationId)
      ) === "1"
    );
  } catch {
    return false;
  }
}

export function clearInvitationSignupHandoff(invitationId: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(
      getInvitationSignupHandoffKey(invitationId)
    );
  } catch {
    // Session storage is only used to smooth the invitation auth handoff.
  }
}

function getInvitationSignupHandoffKey(invitationId: string) {
  return `${INVITATION_SIGNUP_HANDOFF_PREFIX}${encodeURIComponent(invitationId)}`;
}
