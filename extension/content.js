// content.js — v0.3
//
// Runs on fiverr.com and pro.fiverr.com. Two modes:
//
// 1) GRID MODE: works on ANY page (search, category, saved list, or anything
//    else Fiverr ships) that has 2+ recognizable freelancer/gig/agency cards.
//    Scores them live against each other with the AHP model, overlays a
//    rank/score badge + clearly-labeled Shortlist/Discard controls on every
//    card, and renders a fixed, always-open, tabbed panel (Ranking /
//    Shortlist / Settings) — no hovering the toolbar icon required.
//
// 2) SINGLE-GIG MODE (an individual gig or freelancer profile page, i.e. no
//    2+ cards found): keeps the "+ Add to AHP Evaluation" button for pulling
//    one candidate's full package details into the "manual" bucket.
//
// Card detection, in priority order:
//   a) Confirmed selectors (verified live 2026-07-26):
//        `.listings-expert-card-container` — Fiverr Pro's unified card,
//        reused across Pro-catalog search, category pages, AND saved lists.
//        `.gig-wrapper.basic-gig-card` — the classic gig-grid card.
//   b) GENERIC fallback (task: work on any page with 2+ freelancer/agency
//      cards): scans for repeated sibling elements (same tag + class) that
//      each contain a profile-ish link and a money-like leaf of text. This
//      is a heuristic safety net for agency cards or future/redesigned
//      Fiverr markup the confirmed selectors don't cover — best-effort,
//      documented as such in the README.
//
// HIRING MODEL — the 4 questions this maps to (see Settings tab copy too):
//   1. Skilled / able to deliver / fits the team      -> Experience
//   2. Understands needs / communicates / collaborates -> Charisma
//   3. Available / affordable / timely                 -> Cost
//   4. Expensive vs. peers of the same rank/level?      -> Cost is normalized
//      WITHIN a seller-level/tier bucket, not just globally, when the
//      "Compare cost within same tier" setting is on (default: on).

const PRO_CARD_SELECTOR = ".listings-expert-card-container";
const GIG_CARD_SELECTOR = ".gig-wrapper.basic-gig-card";
const CONFIRMED_CARD_SELECTOR = `${PRO_CARD_SELECTOR}, ${GIG_CARD_SELECTOR}`;

// ---------- helpers ----------

// IMPORTANT: cards get re-parsed on every re-render (MutationObserver fires,
// shortlist/discard clicked, weights changed, etc.) and by then the card
// already contains OUR OWN injected .ahp-badge / .ahp-controls as real DOM
// children. Every leaf-text scan must exclude those, or a re-parse picks up
// our own button labels as if they were page content and corrupts name/title
// detection.
function isAhpInjected(n) {
  return !!n.closest?.(".ahp-badge, .ahp-controls, #ahp-panel");
}

function leafTexts(el) {
  return [...el.querySelectorAll("*")]
    .filter((n) => n.children.length === 0 && !isAhpInjected(n))
    .map((n) => n.textContent.trim())
    .filter(Boolean);
}

function parseMoney(text) {
  const m = text && text.match(/[€$£]\s?([\d,]+(?:\.\d+)?)/);
  return m ? parseFloat(m[1].replace(/,/g, "")) : null;
}

function levelToNumber(text) {
  if (!text) return null;
  if (/top rated/i.test(text)) return 3;
  const m = text.match(/level\s*(\d)/i);
  if (m) return parseInt(m[1], 10);
  if (/new seller/i.test(text)) return 0;
  return null;
}

// ---------- card parsers: confirmed selectors ----------

function parseProCard(el) {
  const nameLink = el.querySelector(".seller-name");
  const href = nameLink && nameLink.getAttribute("href");
  if (!href) return null;
  const id = href.split("?")[0];
  const name = nameLink.textContent.trim();

  const ratingEl = el.querySelector(".seller-rating");
  const ratingText = ratingEl ? ratingEl.textContent : "";
  const ratingMatch = ratingText.match(/(\d(?:\.\d)?)/);
  const reviewMatch = ratingText.match(/\(([\d,]+)\)/);

  const leaves = leafTexts(el);
  const priceLeaf = leaves.find((t) => /^from\s*[€$£]/i.test(t));
  const fullText = leaves.join(" "); // excludes our own injected badge/controls text

  return {
    id,
    type: "pro-freelancer",
    cardType: "confirmed",
    name,
    title:
      leaves.find((t) => t.length > 25 && !/satisfaction guarantee/i.test(t)) ||
      "",
    rating: ratingMatch ? parseFloat(ratingMatch[1]) : null,
    reviewCount: reviewMatch ? parseInt(reviewMatch[1].replace(/,/g, ""), 10) : null,
    price: priceLeaf ? parseMoney(priceLeaf) : null,
    sellerLevel: null,
    vettedPro: /vetted pro/i.test(fullText),
    highlyResponsive: /highly responsive|fast responder/i.test(fullText),
  };
}

