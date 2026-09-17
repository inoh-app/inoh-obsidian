/**
 * The Obsidian plugin's core promise: deck words you write in a note get
 * underlined, you can add a new word from the editor, and the toggle turns
 * highlighting off.
 */

import { expect, test } from '@playwright/test';
import {
  assertLocalStackReady,
  readAccountState,
  readSignInCode,
  resetAccount,
  type SeededAccount,
} from '../fixtures/backend';
import {
  closeSettings,
  openNote,
  openPluginSettings,
  runCommand,
  selectWordInEditor,
  signInThroughSettings,
  startObsidian,
  type ObsidianSession,
} from '../fixtures/obsidian';

const EMAIL = 'e2e-obsidian@test.com';
/** Matches `getHighlightClass()` in src/main.ts. */
const HIGHLIGHT_CLASS = 'inoh-deck-word';
/** A word no dictionary has, which is what the missing-word path is for. */
const MISSING_WORD = 'zzzznotaword';

let session: ObsidianSession;
let account: SeededAccount;

test.beforeAll(async () => {
  assertLocalStackReady();
  account = resetAccount({ email: EMAIL, profile: 'learner' });
  session = await startObsidian();

  // Sign in through the plugin's own settings tab and sign-in modal, which
  // live in Obsidian's separate settings window.
  const settings = await openPluginSettings(session.page);
  await signInThroughSettings(settings, EMAIL, (sinceMs) => readSignInCode(EMAIL, sinceMs));
  await closeSettings(session.page);
});

test.afterAll(async () => {
  await session?.close();
});

/** The words currently underlined in the open note. */
const readHighlightedWords = () => session.page.locator(`.${HIGHLIGHT_CLASS}`).allTextContents();

test('the status bar reports the signed-in deck size', async () => {
  // Scoped to the plugin's own status item: Obsidian's word-count item also
  // renders "<n> words" into the same status bar.
  await expect(session.page.locator('.status-bar')).toContainText(
    `Inoh: ${account.cardCount} words`,
    { timeout: 30_000 },
  );
});

test('settings read plan, account, apps, sign out — and the account row is read-only', async () => {
  const settings = await openPluginSettings(session.page);
  try {
    const headings = await settings
      .locator('.setting-item-heading .setting-item-name')
      .allInnerTexts();
    expect(headings).toEqual(['Plan', 'Account', 'Highlighting', 'Apps']);

    // Reason: the account is read-only here — the name and email are changed
    // in the Inoh app — so Refresh is the only control on the row, and
    // signing out is its own card at the foot.
    const accountRow = settings.locator('.setting-item', { hasText: '@test.com' }).first();
    await expect(accountRow.locator('button')).toHaveText(['Refresh']);

    const signOutRow = settings.locator('.setting-item', { hasText: 'Sign out' }).last();
    await signOutRow.scrollIntoViewIfNeeded();
    await expect(signOutRow.locator('button')).toHaveText(['Sign out']);
  } finally {
    // A settings window left open would break the editor tests that follow.
    await closeSettings(session.page);
  }
});

test('the Apps group lists the MCP server, with a mark that rendered', async () => {
  const settings = await openPluginSettings(session.page);
  try {
    const mcpRow = settings.locator('.setting-item-name', { hasText: 'MCP server' });
    await expect(mcpRow).toHaveCount(1, { timeout: 30_000 });
    // Reason: the Apps group is the last one on the tab, so in a short window
    // the row is attached but scrolled past — the same reason the fixture
    // forces its clicks on Obsidian's own nav rows.
    await mcpRow.scrollIntoViewIfNeeded();
    await expect(mcpRow).toBeVisible();

    // Reason: setIcon on a name Obsidian does not know leaves an empty span,
    // so the row would read as text with a gap where every other app has a
    // mark.
    await expect(mcpRow.locator('.inoh-app-icon svg')).toBeVisible();
  } finally {
    // A settings window left open would break the editor tests that follow.
    await closeSettings(session.page);
  }
});

test('a deck word written in a note is underlined; a non-deck word is not', async () => {
  const deckWord = account.words[0];
  const otherWord = account.spareWords[0];
  await openNote(session.page, 'reading.md', `I met ${deckWord} today, then ${otherWord}.`);

  await expect.poll(readHighlightedWords, { timeout: 30_000 }).toContain(deckWord);
  expect(await readHighlightedWords()).not.toContain(otherWord);
});

