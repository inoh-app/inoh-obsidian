import { Notice, type App, type Editor } from "obsidian";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateLemmaCandidates } from "../matching";
import type { AccountService } from "../subscriptions";
import type { AddWordOutcome, DeckCard, DictionaryLookupEntry } from "../types";
import { saveWordToDrafts } from "./card-request-drafts";
import { CardLimitError, type DeckService } from "./deck-service";
import { findDictionaryEntries } from "./dictionary-lookup";
import { MissingWordModal } from "./missing-word-modal";
import { SensePickerModal } from "./sense-picker-modal";

/** Same gates as the Chrome extension's selection button. */
const MAX_WORD_LENGTH = 50;
const MAX_WORD_TOKENS = 4;

const SIGN_IN_FIRST_MESSAGE = "Sign in to Inoh first (plugin settings).";

/** What the add-word flow needs from the plugin. */
export type AddWordHost = {
  app: App;
  supabase: SupabaseClient;
  currentUserEmail: string | null;
  /** Needed to write a draft, which is a row owned by this user. */
  currentUserId: string | null;
  deckService: Pick<DeckService, "addCard" | "getCards">;
  account: Pick<AccountService, "promptUpgrade">;
};

/** A single word or short phrase — something the dictionary could contain. */
export function isAddableWord(text: string): boolean {
  return (
    text.length > 0 &&
    text.length <= MAX_WORD_LENGTH &&
    text.split(/\s+/).length <= MAX_WORD_TOKENS &&
    /[A-Za-z]/.test(text)
  );
}

/**
 * Checks whether the deck already covers the selected text, including
 * inflected selections ("flipped" when "flip" is a deck word). Used to hide
 * the selection add-button for words the user is already learning.
 *
 * @param cards - The cached deck cards
 * @param selectedText - Raw selection from the editor
 */
export function isWordInDeck(cards: DeckCard[], selectedText: string): boolean {
  const candidates = new Set(generateLemmaCandidates(selectedText));
  return cards.some((card) => candidates.has(card.dictionary.word.toLowerCase()));
}

/**
 * Returns the selected text when it looks like an addable word, else null.
 * Used to decide whether the editor context menu shows the add item.
 *
 * @param editor - The active markdown editor
 */
export function getAddableSelection(editor: Editor): string | null {
  const selectedText = editor.getSelection().trim();
  return isAddableWord(selectedText) ? selectedText : null;
}

/**
 * Command entry point: adds the selected word (or the word under the cursor
 * when nothing is selected — opening the command palette drops the selection
 * on mobile) to the user's Inoh deck.
 *
 * @param host - The plugin, providing the session and deck service
 * @param editor - The active markdown editor
 */
export async function addWordFromEditor(host: AddWordHost, editor: Editor): Promise<void> {
  const selectedText = editor.getSelection().trim() || _getWordAtCursor(editor);
  if (!selectedText) {
    new Notice("Select a word to add to your deck.");
    return;
  }
  await addWordToDeckWithNotices(host, selectedText);
}

/**
 * Looks the text up in the dictionary and adds it to the deck — asking which
 * sense when there are several. Shared by the command, the context menu, and
 * the selection popup.
 *
 * Says what happened by returning it rather than by showing a Notice: the
 * selection popup shows the answer in itself, where the user is looking, and
 * a Notice in the corner of the window was the thing that needed fixing.
 *
 * @param host - The plugin, providing the session and deck service
 * @param selectedText - The word or short phrase to add
 * @returns What became of the word
 */