function parseGigCard(el) {
  const anchor = el.querySelector("a[href]");
  const href = anchor && anchor.getAttribute("href");
  if (!href) return null;
  const id = href.split("?")[0];

  const leaves = leafTexts(el);
  // Drop a lone single-character leaf (avatar fallback initial), if present.
  const clean = leaves[0] && leaves[0].length === 1 ? leaves.slice(1) : leaves;

  const levelLeaf = clean.find((t) => /level\s*\d|top rated|new seller/i.test(t));
  const ratingLeaf = clean.find((t) => /^\d(\.\d)?$/.test(t));
  const ratingIdx = ratingLeaf ? clean.indexOf(ratingLeaf) : -1;
  const reviewLeaf =
    ratingIdx >= 0 ? clean.slice(ratingIdx + 1).find((t) => /^[\d,]+$/.test(t)) : null;
  const priceLeaf = clean.find((t) => /^[€$£]\s?[\d,]/.test(t));
  const name = clean[0] || "";
  const title =
    clean.find((t) => t.length > 15 && t !== name && t !== levelLeaf) || "";

  return {
    id,
    type: "gig",
    cardType: "confirmed",
    name,
    title,
    rating: ratingLeaf ? parseFloat(ratingLeaf) : null,
    reviewCount: reviewLeaf ? parseInt(reviewLeaf.replace(/,/g, ""), 10) : null,
    price: priceLeaf ? parseMoney(priceLeaf) : null,
    sellerLevel: levelToNumber(levelLeaf),
    vettedPro: false,
    highlyResponsive: false,
  };
}

function parseConfirmedCard(el) {
  try {
    if (el.matches(PRO_CARD_SELECTOR)) return parseProCard(el);
    if (el.matches(GIG_CARD_SELECTOR)) return parseGigCard(el);
  } catch (e) {
    console.warn("[AHP] confirmed card parse failed", e);
  }
  return null;
}

// ---------- card parser: generic fallback (any page, best-effort) ----------
//
// Heuristic: page markup that repeats the SAME tag+class combination 2+
// times, where each instance contains both a link and a money-like leaf of
// text, is treated as a card grid Fiverr didn't already give us a confirmed
// selector for (agency cards, a future redesign, a totally different page).
// This intentionally trades precision for coverage — it's a safety net, not
// the primary detector. Guarded so it never runs when confirmed selectors
// already found 2+ cards (cheap early-out for the common case).
function elementSignature(el) {
  const cls = typeof el.className === "string" ? el.className.trim() : "";
  if (!cls) return null;
  // Ignore anything already tagged as ours.
  if (/(^|\s)ahp-/.test(cls)) return null;
  return `${el.tagName}.${cls.split(/\s+/).sort().join(".")}`;
}

function findGenericCards() {
  const groups = new Map();
  const all = document.body.querySelectorAll("div, li, article, section");
  let scanned = 0;
  for (const el of all) {
    if (scanned++ > 6000) break; // perf guard on very large pages
    if (el.closest("#ahp-panel")) continue;
    if (el.matches(CONFIRMED_CARD_SELECTOR)) continue;
    // Skip very large containers (whole page sections) and very small ones.
    const textLen = el.textContent ? el.textContent.length : 0;
    if (textLen < 20 || textLen > 1500) continue;
    const sig = elementSignature(el);
    if (!sig) continue;
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig).push(el);
  }

  let best = null;
  for (const els of groups.values()) {
    if (els.length < 2 || els.length > 60) continue;
    const qualifying = els.filter((el) => {
      if (!el.querySelector("a[href]")) return false;
      if (!/[€$£]\s?[\d,]/.test(el.textContent)) return false;
      return true;
    });
    // Require the WHOLE repeated group to qualify (not just some of them) —
    // otherwise we're likely matching an unrelated repeated layout element.
    if (qualifying.length >= 2 && qualifying.length === els.length) {
      if (!best || qualifying.length > best.length) best = qualifying;
    }
  }
  return best || [];
}

