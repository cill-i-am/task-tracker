import {
  SERVICE_AREA_NOT_FOUND_ERROR_TAG,
  SiteGeocodingFailedError,
} from "@ceird/sites-core";
import type {
  ServiceAreaIdType,
  SiteIdType,
  SitesOptionsResponse,
} from "@ceird/sites-core";
/* oxlint-disable vitest/prefer-import-in-mock */
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Exit } from "effect";
import * as React from "react";
import type { ReactNode } from "react";

import { SitesCreateSheet } from "./sites-create-sheet";

type AsyncMutationMock = (...args: unknown[]) => Promise<unknown>;
type NavigateMock = (...args: unknown[]) => unknown;

const serviceAreaId =
  "33333333-3333-4333-8333-333333333333" as ServiceAreaIdType;
const siteId = "55555555-5555-4555-8555-555555555555" as SiteIdType;

const {
  mockedCreateSite,
  mockedCreateResult,
  mockedDrawerRuntime,
  mockedNavigate,
  mockedPathname,
  mockedSitesOptions,
} = vi.hoisted(() => ({
  mockedCreateSite: vi.fn<AsyncMutationMock>(),
  mockedCreateResult: {
    current: {
      error: null as unknown,
      waiting: false,
    },
  },
  mockedDrawerRuntime: {
    close: vi.fn<() => void>(),
    finishCloseAnimation: vi.fn<() => void>(),
  },
  mockedNavigate: vi.fn<NavigateMock>(),
  mockedPathname: {
    current: "/sites/new",
  },
  mockedSitesOptions: {
    current: {
      serviceAreas: [] as SitesOptionsResponse["serviceAreas"],
      sites: [] as SitesOptionsResponse["sites"],
    },
  },
}));

vi.mock("./sites-state", () => ({
  getSitesAsyncErrorMessage: (error: unknown) => {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === "object" && error !== null && "message" in error) {
      return String(error.message);
    }

    return "Something went wrong.";
  },
  isSitesAsyncFailure: (result: { readonly error?: unknown }) =>
    result.error !== null && result.error !== undefined,
  useCreateSiteMutation: () =>
    [mockedCreateResult.current, mockedCreateSite] as const,
  useSitesOptions: () => mockedSitesOptions.current,
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockedNavigate,
  useRouterState: <T,>({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => T;
  }) => select({ location: { pathname: mockedPathname.current } }),
}));

