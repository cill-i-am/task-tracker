import { isRedirect } from "@tanstack/react-router";

import type { authClient as AuthClient } from "#/lib/auth-client";

import { requireAuthenticatedSession } from "./require-authenticated-session";

const {
  mockedGetServerAuthSession,
  mockedGetSession,
  mockedIsServerEnvironment,
} = vi.hoisted(() => ({
  mockedGetServerAuthSession: vi.fn(),
  mockedGetSession: vi.fn(),
  mockedIsServerEnvironment: vi.fn(),
}));

vi.mock(import("./server-session"), () => ({
  getCurrentServerSession: mockedGetServerAuthSession,
}));

vi.mock(import("./runtime-environment"), () => ({
  isServerEnvironment: mockedIsServerEnvironment,
}));

vi.mock(import("#/lib/auth-client"), () => ({
  authClient: {
    getSession: mockedGetSession,
  } as unknown as typeof AuthClient,
}));

describe(requireAuthenticatedSession, () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("throws a redirect to /login when no session exists", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetSession.mockResolvedValue({
      data: null,
      error: null,
    });

    const result = requireAuthenticatedSession();

    await expect(result).rejects.toMatchObject({
      options: { to: "/login" },
    });
    await expect(result).rejects.toSatisfy(isRedirect);
  }, 1000);

  it("resolves with the server session when one exists", async () => {
    const session = {
      id: "session_123",
      createdAt: new Date("2026-04-03T12:00:00.000Z"),
      updatedAt: new Date("2026-04-03T12:00:00.000Z"),
      userId: "user_123",
      expiresAt: new Date("2026-04-10T12:00:00.000Z"),
      token: "session-token",
    };

    mockedIsServerEnvironment.mockReturnValue(true);
    mockedGetServerAuthSession.mockResolvedValue(session);
    mockedGetSession.mockRejectedValue(
      new Error("Browser auth client should not run during SSR")
    );

    await expect(requireAuthenticatedSession()).resolves.toStrictEqual(session);
    expect(mockedGetServerAuthSession).toHaveBeenCalledOnce();
    expect(mockedGetSession).not.toHaveBeenCalled();
  }, 1000);
});
