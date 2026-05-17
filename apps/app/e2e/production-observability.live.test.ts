import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import type {
  Page,
  Response as PlaywrightResponse,
  TestInfo,
} from "@playwright/test";

import { CreateOrganizationPage } from "./pages/create-organization-page";
import { JobDetailSheet, JobsCreateSheet, JobsPage } from "./pages/jobs-page";
import { MembersPage } from "./pages/members-page";
import { SignupPage } from "./pages/signup-page";
import { API_ORIGIN, APP_ORIGIN } from "./test-urls";

const LIVE_PRODUCTION_ENABLED = process.env.PLAYWRIGHT_LIVE_PRODUCTION === "1";
const EXPECTED_PRODUCTION_APP_ORIGIN = "https://app.ceird.app";
const EXPECTED_PRODUCTION_API_ORIGIN = "https://api.ceird.app";
const MAX_OBSERVED_RESPONSES = 120;

interface ObservedResponse {
  readonly method: string;
  readonly origin: string;
  readonly path: string;
  readonly status: number;
}

interface LiveE2eSummary {
  readonly accountEmail: string;
  readonly inviteeEmail: string;
  readonly jobTitle: string;
  readonly organizationName: string;
  readonly responses: ObservedResponse[];
  readonly serviceAreaName: string;
  readonly siteName: string;
  readonly steps: string[];
}

test.describe("production Cloudflare observability live E2E", () => {
  test.skip(
    !LIVE_PRODUCTION_ENABLED,
    "Set PLAYWRIGHT_LIVE_PRODUCTION=1 and production app/API origins to run."
  );
  test.setTimeout(180_000);

  test("exercises the disposable production account and org workflow", async ({
    page,
  }, testInfo) => {
    assertProductionTargets();

    const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const accountPassword = `Codex-${randomUUID()}-E2E9`;
    const summary: LiveE2eSummary = {
      accountEmail: `codex-e2e-${suffix}@example.com`,
      inviteeEmail: `codex-e2e-invitee-${suffix}@example.com`,
      jobTitle: `Live telemetry relay ${suffix}`,
      organizationName: `Codex Live Ops ${suffix}`,
      responses: observeProductionResponses(page),
      serviceAreaName: `Live Dublin ${suffix.slice(-4)}`,
      siteName: `Live telemetry depot ${suffix.slice(-4)}`,
      steps: [],
    };

    try {
      await signUpAndCreateOrganization(page, summary, accountPassword);
      await verifyEmailReminderAndResend(page, summary);
      await exerciseOrganizationSettings(page, summary);
      await createSiteFromCommandBar(page, summary);
      await exerciseJobsFlow(page, summary);
      await inviteDisposableMember(page, summary);
      await exerciseActivityAndSignOut(page, summary);
      assertProductionObservability(summary.responses);
    } finally {
      await attachLiveE2eSummary(testInfo, summary);
    }
  });
});

function assertProductionTargets() {
  expect(APP_ORIGIN).toBe(EXPECTED_PRODUCTION_APP_ORIGIN);
  expect(API_ORIGIN).toBe(EXPECTED_PRODUCTION_API_ORIGIN);
}

async function signUpAndCreateOrganization(
  page: Page,
  summary: LiveE2eSummary,
  accountPassword: string
) {
  const signupPage = new SignupPage(page);
  const createOrganizationPage = new CreateOrganizationPage(page);

  await signupPage.goto();
  await signupPage.name.fill("Codex E2E");
  await signupPage.email.fill(summary.accountEmail);
  await signupPage.password.fill(accountPassword);
  await signupPage.submit.click();
  summary.steps.push("signup-submitted");

  await createOrganizationPage.expectLoaded();
  await createOrganizationPage.name.fill(summary.organizationName);
  await createOrganizationPage.submit.click();
  await createOrganizationPage.skipInviteStep();
  await expectAuthenticatedHome(page);
  summary.steps.push("organization-created");
}

async function verifyEmailReminderAndResend(
  page: Page,
  summary: LiveE2eSummary
) {
  const banner = page.getByRole("alert", {
    name: "Email verification reminder",
  });

  await expect(banner).toBeVisible();
  await expect(banner).toContainText(
    `${summary.accountEmail} is not verified yet.`
  );
  await banner
    .getByRole("button", { name: "Resend verification email" })
    .click();
  await expect(
    banner.getByText("Another verification email has been requested.")
  ).toBeVisible();
  summary.steps.push("verification-resend-requested");
}