vi.mock("#/components/ui/drawer", () => ({
  DRAWER_CLOSE_FALLBACK_MS: 550,
  DrawerClose: ({ children }: { children: ReactNode }) => {
    if (
      React.isValidElement<{
        onClick?: React.MouseEventHandler<HTMLElement>;
      }>(children)
    ) {
      return React.cloneElement(children, {
        onClick: (event: React.MouseEvent<HTMLElement>) => {
          children.props.onClick?.(event);
          mockedDrawerRuntime.close();
        },
      });
    }

    return (
      <button type="button" onClick={() => mockedDrawerRuntime.close()}>
        {children}
      </button>
    );
  },
  DrawerContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DrawerFooter: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DrawerHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DrawerDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("#/components/ui/responsive-drawer", () => ({
  ResponsiveDrawer: ({
    children,
    onAnimationEnd,
    onOpenChange,
    open,
  }: {
    children: ReactNode;
    onAnimationEnd?: (open: boolean) => void;
    onOpenChange?: (open: boolean) => void;
    open: boolean;
  }) => {
    mockedDrawerRuntime.close.mockImplementation(() => {
      onOpenChange?.(false);
    });

    mockedDrawerRuntime.finishCloseAnimation.mockImplementation(() => {
      onAnimationEnd?.(false);
    });

    return open ? (
      <div data-testid="responsive-drawer" data-open="true">
        {children}
      </div>
    ) : null;
  },
}));

describe("sites create sheet", () => {
  beforeEach(() => {
    mockedCreateSite.mockReset();
    mockedNavigate.mockReset();
    mockedPathname.current = "/sites/new";
    mockedCreateResult.current = {
      error: null,
      waiting: false,
    };
    mockedSitesOptions.current = {
      serviceAreas: [
        {
          id: serviceAreaId,
          name: "Dublin",
        },
      ],
      sites: [],
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it(
    "submits standalone site details and returns to the sites section",
    { timeout: 10_000 },
    async () => {
      mockedCreateSite.mockResolvedValue(
        Exit.succeed({
          id: siteId,
          name: "Docklands Campus",
        })
      );

      const user = userEvent.setup();
      render(<SitesCreateSheet />);

      expect(
        screen.getByRole("heading", { name: "New site" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Basics" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Location" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Access" })
      ).toBeInTheDocument();
      expect(screen.queryByText("Draft")).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText(new RegExp(`^Lat${"itude"}$`))
      ).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText(new RegExp(`^Long${"itude"}$`))
      ).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Status")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Site lead")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Phone")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Labels")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Site notes")).not.toBeInTheDocument();
      expect(screen.queryByText("Map preview")).not.toBeInTheDocument();

      await user.type(screen.getByLabelText("Site name"), "Docklands Campus");
      await user.click(screen.getByLabelText("Service area"));
      await user.click(screen.getByRole("option", { name: "Dublin" }));
      await user.type(
        screen.getByLabelText("Address line 1"),
        "1 Custom House Quay"
      );
      await user.type(screen.getByLabelText("Town"), "Dublin");
      await user.type(screen.getByLabelText("County"), "Dublin");
      await user.type(screen.getByLabelText("Eircode"), "D01 X2X2");
      await user.click(screen.getByRole("button", { name: /create site/i }));

      expect(mockedCreateSite).toHaveBeenCalledWith({
        addressLine1: "1 Custom House Quay",
        county: "Dublin",
        country: "IE",
        eircode: "D01 X2X2",
        name: "Docklands Campus",
        serviceAreaId,
        town: "Dublin",
      });
      expect(mockedNavigate).not.toHaveBeenCalled();

      act(() => {
        mockedDrawerRuntime.finishCloseAnimation();
      });

      expect(mockedNavigate).toHaveBeenCalledWith({ to: "/sites" });
    }
  );

  it("waits for the drawer close animation before leaving the new site route", () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    try {
      render(<SitesCreateSheet />);

      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(mockedNavigate).not.toHaveBeenCalled();
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 550);
      expect(mockedNavigate).not.toHaveBeenCalled();

      act(() => {
        mockedDrawerRuntime.finishCloseAnimation();
      });

      expect(mockedNavigate).toHaveBeenCalledWith({ to: "/sites" });
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  it(
    "validates the required name and address details before submitting",
    { timeout: 10_000 },
    async () => {
      const user = userEvent.setup();
      render(<SitesCreateSheet />);

      await user.click(screen.getByRole("button", { name: /create site/i }));

      expect(
        screen.getByText("Add a site name before creating it.")
      ).toBeInTheDocument();
      expect(screen.getByText("Add address line 1.")).toBeInTheDocument();
      expect(screen.getByText("Add county.")).toBeInTheDocument();
      expect(screen.getByText("Add Eircode.")).toBeInTheDocument();
      expect(screen.getByLabelText("Site name")).toHaveAttribute(
        "aria-describedby",
        "site-name-error"
      );
      expect(screen.getByLabelText("Address line 1")).toHaveAttribute(
        "aria-describedby",
        "site-address-line-1-error"
      );
      expect(screen.getByLabelText("County")).toHaveAttribute(
        "aria-describedby",
        "site-county-error"
      );
      expect(screen.getByLabelText("Eircode")).toHaveAttribute(
        "aria-describedby",
        "site-eircode-error"
      );
      expect(mockedCreateSite).not.toHaveBeenCalled();
    }
  );

  it(
    "locks close controls while creation is waiting",
    { timeout: 10_000 },
    () => {
      mockedCreateResult.current = {
        error: null,
        waiting: true,
      };

      render(<SitesCreateSheet />);

      expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
      expect(screen.getByRole("button", { name: /creating/i })).toBeDisabled();
    }
  );

  it(
    "maps stale service area failures to the field without a duplicate alert",
    { timeout: 10_000 },
    async () => {
      mockedCreateSite.mockResolvedValue(
        Exit.fail({
          _tag: SERVICE_AREA_NOT_FOUND_ERROR_TAG,
          message: "Service area is no longer available.",
        })
      );

      const user = userEvent.setup();
      render(<SitesCreateSheet />);

      await user.type(screen.getByLabelText("Site name"), "Docklands Campus");
      await user.click(screen.getByLabelText("Service area"));
      await user.click(screen.getByRole("option", { name: "Dublin" }));
      await user.type(
        screen.getByLabelText("Address line 1"),
        "1 Custom House Quay"
      );
      await user.type(screen.getByLabelText("County"), "Dublin");
      await user.type(screen.getByLabelText("Eircode"), "D01 X2X2");
      await user.click(screen.getByRole("button", { name: /create site/i }));

      const serviceAreaControl = screen.getByLabelText("Service area");

      expect(
        screen.getByText("Service area is no longer available.")
      ).toBeInTheDocument();
      expect(serviceAreaControl).toHaveAttribute("aria-invalid", "true");
      expect(serviceAreaControl).toHaveAttribute(
        "aria-describedby",
        "site-service-area-error"
      );
      expect(
        screen.queryByText("We couldn't create that site.")
      ).not.toBeInTheDocument();
    }
  );

  it(
    "maps geocoding failures to the Eircode field",
    { timeout: 10_000 },
    async () => {
      mockedCreateSite.mockResolvedValue(
        Exit.fail(
          new SiteGeocodingFailedError({
            country: "IE",
            eircode: "D01 X2X2",
            message:
              "We could not locate that site address. Check the Eircode and address details.",
          })
        )
      );

      const user = userEvent.setup();
      render(<SitesCreateSheet />);

      await user.type(screen.getByLabelText("Site name"), "Docklands Campus");
      await user.type(
        screen.getByLabelText("Address line 1"),
        "1 Custom House Quay"
      );
      await user.type(screen.getByLabelText("County"), "Dublin");
      await user.type(screen.getByLabelText("Eircode"), "D01 X2X2");
      await user.click(screen.getByRole("button", { name: /create site/i }));

      const eircodeField = screen.getByLabelText("Eircode");

      expect(
        screen.getByText(
          "We could not locate that site address. Check the Eircode and address details."
        )
      ).toBeInTheDocument();
      expect(eircodeField).toHaveAttribute("aria-invalid", "true");
    }
  );

  it(
    "suppresses stale service area failures from the global result alert",
    { timeout: 10_000 },
    () => {
      mockedCreateResult.current = {
        error: {
          _tag: SERVICE_AREA_NOT_FOUND_ERROR_TAG,
          message: "Service area is no longer available.",
        },
        waiting: false,
      };

      render(<SitesCreateSheet />);

      expect(
        screen.queryByText("We couldn't create that site.")
      ).not.toBeInTheDocument();
    }
  );
});
