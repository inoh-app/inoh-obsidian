/**
 * Reading the plugin settings' Plan row, and finding the upgrade modal it
 * opens. Shared by every spec that drives the plan surface, because Obsidian
 * renders settings in a second window and the modal in a third place again —
 * knowledge that belongs in one file rather than in each spec.
 */

import { expect, type Page } from "@playwright/test";

/** The names the Plan row can carry, which is how it is told from its neighbours. */
const PLAN_ROW_NAMES = /^(Free plan|Inoh Plus|Inoh Pro)$/;

/** What the Plan row should read: its name, its one button, and optionally its caption. */
export type PlanRow = { name: string; button: string; desc?: RegExp };

/** The Plan row: the one whose name is a plan name. */
export const planRowOf = (settings: Page) =>
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
 *
 * @param settings - The settings window, on the plugin's tab
 * @param email - The signed-in account, which names the row Refresh lives on
 * @param expected - The plan name, button label and optional caption to wait for
 */
export async function expectPlanRow(
  settings: Page,
  email: string,
  expected: PlanRow,
): Promise<void> {
  const accountRow = settings.locator(".setting-item", { hasText: email }).first();
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

/**
 * Whichever open window the plan modal rendered into.
 *
 * Reason: the modal opens in the window that owns the plugin's app handle,
 * which is not always the settings window it was pressed from.
 *
 * @param preferred - The window to look in first, usually settings
 * @returns The window showing the modal
 * @throws {Error} When no window shows it within 30 seconds
 */
export async function findPageWithModal(preferred: Page): Promise<Page> {
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
