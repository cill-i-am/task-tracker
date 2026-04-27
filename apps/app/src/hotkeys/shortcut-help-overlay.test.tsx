import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ShortcutHelpOverlay } from "./shortcut-help-overlay";

function renderShortcutHelpOverlay(
  activeScopes: React.ComponentProps<typeof ShortcutHelpOverlay>["activeScopes"]
) {
  return render(
    <HotkeysProvider>
      <ShortcutHelpOverlay activeScopes={activeScopes} />
    </HotkeysProvider>
  );
}

describe("shortcut help overlay", () => {
  it("opens from the trigger and lists global shortcuts", async () => {
    const user = userEvent.setup();

    renderShortcutHelpOverlay(["global"]);

    await user.click(
      screen.getByRole("button", { name: /keyboard shortcuts/i })
    );

    const dialog = await screen.findByRole("dialog", {
      name: /keyboard shortcuts/i,
    });

    expect(within(dialog).getByText("Toggle sidebar")).toBeVisible();
    expect(within(dialog).getByText("Go to Jobs")).toBeVisible();
    expect(within(dialog).queryByText("Search jobs")).not.toBeInTheDocument();
  }, 1000);

  it("includes shortcuts for every active scope", async () => {
    const user = userEvent.setup();

    renderShortcutHelpOverlay(["global", "jobs"]);

    await user.click(
      screen.getByRole("button", { name: /keyboard shortcuts/i })
    );

    const dialog = await screen.findByRole("dialog", {
      name: /keyboard shortcuts/i,
    });

    expect(within(dialog).getByText("Search jobs")).toBeVisible();
  }, 1000);
});
