# Fiverr Candidate AHP Evaluator (Chrome extension)

v0.2 — live AHP scoring directly on Fiverr / Fiverr Pro search, category, and
saved-list pages, plus the original single-gig "add one candidate" flow.

## What's implemented

- **Grid mode** (the main feature): on any of these pages —
  - a Pro-catalog or Full-catalog **search** (`pro.fiverr.com/search/gigs...`)
  - a **category** page (`pro.fiverr.com/categories/...`)
  - a saved **"Freelance network" list** (`pro.fiverr.com/workspace/freelance_network/lists/...`)

  the content script auto-detects every visible candidate card, scores them
  **against each other** (not a fixed dataset) with the AHP model, and injects:
  - a rank + score badge on every card (`#1  0.74`)
  - a green outline on the current top tier, dimming on the bottom tier, so
    you can see which profiles are winning/losing at a glance
  - ★ (track) and ✕ (discard) buttons on every card — discard removes a
    candidate from the live scoring pool entirely (e.g. someone you already
    know isn't right); track just flags one for your shortlist
  - a floating panel (bottom-right) with weight sliders, a tracked/discarded
    count, and the live ranked list — click a name to scroll to that card
  - it **re-scores automatically** when Fiverr's own filters/search change
    the visible cards (Fiverr does this via AJAX, not a page reload — a
    `MutationObserver` watches for it)
  - decisions (tracked/discarded) and a snapshot of each candidate's data
    persist per page-context, so revisiting the same search/category/list
    later restores what you'd already decided

- **Single-gig mode** (legacy, unchanged in spirit): on an individual gig or
  freelancer profile page, a "+ Add to AHP Evaluation" button pulls that one
  candidate's fuller detail (price/delivery/revisions) into a separate
  "manual" bucket, viewable in the popup.

- **Popup**: two sections — manually-added candidates (ranked, exportable),
  and every grid page you've used the floating panel on (with a per-page CSV
  export of whatever you tracked/discarded there).

## The two card types it recognizes (confirmed against live pages, 2026-07-26)

| Page type | CSS selector | Fields it gets |
|---|---|---|
| Fiverr Pro search / category / saved list | `.listings-expert-card-container` | name, rating, review count, price ("From €X"), Vetted Pro flag, "Highly responsive" flag |
| Full-catalog gig grid (search on either domain) | `.gig-wrapper.basic-gig-card` | name, seller level, gig title, rating, review count, price |

Both were checked live: Fiverr Pro reuses the exact same "expert card"
component across search, category, AND saved lists, and the classic gig-card
grid (`.gig-wrapper.basic-gig-card`) shows up when you toggle "Full catalog"
on pro.fiverr.com. If Fiverr redesigns either component, these two selectors
are the first thing to re-check (`chrome://extensions` → click the extension's
"service worker"/"Inspect views" isn't needed — just open DevTools on the
Fiverr page itself and check `document.querySelectorAll('.listings-expert-card-container')`
still returns cards).

**Grid-mode field limitation:** cards only expose rating / review count /
price / seller level / a couple of quality flags — not delivery time or
revisions (those only appear inside an individual gig page). So grid-mode
scoring uses an adapted, smaller version of the AHP model:
- **Experience** = seller level + review count (+ small Vetted-Pro bump)
- **Cost** = price (lower is better)
- **Charisma** = rating (+ small "highly responsive" bump)

This is intentionally simpler than the full Google Sheet model (which also
uses delivery time, revisions, and per-tier pricing) — those richer fields are
still only available via single-gig mode's deeper scrape.

## How to install and test it

### 1. Get the folder
- From GitHub: `github.com/EyeszGit/AHP` → "Code" → Download ZIP (or clone),
  then use the `extension` folder inside it.
- Or unzip the file attached in chat — same folder.

### 2. Load it into Chrome
1. Go to `chrome://extensions`.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked**, select the `extension` folder (the one containing
   `manifest.json`).
4. Pin it: puzzle-piece icon in the toolbar → find "Fiverr Candidate AHP
   Evaluator" → click the pin.

### 3. Try grid mode (the main feature)
1. Go to a Fiverr Pro search, e.g.
   `pro.fiverr.com/search/gigs?query=video game music&expert_listings=true`,
   a category page, or one of your saved lists under "Freelance network".
2. Within a second or two you should see numbered score badges appear on the
   cards, a green outline on the top-tier ones, and a floating panel bottom-right.
3. Try Fiverr's own filters (budget, category, etc.) — the badges and panel
   should update to re-rank just the remaining, filtered set.
4. Click ★ on a card to track it, ✕ to discard it from the ranking pool —
   watch the panel's counts and the other cards' ranks update.
5. Drag the panel's weight sliders to see the ranking shift live.

### 4. Try single-gig mode
On an individual gig or freelancer profile page, click the green
"+ Add to AHP Evaluation" button, then open the extension's popup icon to see
it in the "Manually added" list.

### 5. See everything in the popup
Click the pinned extension icon:
- **Manually added** section: single-gig-mode candidates, ranked, with CSV export.
- **Live grid pages** section: every search/category/list you've used grid mode
  on, with a tracked/discarded count and an **Export** button per page.

### 6. After editing any file
Chrome doesn't auto-reload unpacked extensions:
1. `chrome://extensions` → click the reload icon on the extension's card.
2. Refresh any open Fiverr tabs.

### Troubleshooting
- **No badges/panel on a search/category/list page** → refresh the page (Fiverr
  is a single-page app and can finish loading after our script first runs);
  if it still doesn't show up, open DevTools Console on that page and look for
  `[AHP]` warnings, or check whether `.listings-expert-card-container` /
  `.gig-wrapper.basic-gig-card` still exist in the page (Fiverr may have
  changed its markup — see the table above).
- **Ranking looks off / all similar scores** → with very few cards visible
  (e.g. a 2-person saved list), min-max normalization has little to work with;
  this is expected, not a bug — it gets more meaningful with more candidates
  on screen.
- **Popup's manual section is empty** → that's separate from grid mode; it
  only fills up via the single-gig "+ Add to AHP Evaluation" button.
- **A tracked/discarded decision disappeared** → decisions are stored per
  page (by search query / category path / list ID) — a different query or
  category is treated as a different context, by design.

## Known limitations / what's still not done

- **User Authentication / accounts** — none; single-user, local-storage only.
- **Data Management / GDPR / encryption** — none; everything sits in
  `chrome.storage.local`, unencrypted, on your machine only.
- **No "best tier per candidate" in grid mode** — that richer per-tier logic
  from the Google Sheet only exists in single-gig mode right now.
- **Agency cards** (on category pages, e.g. team profiles) are parsed
  best-effort — they may be missing rating/price fields since agencies show
  team-member lists instead.
- **MutationObserver self-trigger guard is timing-based** (a ~1-frame window
  after each of our own renders) — in the rare case Fiverr re-renders the grid
  in that exact window, the re-scan could be delayed until the next change.

## Suggested next steps

1. Live-test against a broader set of real searches/categories/lists and
   report back anything that doesn't parse (a card with no badge, or an
   obviously wrong price/rating) so selectors can be adjusted.
2. If deeper per-candidate detail (delivery time, revisions, per-tier pricing)
   is wanted in grid mode too, extend it to open each profile in the
   background and merge in the single-gig fields.
3. Decide whether this stays a personal local tool or needs real accounts —
   drives whether auth/GDPR work is worth doing at all.
