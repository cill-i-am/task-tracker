import type { Page } from "@playwright/test";

export async function waitForSubmitHydration(page: Page) {
  await page.waitForFunction(() => {
    const submitButton = document.querySelector(
      'form button[type="submit"], form button:not([type]), button[type="submit"]'
    );

    return (
      submitButton !== null &&
      Object.getOwnPropertyNames(submitButton).some(
        (key) =>
          key.startsWith("__reactFiber$") || key.startsWith("__reactProps$")
      )
    );
  });
}