async function exerciseOrganizationSettings(
  page: Page,
  summary: LiveE2eSummary
) {
  await openSettingsFromAccountMenu(page);
  await openOrganizationSettingsTab(page, "Service areas");
  await page.getByLabel("New service area name").fill(summary.serviceAreaName);
  await page
    .getByLabel("New service area description")
    .fill("Live telemetry coverage");
  await page.getByRole("button", { name: "Add service area" }).click();
  await expect(
    page.getByRole("article", {
      name: `Service area ${summary.serviceAreaName}`,
    })
  ).toBeVisible();

  await openOrganizationSettingsTab(page, "Rate card");
  await page.getByRole("button", { name: "Add line" }).click();
  await page.getByLabel("Kind for line 1").selectOption("callout");
  await page.getByLabel("Name for line 1").fill("Live callout");
  await page.getByLabel("Value for line 1").fill("120");
  await page.getByLabel("Unit for line 1").fill("visit");
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/rate-cards") &&
        response.status() < 400
    ),
    page.getByRole("button", { name: "Save rate card" }).click(),
  ]);
  summary.steps.push("organization-settings-updated");
}

async function createSiteFromCommandBar(page: Page, summary: LiveE2eSummary) {
  await runCommandBarAction(page, "Go to Sites");
  await expect(page).toHaveURL(/\/sites$/);
  await runCommandBarAction(page, "Create site");

  const newSiteDialog = page.getByRole("dialog", { name: "New site" });
  await expect(page).toHaveURL(/\/sites\/new$/);
  await expect(newSiteDialog).toBeVisible();
  await newSiteDialog.getByLabel("Site name").fill(summary.siteName);
  await newSiteDialog.getByLabel("Service area").click();
  await chooseCommandOption(page, summary.serviceAreaName);
  await newSiteDialog.getByLabel("Address line 1").fill("42 North Road");
  await newSiteDialog.getByLabel("County").fill("Dublin");
  await newSiteDialog.getByLabel("Eircode").fill("D01 F5P2");
  await newSiteDialog.getByRole("button", { name: "Create site" }).click();

  await expect(page).toHaveURL(/\/sites$/);
  await expect(page.getByRole("status")).toContainText(summary.siteName);
  await expect(
    page.getByRole("row", { name: `Open ${summary.siteName}` })
  ).toBeVisible();
  summary.steps.push("site-created");
}

async function exerciseJobsFlow(page: Page, summary: LiveE2eSummary) {
  const jobsPage = new JobsPage(page);
  const createSheet = new JobsCreateSheet(page);
  const detailSheet = new JobDetailSheet(page);
  const contactName = `Live Contact ${summary.jobTitle.slice(-8)}`;
  const comment = "Live observability E2E comment.";
  const visitNote = "Live observability E2E visit.";

  await runCommandBarAction(page, "Go to Jobs");
  await jobsPage.expectLoaded();
  await jobsPage.openCreateSheet();
  await createSheet.expectOpen();
  await createSheet.title.fill(summary.jobTitle);
  await createSheet.choosePriorityOption("High");
  await createSheet.chooseSiteOption(summary.siteName);
  await createSheet.createInlineContact(contactName);
  await createSheet.submit.click();

  await jobsPage.expectLoaded();
  await expect(jobsPage.jobCard(summary.jobTitle)).toBeVisible();
  await jobsPage.openJob(summary.jobTitle);
  await detailSheet.expectOpen(summary.jobTitle);
  await detailSheet.openPanel("Comment");
  await detailSheet.commentBody.fill(comment);
  await detailSheet.addComment.click();
  await expect(detailSheet.commentItem(comment)).toBeVisible();

  await detailSheet.openPanel("Status");
  await detailSheet.chooseStatusOption("In progress");
  await detailSheet.applyStatusChange.click();
  await expect(
    detailSheet.root.getByText("In progress", { exact: true })
  ).toBeVisible();

  await detailSheet.openPanel("Visit");
  await detailSheet.visitDate.fill("2026-05-17");
  await detailSheet.chooseVisitDurationOption("2 hours");
  await detailSheet.visitNote.fill(visitNote);
  await detailSheet.logVisit.click();
  await expect(detailSheet.visitItem(visitNote)).toBeVisible();
  summary.steps.push("job-created-and-updated");
}

async function inviteDisposableMember(page: Page, summary: LiveE2eSummary) {
  const membersPage = new MembersPage(page);

  await membersPage.openFromNavigation();
  await membersPage.openInviteDialog();
  await membersPage.email.fill(summary.inviteeEmail);
  await membersPage.submit.click();
  await expect(membersPage.pendingInvitation(summary.inviteeEmail)).toBeVisible(
    {
      timeout: 15_000,
    }
  );
  summary.steps.push("member-invited");
}

