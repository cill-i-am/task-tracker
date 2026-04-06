import { isRedirect } from "@tanstack/react-router";

import {
  ensureActiveOrganizationId,
  listOrganizations,
  redirectIfOrganizationReady,
  requireOrganizationAccess,
} from "./organization-access";
import type { OrganizationSummary } from "./organization-access";

interface Session {
  session: {
    activeOrganizationId?: string | null;
  };
  user: {
    id: string;
    name: string;
    email: string;
  };
}

interface Organization {
  id: string;
  name: string;
  slug: string;
}

const {
  mockedGetServerSession,
  mockedListServerOrganizations,
  mockedGetStrictServerOrganizations,
  mockedGetSession,
  mockedGetClientOrganizations,
  mockedIsServerEnvironment,
} = vi.hoisted(() => ({
  mockedGetServerSession: vi.fn<() => Promise<Session | null>>(),
  mockedListServerOrganizations:
    vi.fn<() => Promise<readonly OrganizationSummary[]>>(),
  mockedGetStrictServerOrganizations:
    vi.fn<() => Promise<readonly OrganizationSummary[]>>(),
  mockedGetSession:
    vi.fn<() => Promise<{ data: Session | null; error: Error | null }>>(),
  mockedGetClientOrganizations:
    vi.fn<
      () => Promise<{ data: Organization[] | null; error: Error | null }>
    >(),
  mockedIsServerEnvironment: vi.fn<() => boolean>(),
}));

vi.mock(import("../auth/server-session"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    getCurrentServerSession:
      mockedGetServerSession as typeof actual.getCurrentServerSession,
  };
});

vi.mock(import("./organization-server"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    listCurrentServerOrganizations:
      mockedListServerOrganizations as typeof actual.listCurrentServerOrganizations,
    getCurrentServerOrganizations:
      mockedGetStrictServerOrganizations as typeof actual.getCurrentServerOrganizations,
  };
});

vi.mock(import("../auth/runtime-environment"), () => ({
  isServerEnvironment: mockedIsServerEnvironment,
}));

vi.mock(import("#/lib/auth-client"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    authClient: {
      ...actual.authClient,
      getSession: mockedGetSession as typeof actual.authClient.getSession,
      organization: {
        ...actual.authClient.organization,
        list: mockedGetClientOrganizations as unknown as typeof actual.authClient.organization.list,
      },
    },
  };
});

