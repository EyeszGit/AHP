// content.js — v0.2
//
// Runs on fiverr.com and pro.fiverr.com. Two modes:
//
// 1) GRID MODE (search results, category pages, saved "Freelance network"
//    lists): auto-detects every visible candidate card, scores them live
//    against each other with the AHP model, and overlays a rank/score badge
//    + track/discard controls directly on each card, plus a floating stats
//    panel. Re-scans whenever Fiverr's own filters change the visible set
//    (Fiverr is an SPA — filtering doesn't reload the page).
//
// 2) SINGLE-GIG MODE (an individual gig or freelancer profile page): keeps
//    the older "+ Add to AHP Evaluation" button for pulling one candidate's
//    full package details (price/delivery/revisions) into the "manual"
//    bucket, viewable from the popup.
//
// Selectors were confirmed against live pages on 2026-07-26:
//   - `.listings-expert-card-container` = Fiverr Pro's unified card, reused
//     across Pro-catalog search, category pages, AND saved lists.
//   - `.gig-wrapper.basic-gig-card` = the classic gig-grid card, used by
//     "Full catalog" search on pro.fiverr.com (and the same component family
//     on www.fiverr.com).
// Fiverr redesigns these periodically — if the overlay stops appearing,
// these are the two selectors to re-check first (see README troubleshooting).

const PRO_CARD_SELECTOR = ".listings-expert-card-container";
const GIG_CARD_SELECTOR = ".gig-wrapper.basic-gig-card";
const CARD_SELECTOR = `${PRO_CARD_SELECTOR}, ${GIG_CARD_SELECTOR}`;

// ---------- helpers ----------

// IMPORTANT: cards get re-parsed on every re-render (MutationObserver fires,
// track/discard clicked, weights changed, etc.) and by then the card already
// contains OUR OWN injected .ahp-badge / .ahp-controls as real DOM children.
// Every leaf-text scan must exclude those, or a re-parse picks up "★ / ☆ / ✕"
// as if they were page content and corrupts name/title detection.
function isAhpInjected(n) {
  return !!n.closest?.(".ahp-badge, .ahp-controls");
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

// ---------- card parsers ----------

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

function parseCard(el) {
  try {
    if (el.matches(PRO_CARD_SELECTOR)) return parseProCard(el);
    if (el.matches(GIG_CARD_SELECTOR)) return parseGigCard(el);
  } catch (e) {
    console.warn("[AHP] card parse failed", e);
  }
  return null;
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

  return { key: `page:${path}`, label: "This page" };
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

function scoreVisible(candidates, weights) {
  const levels = candidates.map((c) => c.sellerLevel);
  const reviews = candidates.map((c) => c.reviewCount);
  const prices = candidates.map((c) => c.price);
  const ratings = candidates.map((c) => c.rating);

  const nLevel = minMax(levels, true);
  const nReview = minMax(reviews, true);
  const nCost = minMax(prices, false);
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

let currentContext = null;
let currentWeights = { Experience: 0.5904, Cost: 0.1312, Charisma: 0.2783 };
let decisions = {}; // candidateId -> 'tracked' | 'discarded'
let snapshots = {}; // candidateId -> last-seen candidate data (survives leaving the page)
let panelCollapsed = false;
let renderScheduled = false;
let selfMutating = false;

function loadState(cb) {
  chrome.storage.local.get({ ahpWeights: currentWeights, ahpContexts: {} }, (data) => {
    currentWeights = data.ahpWeights;
    const ctxData = data.ahpContexts[currentContext.key];
    decisions = (ctxData && ctxData.decisions) || {};
    snapshots = (ctxData && ctxData.snapshots) || {};
    cb && cb();
  });
}

function saveWeights() {
  chrome.storage.local.set({ ahpWeights: currentWeights });
}

// snapshot: pass the scored candidate object when marking tracked/discarded so
// the popup can still show/export it after the user leaves this page.
function saveDecisions(id, snapshot) {
  if (snapshot) snapshots[id] = snapshot;
  chrome.storage.local.get({ ahpContexts: {} }, (data) => {
    data.ahpContexts[currentContext.key] = { label: currentContext.label, decisions, snapshots };
    chrome.storage.local.set({ ahpContexts: data.ahpContexts });
  });
}

// ---------- rendering: per-card overlay ----------

function renderCardOverlay(cardEl, scored, rank, tierClass) {
  cardEl.classList.add("ahp-anchor");
  cardEl.querySelectorAll(":scope > .ahp-badge, :scope > .ahp-controls").forEach((n) => n.remove());
  cardEl.classList.remove("ahp-card-tier-lead", "ahp-card-tier-mid", "ahp-card-tier-trail", "ahp-card-discarded");

  const decision = decisions[scored.id];
  if (decision === "discarded") {
    cardEl.classList.add("ahp-card-discarded");
  } else {
    cardEl.classList.add(tierClass);
  }

  const badge = document.createElement("div");
  badge.className = `ahp-badge ${rank === 1 ? "ahp-rank-1" : ""}`;
  badge.innerHTML = `#${rank} <span class="ahp-score">${scored.scores.final.toFixed(2)}</span>`;
  cardEl.prepend(badge);

  const snapshot = { ...scored };
  delete snapshot.cardEl;

  const controls = document.createElement("div");
  controls.className = "ahp-controls";
  const trackBtn = document.createElement("button");
  trackBtn.textContent = decision === "tracked" ? "★" : "☆";
  trackBtn.title = "Track this candidate";
  trackBtn.className = decision === "tracked" ? "ahp-active-track" : "";
  trackBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    decisions[scored.id] = decision === "tracked" ? undefined : "tracked";
    if (!decisions[scored.id]) delete decisions[scored.id];
    saveDecisions(scored.id, snapshot);
    scheduleRender();
  });

  const discardBtn = document.createElement("button");
  discardBtn.textContent = "✕";
  discardBtn.title = "Discard from ranking";
  discardBtn.className = decision === "discarded" ? "ahp-active-discard" : "";
  discardBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    decisions[scored.id] = decision === "discarded" ? undefined : "discarded";
    if (!decisions[scored.id]) delete decisions[scored.id];
    saveDecisions(scored.id, snapshot);
    scheduleRender();
  });

  controls.append(trackBtn, discardBtn);
  cardEl.prepend(controls);
}

