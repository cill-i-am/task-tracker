"use client";

import * as React from "react";

import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";

import { ShortcutHint } from "./hotkey-display";
import { HOTKEYS, HOTKEY_GROUPS } from "./hotkey-registry";
import type { HotkeyDefinition, HotkeyScope } from "./hotkey-registry";
import { useAppHotkey } from "./use-app-hotkey";

function getShortcutsForScopes(activeScopes: readonly HotkeyScope[]) {
  const activeScopeSet = new Set<HotkeyScope>(activeScopes);

  return Object.values(HOTKEYS).filter((shortcut) =>
    activeScopeSet.has(shortcut.scope)
  );
}

function groupShortcuts(shortcuts: readonly HotkeyDefinition[]) {
  return HOTKEY_GROUPS.map((group) => ({
    group,
    shortcuts: shortcuts.filter((shortcut) => shortcut.group === group),
  })).filter(({ shortcuts: groupedShortcuts }) => groupedShortcuts.length > 0);
}

export function ShortcutHelpOverlay({
  activeScopes,
}: {
  readonly activeScopes: readonly HotkeyScope[];
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const shortcutGroups = groupShortcuts(getShortcutsForScopes(activeScopes));

  useAppHotkey("help", () => setIsOpen(true));
  useAppHotkey("helpAlternate", () => setIsOpen(true));

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
      >
        Keyboard shortcuts
      </Button>
      <DialogContent className="max-h-[min(38rem,calc(100vh-2rem))] overflow-y-auto rounded-2xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Press ? anytime to open this reference.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5">
          {shortcutGroups.map(({ group, shortcuts }) => (
            <section key={group} aria-labelledby={`shortcut-group-${group}`}>
              <h3
                id={`shortcut-group-${group}`}
                className="mb-2 text-xs font-medium tracking-normal text-muted-foreground"
              >
                {group}
              </h3>
              <div className="grid gap-1.5">
                {shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.id}
                    className="flex min-h-10 items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        {shortcut.label}
                      </div>
                      {shortcut.when ? (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {shortcut.when}
                        </div>
                      ) : null}
                    </div>
                    <ShortcutHint
                      className="shrink-0"
                      hotkey={shortcut.hotkey}
                      label={shortcut.label}
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