function parseGenericCard(el) {
  const anchor = el.querySelector("a[href]");
  const href = anchor && anchor.getAttribute("href");
  if (!href) return null;
  const id = href.split("?")[0];

  const leaves = leafTexts(el);
  const clean = leaves[0] && leaves[0].length === 1 ? leaves.slice(1) : leaves;

  const levelLeaf = clean.find((t) => /level\s*\d|top rated|new seller/i.test(t));
  const ratingLeaf = clean.find((t) => /^\d(\.\d)?$/.test(t));
  const ratingIdx = ratingLeaf ? clean.indexOf(ratingLeaf) : -1;
  const reviewLeaf =
    ratingIdx >= 0 ? clean.slice(ratingIdx + 1).find((t) => /^[\d,]+$/.test(t)) : null;
  // Generic fallback covers markup we haven't seen before, so match money
  // ANYWHERE in the leaf ("€88", "From €120", "Starting at $45"), unlike the
  // confirmed-selector parsers which can anchor on Fiverr's known format.
  const priceLeaf = clean.find((t) => /[€$£]\s?[\d,]/.test(t));
  const name = clean[0] || anchor.textContent.trim().slice(0, 60) || "Unnamed candidate";
  const title = clean.find((t) => t.length > 15 && t !== name && t !== levelLeaf) || "";
  const fullText = clean.join(" ");
  const isAgency = /\bagency\b|\bteam of\b|\bstudio\b/i.test(fullText);

  return {
    id,
    type: isAgency ? "agency" : "generic",
    cardType: "generic",
    name,
    title,
    rating: ratingLeaf ? parseFloat(ratingLeaf) : null,
    reviewCount: reviewLeaf ? parseInt(reviewLeaf.replace(/,/g, ""), 10) : null,
    price: priceLeaf ? parseMoney(priceLeaf) : null,
    sellerLevel: levelToNumber(levelLeaf),
    vettedPro: /vetted pro/i.test(fullText),
    highlyResponsive: /highly responsive|fast responder/i.test(fullText),
  };
}

// Fiverr occasionally surfaces the very same seller twice on one page (e.g.
// a featured slot plus a regular grid slot) — confirmed live 2026-07-26 on a
// real search results page. De-dupe by id (first occurrence wins) so one
// seller doesn't eat two ranking slots.
function dedupeById(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (seen.has(item.parsed.id)) continue;
    seen.add(item.parsed.id);
    out.push(item);
  }
  return out;
}

// Returns [{ el, parsed }] across confirmed selectors first, generic fallback
// only if confirmed selectors alone don't clear the "2+ cards" bar.
function findAllCards() {
  const confirmedEls = [...document.querySelectorAll(CONFIRMED_CARD_SELECTOR)];
  const results = [];
  for (const el of confirmedEls) {
    const parsed = parseConfirmedCard(el);
    if (parsed) results.push({ el, parsed });
  }
  const dedupedConfirmed = dedupeById(results);
  if (dedupedConfirmed.length >= 2) return { cards: dedupedConfirmed, mode: "confirmed" };

  const genericEls = findGenericCards();
  const genericResults = [];
  for (const el of genericEls) {
    const parsed = parseGenericCard(el);
    if (parsed) genericResults.push({ el, parsed });
  }
  const combined = dedupeById([...dedupedConfirmed, ...genericResults]);
  if (combined.length >= 2) {
    return { cards: combined, mode: "generic" };
  }
  return { cards: dedupedConfirmed, mode: dedupedConfirmed.length ? "confirmed" : "none" };
}

// ---------- context detection ----------

function detectContext() {
  const path = location.pathname;
  const params = new URLSearchParams(location.search);

  const listMatch = path.match(/\/workspace\/freelance_network\/lists\/([^/?]+)/);
  if (listMatch) {
    const heading = document.querySelector("h1, [class*='list-name'], [class*='ListName']");
    return { key: `list:${listMatch[1]}`, label: heading ? heading.textContent.trim() : "Saved list" };
  }

  if (path.includes("/search/gigs")) {
    const q = params.get("query") || "";
    const catalog = params.get("expert_listings") === "false" ? "full" : "pro";
    return { key: `search:${catalog}:${q.toLowerCase()}`, label: `Search: "${q}"` };
  }

  const catMatch = path.match(/\/categories\/([^/?]+(?:\/[^/?]+)?)/);
  if (catMatch) {
    const heading = document.querySelector("h1");
    return { key: `category:${catMatch[1]}`, label: heading ? heading.textContent.trim() : catMatch[1] };
  }

  return { key: `page:${path}`, label: document.title ? document.title.slice(0, 60) : "This page" };
}

// ---------- scoring ----------

function minMax(values, higherBetter) {
  const present = values.filter((v) => v !== null && v !== undefined && !isNaN(v));
  if (present.length === 0) return values.map(() => null);
  const min = Math.min(...present);
  const max = Math.max(...present);
  return values.map((v) => {
    if (v === null || v === undefined || isNaN(v)) return null;
    if (max === min) return 1;
    const n = (v - min) / (max - min);
    return higherBetter ? n : 1 - n;
  });
}

// Hiring question #4: "is this candidate expensive compared to others of the
// SAME rank/level?" — bucket by seller level when we have one (gig cards),
// falling back to a Vetted-Pro-vs-standard bucket (pro cards don't expose a
// numeric level). Buckets with < 2 members fall back to the global cost
// normalization since there's no real peer set to compare within.
function levelBucketKey(c) {
  if (c.sellerLevel !== null && c.sellerLevel !== undefined) return `level:${c.sellerLevel}`;
  return c.vettedPro ? "tier:vetted-pro" : "tier:standard";
}