export async function addWordToDeck(
  host: AddWordHost,
  selectedText: string,
): Promise<AddWordOutcome> {
  if (!isAddableWord(selectedText)) {
    return { kind: "failed", message: "Select a single word or a short phrase." };
  }
  if (!host.currentUserEmail) {
    return { kind: "failed", message: SIGN_IN_FIRST_MESSAGE };
  }

  let entries: DictionaryLookupEntry[];
  try {
    entries = await findDictionaryEntries(host.supabase, selectedText);
  } catch (error) {
    return { kind: "failed", message: error instanceof Error ? error.message : String(error) };
  }

  if (entries.length === 0) {
    return _offerToWriteWordDown(host, selectedText);
  }
  if (entries.length === 1) {
    return _addEntryToDeck(host, entries[0]);
  }

  // Reason: the picked sense is added after this function has returned, so
  // the picker reports for itself through a Notice. Nothing is left on screen
  // to put the answer in by then — the popup closes when the dialog opens.
  new SensePickerModal(host.app, selectedText, entries, (pickedEntry) => {
    void _addEntryToDeck(host, pickedEntry).then(_announceOutcome);
  }).open();
  return { kind: "handed-over" };
}

/**
 * Adds a word and reports through Notices, for the callers that have nowhere
 * else to put the answer: the command palette and the mobile long-press menu.
 *
 * @param host - The plugin, providing the session and deck service
 * @param selectedText - The word or short phrase to add
 */
export async function addWordToDeckWithNotices(
  host: AddWordHost,
  selectedText: string,
): Promise<void> {
  const addingNotice = new Notice(`Adding "${selectedText}" to Inoh…`, 0);
  try {
    _announceOutcome(await addWordToDeck(host, selectedText));
  } finally {
    addingNotice.hide();
  }
}

/** Says what happened, when there is no popup to say it in. */
function _announceOutcome(outcome: AddWordOutcome): void {
  const message = describeAddWordOutcome(outcome);
  if (message) {
    new Notice(message);
  }
}

/**
 * The outcome in the words the user should read, or null when a dialog took
 * over and is speaking for itself.
 *
 * @param outcome - What became of the word
 * @returns The line to show, or null when there is nothing to say
 */
export function describeAddWordOutcome(outcome: AddWordOutcome): string | null {
  switch (outcome.kind) {
    case "added":
      return `Added "${outcome.word}" to your deck.`;
    case "already-in-deck":
      return `"${outcome.word}" is already in your deck.`;
    case "failed":
      return outcome.message;
    case "handed-over":
      return null;
  }
}

/**
 * Offers to save a word the dictionary does not have, so it is not simply
 * lost. The card itself is made in the web app: see MissingWordModal.
 */
function _offerToWriteWordDown(host: AddWordHost, selectedText: string): AddWordOutcome {
  const userId = host.currentUserId;
  if (!userId) {
    return { kind: "failed", message: SIGN_IN_FIRST_MESSAGE };
  }

  new MissingWordModal(host.app, selectedText, () =>
    saveWordToDrafts(host.supabase, userId, selectedText),
  ).open();
  return { kind: "handed-over" };
}

/** The word under the cursor, or an empty string when the cursor is not on one. */
function _getWordAtCursor(editor: Editor): string {
  const wordRange = editor.wordAt(editor.getCursor());
  return wordRange ? editor.getRange(wordRange.from, wordRange.to) : "";
}

/**
 * Adds one dictionary entry. A full deck is the one outcome that is not
 * reported back: it opens the upgrade modal, which takes the screen.
 */
async function _addEntryToDeck(
  host: AddWordHost,
  entry: DictionaryLookupEntry,
): Promise<AddWordOutcome> {
  const isAlreadyInDeck = host.deckService
    .getCards()
    .some((card) => card.dictionary_id === entry.id);
  if (isAlreadyInDeck) {
    return { kind: "already-in-deck", word: entry.word };
  }

  try {
    await host.deckService.addCard(entry.id);
    return { kind: "added", word: entry.word, dictionaryId: entry.id };
  } catch (error) {
    if (error instanceof CardLimitError) {
      // The server owns the plan limits, so its message is the only place the
      // real numbers appear — show it rather than restating them here.
      host.account.promptUpgrade(error.message);
      return { kind: "handed-over" };
    }
    return { kind: "failed", message: error instanceof Error ? error.message : String(error) };
  }
}