describe("organization access helpers", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lists organizations on the client", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetClientOrganizations.mockResolvedValue({
      data: [{ id: "org_123", name: "Acme", slug: "acme" }],
      error: null,
    });

    await expect(listOrganizations()).resolves.toStrictEqual([
      { id: "org_123", name: "Acme", slug: "acme" },
    ]);
    expect(mockedListServerOrganizations).not.toHaveBeenCalled();
  }, 1000);

  it("uses the plan-shaped server list helper during SSR", async () => {
    mockedIsServerEnvironment.mockReturnValue(true);
    mockedListServerOrganizations.mockResolvedValue([
      { id: "org_server", name: "Server Org", slug: "server-org" },
    ]);

    await expect(listOrganizations()).resolves.toStrictEqual([
      { id: "org_server", name: "Server Org", slug: "server-org" },
    ]);
    expect(mockedListServerOrganizations).toHaveBeenCalledOnce();
    expect(mockedGetStrictServerOrganizations).not.toHaveBeenCalled();
  }, 1000);

  it("rethrows client organization lookup failures", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetClientOrganizations.mockResolvedValue({
      data: null,
      error: new Error("organization endpoint failed"),
    });

    const failure = await listOrganizations().catch(
      (caughtError) => caughtError
    );

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain(
      "organization endpoint failed"
    );
  }, 1000);

  it("redirects unauthenticated users to /login from ensureActiveOrganizationId", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetSession.mockResolvedValue({ data: null, error: null });

    const result = ensureActiveOrganizationId();

    await expect(result).rejects.toMatchObject({
      options: { to: "/login" },
    });
    await expect(result).rejects.toSatisfy(isRedirect);
  }, 1000);

  it("returns active organization id from the current session when available", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetSession.mockResolvedValue({
      data: {
        session: { activeOrganizationId: "org_active" },
        user: {
          id: "user_123",
          name: "Taylor Example",
          email: "taylor@example.com",
        },
      },
      error: null,
    });

    await expect(ensureActiveOrganizationId()).resolves.toMatchObject({
      activeOrganizationId: "org_active",
    });
    expect(mockedGetClientOrganizations).not.toHaveBeenCalled();
  }, 1000);

  it("falls back to the first organization when there is no active organization", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetSession.mockResolvedValue({
      data: {
        session: {},
        user: {
          id: "user_123",
          name: "Taylor Example",
          email: "taylor@example.com",
        },
      },
      error: null,
    });
    mockedGetClientOrganizations.mockResolvedValue({
      data: [
        { id: "org_first", name: "First Org", slug: "first-org" },
        { id: "org_second", name: "Second Org", slug: "second-org" },
      ],
      error: null,
    });

    await expect(ensureActiveOrganizationId()).resolves.toStrictEqual({
      activeOrganizationId: "org_first",
      session: {
        session: {},
        user: {
          id: "user_123",
          name: "Taylor Example",
          email: "taylor@example.com",
        },
      },
    });
  }, 1000);

  it("redirects to /create-organization when there are no organizations", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetSession.mockResolvedValue({
      data: {
        session: {},
        user: {
          id: "user_123",
          name: "Taylor Example",
          email: "taylor@example.com",
        },
      },
      error: null,
    });
    mockedGetClientOrganizations.mockResolvedValue({
      data: [],
      error: null,
    });

    const result = ensureActiveOrganizationId();

    await expect(result).rejects.toMatchObject({
      options: { href: "/create-organization" },
    });
    await expect(result).rejects.toSatisfy(isRedirect);
  }, 1000);

  it("rethrows SSR organization lookup failures when list helper returns an ambiguous empty list", async () => {
    mockedIsServerEnvironment.mockReturnValue(true);
    mockedGetServerSession.mockResolvedValue({
      session: {},
      user: {
        id: "user_123",
        name: "Taylor Example",
        email: "taylor@example.com",
      },
    });
    mockedListServerOrganizations.mockResolvedValue([]);
    mockedGetStrictServerOrganizations.mockRejectedValue(
      new Error("upstream unavailable")
    );

    const failure = await ensureActiveOrganizationId().catch(
      (caughtError) => caughtError
    );

    expect(isRedirect(failure)).toBeFalsy();
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain("upstream unavailable");
  }, 1000);

  it("redirects authenticated users without organizations to /create-organization", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetSession.mockResolvedValue({
      data: {
        session: {},
        user: {
          id: "user_123",
          name: "Taylor Example",
          email: "taylor@example.com",
        },
      },
      error: null,
    });
    mockedGetClientOrganizations.mockResolvedValue({
      data: [],
      error: null,
    });

    const result = requireOrganizationAccess();

    await expect(result).rejects.toMatchObject({
      options: { href: "/create-organization" },
    });
    await expect(result).rejects.toSatisfy(isRedirect);
  }, 1000);

  it("redirects unauthenticated users to /login from redirectIfOrganizationReady", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetSession.mockResolvedValue({ data: null, error: null });

    const result = redirectIfOrganizationReady();

    await expect(result).rejects.toMatchObject({
      options: { to: "/login" },
    });
    await expect(result).rejects.toSatisfy(isRedirect);
  }, 1000);

  it("redirects onboarding users away when organization access is already ready", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetSession.mockResolvedValue({
      data: {
        session: {
          activeOrganizationId: "org_active",
        },
        user: {
          id: "user_123",
          name: "Taylor Example",
          email: "taylor@example.com",
        },
      },
      error: null,
    });

    const result = redirectIfOrganizationReady();

    await expect(result).rejects.toMatchObject({
      options: { to: "/" },
    });
    await expect(result).rejects.toSatisfy(isRedirect);
  }, 1000);

  it("rethrows client-side organization lookup failures in redirectIfOrganizationReady", async () => {
    mockedIsServerEnvironment.mockReturnValue(false);
    mockedGetSession.mockResolvedValue({
      data: {
        session: {},
        user: {
          id: "user_123",
          name: "Taylor Example",
          email: "taylor@example.com",
        },
      },
      error: null,
    });
    mockedGetClientOrganizations.mockRejectedValue(new Error("network down"));

    const failure = await redirectIfOrganizationReady().catch(
      (caughtError) => caughtError
    );

    expect(isRedirect(failure)).toBeFalsy();
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain("network down");
  }, 1000);
});
