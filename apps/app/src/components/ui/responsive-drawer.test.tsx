import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

import { ResponsiveDrawer } from "./responsive-drawer";

interface DrawerRootMockProps {
  readonly children?: ReactNode;
  readonly direction?: string;
}

vi.mock(import("#/components/ui/drawer"), () => ({
  Drawer: ({ children, direction }: DrawerRootMockProps) => (
    <div data-direction={direction} data-kind="root" data-testid="drawer-root">
      {children}
    </div>
  ),
  DrawerNestedRoot: ({ children, direction }: DrawerRootMockProps) => (
    <div
      data-direction={direction}
      data-kind="nested"
      data-testid="drawer-root"
    >
      {children}
    </div>
  ),
}));

vi.setConfig({ testTimeout: 1000 });

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  window.dispatchEvent(new Event("resize"));
}

describe("responsive drawer", () => {
  it("uses a right-side drawer on desktop", () => {
    setViewportWidth(1024);

    render(
      <ResponsiveDrawer open>
        <p>Drawer body</p>
      </ResponsiveDrawer>
    );

    expect(screen.getByTestId("drawer-root")).toHaveAttribute(
      "data-direction",
      "right"
    );
    expect(screen.getByTestId("drawer-root")).toHaveAttribute(
      "data-kind",
      "root"
    );
  });

  it("uses a bottom drawer on mobile", () => {
    setViewportWidth(390);

    render(
      <ResponsiveDrawer open>
        <p>Drawer body</p>
      </ResponsiveDrawer>
    );

    expect(screen.getByTestId("drawer-root")).toHaveAttribute(
      "data-direction",
      "bottom"
    );
  });

  it("uses the nested Vaul root when nested", () => {
    setViewportWidth(1024);

    render(
      <ResponsiveDrawer nested open>
        <p>Nested body</p>
      </ResponsiveDrawer>
    );

    expect(screen.getByTestId("drawer-root")).toHaveAttribute(
      "data-kind",
      "nested"
    );
    expect(screen.getByTestId("drawer-root")).toHaveAttribute(
      "data-direction",
      "right"
    );
  });
});
