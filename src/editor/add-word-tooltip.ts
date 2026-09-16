import { StateEffect, StateField, type Extension } from "@codemirror/state";
import { showTooltip, ViewPlugin, type EditorView, type Tooltip } from "@codemirror/view";
import { WEB_APP_URL } from "../constants";
import type { AddWordOutcome } from "../types";

/**
 * Floating "＋ Add to Inoh" popup that appears above a selected word, the
 * Obsidian counterpart of the Chrome extension's in-page selection button.
 *
 * The popup also carries the answer. Adding a word used to report itself as a
 * Notice in the corner of the window, far from where the user was looking and
 * with no connection to the word they had just selected; now the pill turns
 * into the outcome in the same spot.
 *
 * Desktop-only: on mobile the native selection callout sits exactly where
 * this popup would, and long-press already offers "Add to Inoh deck" in
 * the editor menu.
 */

/** Selections still change while the mouse drags; show only once they settle. */
const SELECTION_SETTLE_MS = 300;

export type AddWordTooltipOptions = {
  /** Whether the popup should appear for this selection (addable, signed in, not in deck). */
  shouldOfferWord: (selectedText: string) => boolean;
  /** Runs the add flow (lookup, sense picker, drafts) and says what happened. */
  onAddWord: (selectedText: string) => Promise<AddWordOutcome>;
};

const setAddWordTooltipEffect = StateEffect.define<Tooltip | null>();

const addWordTooltipField = StateField.define<Tooltip | null>({
  create: () => null,
  update(tooltip, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setAddWordTooltipEffect)) {
        return effect.value;
      }
    }
    // Any edit or new selection invalidates a shown popup.
    return transaction.docChanged || transaction.selection ? null : tooltip;
  },
  provide: (field) => showTooltip.from(field),
});

function buildAddWordPopup(
  view: EditorView,
  from: number,
  to: number,
  selectedText: string,
  onAddWord: AddWordTooltipOptions["onAddWord"],
): Tooltip {
  return {
    pos: from,
    end: to,
    above: true,
    create: () => {
      // Reason: a container rather than the bare button. CodeMirror puts its
      // own `cm-tooltip` class on whatever element it is given, so the button
      // itself used to be the tooltip — which left nowhere to render an answer
      // into, and meant every rule written as `.cm-tooltip > button` matched
      // nothing and the pill fell back to the theme's own button styling.
      const popup = createDiv({ cls: "inoh-add-word-popup" });

      /** Re-measures the popup, which has just changed size. */
      const reposition = () => {
        // An empty transaction: CodeMirror re-measures tooltips on any view
        // update, and the state field keeps a popup across a transaction that
        // neither edits the document nor moves the selection.
        view.dispatch({});
      };

      const dismiss = () => view.dispatch({ effects: setAddWordTooltipEffect.of(null) });

      const showMessage = (text: string, tone: "working" | "added" | "failed") => {
        popup.empty();
        popup.addClass("inoh-add-word-popup-answer");
        const message = popup.createDiv({
          cls: `inoh-add-word-message inoh-add-word-message-${tone}`,
        });
        // Reason: a spinner while the lookup and the insert are in flight.
        // Both are network round-trips, and on a slow connection the bare word
        // "Adding…" gave no sign that anything was still happening.
        if (tone === "working") {
          message.createSpan({ cls: "inoh-add-word-spinner" });
        }
        message.appendText(text);
        reposition();
        return popup;
      };

      /**
       * The card the word just became, so "Added to your deck" is somewhere to
       * go rather than only something to read.
       *
       * The popup is not on a timer: it clears itself on the next keystroke or
       * selection change, which is soon enough, and a link that vanished after
       * two seconds was one nobody could reach.
       */
      const showAddedCard = (word: string, dictionaryId: string) => {
        showMessage("Added to your deck ✓", "added").createEl("a", {
          cls: "inoh-add-word-link",
          text: `View "${word}" in Inoh`,
          href: `${WEB_APP_URL}/word/${dictionaryId}`,
          attr: { target: "_blank", rel: "noopener" },
        });
        reposition();
      };

      const addWord = async () => {
        showMessage("Adding…", "working");

        const outcome = await onAddWord(selectedText);

        switch (outcome.kind) {
          case "added":
            showAddedCard(outcome.word, outcome.dictionaryId);
            return;
          case "already-in-deck":
            showMessage("Already in your deck", "added");
            return;
          case "failed":
            showMessage(outcome.message, "failed");
            return;
          // A dialog has the screen now, so the popup gets out of the way.
          case "handed-over":
            dismiss();
            return;
        }
      };

      const addButton = popup.createEl("button", {
        cls: "inoh-add-word-button",
        text: "＋ Add to Inoh",
      });
      // Reason: mousedown would move the cursor and collapse the selection
      // before click fires, dismissing the popup under the pointer.
      addButton.addEventListener("mousedown", (event) => event.preventDefault());
      addButton.addEventListener("click", () => void addWord());

      return { dom: popup };
    },
  };
}

/** Watches the selection and pops the add button once it settles on a word. */
function buildSelectionWatcher(options: AddWordTooltipOptions): Extension {
  return ViewPlugin.fromClass(
    class {
      private settleTimer: number | null = null;

      constructor(private readonly view: EditorView) {}

      update(update: { selectionSet: boolean; docChanged: boolean }): void {
        if (!update.selectionSet && !update.docChanged) {
          return;
        }
        this.cancelPendingShow();
        if (!this.view.state.selection.main.empty) {
          this.settleTimer = window.setTimeout(() => this.showIfAddable(), SELECTION_SETTLE_MS);
        }
      }

      destroy(): void {
        this.cancelPendingShow();
      }

      private cancelPendingShow(): void {
        if (this.settleTimer !== null) {
          window.clearTimeout(this.settleTimer);
          this.settleTimer = null;
        }
      }

      private showIfAddable(): void {
        this.settleTimer = null;
        const { from, to } = this.view.state.selection.main;
        const selectedText = this.view.state.sliceDoc(from, to).trim();
        if (!selectedText || !options.shouldOfferWord(selectedText)) {
          return;
        }
        this.view.dispatch({
          effects: setAddWordTooltipEffect.of(
            buildAddWordPopup(this.view, from, to, selectedText, options.onAddWord),
          ),
        });
      }
    },
  );
}

/**
 * Builds the selection popup extension.
 *
 * @param options - Gate and action callbacks, wired to the plugin in main.ts
 */
export function buildAddWordTooltip(options: AddWordTooltipOptions): Extension {
  return [addWordTooltipField, buildSelectionWatcher(options)];
}