function normalizeCost(candidates, prices, peerRelative) {
  const globalNorm = minMax(prices, false);
  if (!peerRelative) return globalNorm;

  const buckets = new Map();
  candidates.forEach((c, i) => {
    const key = levelBucketKey(c);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(i);
  });

  const result = new Array(candidates.length).fill(null);
  buckets.forEach((idxs) => {
    if (idxs.length < 2) {
      idxs.forEach((i) => (result[i] = globalNorm[i]));
      return;
    }
    const bucketPrices = idxs.map((i) => prices[i]);
    const bucketNorm = minMax(bucketPrices, false);
    idxs.forEach((i, j) => (result[i] = bucketNorm[j]));
  });
  return result;
}

function scoreVisible(candidates, weights, settings) {
  const peerRelative = !settings || settings.peerRelativeCost !== false;
  const levels = candidates.map((c) => c.sellerLevel);
  const reviews = candidates.map((c) => c.reviewCount);
  const prices = candidates.map((c) => c.price);
  const ratings = candidates.map((c) => c.rating);

  const nLevel = minMax(levels, true);
  const nReview = minMax(reviews, true);
  const nCost = normalizeCost(candidates, prices, peerRelative);
  const nRating = minMax(ratings, true);

  return candidates.map((c, i) => {
    const expParts = [nLevel[i], nReview[i]].filter((v) => v !== null);
    let experience = expParts.length ? expParts.reduce((a, b) => a + b, 0) / expParts.length : 0.5;
    if (c.vettedPro) experience = Math.min(1, experience + 0.15);

    const cost = nCost[i] !== null ? nCost[i] : 0.5;

    let charisma = nRating[i] !== null ? nRating[i] : 0.5;
    if (c.highlyResponsive) charisma = Math.min(1, charisma + 0.1);

    const final = weights.Experience * experience + weights.Cost * cost + weights.Charisma * charisma;
    return { ...c, scores: { experience, cost, charisma, final } };
  });
}

// ---------- state ----------

const DEFAULT_WEIGHTS = { Experience: 0.5904, Cost: 0.1312, Charisma: 0.2783 };
const DEFAULT_SETTINGS = { peerRelativeCost: true };

let currentContext = null;
let currentWeights = { ...DEFAULT_WEIGHTS };
let currentSettings = { ...DEFAULT_SETTINGS };
let decisions = {}; // candidateId -> 'discarded' (per-context; shortlist membership lives separately)
let snapshots = {}; // candidateId -> last-seen candidate data (survives leaving the page)
let shortlistProjects = { activeId: "default", projects: { default: { name: "My Project", items: {} } } };
let panelCollapsed = false;
let activeTab = "ranking";
let renderScheduled = false;
let selfMutating = false;
let currentMode = "none"; // 'confirmed' | 'generic' | 'none'

function activeProject() {
  const proj = shortlistProjects.projects[shortlistProjects.activeId];
  return proj || shortlistProjects.projects[Object.keys(shortlistProjects.projects)[0]];
}

function loadState(cb) {
  chrome.storage.local.get(
    {
      ahpWeights: DEFAULT_WEIGHTS,
      ahpSettings: DEFAULT_SETTINGS,
      ahpContexts: {},
      ahpShortlistProjects: shortlistProjects,
    },
    (data) => {
      currentWeights = data.ahpWeights;
      currentSettings = data.ahpSettings;
      const ctxData = data.ahpContexts[currentContext.key];
      decisions = (ctxData && ctxData.decisions) || {};
      snapshots = (ctxData && ctxData.snapshots) || {};
      shortlistProjects = data.ahpShortlistProjects;
      if (!shortlistProjects.projects || !Object.keys(shortlistProjects.projects).length) {
        shortlistProjects = { activeId: "default", projects: { default: { name: "My Project", items: {} } } };
      }
      cb && cb();
    }
  );
}

function saveWeights() {
  chrome.storage.local.set({ ahpWeights: currentWeights });
}

function saveSettings() {
  chrome.storage.local.set({ ahpSettings: currentSettings });
}

function saveShortlistProjects() {
  chrome.storage.local.set({ ahpShortlistProjects: shortlistProjects });
}

// snapshot: pass the scored candidate object when discarding so the popup
// can still show/export it after the user leaves this page.
function saveDecisions(id, snapshot) {
  if (snapshot) snapshots[id] = snapshot;
  chrome.storage.local.get({ ahpContexts: {} }, (data) => {
    data.ahpContexts[currentContext.key] = { label: currentContext.label, decisions, snapshots };
    chrome.storage.local.set({ ahpContexts: data.ahpContexts });
  });
}

function isShortlisted(id) {
  const proj = activeProject();
  return !!(proj && proj.items && proj.items[id]);
}