// ---------- rendering: floating panel ----------

function ensurePanel() {
  let panel = document.getElementById("ahp-panel");
  if (panel) return panel;
  panel = document.createElement("div");
  panel.id = "ahp-panel";
  panel.innerHTML = `
    <div class="ahp-panel-header">
      <strong>AHP ranking</strong>
      <span id="ahp-panel-context"></span>
    </div>
    <div class="ahp-panel-body">
      <div class="ahp-panel-weights">
        <div class="ahp-weight-row"><label>Experience</label><input type="range" id="ahp-w-exp" min="0" max="100" /><span id="ahp-w-exp-val"></span></div>
        <div class="ahp-weight-row"><label>Charisma</label><input type="range" id="ahp-w-char" min="0" max="100" /><span id="ahp-w-char-val"></span></div>
        <div class="ahp-weight-row"><label>Cost</label><input type="range" id="ahp-w-cost" min="0" max="100" /><span id="ahp-w-cost-val"></span></div>
      </div>
      <div class="ahp-panel-summary" id="ahp-panel-summary"></div>
      <div id="ahp-panel-list"></div>
    </div>`;
  document.body.appendChild(panel);

  panel.querySelector(".ahp-panel-header").addEventListener("click", () => {
    panelCollapsed = !panelCollapsed;
    panel.classList.toggle("ahp-collapsed", panelCollapsed);
  });

  const sliderIds = { Experience: "ahp-w-exp", Charisma: "ahp-w-char", Cost: "ahp-w-cost" };
  Object.entries(sliderIds).forEach(([key, id]) => {
    panel.querySelector(`#${id}`).addEventListener("input", (e) => {
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

  return panel;
}

function renderPanel(scoredRanked, totalOnPage) {
  const panel = ensurePanel();
  panel.querySelector("#ahp-panel-context").textContent = currentContext.label;

  panel.querySelector("#ahp-w-exp").value = Math.round(currentWeights.Experience * 100);
  panel.querySelector("#ahp-w-exp-val").textContent = currentWeights.Experience.toFixed(2);
  panel.querySelector("#ahp-w-char").value = Math.round(currentWeights.Charisma * 100);
  panel.querySelector("#ahp-w-char-val").textContent = currentWeights.Charisma.toFixed(2);
  panel.querySelector("#ahp-w-cost").value = Math.round(currentWeights.Cost * 100);
  panel.querySelector("#ahp-w-cost-val").textContent = currentWeights.Cost.toFixed(2);

  // Count straight from `decisions`, not from scoredRanked — discarded
  // candidates are already filtered OUT of scoredRanked by design, so
  // counting them from that array would always read zero.
  const decisionValues = Object.values(decisions);
  const trackedCount = decisionValues.filter((v) => v === "tracked").length;
  const discardedCount = decisionValues.filter((v) => v === "discarded").length;
  panel.querySelector("#ahp-panel-summary").innerHTML =
    `<span><b>${totalOnPage}</b> on page</span><span><b>${trackedCount}</b> tracked</span><span><b>${discardedCount}</b> discarded</span>`;

  const list = panel.querySelector("#ahp-panel-list");
  if (scoredRanked.length === 0) {
    list.innerHTML = `<p class="ahp-panel-empty">No candidate cards recognized on this page yet.</p>`;
    return;
  }
  list.innerHTML = scoredRanked
    .slice(0, 25)
    .map((c, i) => {
      const isDiscarded = decisions[c.id] === "discarded";
      return `<div class="ahp-row ${isDiscarded ? "ahp-discarded-row" : ""}" data-id="${i}">
        <span class="ahp-row-rank">${i + 1}</span>
        <span class="ahp-row-name" title="${c.name}">${c.name}</span>
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

// ---------- main scan + render cycle ----------

function runScanAndRender() {
  const cardEls = [...document.querySelectorAll(CARD_SELECTOR)];
  const parsed = [];
  for (const el of cardEls) {
    const data = parseCard(el);
    if (data) parsed.push({ ...data, cardEl: el });
  }

  const activePool = parsed.filter((c) => decisions[c.id] !== "discarded");
  const scoredActive = scoreVisible(activePool, currentWeights).sort((a, b) => b.scores.final - a.scores.final);

  // Re-attach discarded ones (score doesn't matter, just for the panel list / overlay pass)
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
  return node.matches?.(CARD_SELECTOR) || !!node.querySelector?.(CARD_SELECTOR);
}

function startObserver() {
  const observer = new MutationObserver((mutations) => {
    if (selfMutating) return;
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
  loadState(() => {
    const hasCards = document.querySelector(CARD_SELECTOR);
    if (hasCards) {
      runScanAndRender();
      startObserver();
    } else {
      injectSingleGigButton();
      setInterval(injectSingleGigButton, 2000);
    }
  });
}

boot();

// Fiverr's SPA can swap the whole route (e.g. list A -> list B) without our
// content script reloading; re-detect context + re-init periodically as a
// cheap safety net alongside the MutationObserver.
let lastPath = location.href;
setInterval(() => {
  if (location.href !== lastPath) {
    lastPath = location.href;
    document.getElementById("ahp-panel")?.remove();
    boot();
  }
}, 1000);