test('hovering an underlined word shows its card', async () => {
  const deckWord = account.words[0];
  await openNote(session.page, 'reading.md', `Hover over ${deckWord} to see its card.`);
  await expect.poll(readHighlightedWords, { timeout: 30_000 }).toContain(deckWord);

  await session.page.locator(`.${HIGHLIGHT_CLASS}`, { hasText: deckWord }).first().hover();

  const tooltip = session.page.locator('.inoh-tooltip');
  await expect(tooltip).toBeVisible({ timeout: 30_000 });
  await expect(tooltip.locator('.inoh-tooltip-word')).toHaveText(deckWord);
  await expect(tooltip.locator('.inoh-tooltip-definition')).not.toBeEmpty();
});

test('toggling highlighting off removes the underlines', async () => {
  await openNote(session.page, 'reading.md', `Reading about ${account.words[0]}.`);
  await expect.poll(readHighlightedWords, { timeout: 30_000 }).not.toEqual([]);

  expect(await runCommand(session.page, 'inoh:toggle-highlighting')).toBe(true);
  await expect.poll(readHighlightedWords, { timeout: 20_000 }).toEqual([]);

  expect(await runCommand(session.page, 'inoh:toggle-highlighting')).toBe(true);
  await expect.poll(readHighlightedWords, { timeout: 20_000 }).not.toEqual([]);
});

test('adding a selected word from the editor puts it in the deck', async () => {
  const newWord = account.spareWords[0];
  await openNote(session.page, 'capture.md', `The word ${newWord} is worth learning.`);

  expect(await selectWordInEditor(session.page, newWord)).toBe(true);
  expect(await runCommand(session.page, 'inoh:add-word-to-deck')).toBe(true);

  await expect
    .poll(() => readAccountState(EMAIL).words, { timeout: 30_000 })
    .toContain(newWord);
  // And once it is a deck word, it starts getting underlined.
  await expect.poll(readHighlightedWords, { timeout: 30_000 }).toContain(newWord);
});

test('the selection popup reports the outcome in itself, not in the corner', async () => {
  const newWord = account.spareWords[1];
  await openNote(session.page, 'capture.md', `The word ${newWord} is worth learning.`);

  expect(await selectWordInEditor(session.page, newWord)).toBe(true);
  // Reason: the popup follows a settled selection rather than the command, so
  // this is the only path that exercises the in-place answer.
  const addButton = session.page.locator('.inoh-add-word-button');
  await expect(addButton).toBeVisible({ timeout: 30_000 });
  await addButton.click();

  await expect(session.page.locator('.inoh-add-word-message-added')).toContainText('deck', {
    timeout: 30_000,
  });
  // Reason: the confirmation is somewhere to go, not only something to read.
  await expect(session.page.locator('a.inoh-add-word-link')).toHaveAttribute(
    'href',
    /\/word\/[0-9a-f-]{36}$/,
  );
  await expect
    .poll(() => readAccountState(EMAIL).words, { timeout: 30_000 })
    .toContain(newWord);
});

test('a selected word Inoh does not have is written down for later', async () => {
  await openNote(session.page, 'capture.md', `The word ${MISSING_WORD} is in no dictionary.`);

  expect(await selectWordInEditor(session.page, MISSING_WORD)).toBe(true);
  expect(await runCommand(session.page, 'inoh:add-word-to-deck')).toBe(true);

  // The card cannot be added, so the plugin offers to keep the word instead.
  const modal = session.page.locator('.inoh-modal');
  await expect(modal).toContainText("isn't in the public dictionary", { timeout: 30_000 });
  // The × is the only way out; the "Not now" link is gone.
  await expect(modal.locator('.inoh-modal-close')).toBeVisible();
  // Reason: Obsidian focuses a dialog's first button on open, and the theme
  // rings whatever is focused — which read as a stray border on the button.
  await expect(modal.locator('button.mod-cta')).not.toBeFocused();
  // The host in the caption is a link, not just prose.
  await expect(modal.locator('.inoh-modal-caption a')).toHaveAttribute('href', /app\.inoh\.app/);

  await modal.getByRole('button', { name: 'Save to Drafts' }).click();

  // Reason: a draft, not a request. Nothing is generated and no allowance is
  // spent until the user finishes the word in the web app — which is what the
  // dialog now points at.
  await expect
    .poll(() => readAccountState(EMAIL).cardRequests, {
      timeout: 30_000,
      message: `${MISSING_WORD} is written down as a draft`,
    })
    .toContainEqual({ word: MISSING_WORD, status: 'draft' });
  // Reason: the same dialog, not a second one — the button it offered has
  // become the next step and the line under it says the word is kept.
  await expect(modal.getByRole('button', { name: 'Open Inoh' })).toBeVisible();
  await expect(modal.locator('.inoh-modal-caption-saved')).toContainText('drafts');
  await expect(modal.getByRole('button', { name: 'Save to Drafts' })).toHaveCount(0);
});
