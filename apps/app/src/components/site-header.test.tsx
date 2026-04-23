import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";

import { SiteHeader } from "./site-header";

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    Link: (({
      children,
      to,
      ...props
    }: ComponentProps<"a"> & { to?: string }) => (
      <a href={to} {...props}>
        {children}
      </a>
    )) as typeof actual.Link,
  };
});

vi.mock(import("#/components/search-form"), () => ({
  SearchForm: ({ className }: ComponentProps<"form">) => (
    <form role="search" data-testid="search-form" data-class-name={className} />
  ),
}));

vi.mock(import("#/components/ThemeToggle"), () => ({
  default: () => <button type="button">Theme mode</button>,
}));

vi.mock(import("#/components/ui/sidebar"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    SidebarTrigger: (({
      className,
      "aria-label": ariaLabel,
    }: Parameters<typeof actual.SidebarTrigger>[0]) => (
      <button
        type="button"
        data-testid="sidebar-trigger"
        data-class-name={typeof className === "string" ? className : undefined}
        aria-label={ariaLabel}
      />
    )) as typeof actual.SidebarTrigger,
  };
});

describe("site header", () => {
  it(
    "keeps search available in the shared header without hiding it on mobile",
    {
      timeout: 10_000,
    },
    () => {
      render(<SiteHeader />);

      expect(
        screen.getByRole("button", { name: /toggle navigation/i })
      ).toBeInTheDocument();
      expect(screen.getByRole("search")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /theme mode/i })
      ).toBeInTheDocument();

      const searchForm = screen.getByTestId("search-form");
      const className = searchForm.dataset.className ?? "";

      expect(className).toContain("basis-full");
      expect(className).not.toContain("hidden");
    }
  );
});
