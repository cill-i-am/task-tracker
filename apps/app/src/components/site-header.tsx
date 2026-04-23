"use client";

import { Link } from "@tanstack/react-router";

import { SearchForm } from "#/components/search-form";
import ThemeToggle from "#/components/ThemeToggle";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "#/components/ui/breadcrumb";
import { SidebarTrigger } from "#/components/ui/sidebar";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 flex w-full items-center border-b border-border/60 bg-background/90 backdrop-blur">
      <div className="flex min-h-(--header-height) w-full flex-wrap items-center gap-3 px-3 py-3 sm:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <SidebarTrigger
            className="size-10 rounded-[calc(var(--radius)*2.2)] border border-border/70 bg-background/80 sm:size-8"
            aria-label="Toggle navigation"
          />
          <div className="min-w-0">
            <p className="text-[0.68rem] font-medium tracking-[0.18em] text-muted-foreground uppercase">
              Workspace
            </p>
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink render={<Link to="/" />}>
                    Task Tracker
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Your work</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </div>
        <SearchForm className="order-last min-w-0 basis-full md:order-none md:ml-auto md:w-[min(100%,17rem)] md:basis-auto" />
        <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
