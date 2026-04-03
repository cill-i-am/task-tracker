"use client";

import { CommandIcon, ComputerTerminalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import * as React from "react";

import { NavMain } from "#/components/nav-main";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "#/components/ui/sidebar";

const data = {
  navMain: [
    {
      title: "Overview",
      url: "/",
      icon: <HugeiconsIcon icon={ComputerTerminalIcon} strokeWidth={2} />,
      isActive: true,
      items: [
        {
          title: "Home",
          url: "/",
        },
        {
          title: "Health",
          url: "/health",
        },
      ],
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar
      className="top-(--header-height) h-[calc(100svh-var(--header-height))]!"
      {...props}
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={
                <Link to="/">
                  <span className="sr-only">Task Tracker</span>
                </Link>
              }
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <HugeiconsIcon
                  icon={CommandIcon}
                  strokeWidth={2}
                  className="size-4"
                />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">Task Tracker</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <div className="mt-auto px-4 pb-4 text-sm text-muted-foreground">
          Task Tracker
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
