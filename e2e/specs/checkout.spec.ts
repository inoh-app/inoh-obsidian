/**
 * Where the plugin's plan buttons actually send a user.
 *
 * The plugin never renders a payment page itself: every plan action hands a
 * URL to the system browser. So the URL *is* the behaviour, and it is the one
 * thing a label check cannot catch — an Upgrade button that opens the wrong
 * page looks perfectly right on screen. The hand-off is caught in the
 * renderer, so no browser opens and Stripe's page is never loaded.
 */

import { expect, test, type Page } from "@playwright/test";
import {
  assertLocalStackReady,
  readSignInCode,
  resetAccount,
  setSubscription,
} from "../fixtures/backend";
import { captureExternalUrls, type ExternalUrlCapture } from "../fixtures/external-urls";
import {
  closeSettings,
  openPluginSettings,
  signInThroughSettings,
  startObsidian,
  type ObsidianSession,
} from "../fixtures/obsidian";
import { expectPlanRow, findPageWithModal, planRowOf } from "../fixtures/plan-row";

const EMAIL = "e2e-obsidian-checkout@test.com";
/** The web app's Plan & Billing page, as `src/constants.ts` builds it. */
const BILLING_URL = "https://app.inoh.app/billing";
/**
 * Stripe's hosted checkout, which is the only address a purchase may open.
 * The `cs_test_` session id is also the assertion that this ran against the
 * sandbox: a live-mode session would read `cs_live_` and fail here.
 */
const STRIPE_CHECKOUT_PATTERN = /^https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_/;

let session: ObsidianSession;
let capture: ExternalUrlCapture;

test.beforeAll(async () => {
  assertLocalStackReady();
  resetAccount({ email: EMAIL, profile: "empty" });
  session = await startObsidian();
  const settings = await openPluginSettings(session.page);
  await signInThroughSettings(settings, EMAIL, (sinceMs) => readSignInCode(EMAIL, sinceMs));
  await closeSettings(session.page);
});

test.afterAll(async () => {
  await session?.close();
});

test.beforeEach(async () => {
  capture = await captureExternalUrls(session.page.context());
});

test.afterEach(async () => {
  await capture?.restore();
});

/** Opens the upgrade modal from the Plan row of a free account. */
async function openUpgradeModal(settings: Page): Promise<Page> {
  await expectPlanRow(settings, EMAIL, { name: "Free plan", button: "Upgrade" });
  await planRowOf(settings).getByRole("button", { name: "Upgrade" }).click({ force: true });
  return findPageWithModal(settings);
}

/** The yearly Plus button, once its live price has arrived from Stripe. */
async function pricedPlusYearlyButton(modalHost: Page) {
  const plusCard = modalHost.locator(".inoh-plan-card").first();
  const yearlyButton = plusCard.locator(".inoh-plan-button-primary");
  await expect(yearlyButton).toHaveText(/^Yearly · \$\d+\.\d{2} \(save \d+%\)$/, {
    timeout: 30_000,
  });
  return yearlyButton;
}

test("buying Plus hands Stripe's hosted checkout to the browser and closes the modal", async () => {
  setSubscription(EMAIL, "free");
  const settings = await openPluginSettings(session.page);
  try {
    const modalHost = await openUpgradeModal(settings);
    await (await pricedPlusYearlyButton(modalHost)).click({ force: true });

    // A real test-mode Checkout Session, created by stripe-subscribe against
    // the sandbox key — a session id in the URL is what proves it is real.
    expect(await capture.waitForUrl()).toMatch(STRIPE_CHECKOUT_PATTERN);
    await expect(modalHost.locator(".inoh-plan-card")).toHaveCount(0);
  } finally {
    await closeSettings(session.page);
  }
});

test("a purchase from a stale modal opens Plan & Billing instead of a second checkout", async () => {
  // The upgrade modal is open as a free user; meanwhile the account becomes a
  // subscriber elsewhere. Pressing a tier must not start a second checkout:
  // stripe-subscribe refuses with `subscription_exists`, and the plugin sends
  // the user to Plan & Billing to change the subscription it already has.
  setSubscription(EMAIL, "free");
  const settings = await openPluginSettings(session.page);
  try {
    const modalHost = await openUpgradeModal(settings);
    const yearlyButton = await pricedPlusYearlyButton(modalHost);

    setSubscription(EMAIL, "plus", "active");
    await yearlyButton.click({ force: true });

    expect(await capture.waitForUrl()).toBe(BILLING_URL);
    // Nothing else was opened: a Stripe session here would be the double-bill
    // the refusal exists to prevent.
    expect(await capture.read()).toEqual([BILLING_URL]);
    await expect(modalHost.locator(".inoh-plan-card")).toHaveCount(0);

    // And the settings the user comes back to have caught up with the plan.
    await expectPlanRow(settings, EMAIL, { name: "Inoh Plus", button: "Manage" });
  } finally {
    await closeSettings(session.page);
  }
});

test("Manage opens the web app's Plan & Billing page", async () => {
  setSubscription(EMAIL, "plus", "active");
  const settings = await openPluginSettings(session.page);
  try {
    await expectPlanRow(settings, EMAIL, { name: "Inoh Plus", button: "Manage" });
    await planRowOf(settings).getByRole("button", { name: "Manage" }).click({ force: true });

    expect(await capture.waitForUrl()).toBe(BILLING_URL);
  } finally {
    await closeSettings(session.page);
  }
});
