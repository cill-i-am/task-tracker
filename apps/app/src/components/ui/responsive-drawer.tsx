"use client";

import * as React from "react";

import { Drawer, DrawerNestedRoot } from "#/components/ui/drawer";

const RESPONSIVE_DRAWER_DESKTOP_MIN_WIDTH = 768;

type DrawerDirection = "top" | "bottom" | "left" | "right";
type DrawerRootProps = React.ComponentProps<typeof Drawer>;
type DistributiveOmit<T, K extends keyof T> = T extends unknown
  ? Omit<T, K>
  : never;

type ResponsiveDrawerProps = DistributiveOmit<DrawerRootProps, "direction"> & {
  readonly desktopDirection?: Extract<DrawerDirection, "left" | "right">;
  readonly mobileDirection?: Extract<DrawerDirection, "top" | "bottom">;
  readonly nested?: boolean;
};

function ResponsiveDrawer({
  desktopDirection = "right",
  mobileDirection = "bottom",
  nested = false,
  ...props
}: ResponsiveDrawerProps) {
  const isDesktop = useResponsiveDrawerDesktop();
  const direction = isDesktop ? desktopDirection : mobileDirection;

  if (nested) {
    return <DrawerNestedRoot direction={direction} {...props} />;
  }

  return <Drawer direction={direction} {...props} />;
}

function useResponsiveDrawerDesktop() {
  return React.useSyncExternalStore(
    subscribeToResponsiveDrawerViewport,
    getResponsiveDrawerViewportSnapshot,
    () => true
  );
}

function subscribeToResponsiveDrawerViewport(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => null;
  }

  window.addEventListener("resize", onStoreChange);

  return () => {
    window.removeEventListener("resize", onStoreChange);
  };
}

function getResponsiveDrawerViewportSnapshot() {
  if (typeof window === "undefined") {
    return true;
  }

  return window.innerWidth >= RESPONSIVE_DRAWER_DESKTOP_MIN_WIDTH;
}

export { ResponsiveDrawer, useResponsiveDrawerDesktop };
