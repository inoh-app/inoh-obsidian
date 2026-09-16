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
 *
 * Saving does not replace the dialog with a second screen. The one button
 * becomes the next step and the line under it says what happened, because the
 * two states are the same two sentences either way, and a dialog that rebuilds
 * itself reads as a new question rather than an answer to the one just asked.
 */
export class MissingWordModal extends Modal {
  private isSaving = false;
  private actionButton!: HTMLButtonElement;
  private captionEl!: HTMLElement;

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
    this.dropAutomaticFocus();
  }

  /**
   * Leaves the dialog with nothing focused.
   *
   * Reason: Obsidian focuses a dialog's first button on open, and the theme
   * paints a 3px ring around whatever is focused — so opening this with the
   * mouse drew a keyboard affordance nobody had asked for, which read as a
   * stray border on the button. Tabbing to the button still shows the ring,
   * which is the one time it means something.
   *
   * On a timer because the focus lands after onOpen returns, so blurring
   * inside it would run first and change nothing.
   */
  private dropAutomaticFocus(): void {
    window.setTimeout(() => this.actionButton.blur(), 0);
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
    this.setTitle(`"${this.word}" isn't in the public dictionary`);

    this.actionButton = this.contentEl.createEl("button", {
      cls: "mod-cta",
      text: "Save to Drafts",
    });
    // Reason: assigned rather than added. Saving turns this same button into
    // Open Inoh, and an assignment replaces the handler where addEventListener
    // would leave the old one to fire alongside the new.
    this.actionButton.onclick = () => void this.saveWord();

    this.captionEl = this.contentEl.createDiv({ cls: "inoh-modal-caption" });
    this.captionEl.appendText("Generate a card later at ");
    this.captionEl.createEl("a", {
      text: WEB_APP_HOST,
      href: GENERATE_URL,
      attr: { target: "_blank", rel: "noopener" },
    });
  }

  /** Writes the word down, then turns the button into the way to Inoh. */
  private async saveWord(): Promise<void> {
    if (this.isSaving) return;
    this.isSaving = true;
    this.actionButton.disabled = true;
    this.actionButton.addClass("inoh-button-loading");

    try {
      const result = await this.onSaveWord();
      this.showSaved(result);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error));
      this.actionButton.disabled = false;
      this.actionButton.removeClass("inoh-button-loading");
    } finally {
      this.isSaving = false;
    }
  }

  /** The same dialog, now saying the word is kept and where to finish it. */
  private showSaved(result: SaveDraftResult): void {
    this.actionButton.disabled = false;
    this.actionButton.removeClass("inoh-button-loading");
    this.actionButton.setText("Open Inoh");
    this.actionButton.onclick = () => {
      openExternalUrl(GENERATE_URL);
      this.close();
    };

    this.captionEl.addClass("inoh-modal-caption-saved");
    // setText clears the link along with the sentence it sat in, which is
    // right: the button below now goes to the same place.
    this.captionEl.setText(
      result === "saved" ? "Saved to your drafts ✓" : "Already in your drafts ✓",
    );
  }
}
