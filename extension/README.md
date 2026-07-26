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
  with sliders to adjust the three top-level weights (Charisma / Experience / Cost —
  pre-filled with the weights from the Google Sheet AHP model), a progress-bar
  breakdown per candidate, and CSV export.
- **Scoring engine** (`scoring.js`): same shape as the Google Sheet model — min-max
  normalization, equal-weighted leaves within each group, weighted combination.

## Install (unpacked, for testing)

1. Open `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked" → select this `extension` folder
4. Visit any Fiverr gig page → click "+ Add to AHP Evaluation" → open the extension
   icon to see the ranking

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