function addToShortlist(snapshot) {
  const proj = activeProject();
  if (!proj) return;
  proj.items[snapshot.id] = {
    snapshot,
    contextKey: currentContext.key,
    contextLabel: currentContext.label,
    addedAt: Date.now(),
  };
  saveShortlistProjects();
}

function removeFromShortlist(id) {
  const proj = activeProject();
  if (!proj || !proj.items) return;
  delete proj.items[id];
  saveShortlistProjects();
}

// ---------- rendering: per-card overlay ----------

function renderCardOverlay(cardEl, scored, rank, tierClass) {
  cardEl.classList.add("ahp-anchor");
  cardEl.querySelectorAll(":scope > .ahp-badge, :scope > .ahp-controls").forEach((n) => n.remove());
  cardEl.classList.remove("ahp-card-tier-lead", "ahp-card-tier-mid", "ahp-card-tier-trail", "ahp-card-discarded");

  const discarded = decisions[scored.id] === "discarded";
  if (discarded) {
    cardEl.classList.add("ahp-card-discarded");
  } else {
    cardEl.classList.add(tierClass);
  }

  const badge = document.createElement("div");
  badge.className = `ahp-badge ${rank === 1 ? "ahp-rank-1" : ""}`;
  badge.innerHTML = `<span class="ahp-badge-rank">#${rank}</span><span class="ahp-score">${scored.scores.final.toFixed(2)}</span>`;
  cardEl.prepend(badge);

  const snapshot = { ...scored };
  delete snapshot.cardEl;

  const shortlisted = isShortlisted(scored.id);

  const controls = document.createElement("div");
  controls.className = "ahp-controls";

  const shortlistBtn = document.createElement("button");
  shortlistBtn.type = "button";
  shortlistBtn.className = `ahp-btn ahp-btn-shortlist ${shortlisted ? "ahp-btn-active" : ""}`;
  shortlistBtn.innerHTML = shortlisted
    ? `<span class="ahp-btn-icon">✓</span> Shortlisted`
    : `<span class="ahp-btn-icon">+</span> Shortlist`;
  shortlistBtn.title = shortlisted
    ? "Remove this candidate from your shortlist"
    : "Add this candidate to your shortlist (stays visible as you browse other pages)";
  shortlistBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isShortlisted(scored.id)) removeFromShortlist(scored.id);
    else addToShortlist(snapshot);
    scheduleRender();
  });

  const discardBtn = document.createElement("button");
  discardBtn.type = "button";
  discardBtn.className = `ahp-btn ahp-btn-discard ${discarded ? "ahp-btn-active" : ""}`;
  discardBtn.innerHTML = discarded
    ? `<span class="ahp-btn-icon">↺</span> Restore`
    : `<span class="ahp-btn-icon">✕</span> Discard`;
  discardBtn.title = discarded
    ? "Bring this candidate back into the ranking on this page"
    : "Remove this candidate from the ranking on this page (they won't affect other scores)";
  discardBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    decisions[scored.id] = discarded ? undefined : "discarded";
    if (!decisions[scored.id]) delete decisions[scored.id];
    saveDecisions(scored.id, snapshot);
    scheduleRender();
  });

  controls.append(shortlistBtn, discardBtn);
  cardEl.prepend(controls);
}

// ---------- rendering: fixed tabbed panel ----------

