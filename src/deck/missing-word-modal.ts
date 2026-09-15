import { Modal, Notice, Platform, type App } from "obsidian";
import { GENERATE_URL } from "../constants";
import { removeModalCloseButtons } from "../editor";
import { openExternalUrl } from "../ui";
import type { SaveDraftResult } from "./card-request-drafts";

/**
 * What the plugin offers for a selected word the Inoh dictionary does not
 * have: write it down, then finish it in the web app. Why the card is not made
 * here, and why no dictionary is chosen here, is in `card-request-drafts`.
 *
 * So this dialog does the one thing a note-taking app is well placed to do:
 * catch the word before it is lost, and hand it over.
 */
export class MissingWordModal extends Modal {
  private isSaving = false;

  constructor(
    app: App,
    private readonly word: string,
    private readonly onSaveWord: () => Promise<SaveDraftResult>,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.modalEl.addClass("inoh-modal");
    // Mobile's dialog X is an oversized circle that fights the cream card;
    // tap-outside and swipe-down still close. Desktop keeps its small ×.
    if (Platform.isMobile) {
      removeModalCloseButtons(this.containerEl);
    }
    this.renderOffer();
  }

  override onClose(): void {
    this.contentEl.empty();
  }

  /** The dialog as it opens: what happened, and the one thing to do about it. */
  private renderOffer(): void {
    this.contentEl.empty();
    this.setTitle(`"${this.word}" isn't in Inoh yet`);

    this.contentEl.createEl("p", {
      text: "Save it to your drafts and finish it in Inoh, where you can generate your own card for it or request it for the public dictionary.",
    });

    const saveButton = this.contentEl.createEl("button", {
      cls: "mod-cta",
      text: "Save to drafts",
    });
    saveButton.addEventListener("click", () => void this.saveWord(saveButton));

    const linkRow = this.contentEl.createDiv({ cls: "inoh-modal-link-row" });
    const dismissButton = linkRow.createEl("button", {
      cls: "inoh-modal-link",
      text: "Not now",
    });
    dismissButton.addEventListener("click", () => this.close());
  }

  /**
   * Writes the word down, then swaps the dialog for the way to Inoh.
   *
   * Reason: the dialog stays open rather than closing onto a Notice. The word
   * is only half-handled once it is saved — the card still has to be made in
   * the web app — so the link there has to survive the save, and a Notice
   * cannot be clicked on mobile.
   */
  private async saveWord(saveButton: HTMLButtonElement): Promise<void> {
    if (this.isSaving) return;
    this.isSaving = true;
    saveButton.disabled = true;
    saveButton.addClass("inoh-button-loading");

    try {
      const result = await this.onSaveWord();
      this.renderSaved(result);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error));
      saveButton.disabled = false;
      saveButton.removeClass("inoh-button-loading");
    } finally {
      this.isSaving = false;
    }
  }

  /** The dialog once the word is written down: where to go to make the card. */
  private renderSaved(result: SaveDraftResult): void {
    this.contentEl.empty();
    this.setTitle(result === "saved" ? "Saved to your drafts" : "Already in your drafts");

    this.contentEl.createEl("p", {
      text: `"${this.word}" is waiting in Inoh. Open the Generate tab to say what it means and make the card.`,
    });

    const openButton = this.contentEl.createEl("button", {
      cls: "mod-cta",
      text: "Open Inoh",
    });
    openButton.addEventListener("click", () => {
      openExternalUrl(GENERATE_URL);
      this.close();
    });

    const linkRow = this.contentEl.createDiv({ cls: "inoh-modal-link-row" });
    const laterButton = linkRow.createEl("button", {
      cls: "inoh-modal-link",
      text: "Later",
    });
    laterButton.addEventListener("click", () => this.close());
  }
}
