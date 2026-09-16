import { Modal, Notice, setIcon, type App } from "obsidian";
import { GENERATE_URL, WEB_APP_HOST } from "../constants";
import { removeModalCloseButtons } from "../editor";
import { openExternalUrl } from "../ui";
import type { SaveDraftResult } from "./card-request-drafts";

/**
 * What the plugin offers for a selected word the public dictionary does not
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
    this.modalEl.addClass("inoh-missing-word-modal");
    // Reason: Obsidian's own close button is dropped on both platforms and
    // replaced below. Desktop put a small × outside the cream card and mobile
    // an oversized circle on top of it; one × in the card's top corner is the
    // same control in the same place everywhere.
    removeModalCloseButtons(this.containerEl);
    this.renderCloseButton();
    this.renderOffer();
  }

  override onClose(): void {
    this.contentEl.empty();
  }

  /** The × in the top corner, which is the only way to dismiss this dialog. */
  private renderCloseButton(): void {
    const closeButton = this.modalEl.createEl("button", { cls: "inoh-modal-close" });
    setIcon(closeButton, "x");
    closeButton.setAttribute("aria-label", "Close");
    closeButton.addEventListener("click", () => this.close());
  }

  /** The dialog as it opens: what happened, and the one thing to do about it. */
  private renderOffer(): void {
    this.contentEl.empty();
    this.setTitle(`"${this.word}" isn't in the public dictionary`);

    const saveButton = this.contentEl.createEl("button", {
      cls: "mod-cta",
      text: "Save to Drafts",
    });
    saveButton.addEventListener("click", () => void this.saveWord(saveButton));

    this.contentEl.createDiv({
      cls: "inoh-modal-caption",
      text: `Generate a card later at ${WEB_APP_HOST}`,
    });
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

    const openButton = this.contentEl.createEl("button", {
      cls: "mod-cta",
      text: "Open Inoh",
    });
    openButton.addEventListener("click", () => {
      openExternalUrl(GENERATE_URL);
      this.close();
    });

    this.contentEl.createDiv({
      cls: "inoh-modal-caption",
      text: `Generate the card at ${WEB_APP_HOST}`,
    });
  }
}