async function exerciseActivityAndSignOut(page: Page, summary: LiveE2eSummary) {
  await page.getByRole("link", { exact: true, name: "Activity" }).click();
  await expect(page).toHaveURL(/\/activity$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Activity" })
  ).toBeVisible();
  summary.steps.push("activity-opened");

  await page.getByRole("button", { name: /Codex E2E/i }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  summary.steps.push("signed-out");
}

async function expectAuthenticatedHome(page: Page) {
  const workspaceHome = page.getByRole("main", { name: "Workspace home" });

  await expect(page).toHaveURL(/\/$/);
  await expect(workspaceHome).toBeVisible({ timeout: 15_000 });
  await expect(workspaceHome.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.getByRole("link", { exact: true, name: "Jobs" })
  ).toBeVisible();
}

async function openSettingsFromAccountMenu(page: Page) {
  await page.getByRole("button", { name: /Codex E2E/i }).click();
  await page.getByRole("menuitem", { name: "Organization settings" }).click();
  await expect(page).toHaveURL(/\/organization\/settings$/);
}

async function openOrganizationSettingsTab(page: Page, name: string) {
  const tab = page.getByRole("tab", { exact: true, name });

  await page.waitForFunction((tabName) => {
    const tabElement = [...document.querySelectorAll('[role="tab"]')].find(
      (element) => element.textContent?.trim() === tabName
    );

    return (
      tabElement !== undefined &&
      Object.getOwnPropertyNames(tabElement).some(
        (key) =>
          key.startsWith("__reactFiber$") || key.startsWith("__reactProps$")
      )
    );
  }, name);
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

async function runCommandBarAction(page: Page, label: string) {
  await page.keyboard.press("ControlOrMeta+K");
  await chooseCommandOption(page, label);
}

async function chooseCommandOption(page: Page, optionLabel: string) {
  const option = page.getByRole("option", {
    exact: true,
    name: optionLabel,
  });

  await option.click();
  await expect(option).toBeHidden();
}

function observeProductionResponses(page: Page): ObservedResponse[] {
  const responses: ObservedResponse[] = [];

  page.on("response", (response) => {
    const observed = makeObservedResponse(response);

    if (observed) {
      responses.push(observed);

      if (responses.length > MAX_OBSERVED_RESPONSES) {
        responses.shift();
      }
    }
  });

  return responses;
}

function makeObservedResponse(
  response: PlaywrightResponse
): ObservedResponse | undefined {
  const url = new URL(response.url());

  if (
    url.origin !== EXPECTED_PRODUCTION_APP_ORIGIN &&
    url.origin !== EXPECTED_PRODUCTION_API_ORIGIN
  ) {
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    return;
  }

  const path = url.pathname.startsWith("/_serverFn/")
    ? "/_serverFn/REDACTED"
    : url.pathname;

  return {
    method: response.request().method(),
    origin: url.origin,
    path,
    status: response.status(),
  };
}

function assertProductionObservability(responses: readonly ObservedResponse[]) {
  expect(
    responses.some(
      (response) =>
        response.origin === EXPECTED_PRODUCTION_APP_ORIGIN &&
        response.path === "/_serverFn/REDACTED"
    ),
    "expected at least one app server-function response"
  ).toBe(true);
  expect(
    responses.some(
      (response) =>
        response.origin === EXPECTED_PRODUCTION_API_ORIGIN &&
        response.path.startsWith("/api/auth/")
    ),
    "expected at least one auth API response"
  ).toBe(true);
  expect(
    responses.some(
      (response) =>
        response.origin === EXPECTED_PRODUCTION_API_ORIGIN &&
        response.path.startsWith("/jobs")
    ),
    "expected at least one jobs API response"
  ).toBe(true);
  expect(
    responses.some(
      (response) =>
        response.origin === EXPECTED_PRODUCTION_API_ORIGIN &&
        response.path.startsWith("/sites")
    ),
    "expected at least one sites API response"
  ).toBe(true);
  expect(responses.filter((response) => response.status >= 400)).toStrictEqual(
    []
  );
  expect(responses.every((response) => !response.path.includes("?"))).toBe(
    true
  );
}

async function attachLiveE2eSummary(
  testInfo: TestInfo,
  summary: LiveE2eSummary
) {
  await testInfo.attach("live-production-observability-summary.json", {
    body: JSON.stringify(
      {
        accountEmail: "[redacted]",
        inviteeEmail: "[redacted]",
        jobTitle: "[redacted]",
        organizationName: "[redacted]",
        responses: summary.responses,
        serviceAreaName: "[redacted]",
        siteName: "[redacted]",
        stepCount: summary.steps.length,
        steps: summary.steps,
      },
      null,
      2
    ),
    contentType: "application/json",
  });
}
