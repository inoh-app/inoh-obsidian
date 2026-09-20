/**
 * The plugin's Plan row through every state, and the upgrade modal a free user
 * opens from it: the plan name and the one button are what a user relies on to
 * know where they stand and where to go.
 */

import { expect, test } from "@playwright/test";
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
import { expectPlanRow, findPageWithModal, planRowOf, type PlanRow } from "../fixtures/plan-row";

const EMAIL = "e2e-obsidian-plan@test.com";

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

test("a free account sees Free plan and Upgrade, which opens Plus and Pro with live prices", async () => {
  setSubscription(EMAIL, "free");
  const settings = await openPluginSettings(session.page);
  try {
    await expectPlanRow(settings, EMAIL, { name: "Free plan", button: "Upgrade" });
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
      await expectPlanRow(settings, EMAIL, expected);
    } finally {
      await closeSettings(session.page);
    }
  });
}
