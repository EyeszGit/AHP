# Fiverr Candidate AHP Evaluator (Chrome extension)

v0.4 — a fixed, always-on, tabbed "AHP Hiring Assistant" panel that lives
directly on Fiverr / Fiverr Pro pages: rank candidates live against each
other — across the ENTIRE search, not just the first page — shortlist the
ones you like across pages, and tune the model from a dedicated Settings
tab. No popup-hunting required.

## What changed in v0.4

- **Per-criterion score breakdown on every card.** The badge already showed
  the blended final score (`#1  0.74`); it now also shows the three numbers
  that went into it — `Exp 0.82`, `Cost 0.65`, `Char 0.90` — right on the
  card, since `scoreVisible()` was already computing all three per candidate.
- **Auto-loads every page of results.** Fiverr Pro search/category/list pages
  gate additional candidates behind a "Show more freelancers" button —
  previously, ranking only ever considered whatever subset you'd manually
  clicked into view. The extension now clicks through that pagination
  automatically (confirmed live: `.show-more-button`) as soon as a page
  loads, with a visible "Loading all results…" status in the panel while it
  runs, so the full candidate set is scored and shortlist-able, not just
  page 1. Toggle it off in Settings ("Automatically load all results") if you
  ever want to control pagination manually instead. Capped at 40 clicks /
  500 candidates as a safety net, and it stops itself if clicking stops
  adding candidates (so it can't spin forever on a broken page).

## What changed in v0.3

- **Fixed, tabbed on-page panel** (Ranking / Shortlist / Settings) instead of
  a small floating stats box. It's open by default, docked bottom-right, and
  only needs one click to collapse — the toolbar popup is no longer where the
  main experience lives.
- **Clearly labeled card controls.** The old ☆ / ✕ glyphs were genuinely
  ambiguous (Fiverr's own cards already show plain star/x icons for their own
  favorite/remove actions, right next to ours — confirmed on a live search
  page). Every button now has a text label and a tooltip: **"+ Shortlist" /
  "✓ Shortlisted"** and **"✕ Discard" / "↺ Restore"**.
- **Works on any page with 2+ cards**, not just the three URL patterns from
  v0.2. Confirmed selectors are tried first; if they don't clear 2 cards, a
  generic fallback scans for repeated same-tag/same-class elements that each
  contain a profile link and a price, so agency cards or a future Fiverr
  redesign still get picked up (best-effort — see Known limitations).
- **Persistent cross-page shortlist ("project").** Clicking "+ Shortlist" on
  any card adds it to a project that stays visible in the Shortlist tab as you
  move between different searches, categories, and lists — re-ranked against
  each other live, using whichever weights are currently set. A default
  project is created automatically; you can create more from the Shortlist
  tab (e.g. one per open role).
- **Peer-relative cost, not just "cheapest wins."** A new Settings toggle
  ("Compare cost within the same seller tier", on by default) answers the
  4th hiring question — *is this candidate expensive compared to others of
  the same rank/level?* — by normalizing price within same-tier buckets
  (seller level, or Vetted-Pro-vs-standard when no numeric level is exposed)
  instead of against the whole visible set. Turn it off to go back to a
  simple global cheapest-wins comparison.
- **De-duplication.** Fiverr sometimes shows the same seller twice on one
  page (confirmed live, e.g. a featured slot + a regular grid slot) — the
  scanner now dedupes by profile URL so one seller doesn't take two ranking
  slots.
- **Settings copy tied to your 4 hiring questions**, so the weights aren't
  abstract sliders:
  1. *Skilled, able to deliver, fits the team* → **Experience**
  2. *Understands your needs, communicates, collaborates* → **Charisma**
  3. *Available, affordable, timely* → **Cost**
  4. *Expensive vs. peers of the same rank/level?* → the peer-relative cost
     toggle described above

## What's implemented

- **Grid mode** (the main feature): any Fiverr / Fiverr Pro page with 2+
  recognizable candidate cards — search, category, saved "Freelance network"
  lists, or anything else — gets:
  - a rank + score badge on every card (`#1  0.74`) with the Experience /
    Cost / Charisma sub-scores shown underneath it
  - a green outline on the current top tier, dimming on the bottom tier
  - automatic pagination — the full result set loads and gets scored without
    you needing to click "Show more" yourself (toggleable in Settings)
  - **"+ Shortlist"** and **"✕ Discard"** buttons on every card (labeled, not
    bare icons) — Discard removes a candidate from the live scoring pool on
    *this page only*; Shortlist adds them to a project that follows you
    across pages
  - the fixed panel (bottom-right): **Ranking** tab (live list, click a name
    to scroll to that card), **Shortlist** tab (your cross-page picks,
    re-ranked, with a project switcher), **Settings** tab (weight sliders +
    the peer-relative-cost toggle, with copy tied to the 4 hiring questions)
  - live re-scoring whenever Fiverr's own filters/search change the visible
    cards (a `MutationObserver` watches for it — debounced via
    `requestAnimationFrame` so bursts of DOM changes only trigger one re-scan)
  - discard decisions + a snapshot of each candidate's data persist per page
    context; shortlist entries persist globally across all pages/projects

- **Single-gig mode** (legacy, unchanged): on a page with fewer than 2 cards
  (an individual gig or freelancer profile), a "+ Add to AHP Evaluation"
  button pulls that candidate's fuller detail (price/delivery/revisions)
  into a separate "manual" bucket, viewable in the popup.

- **Popup**: now secondary — a banner points to the on-page panel. Still
  useful for the manually-added single-gig candidates (ranked, exportable)
  and a CSV export per page context you've used grid mode on.

## Card detection, in priority order

| Priority | Method | Coverage |
|---|---|---|
| 1 | `.listings-expert-card-container` (confirmed live 2026-07-26) | Fiverr Pro's unified card — search, category, AND saved lists all reuse this same component |
| 2 | `.gig-wrapper.basic-gig-card` (confirmed live 2026-07-26) | The classic gig-grid card ("Full catalog" toggle, either domain) |
| 3 | Generic fallback (best-effort) | Any page: looks for 2+ repeated same-tag/same-class elements that each contain a link and a price-like piece of text. Used only when priorities 1–2 together find fewer than 2 cards. Covers agency cards and future/redesigned markup we haven't seen live yet — expect this to be less precise than 1–2, and to occasionally mis-group unrelated repeated layout elements. |

**Grid-mode field limitation (still true in v0.4):** cards only expose
rating / review count / price / seller level (gig cards only) / a couple of
quality flags — not delivery time or revisions (those only appear inside an
individual gig page). So grid-mode scoring is an adapted, smaller model:
- **Experience** = seller level + review count (+ small Vetted-Pro bump)
- **Cost** = price, lower is better, normalized *within the candidate's
  seller-tier bucket* when the peer-relative toggle is on (see above)
- **Charisma** = rating (+ small "highly responsive" bump)

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
4. Pin it if you like (puzzle-piece icon → find "Fiverr Candidate AHP
   Evaluator" → pin) — but you shouldn't need to open it much anymore; the
   panel now lives on the page itself.

### 3. Try grid mode (the main feature)
1. Go to any Fiverr Pro search (e.g.
   `pro.fiverr.com/search/gigs?query=video game music&expert_listings=true`),
   a category page, one of your saved lists, or really any page with 2+
   candidate cards.
2. Within a second or two: numbered score badges on the cards, a green
   outline on the top-tier ones, "+ Shortlist"/"✕ Discard" buttons on each
   card, and the fixed panel bottom-right, open on the **Ranking** tab.
3. Try Fiverr's own filters — the badges and panel update to re-rank just
   the remaining, filtered set.
4. Click **"+ Shortlist"** on a couple of cards, then open the **Shortlist**
   tab — they stay there. Navigate to a *different* search or category and
   check the Shortlist tab again: same candidates, still there, still
   ranked against each other.
5. Watch the top of the **Ranking** tab right after the page loads — an amber
   "Loading all results…" status means it's clicking through Fiverr's "Show
   more freelancers" pagination for you; it turns green ("All N candidates
   loaded…") once done, and the badges/panel reflect the full set, not just
   the first batch. Turn "Automatically load all results" off in **Settings**
   if you'd rather click "Show more" yourself.
5. Click **"✕ Discard"** on a card — it dims and drops out of the ranking
   pool on this page (click **"↺ Restore"** to bring it back).
6. Open the **Settings** tab: drag the weight sliders (see how each maps to
   a hiring question), and toggle "Compare cost within the same seller
   tier" to see cost normalization switch between peer-relative and global.

### 4. Try single-gig mode
On a page with fewer than 2 cards (an individual gig/profile page), click
the green "+ Add to AHP Evaluation" button, then open the extension's popup
to see it in the "Manually added" list.

### 5. After editing any file
Chrome doesn't auto-reload unpacked extensions:
1. `chrome://extensions` → click the reload icon on the extension's card.
2. Refresh any open Fiverr tabs.

### Troubleshooting
- **No badges/panel on a page that clearly has candidate cards** → refresh
  (Fiverr can finish loading after our script first runs); if it still
  doesn't show up, open DevTools Console and look for `[AHP]` warnings, or
  check whether the confirmed selectors still exist
  (`document.querySelectorAll('.listings-expert-card-container')` in the
  console) — if Fiverr changed its markup, the generic fallback should still
  kick in as long as cards share a repeated tag+class and show a price.
- **Ranking looks off / all similar scores** → with very few cards visible,
  min-max normalization has little to work with; expected, not a bug.
- **A candidate you know is on the page didn't get picked up** → the generic
  fallback requires a link + a visible price-like piece of text in the card;
  if a card genuinely has neither (rare), it won't be detected. Report the
  page and we'll look at adding a confirmed selector for it.
- **Popup's manual section is empty** → that's separate from grid mode; it
  only fills up via the single-gig "+ Add to AHP Evaluation" button.
- **A discard decision disappeared** → discard is stored per page context
  (by search query / category path / list ID) — a different query or
  category is a different context, by design. Shortlist entries, by
  contrast, are NOT page-scoped — they follow you everywhere.
- **Auto-load stopped partway through a big category** → it's capped at 40
  "Show more" clicks / 500 candidates as a safety net, and it also stops
  itself if two clicks in a row add nothing (treated as "stuck," not
  "finished," to avoid spinning forever) — the amber/green status line in the
  Ranking tab always shows the true state. It also only runs on pages where
  the confirmed selectors found the cards; it deliberately does not attempt
  to click buttons on generic-fallback pages.

## Known limitations / what's still not done

- **User authentication / accounts** — none; single-user, local-storage only.
- **Data management / GDPR / encryption** — none; everything sits in
  `chrome.storage.local`, unencrypted, on your machine only.
- **No "best tier per candidate" in grid mode** — that richer per-tier logic
  from the Google Sheet only exists in single-gig mode right now.
- **Generic fallback is best-effort** — it can occasionally miss a real card
  grid (if cards don't share a clean repeated tag+class, or don't expose a
  price as visible text) or, in principle, mis-group an unrelated repeated
  page element. It only activates when the two confirmed selectors together
  find fewer than 2 cards, so it never interferes with the common case.
- **Peer-relative cost buckets by seller level or Vetted-Pro status only** —
  Fiverr Pro cards don't expose a numeric seller level the way classic gig
  cards do, so the "same rank/level" bucket for Pro cards is Vetted-Pro vs.
  standard, which is coarser than true seller-level tiers.
- **MutationObserver self-trigger guard is timing-based** (a ~1-frame window
  after each of our own renders) — in the rare case Fiverr re-renders the
  grid in that exact window, the re-scan could be delayed until the next
  change.
- **No payments/licensing** — the extension has no paywall, license check,
  or monetization plumbing of any kind. (Ray's stated pricing idea —
  roughly $2/mo, $9/yr, $14.99 lifetime, targeting Fiverr hirers — is a
  business plan note, not something implemented in this codebase.)
- **Auto-load only recognizes Fiverr's current "Show more" button** — a
  standalone confirmed selector (`.show-more-button`) plus a strict text-only
  fallback (a button whose entire text is "Show/Load/See more…"). If Fiverr
  switches to true URL-based pagination (separate page URLs) instead of an
  in-place "load more," this won't follow it — that would need a different
  approach (auto-navigating between page URLs) rather than auto-clicking.
- **Auto-load can make a search feel slower on very large categories** — each
  click waits for the new cards to settle before clicking again, so loading
  everything on a 500-candidate category takes longer than loading page 1
  alone. That's the deliberate trade-off for "consider all options" over
  speed; turn the Settings toggle off if you'd rather see page 1 instantly.

## Suggested next steps

1. Live-test the generic fallback against a real agency-card page or any
   Fiverr layout the confirmed selectors don't cover, and tighten its
   heuristics based on what actually shows up (or add a third confirmed
   selector if a stable pattern emerges).
2. If deeper per-candidate detail (delivery time, revisions, per-tier
   pricing) is wanted in grid mode too, extend it to open each profile in
   the background and merge in the single-gig fields.
3. Decide whether this stays a personal local tool or needs real accounts —
   that decision drives whether auth/GDPR work, and any payment/licensing
   layer for the monetization plan, is worth building.
