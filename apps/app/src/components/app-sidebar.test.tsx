import { render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";

import { AppSidebar } from "./app-sidebar";

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    Link: (({ children, ...props }: ComponentProps<"a">) => (
      <a {...props}>{children}</a>
    )) as typeof actual.Link,
  };
});

vi.mock(import("#/components/ui/sidebar"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    Sidebar: (({ children, ...props }: ComponentProps<"div">) => (
      <div data-testid="sidebar" {...props}>
        {children}
      </div>
    )) as typeof actual.Sidebar,
    SidebarContent: (({ children, ...props }: ComponentProps<"div">) => (
      <div data-testid="sidebar-content" {...props}>
        {children}
      </div>
    )) as typeof actual.SidebarContent,
    SidebarFooter: (({ children, ...props }: ComponentProps<"div">) => (
      <div data-testid="sidebar-footer" {...props}>
        {children}
      </div>
    )) as typeof actual.SidebarFooter,
    SidebarHeader: (({ children, ...props }: ComponentProps<"div">) => (
      <div data-testid="sidebar-header" {...props}>
        {children}
      </div>
    )) as typeof actual.SidebarHeader,
    SidebarMenu: (({ children, ...props }: ComponentProps<"div">) => (
      <div data-testid="sidebar-menu" {...props}>
        {children}
      </div>
    )) as typeof actual.SidebarMenu,
    SidebarMenuButton: (({
      children,
      render: renderProp,
      ...props
    }: ComponentProps<"button"> & { render?: ReactNode }) => (
      <button type="button" data-testid="sidebar-menu-button" {...props}>
        {renderProp}
        {children}
      </button>
    )) as typeof actual.SidebarMenuButton,
    SidebarMenuItem: (({ children, ...props }: ComponentProps<"div">) => (
      <div data-testid="sidebar-menu-item" {...props}>
        {children}
      </div>
    )) as typeof actual.SidebarMenuItem,
    SidebarGroup: (({ children, ...props }: ComponentProps<"div">) => (
      <div data-testid="sidebar-group" {...props}>
        {children}
      </div>
    )) as typeof actual.SidebarGroup,
    SidebarGroupContent: (({ children, ...props }: ComponentProps<"div">) => (
      <div data-testid="sidebar-group-content" {...props}>
        {children}
      </div>
    )) as typeof actual.SidebarGroupContent,
    SidebarGroupLabel: (({ children, ...props }: ComponentProps<"div">) => (
      <div data-testid="sidebar-group-label" {...props}>
        {children}
      </div>
    )) as typeof actual.SidebarGroupLabel,
    SidebarMenuAction: (({ children, ...props }: ComponentProps<"button">) => (
      <button type="button" data-testid="sidebar-menu-action" {...props}>
        {children}
      </button>
    )) as typeof actual.SidebarMenuAction,
    SidebarMenuSub: (({ children, ...props }: ComponentProps<"div">) => (
      <div data-testid="sidebar-menu-sub" {...props}>
        {children}
      </div>
    )) as typeof actual.SidebarMenuSub,
    SidebarMenuSubButton: (({
      children,
      render: renderProp,
      ...props
    }: ComponentProps<"button"> & { render?: ReactNode }) => (
      <button type="button" data-testid="sidebar-menu-sub-button" {...props}>
        {renderProp}
        {children}
      </button>
    )) as typeof actual.SidebarMenuSubButton,
    SidebarMenuSubItem: (({ children, ...props }: ComponentProps<"div">) => (
      <div data-testid="sidebar-menu-sub-item" {...props}>
        {children}
      </div>
    )) as typeof actual.SidebarMenuSubItem,
    useSidebar: () => ({
      state: "expanded" as const,
      open: true,
      setOpen: () => {},
      openMobile: false,
      setOpenMobile: () => {},
      isMobile: false,
      toggleSidebar: () => {},
    }),
  };
});

describe("app sidebar", () => {
  it(
    "hides the starter and promo text",
    {
      timeout: 10_000,
    },
    () => {
      render(<AppSidebar />);

      expect(screen.queryByText(/starter workspace/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/shadcn starter/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/tanstack start/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/tanstack router/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/shadcn\/ui/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/tanstack github/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/follow on x/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/auth screens/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/form patterns/i)).not.toBeInTheDocument();
    }
  );
});