function ensurePanel() {
  let panel = document.getElementById("ahp-panel");
  if (panel) return panel;
  panel = document.createElement("div");
  panel.id = "ahp-panel";
  panel.innerHTML = `
    <div class="ahp-panel-header">
      <div class="ahp-panel-title"><span class="ahp-logo-dot"></span><strong>AHP Hiring Assistant</strong></div>
      <div class="ahp-panel-context" id="ahp-panel-context"></div>
      <button type="button" class="ahp-panel-collapse-btn" id="ahp-panel-collapse-btn" title="Collapse / expand">–</button>
    </div>
    <div class="ahp-panel-tabs">
      <button type="button" class="ahp-tab-btn" data-tab="ranking">Ranking</button>
      <button type="button" class="ahp-tab-btn" data-tab="shortlist">Shortlist <span class="ahp-tab-badge" id="ahp-shortlist-count"></span></button>
      <button type="button" class="ahp-tab-btn" data-tab="settings">Settings</button>
    </div>
    <div class="ahp-panel-body">
      <div class="ahp-tab-panel" data-tab-panel="ranking">
        <div class="ahp-panel-summary" id="ahp-panel-summary"></div>
        <div id="ahp-panel-list"></div>
      </div>
      <div class="ahp-tab-panel" data-tab-panel="shortlist" hidden>
        <div class="ahp-project-row">
          <select id="ahp-project-select"></select>
          <button type="button" id="ahp-project-new" title="Create a new project">+ New</button>
        </div>
        <p class="ahp-settings-note ahp-shortlist-hint">Candidates you shortlist stay here as you move between searches, categories, and lists.</p>
        <div id="ahp-shortlist-list"></div>
      </div>
      <div class="ahp-tab-panel" data-tab-panel="settings" hidden>
        <p class="ahp-settings-intro">Weights map to how you hire:</p>
        <div class="ahp-weight-row">
          <label>Experience<span class="ahp-settings-note">Skilled, able to deliver, fits the team</span></label>
          <input type="range" id="ahp-w-exp" min="0" max="100" />
          <span class="ahp-weight-val" id="ahp-w-exp-val"></span>
        </div>
        <div class="ahp-weight-row">
          <label>Charisma<span class="ahp-settings-note">Understands your needs, communicates, collaborates</span></label>
          <input type="range" id="ahp-w-char" min="0" max="100" />
          <span class="ahp-weight-val" id="ahp-w-char-val"></span>
        </div>
        <div class="ahp-weight-row">
          <label>Cost<span class="ahp-settings-note">Available, affordable, timely</span></label>
          <input type="range" id="ahp-w-cost" min="0" max="100" />
          <span class="ahp-weight-val" id="ahp-w-cost-val"></span>
        </div>
        <label class="ahp-toggle-row">
          <input type="checkbox" id="ahp-peer-cost-toggle" />
          <span>Compare cost within the same seller tier<span class="ahp-settings-note">Is this candidate expensive vs. peers of similar rank/level, not just the cheapest overall?</span></span>
        </label>
      </div>
    </div>`;
  document.body.appendChild(panel);

  panel.querySelector("#ahp-panel-collapse-btn").addEventListener("click", () => {
    panelCollapsed = !panelCollapsed;
    panel.classList.toggle("ahp-collapsed", panelCollapsed);
    panel.querySelector("#ahp-panel-collapse-btn").textContent = panelCollapsed ? "+" : "–";
  });

  panel.querySelectorAll(".ahp-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab;
      renderPanelChrome(panel);
    });
  });

  const sliderIds = { Experience: "ahp-w-exp", Charisma: "ahp-w-char", Cost: "ahp-w-cost" };
  Object.entries(sliderIds).forEach(([key, id]) => {
    panel.querySelector(`#${id}`).addEventListener("input", () => {
      const raw = {
        Experience: Number(panel.querySelector("#ahp-w-exp").value),
        Charisma: Number(panel.querySelector("#ahp-w-char").value),
        Cost: Number(panel.querySelector("#ahp-w-cost").value),
      };
      const sum = raw.Experience + raw.Charisma + raw.Cost || 1;
      currentWeights = { Experience: raw.Experience / sum, Charisma: raw.Charisma / sum, Cost: raw.Cost / sum };
      saveWeights();
      scheduleRender();
    });
  });

  panel.querySelector("#ahp-peer-cost-toggle").addEventListener("change", (e) => {
    currentSettings = { ...currentSettings, peerRelativeCost: e.target.checked };
    saveSettings();
    scheduleRender();
  });

  panel.querySelector("#ahp-project-select").addEventListener("change", (e) => {
    shortlistProjects.activeId = e.target.value;
    saveShortlistProjects();
    scheduleRender();
  });

  panel.querySelector("#ahp-project-new").addEventListener("click", () => {
    const name = window.prompt("Name this project (e.g. a role, team, or client):", "New project");
    if (!name) return;
    const id = `proj-${Date.now()}`;
    shortlistProjects.projects[id] = { name, items: {} };
    shortlistProjects.activeId = id;
    saveShortlistProjects();
    scheduleRender();
  });

  return panel;
}

function renderPanelChrome(panel) {
  panel.querySelectorAll(".ahp-tab-btn").forEach((btn) => {
    btn.classList.toggle("ahp-tab-active", btn.dataset.tab === activeTab);
  });
  panel.querySelectorAll(".ahp-tab-panel").forEach((tp) => {
    tp.hidden = tp.dataset.tabPanel !== activeTab;
  });
}

