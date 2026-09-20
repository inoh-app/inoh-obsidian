/**
 * Catching the URLs the plugin hands to the system browser.
 *
 * `openExternalUrl` calls `window.open`, which Electron turns into a real
 * browser launch — so a checkout test would otherwise open Stripe in the
 * developer's own browser, and the address that matters would never be
 * asserted. Replacing `window.open` in the renderer records it instead, which
 * is as close to the hand-off as a test can stand without leaving the app.
 *
 * Every Obsidian window is stubbed, including ones opened later (settings is
 * its own window since 1.13), rather than only the one showing the button:
 * the plugin's code runs in the main window's realm, so that is where its
 * `window.open` lives, wherever the button was pressed.
 */

import type { BrowserContext, Page } from "@playwright/test";

/** Where the stub parks what it caught, on each window it is installed in. */
type CapturingWindow = Window & {
  __inohExternalUrls?: string[];
  __inohRealOpen?: Window["open"];
};

export type ExternalUrlCapture = {
  /** Every URL opened since the capture started, oldest first. */
  read: () => Promise<string[]>;
  /** Resolves with the URL the plugin opened, or throws when none arrives in time. */
  waitForUrl: (timeoutMs?: number) => Promise<string>;
  /** Puts the real `window.open` back. */
  restore: () => Promise<void>;
};

const installStub = (page: Page) =>
  page
    .evaluate(() => {
      const target = window as CapturingWindow;
      target.__inohExternalUrls ??= [];
      const realOpen = (target.__inohRealOpen ??= window.open);
      // Reason: Obsidian opens its own settings and popout windows through
      // `window.open` too, and swallowing those breaks the app under test.
      // Only a bare `window.open(httpsUrl)` — what `openExternalUrl` does —
      // is a hand-off to the system browser; everything else passes through.
      const isBrowserHandoff = (url: string | URL | undefined, argumentCount: number) =>
        argumentCount === 1 && /^https?:\/\//.test(String(url));
      window.open = function (this: Window, ...args: unknown[]) {
        if (!isBrowserHandoff(args[0] as string | URL | undefined, args.length)) {
          return (realOpen as (...passed: unknown[]) => Window | null).apply(this, args);
        }
        target.__inohExternalUrls?.push(String(args[0]));
        return null;
      } as Window["open"];
    })
    // A window can close between being listed and being stubbed; the windows
    // that matter are still open.
    .catch(() => undefined);

const readWindow = (page: Page) =>
  page
    .evaluate(() => (window as CapturingWindow).__inohExternalUrls ?? [])
    .catch((): string[] => []);

const removeStub = (page: Page) =>
  page
    .evaluate(() => {
      const target = window as CapturingWindow;
      if (target.__inohRealOpen) window.open = target.__inohRealOpen;
      delete target.__inohExternalUrls;
      delete target.__inohRealOpen;
    })
    .catch(() => undefined);

/**
 * Stops Obsidian's windows from opening a browser, and records what they would
 * have opened.
 *
 * @param context - The CDP connection to the running Obsidian app
 * @returns A handle to read the captured URLs and to undo the stub
 */
export async function captureExternalUrls(context: BrowserContext): Promise<ExternalUrlCapture> {
  const stubNewWindow = (page: Page) => void installStub(page);
  context.on("page", stubNewWindow);
  await Promise.all(context.pages().map(installStub));

  const read = async (): Promise<string[]> =>
    (await Promise.all(context.pages().map(readWindow))).flat();

  return {
    read,
    waitForUrl: async (timeoutMs = 60_000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const captured = await read();
        if (captured.length > 0) return captured[captured.length - 1];
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      throw new Error(`The plugin opened no external URL within ${timeoutMs}ms.`);
    },
    restore: async () => {
      context.off("page", stubNewWindow);
      await Promise.all(context.pages().map(removeStub));
    },
  };
}
