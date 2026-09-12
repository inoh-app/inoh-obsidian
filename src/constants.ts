/**
 * The Inoh web app (Expo web export). Word detail lives at /word/<dictionaryId>.
 *
 * Its own host since PRI-20768. inoh.app serves the marketing site, the public
 * dictionary pages and the Stripe return pages; app.inoh.app serves the app.
 */
export const WEB_APP_URL = "https://app.inoh.app";

/**
 * Inoh's marketing host. Separate from WEB_APP_URL because the Stripe return
 * pages below are static HTML that stays here, so a payment receipt does not
 * depend on the app bundle loading, and published versions of this plugin
 * have those paths compiled in.
 */
export const MARKETING_URL = "https://inoh.app";

/**
 * Where Stripe returns the user after checkout. Static pages on the marketing
 * host, not `obsidian://` URIs: the stripe-subscribe edge function only
 * accepts redirect URLs Inoh owns (see _shared/stripe-redirect-urls.ts in
 * inoh-backend), and Stripe rejects unregistered custom schemes anyway.
 * `from` tells the page which app to send the user back to.
 */
export const CHECKOUT_SUCCESS_URL = `${MARKETING_URL}/checkout-success?from=obsidian`;
export const CHECKOUT_CANCEL_URL = `${MARKETING_URL}/checkout-cancel?from=obsidian`;

/**
 * The web app's Plan & Billing page: where subscribers upgrade, downgrade,
 * cancel, resume, and fix their card. The plugin only sells the first
 * upgrade itself; everything after that happens there.
 */
export const BILLING_URL = `${WEB_APP_URL}/billing`;

/** Product pages for the other Inoh ecosystem apps, shown in the Apps settings group. */
export const IOS_APP_URL = "https://apps.apple.com/app/id6799947889";
export const CHROME_EXTENSION_URL =
  "https://chromewebstore.google.com/detail/fihdhfkhbocbgmnhdigkljknabnjeoai?utm_source=item-share-cb";
export const RAYCAST_EXTENSION_URL = "https://www.raycast.com/tai/inoh";

/** Delay after the last keystroke before rescanning the viewport for deck words. */
export const HIGHLIGHT_REBUILD_DEBOUNCE_MS = 200;

/**
 * Typed tokens shorter than this never match via the weak (tolerant) tiers.
 * Prevents "a", "an", "to" from lighting up through typo-distance matching.
 */
export const MIN_FUZZY_TOKEN_LENGTH = 3;