function renderShortlistTab(panel) {
  const select = panel.querySelector("#ahp-project-select");
  select.innerHTML = Object.entries(shortlistProjects.projects)
    .map(([id, p]) => `<option value="${id}" ${id === shortlistProjects.activeId ? "selected" : ""}>${p.name}</option>`)
    .join("");

  const proj = activeProject();
  const items = proj ? Object.values(proj.items) : [];
  panel.querySelector("#ahp-shortlist-count").textContent = items.length ? items.length : "";

  const list = panel.querySelector("#ahp-shortlist-list");
  if (items.length === 0) {
    list.innerHTML = `<p class="ahp-panel-empty">No candidates shortlisted yet. Click "+ Shortlist" on any card.</p>`;
    return;
  }
  const candidates = items.map((it) => it.snapshot);
  const ranked = scoreVisible(candidates, currentWeights, currentSettings).sort(
    (a, b) => b.scores.final - a.scores.final
  );
  list.innerHTML = ranked
    .map((c, i) => {
      const meta = items.find((it) => it.snapshot.id === c.id);
      return `<div class="ahp-row ahp-shortlist-row">
        <span class="ahp-row-rank">${i + 1}</span>
        <span class="ahp-row-body">
          <span class="ahp-row-name" title="${c.name}">${c.name}</span>
          <span class="ahp-row-sub">${meta ? meta.contextLabel : ""}</span>
        </span>
        <span class="ahp-row-score">${c.scores.final.toFixed(2)}</span>
        <button type="button" class="ahp-row-remove" data-id="${c.id}" title="Remove from shortlist">✕</button>
      </div>`;
    })
    .join("");

  list.querySelectorAll(".ahp-row-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      removeFromShortlist(btn.dataset.id);
      scheduleRender();
    });
  });
}

function renderSettingsTab(panel) {
  panel.querySelector("#ahp-w-exp").value = Math.round(currentWeights.Experience * 100);
  panel.querySelector("#ahp-w-exp-val").textContent = currentWeights.Experience.toFixed(2);
  panel.querySelector("#ahp-w-char").value = Math.round(currentWeights.Charisma * 100);
  panel.querySelector("#ahp-w-char-val").textContent = currentWeights.Charisma.toFixed(2);
  panel.querySelector("#ahp-w-cost").value = Math.round(currentWeights.Cost * 100);
  panel.querySelector("#ahp-w-cost-val").textContent = currentWeights.Cost.toFixed(2);
  panel.querySelector("#ahp-peer-cost-toggle").checked = currentSettings.peerRelativeCost !== false;
}

