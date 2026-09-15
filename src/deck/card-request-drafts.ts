import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Drafts: a word written down but not asked for yet.
 *
 * A draft is a `card_requests` row at status `draft`, not vault state, so a
 * word saved from a note is waiting in the web app a second later. It costs
 * nothing: it holds no slot in the monthly allowance and the generator never
 * sees it, because the poller only claims `pending` rows.
 *
 * The plugin writes the word down and stops there. Which dictionary it is
 * headed for, and the sense the card should teach, are both settled in the web
 * app's Generate tab — that is where the Private/Public control and the
 * meaning field live, and duplicating them in a modal here would be a second
 * place to keep them right.
 */

/**
 * Where a new draft starts out. The Generate composer opens on Private, so a
 * word written down here lands under the control the user actually sees; they
 * switch the whole list to Public there if that is what they meant.
 */
const INITIAL_DESTINATION = "private";

/**
 * Names this client on every row it writes. A private request must carry one
 * (the database refuses it otherwise) and `publish_private_card` copies the
 * value onto the finished card.
 */
const CARD_REQUEST_SOURCE = "obsidian";

/**
 * What saving a word to the user's Inoh drafts did. "Already saved" is a
 * success: the word is waiting in the web app either way, and the user is told
 * so rather than being handed an error for repeating themselves.
 */
export type SaveDraftResult = "saved" | "already-saved";

/**
 * The words this user has already written down, lowercased.
 *
 * Reason: drafts are exempt from the unique index on work in flight, so
 * nothing in the database stops the same word being saved twice. Selecting the
 * same missing word in two notes is the obvious way to do that by accident.
 *
 * @param supabase - Signed-in Supabase client
 * @param userId - Whose drafts to read
 * @returns The words already written down, for comparing case-insensitively
 */
async function _readWordsAlreadyWrittenDown(
  supabase: SupabaseClient,
  userId: string,
): Promise<Set<string>> {
  // Reason: a failed read is not a reason to refuse the save. The worst a
  // missed duplicate costs is a second row the user can discard in the web
  // app, which is better than losing the word they just selected.
  const { data: existingDrafts } = await supabase
    .from("card_requests")
    .select("word")
    .eq("user_id", userId)
    .eq("status", "draft");

  const drafts = (existingDrafts ?? []) as { word: string }[];
  return new Set(drafts.map((draft) => draft.word.trim().toLowerCase()));
}

/**
 * Writes a word down without asking for a card yet.
 *
 * The meaning is left blank on purpose: the database only requires one from
 * the moment a row leaves `draft`, so the web app collects it when the user
 * submits rather than the plugin demanding it up front.
 *
 * @param supabase - Signed-in Supabase client
 * @param userId - The signed-in user's id
 * @param word - The word to write down
 * @returns Whether it was saved or was already there
 * @throws {Error} When the draft could not be written
 */
export async function saveWordToDrafts(
  supabase: SupabaseClient,
  userId: string,
  word: string,
): Promise<SaveDraftResult> {
  const trimmedWord = word.trim();

  const wordsAlreadyWrittenDown = await _readWordsAlreadyWrittenDown(supabase, userId);
  if (wordsAlreadyWrittenDown.has(trimmedWord.toLowerCase())) {
    return "already-saved";
  }

  const { error } = await supabase.from("card_requests").insert({
    user_id: userId,
    word: trimmedWord,
    context: "",
    destination: INITIAL_DESTINATION,
    source: CARD_REQUEST_SOURCE,
    status: "draft",
  });

  if (error) {
    throw new Error(`Could not save "${trimmedWord}" to your drafts: ${error.message}`);
  }

  return "saved";
}
