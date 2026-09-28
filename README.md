# Inoh for Obsidian

[Inoh](https://inoh.app) is the vocabulary app for the articulate. This plugin highlights words from your Inoh deck while you write, so you actually use what you're learning.

## Features

- **Deck-word highlighting.** Words from your deck get a dotted underline as you write, including inflected forms (_crossed_ for _cross_, _went_ for _go_) and multi-word idioms (_counted my blessings_ for _count one's blessings_, _gave the idea up_ for _give up_). Matching is exact against real English forms: _brain_ never lights up _brainy_.
- **Hover or tap to review.** Hovering a highlighted word shows its definition, phonetic, example sentence, and pronunciation audio, with a link to the word in the Inoh app, plus a "Remove from deck" action for words you've finished learning. On mobile, where hover doesn't exist, tapping a highlighted word opens the same card in a dialog.
- **Add words without leaving Obsidian.** Select a word (or phrase) and a **＋ Add to Inoh** button pops up right above it; on mobile the same action lives in the long-press menu. There's also an **Add selected word to deck** command, which works on the word under the cursor too. Inflected forms find their entry (_flipped_ adds _flip_), and if the word has several meanings you pick the right one from a list.
- **Keep a word the dictionary doesn't have.** If Inoh has never heard of the word, the plugin offers to save it to your drafts, and you finish it at [app.inoh.app](https://app.inoh.app) — where you either generate your own card for it or request it for the public dictionary.
- **Works offline.** Your deck is cached locally, so highlighting keeps working without a connection.

## Getting started

1. Enable the plugin, then open its settings.
2. Click **Sign in or sign up**, then enter your email and the six-digit code you receive. A new email creates an Inoh account automatically.
3. Build your vocabulary deck at [app.inoh.app](https://app.inoh.app) (or in the Inoh iOS app), then hit **Refresh**, or just click the status bar item.
4. Write. Deck words light up as you type; the status bar shows how many words are loaded.

## Plans

The plugin works on the free plan. Deck size and a few other limits depend on your Inoh plan, and you can upgrade from the plugin's settings without leaving Obsidian — checkout opens in your browser and your plan updates when you come back.

## The rest of Inoh

Inoh is one account across several places, all listed in the plugin's settings: the [iOS app](https://apps.apple.com/app/id6799947889), the [web app](https://app.inoh.app), the [Chrome extension](https://chromewebstore.google.com/detail/fihdhfkhbocbgmnhdigkljknabnjeoai), the [Raycast extension](https://www.raycast.com/tai/inoh), and an MCP server that lets an AI assistant make cards for you — see [docs.inoh.app](https://docs.inoh.app).

In settings, **Apps → [Connect to Claude](https://docs.inoh.app/#claude)** opens the guide to practicing your deck with Claude. **AI Assistants** keeps the full set of connection guides available.

## Network use disclosure

- The plugin talks to Inoh's backend (Supabase) to sign you in and download your vocabulary deck.
- When you add a word to your deck, that word is sent to Inoh's backend to look it up in the dictionary. Nothing else from your vault is ever uploaded.
- When you save a word the dictionary doesn't have, that word is sent to Inoh's backend as a draft on your account, so you can finish it in the Inoh app.
- If you choose to upgrade, the plugin asks Inoh's backend for a Stripe Checkout link and opens it in your browser. Payment details go to Stripe and are never seen by the plugin; it only reads back whether your account is on the Free, Plus, or Pro plan.
- Auth tokens are stored in device-local storage, never in vault files, so they are not carried along by vault sync services.

## Support

Something wrong, or something missing? Open an issue at [github.com/inoh-app/inoh-obsidian/issues](https://github.com/inoh-app/inoh-obsidian/issues).

Building on the plugin, or running it from source? See [DEVELOPMENT.md](DEVELOPMENT.md).

## License

[MIT](LICENSE)

## Push checks

Every push to `main`, including a pull request merge or a direct push, starts the Push checks workflow in GitHub Actions. The quality job checks formatting and lint. The AI job reviews the changed source code using this repository's `CLAUDE.md` and its `ANTHROPIC_API_KEY` Actions secret. These checks run after the change reaches `main`; feature-branch pushes do not start them.

If quality fails or AI review reports findings without edits, inspect the Actions run and make a follow-up fix. If Claude edits code, Actions validates the edits and opens an `ai-fix/*` pull request targeting `main`. The AI job stays red to signal the open fix. Review and merge that PR manually. The PR itself does not run this main-only workflow, so check it against the latest `main` and resolve any conflicts before merging. The merge then starts a new Push checks run.