function renderPanel(scoredRanked, totalOnPage) {
  const panel = ensurePanel();
  renderPanelChrome(panel);
  panel.querySelector("#ahp-panel-context").textContent = currentContext.label;

  // Ranking tab
  const decisionValues = Object.values(decisions);
  const discardedCount = decisionValues.filter((v) => v === "discarded").length;
  const proj = activeProject();
  const shortlistCount = proj ? Object.keys(proj.items).length : 0;
  panel.querySelector("#ahp-panel-summary").innerHTML =
    `<span><b>${totalOnPage}</b> on page</span><span><b>${shortlistCount}</b> shortlisted</span><span><b>${discardedCount}</b> discarded here</span>`;

  const list = panel.querySelector("#ahp-panel-list");
  if (scoredRanked.length === 0) {
    list.innerHTML = `<p class="ahp-panel-empty">No candidate cards recognized on this page yet.</p>`;
  } else {
    list.innerHTML = scoredRanked
      .slice(0, 25)
      .map((c, i) => {
        const shortlisted = isShortlisted(c.id);
        return `<div class="ahp-row" data-id="${i}">
          <span class="ahp-row-rank">${i + 1}</span>
          <span class="ahp-row-name" title="${c.name}">${shortlisted ? "★ " : ""}${c.name}</span>
          <span class="ahp-row-score">${c.scores.final.toFixed(2)}</span>
        </div>`;
      })
      .join("");

    list.querySelectorAll(".ahp-row").forEach((row, i) => {
      row.addEventListener("click", () => {
        const target = scoredRanked[i];
        if (target && target.cardEl) target.cardEl.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
  }

  renderShortlistTab(panel);
  renderSettingsTab(panel);
}

// ---------- main scan + render cycle ----------

function runScanAndRender() {
  const { cards, mode } = findAllCards();
  currentMode = mode;
  const parsed = cards.map(({ el, parsed }) => ({ ...parsed, cardEl: el }));

  const activePool = parsed.filter((c) => decisions[c.id] !== "discarded");
  const scoredActive = scoreVisible(activePool, currentWeights, currentSettings).sort(
    (a, b) => b.scores.final - a.scores.final
  );

  // Re-attach discarded ones (score doesn't matter, just for the overlay pass)
  const discardedOnes = parsed
    .filter((c) => decisions[c.id] === "discarded")
    .map((c) => ({ ...c, scores: { experience: 0, cost: 0, charisma: 0, final: 0 } }));

  const n = scoredActive.length;
  selfMutating = true;
  scoredActive.forEach((scored, idx) => {
    const rank = idx + 1;
    let tier = "ahp-card-tier-mid";
    if (n >= 3) {
      if (idx < Math.max(1, Math.ceil(n * 0.2))) tier = "ahp-card-tier-lead";
      else if (idx >= n - Math.max(1, Math.ceil(n * 0.2))) tier = "ahp-card-tier-trail";
    } else if (idx === 0) {
      tier = "ahp-card-tier-lead";
    }
    renderCardOverlay(scored.cardEl, scored, rank, tier);
  });
  discardedOnes.forEach((c) => renderCardOverlay(c.cardEl, c, "–", "ahp-card-tier-mid"));
  renderPanel(scoredActive, parsed.length);
  // Let the mutation observer settle before re-arming.
  requestAnimationFrame(() => {
    selfMutating = false;
  });
}

function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    runScanAndRender();
  });
}

// ---------- mutation observer (detects Fiverr's own filter/search re-renders) ----------

function isRealCardNode(node) {
  if (!(node instanceof Element)) return false;
  if (node.className && typeof node.className === "string" && node.className.startsWith("ahp-")) return false;
  return node.matches?.(CONFIRMED_CARD_SELECTOR) || !!node.querySelector?.(CONFIRMED_CARD_SELECTOR);
}

function startObserver() {
  const observer = new MutationObserver((mutations) => {
    if (selfMutating) return;
    if (currentMode === "generic") {
      // Generic mode has no cheap selector to check against — any childList
      // change on a page we're already treating as a grid is worth a
      // (debounced) re-scan.
      const anyChildlistChange = mutations.some((m) => m.addedNodes.length || m.removedNodes.length);
      if (anyChildlistChange) scheduleRender();
      return;
    }
    const relevant = mutations.some((m) =>
      [...m.addedNodes, ...m.removedNodes].some((n) => isRealCardNode(n))
    );
    if (relevant) scheduleRender();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// ---------- single-gig-page legacy button (kept for one-off deep scrape) ----------

function findFirstMatch(regex) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const t = node.textContent.trim();
    if (t && regex.test(t)) return t.match(regex);
  }
  return null;
}

function scrapeSingleGig() {
  const title = document.querySelector("h1")?.innerText?.trim() || document.title;
  const levelMatch = findFirstMatch(/^Level\s+(\d+)/i);
  const reviewCountMatch = findFirstMatch(/^(\d+)\s+reviews?$/i) || findFirstMatch(/\((\d+)\)/);
  const ratingMatch = findFirstMatch(/^(\d\.\d)$/);
  const priceMatch = findFirstMatch(/^[€$£]\s?[\d,.]+/);
  const deliveryMatch = findFirstMatch(/(\d+)\s*-?\s*day(?:s)?\s+delivery/i);
  const revisionMatch = findFirstMatch(/(\d+|unlimited)\s+Revisions?/i);
  return {
    id: location.href.split("?")[0],
    type: "manual-gig",
    name: title,
    title,
    sellerLevel: levelMatch ? parseInt(levelMatch[1], 10) : 0,
    totalReviewCount: reviewCountMatch ? parseInt(reviewCountMatch[1], 10) : null,
    reviewScore: ratingMatch ? parseFloat(ratingMatch[1]) : null,
    price: priceMatch ? parseFloat(priceMatch[0].replace(/[^\d.]/g, "")) : null,
    deliveryDays: deliveryMatch ? parseInt(deliveryMatch[1], 10) : null,
    revisions: revisionMatch
      ? isNaN(parseInt(revisionMatch[1], 10))
        ? "unlimited"
        : parseInt(revisionMatch[1], 10)
      : null,
    scrapedAt: new Date().toISOString(),
  };
}

function injectSingleGigButton() {
  if (document.getElementById("ahp-eval-btn")) return;
  const btn = document.createElement("button");
  btn.id = "ahp-eval-btn";
  btn.textContent = "+ Add to AHP Evaluation";
  Object.assign(btn.style, {
    position: "fixed",
    top: "90px",
    right: "20px",
    zIndex: 2147483647,
    background: "#1dbf73",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "10px 14px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
  });
  btn.addEventListener("click", () => {
    const gig = scrapeSingleGig();
    chrome.runtime.sendMessage({ type: "SAVE_MANUAL_GIG", gig }, (resp) => {
      btn.textContent = resp && resp.ok ? "✓ Added" : "Error - see console";
      setTimeout(() => (btn.textContent = "+ Add to AHP Evaluation"), 1500);
    });
  });
  document.body.appendChild(btn);
}

// ---------- boot ----------

function boot() {
  currentContext = detectContext();
  activeTab = "ranking";
  loadState(() => {
    const { cards } = findAllCards();
    if (cards.length >= 2) {
      runScanAndRender();
      startObserver();
    } else {
      document.getElementById("ahp-panel")?.remove();
      injectSingleGigButton();
      setInterval(injectSingleGigButton, 2000);
    }
  });
}

boot();

// Fiverr's SPA can swap the whole route (e.g. list A -> list B), or change
// the visible set via filters, without our content script reloading;
// re-detect context + re-init periodically as a cheap safety net alongside
// the MutationObserver.
let lastPath = location.href;
setInterval(() => {
  if (location.href !== lastPath) {
    lastPath = location.href;
    document.getElementById("ahp-panel")?.remove();
    boot();
  }
}, 1000);
