import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import type * as AuthClientModule from "#/lib/auth-client";

import { AuthenticatedShellHome } from "./authenticated-shell-home";

const { mockedSendVerificationEmail, mockedUseRouteContext } = vi.hoisted(
  () => ({
    mockedSendVerificationEmail: vi.fn<
      (input: { email: string; callbackURL: string }) => Promise<{
        data: unknown;
        error: { status: number; message: string; statusText: string } | null;
      }>
    >(),
    mockedUseRouteContext: vi.fn<
      (options: { from: string }) => {
        activeOrganization?: {
          name: string;
          slug: string;
        };
        session?: {
          user: {
            email: string;
            emailVerified: boolean;
          };
        };
      }
    >(),
  })
);

vi.mock(import("#/lib/auth-client"), async () => {
  const actual =
    await vi.importActual<typeof AuthClientModule>("#/lib/auth-client");

  return {
    authClient: {
      sendVerificationEmail: mockedSendVerificationEmail,
    } as unknown as typeof AuthClientModule.authClient,
    buildEmailVerificationRedirectTo: actual.buildEmailVerificationRedirectTo,
  };
});

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    Link: (({
      children,
      to,
      ...props
    }: {
      children?: ReactNode;
      to: string;
      className?: string;
    }) => (
      <a href={to} {...props}>
        {children}
      </a>
    )) as unknown as typeof actual.Link,
    useRouteContext:
      mockedUseRouteContext as unknown as typeof actual.useRouteContext,
  };
});

describe("authenticated shell home", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "http://localhost:3000/tasks");
    mockedSendVerificationEmail.mockResolvedValue({
      data: { ok: true },
      error: null,
    });
    mockedUseRouteContext.mockImplementation(({ from }) => {
      if (from === "/_app/_org") {
        return {
          activeOrganization: {
            name: "Acme Field Ops",
            slug: "acme-field-ops",
          },
        };
      }

      return {
        session: {
          user: {
            email: "taylor@example.com",
            emailVerified: false,
          },
        },
      };
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it(
    "shows the active organization overview, status strip, and next actions",
    {
      timeout: 10_000,
    },
    async () => {
      const user = userEvent.setup();

      render(<AuthenticatedShellHome />);

      expect(
        screen.getByRole("heading", { name: "Acme Field Ops" })
      ).toBeInTheDocument();
      expect(screen.getByText(/@acme-field-ops is live/i)).toBeInTheDocument();
      expect(
        screen.getByRole("region", { name: /workspace status/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: /next actions/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: /operating context/i })
      ).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /open jobs/i })).toHaveAttribute(
        "href",
        "/jobs"
      );
      expect(
        screen.getByRole("link", { name: /invite teammates/i })
      ).toHaveAttribute("href", "/members");
      expect(
        screen.getByRole("link", { name: /check system health/i })
      ).toHaveAttribute("href", "/health");
      const nextActions = screen
        .getByRole("heading", { name: /next actions/i })
        .closest("section");
      expect(nextActions).not.toBeNull();
      const resendButton = within(nextActions as HTMLElement).getByRole(
        "button",
        { name: /resend verification email/i }
      );
      expect(
        within(nextActions as HTMLElement).getByText(
          /finish account verification/i
        )
      ).toBeInTheDocument();
      expect(screen.getAllByText(/verification pending/i)).not.toHaveLength(0);

      await user.click(resendButton);

      await waitFor(() => {
        expect(mockedSendVerificationEmail).toHaveBeenCalledWith({
          email: "taylor@example.com",
          callbackURL: "http://localhost:3000/verify-email?status=success",
        });
      });
      await expect(
        screen.findByText("Another verification email has been requested.")
      ).resolves.toBeInTheDocument();
    }
  );

  it(
    "shows a verified account badge when the session email is verified",
    {
      timeout: 10_000,
    },
    () => {
      mockedUseRouteContext.mockImplementation(({ from }) => {
        if (from === "/_app/_org") {
          return {
            activeOrganization: {
              name: "Acme Field Ops",
              slug: "acme-field-ops",
            },
          };
        }

        return {
          session: {
            user: {
              email: "taylor@example.com",
              emailVerified: true,
            },
          },
        };
      });

      render(<AuthenticatedShellHome />);

      expect(screen.getAllByText(/email verified/i)).not.toHaveLength(0);
      expect(
        screen.getByText(/account trust is in place/i)
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /resend verification email/i })
      ).not.toBeInTheDocument();
      const nextActions = screen
        .getByRole("heading", { name: /next actions/i })
        .closest("section");
      expect(nextActions).not.toBeNull();
      expect(
        within(nextActions as HTMLElement).getByText(
          /account trust is in place/i
        )
      ).toBeInTheDocument();
    }
  );
});
