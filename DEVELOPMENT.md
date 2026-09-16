# Developing Inoh for Obsidian

Everything in here is for working on the plugin. [README.md](README.md) is for
people using it.

## Commands

```bash
pnpm install
pnpm dev        # watch build into your vault, against the production backend
pnpm dev:local  # same, but against a local Supabase stack (Stripe test mode)
pnpm test       # vitest — matching engine
pnpm typecheck  # tsc --noEmit
pnpm lint       # eslint (type-checked rules); pnpm lint:fix to autofix
pnpm format     # prettier --write src; pnpm format:check to verify only
pnpm build      # typecheck + lint + minified production build to ./main.js
```

## Which backend a build talks to

Backend selection follows the Inoh app's `APP_ENV` convention: `.env.<APP_ENV>` is loaded on top of `.env`, and `APP_ENV` defaults to `prod`. **The production project runs live Stripe keys, so completing checkout against it charges a real card.** To exercise the upgrade flow safely, run `supabase start` in `inoh-backend`, put the URL and publishable key it prints into `.env.local`, and use `pnpm dev:local` — that stack runs Stripe test keys, so card `4242 4242 4242 4242` works. Every dev build prints which backend it targets. `pnpm build` ignores the env files entirely and always targets production, so a local URL can never ship.

## Building into a vault

`pnpm dev` writes straight into a vault. It defaults to `~/Obsidian` and needs no setup if your vault lives there; otherwise copy `.env.example` to `.env` (gitignored) and point `OBSIDIAN_VAULT` at your vault's root — the folder containing `.obsidian/`. An `OBSIDIAN_VAULT` already in your environment wins over `.env`, so `OBSIDIAN_VAULT=~/Notes pnpm dev` works for a one-off. The build refuses to run if the resolved path has no `.obsidian/`, rather than creating directories somewhere unexpected. Install [hot-reload](https://github.com/pjeby/hot-reload) in the same vault and the plugin reloads on every rebuild.

## Layout

```
src/
├── main.ts                  # plugin wiring
├── supabase/                # backend URL/key (per APP_ENV), client factory, email-OTP auth
├── deck/                    # fetch + cache + deck-changed events, add-word flow (lookup, sense picker, drafts)
├── matching/                # deck index + token-driven matcher (pure TS, unit-tested)
├── editor/                  # CM6 extensions: highlight decorations, hover tooltip, selection popup
├── suggestions/             # suggest-deck-words edge function client
├── subscriptions/           # Stripe checkout client + upgrade modal
├── settings/                # settings tab + sign-in modal
└── ui/status-bar.ts
```

## Implementation notes

The highlighter is a CodeMirror 6 view plugin that scans only the visible viewport, debounced 200 ms after the last keystroke; each deck word is expanded into its exact surface forms at index time, so a rescan is a map lookup per token. Obsidian's own `@codemirror/*` packages are `external` in the build — bundling a second copy breaks decoration rendering.

CodeMirror puts its `cm-tooltip` class on whatever element a tooltip's `create` returns, so that element *is* the tooltip. The selection popup therefore returns a container and styles the pill inside it as a descendant; rules written as `.cm-tooltip > button` match nothing, which is how the ＋ Add to Inoh pill once ended up wearing the theme's own button styling.

The add-word flow reports by returning an `AddWordOutcome` rather than showing a Notice, because the same add is started from three places and only the selection popup has somewhere to show the answer in place. The command palette and the mobile long-press menu present that outcome as a Notice; see `describeAddWordOutcome`.

## End-to-end tests

Playwright drives the **real Obsidian app** over the Chrome DevTools Protocol,
with the plugin built into a throwaway vault at `e2e/fixtures/vault` and a
throwaway config directory — a run never touches your own vault or settings.
The backend is a local Supabase stack.

```bash
cd ../inoh-backend && pnpm db:start     # once per session
cd -                                     # back here
pnpm e2e:run                             # doctor + build into the vault + test
```

Covered: the deck size in the status bar, the Apps settings group, deck words
underlined in a note (and non-deck words left alone), the highlight toggle,
adding a selected word from the editor, the selection popup's in-place answer,
and saving a word the public dictionary does not have.

Sign-in goes through the plugin's real settings tab and sign-in modal. Worth
knowing if you extend the suite:

- Obsidian 1.13 renders Settings in a **separate window**, so it shows up as a
  second CDP page — `app.setting.open()` looks like it does nothing if you only
  inspect the window you started from.
- Obsidian sets `window.app` while it is still showing its "Loading plugins…"
  splash, so the startup wait has to be for `app.plugins`, not for `app`.
  Waiting on `app` alone was the source of this suite's intermittent
  first-test failures.
- A run that is killed part-way leaves an Obsidian process holding the remote
  debugging port, and the next run attaches to *that* instance instead of a
  fresh one. `pkill -f inoh-obsidian-e2e` before re-running.

See [inoh-backend/E2E.md](../inoh-backend/E2E.md) for the cross-client picture.

## Copy parked for when suggestions return

AI suggestions are disabled until their quality improves. The plugin code for
them is still in `src/suggestions/` with its command commented out in
`main.ts`, and this is the README copy that described it, kept here so it does
not have to be rewritten from scratch:

> Highlights words from your [Inoh](https://inoh.app) vocabulary deck while you write and suggests places to use them — so you actually use what you're learning.

> - **Hover — or tap — to review.** … On mobile, where hover doesn't exist, tapping a highlighted word or suggested phrase opens the same card in a dialog.
> - **AI suggestions.** Run **Suggest deck words for selection or note** — it works on the selected passage, or the entire note when nothing is selected. On mobile the selection is lost when the command palette opens, so there the command is named **Suggest deck words for entire note** and always covers the whole note. Phrases that could be rewritten with one of your deck words get a wavy underline; hover one to see the deck word, its definition, the rewrite, and a one-sentence explanation of why it fits — then Apply or Dismiss. Free accounts get a limited number of suggestion requests per day; Inoh Pro is unlimited — you can upgrade from the plugin settings without leaving Obsidian.

And the network-use line it needed:

> - When you run the suggestion command, your selected text (up to 2,000 characters) and your deck words are sent to Inoh's backend, which uses OpenAI to generate suggestions. Nothing else from your vault is ever uploaded.
