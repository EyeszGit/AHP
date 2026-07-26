# Fiverr Candidate AHP Evaluator (Chrome extension scaffold)

An MVP scaffold for the tool described in your "Extension Requirements" tab: scrape
Fiverr gig pages and rank candidates against an AHP model, right from the browser.

## What's implemented

- **Content script** (`content.js`): injects a "+ Add to AHP Evaluation" button on any
  Fiverr gig page. Scrapes the currently-visible package's price, delivery time,
  revisions, plus seller level, review score and review count — by reading the
  page's visible text (regex-based), not brittle CSS class names, since Fiverr's
  class names are auto-generated and change often.
- **Storage** (`background.js`): saved candidates persist locally via
  `chrome.storage.local`.
- **Popup UI** (`popup.html/js`): lists saved candidates ranked by a live AHP score,
  with sliders to adjust the three top-level weights (Experience / Charisma / Cost —
  pre-filled with the weights from the Google Sheet AHP model: Experience 0.59,
  Charisma 0.28, Cost 0.13, updated 2026-07-26), a progress-bar breakdown per
  candidate, and CSV export.
- **Scoring engine** (`scoring.js`): same shape as the Google Sheet model — min-max
  normalization, equal-weighted leaves within each group, weighted combination.

## How to install and test it (step by step)

### 1. Get the folder onto your computer
- If you're working from the GitHub repo: go to
  `github.com/EyeszGit/AHP` → open the `extension` folder → click "Code" (or use
  `git clone`/"Download ZIP" on the repo) so you have a local copy of the
  `extension` folder with all 9 files (`manifest.json`, `content.js`, etc.)
  somewhere on your machine, e.g. `Downloads/AHP/extension`.
- If you're using the zip I gave you directly in this chat: unzip it anywhere,
  you'll get an `extension` folder — that's the one you'll load in the next step.

### 2. Load it into Chrome
1. Open Chrome and go to `chrome://extensions` (type that directly into the
   address bar).
2. Turn on **Developer mode** — toggle switch, top-right corner of the page.
3. Click **Load unpacked** (top-left, appears once Developer mode is on).
4. In the file picker, select the `extension` folder itself (not a zip, not a
   file inside it — the folder containing `manifest.json`).
5. It should appear in your extensions list as "Fiverr Candidate AHP Evaluator".
   If Chrome shows a red error instead, click "Errors" to see what it's
   complaining about (most likely a typo if you hand-edited a file).

### 3. Pin it so it's easy to reach
- Click the puzzle-piece icon in Chrome's toolbar (top-right) → find "Fiverr
  Candidate AHP Evaluator" → click the pin icon so it stays visible in the
  toolbar.

### 4. Scrape some candidates
1. Go to any Fiverr gig page, e.g. one of the candidate URLs from the Google
   Sheet's DOC1 tab.
2. You should see a green **"+ Add to AHP Evaluation"** button float in near
   the top-right of the page. If you don't see it within a couple of seconds,
   refresh the page.
3. Click it. It'll briefly say "✓ Added" if it worked.
4. Repeat on a few more gig pages (open each in a new tab) to build up a set of
   candidates to compare.

### 5. See the ranking
1. Click the extension's icon in your toolbar (the one you pinned).
2. The popup shows every saved candidate, ranked best-to-worst, with a score
   and a breakdown bar for Experience / Cost / Charisma.
3. Drag the sliders at the top to try different weight balances — the ranking
   recalculates live. They default to this project's current AHP weights
   (Experience 0.59 / Charisma 0.28 / Cost 0.13).
4. Click **Export CSV** to save the current ranking as a spreadsheet file, or
   the **×** on a card to remove that candidate, or **Clear all** to start over.

### 6. If you edit the code afterwards
Chrome doesn't auto-reload unpacked extensions. After changing any file:
1. Go back to `chrome://extensions`
2. Click the circular reload icon on the extension's card
3. Refresh any open Fiverr tabs so the updated content script takes effect

### Troubleshooting
- **Button doesn't show up on a gig page** → refresh the page; Fiverr is a
  single-page app and the script sometimes loads before the page content does.
- **Popup says "No candidates yet"** → you haven't clicked "+ Add to AHP
  Evaluation" on a gig page yet, or storage got cleared.
- **Wrong/missing price or delivery info** → the scraper reads whichever
  package tab (Basic/Standard/Premium) is currently open on the page — click
  the tier you want captured before clicking the Add button.

## Known limitations / what's NOT done yet

Matched against your Extension Requirements doc:

- **User Authentication** — not implemented. This scaffold has no accounts; it's
  single-user, local-storage only. Needed for a real multi-user product.
- **Data Management / GDPR / encryption** — not implemented. Data sits in
  `chrome.storage.local`, unencrypted, on the user's machine only (arguably fine for
  a personal tool, not sufficient if this becomes a shared/multi-user product).
- **One tier per gig** — a gig page only shows one package (Basic/Standard/Premium)
  at a time; the button only captures whichever tier is open. The Google Sheet's
  "best tier per candidate" logic isn't ported yet — would need the content script
  to auto-click through all three tabs before saving.
- **Customer Satisfaction / response rate / positive-negative review split** — not
  scraped; Fiverr's gig page doesn't surface these as plain text the way it does
  price/delivery/reviews/level. Would need the seller's profile page as a second
  scrape target.
- **Customization Options** — only the 3 top-level weights are user-adjustable so
  far; sub-criteria weights are fixed equal-within-group, matching your "equal
  weight" decision for the spreadsheet analysis.
- **Cross-browser** — built and tested conceptually for Chrome (Manifest V3) only,
  per your "Google Chrome" + "Fiverr" target platforms note (Fiverr itself isn't a
  browser — flagging in case that line in the requirements doc meant something
  else, e.g. Firefox).

## Suggested next steps

1. Test the unpacked extension against a few real gig pages and fix any scraping
   misses (Fiverr occasionally A/B tests page layouts).
2. Add tab-clicking so all 3 tiers get captured per gig (closes the biggest gap
   vs. the spreadsheet model).
3. Decide whether this stays a personal local tool or needs real accounts — that
   decision drives whether auth/GDPR work is worth doing at all.
