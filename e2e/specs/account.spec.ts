/**
 * The plugin's Plan row through every state, and the upgrade modal a free user
 * opens from it: the plan name and the one button are what a user relies on to
 * know where they stand and where to go.
 */

import { expect, test, type Page } from "@playwright/test";
import {
  assertLocalStackReady,
  readSignInCode,
  resetAccount,
  setSubscription,
} from "../fixtures/backend";
import {
  closeSettings,
  openPluginSettings,
  signInThroughSettings,
  startObsidian,
  type ObsidianSession,
} from "../fixtures/obsidian";

const EMAIL = "e2e-obsidian-plan@test.com";
const PLAN_ROW_NAMES = /^(Free plan|Inoh Plus|Inoh Pro)$/;

type PlanRow = { name: string; button: string; desc?: RegExp };

let session: ObsidianSession;

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

/** The Plan row: the one whose name is a plan name. */
const planRowOf = (settings: Page) =>
  settings
    .locator(".setting-item")
    .filter({ has: settings.locator(".setting-item-name", { hasText: PLAN_ROW_NAMES }) })
    .first();

/**
 * Asks the plugin to re-read the account, then waits for the Plan row to show
 * the expected state.
 *
 * Reason: Refresh repaints the tab at once and again when the account read
 * lands, so a single read straight after the click can see the old plan.
 */
async function expectPlanRow(settings: Page, expected: PlanRow): Promise<void> {
  const accountRow = settings.locator(".setting-item", { hasText: EMAIL }).first();
  await accountRow.getByRole("button", { name: "Refresh" }).click({ force: true });
  const planRow = planRowOf(settings);
  await expect(planRow.locator(".setting-item-name")).toHaveText(expected.name, {
    timeout: 30_000,
  });
  await expect(planRow.locator("button")).toHaveText(expected.button);
  if (expected.desc) {
    await expect(planRow.locator(".setting-item-description")).toHaveText(expected.desc);
  }
}

/** Whichever open window the plan modal rendered into. */
async function findPageWithModal(preferred: Page): Promise<Page> {
  const candidates = [
    preferred,
    ...preferred
      .context()
      .pages()
      .filter((page) => page !== preferred),
  ];
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    for (const candidate of candidates) {
      if ((await candidate.locator(".inoh-plan-card").count()) > 0) return candidate;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("The upgrade modal never opened in any Obsidian window.");
}

test("a free account sees Free plan and Upgrade, which opens Plus and Pro with live prices", async () => {
  setSubscription(EMAIL, "free");
  const settings = await openPluginSettings(session.page);
  try {
    await expectPlanRow(settings, { name: "Free plan", button: "Upgrade" });
    await planRowOf(settings).getByRole("button", { name: "Upgrade" }).click({ force: true });

    // Reason: the modal opens in whichever window owns the plugin's app
    // handle, which is not always the settings window.
    const modalHost = await findPageWithModal(settings);
    const cards = modalHost.locator(".inoh-plan-card");
    await expect(cards).toHaveCount(2);
    await expect(cards.locator(".inoh-plan-name")).toHaveText(["Inoh Plus", "Inoh Pro"]);
    await expect(modalHost.locator(".inoh-plan-badge")).toHaveText(["Most popular"]);
    // Prices come from Stripe through subscription-prices; the skeletons give way to them.
    await expect(cards.locator(".inoh-plan-price").first()).toContainText(/\$\d+\.\d{2}/, {
      timeout: 30_000,
    });
    const buttonLabels = await cards.locator(".inoh-plan-button").allTextContents();
    expect(
      buttonLabels.filter((label) => /^Yearly · \$\d+\.\d{2} \(save \d+%\)$/.test(label)),
    ).toHaveLength(2);
    expect(buttonLabels.filter((label) => /^Monthly · \$\d+\.\d{2}$/.test(label))).toHaveLength(2);

    await modalHost.locator(".inoh-plan-dismiss").click({ force: true });
    await expect(modalHost.locator(".inoh-plan-card")).toHaveCount(0);
  } finally {
    await closeSettings(session.page);
  }
});

const PAID_STATES: {
  title: string;
  plan: "plus" | "pro";
  state: "active" | "cancel_pending" | "downgrade_pending" | "past_due" | "canceled";
  expected: PlanRow;
}[] = [
  {
    title: "an active Plus subscriber",
    plan: "plus",
    state: "active",
    expected: { name: "Inoh Plus", button: "Manage" },
  },
  {
    title: "a pending cancellation",
    plan: "plus",
    state: "cancel_pending",
    expected: {
      name: "Inoh Plus",
      button: "Manage",
      desc: /^Cancels on .+ — you keep Plus until then\.$/,
    },
  },
  {
    title: "a scheduled downgrade",
    plan: "pro",
    state: "downgrade_pending",
    expected: { name: "Inoh Pro", button: "Manage" },
  },
  {
    title: "a failed payment",
    plan: "plus",
    state: "past_due",
    expected: { name: "Free plan", button: "Fix payment", desc: /^Payment failed/ },
  },
  {
    title: "a former subscriber",
    plan: "plus",
    state: "canceled",
    expected: { name: "Free plan", button: "Upgrade" },
  },
];

for (const { title, plan, state, expected } of PAID_STATES) {
  test(`${title} sees the right plan name and action`, async () => {
    setSubscription(EMAIL, plan, state);
    const settings = await openPluginSettings(session.page);
    try {
      await expectPlanRow(settings, expected);
    } finally {
      await closeSettings(session.page);
    }
  });
}
