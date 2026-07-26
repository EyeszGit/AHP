// popup.js
//
// Two sections:
// 1. Manual candidates — from the legacy "+ Add to AHP Evaluation" button on
//    a single gig/profile page (full package detail: price/delivery/revisions).
// 2. Live grid contexts — every search/category/list page the in-page panel
//    has scored, with tracked/discarded counts and per-context CSV export
//    (pulled from the snapshots content.js stores alongside each decision).

const sliders = {
  Charisma: document.getElementById("w-charisma"),
  Experience: document.getElementById("w-experience"),
  Cost: document.getElementById("w-cost"),
};
const valLabels = {
  Charisma: document.getElementById("w-charisma-val"),
  Experience: document.getElementById("w-experience-val"),
  Cost: document.getElementById("w-cost-val"),
};

function currentWeights() {
  const raw = {
    Charisma: Number(sliders.Charisma.value),
    Experience: Number(sliders.Experience.value),
    Cost: Number(sliders.Cost.value),
  };
  const sum = raw.Charisma + raw.Experience + raw.Cost || 1;
  return {
    Charisma: raw.Charisma / sum,
    Experience: raw.Experience / sum,
    Cost: raw.Cost / sum,
  };
}

function renderWeightLabels() {
  const w = currentWeights();
  valLabels.Charisma.textContent = w.Charisma.toFixed(2);
  valLabels.Experience.textContent = w.Experience.toFixed(2);
  valLabels.Cost.textContent = w.Cost.toFixed(2);
}

function downloadCsv(rows, filename) {
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- Section 1: manual single-gig candidates ----------

function renderManualResults(candidates) {
  const container = document.getElementById("results");
  document.getElementById("count-badge").textContent = `${candidates.length} saved`;

  if (candidates.length === 0) {
    container.innerHTML = `<p class="empty">No candidates yet. Open a single Fiverr gig page and click
      "+ Add to AHP Evaluation" (grid pages like search/category/lists score automatically
      on the page itself — see the floating panel there instead).</p>`;
    return;
  }

  const ranked = window.AHPScoring.scoreCandidates(candidates, currentWeights());

  container.innerHTML = ranked
    .map((c, i) => {
      const s = c.scores;
      return `
      <article class="card ${i === 0 ? "best" : ""}">
        <div class="rank">#${i + 1}</div>
        <div class="body">
          <a href="${c.id}" target="_blank" class="title">${c.title || c.id}</a>
          <div class="meta">
            €${c.price ?? "?"} &middot; ${c.deliveryDays ?? "?"}d delivery &middot;
            ${c.revisions ?? "?"} revisions &middot; Level ${c.sellerLevel ?? 0} &middot;
            ${c.reviewScore ?? "?"}★ (${c.totalReviewCount ?? "?"})
          </div>
          <div class="bars">
            <div class="bar"><span>Charisma</span><progress max="1" value="${s.charisma}"></progress></div>
            <div class="bar"><span>Experience</span><progress max="1" value="${s.experience}"></progress></div>
            <div class="bar"><span>Cost</span><progress max="1" value="${s.cost}"></progress></div>
          </div>
        </div>
        <div class="score">${s.final.toFixed(3)}</div>
        <button class="remove" data-id="${c.id}">&times;</button>
      </article>`;
    })
    .join("");

  container.querySelectorAll(".remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "DELETE_MANUAL_GIG", id: btn.dataset.id }, loadAll);
    });
  });
}

// ---------- Section 2: live grid contexts ----------

function renderContexts(ahpContexts) {
  const container = document.getElementById("contexts");
  const keys = Object.keys(ahpContexts);
  if (keys.length === 0) {
    container.innerHTML = `<p class="empty">No search/category/list pages tracked yet. Visit one on
      pro.fiverr.com and use the floating panel's ★ / ✕ controls.</p>`;
    return;
  }

  container.innerHTML = keys
    .map((key) => {
      const ctx = ahpContexts[key];
      const decisions = ctx.decisions || {};
      const tracked = Object.values(decisions).filter((v) => v === "tracked").length;
      const discarded = Object.values(decisions).filter((v) => v === "discarded").length;
      return `
      <div class="ctx-row">
        <div class="ctx-label" title="${ctx.label}">${ctx.label}</div>
        <div class="ctx-counts">${tracked}★ / ${discarded}✕</div>
        <button class="ctx-export" data-key="${key}">Export</button>
      </div>`;
    })
    .join("");

  container.querySelectorAll(".ctx-export").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ctx = ahpContexts[btn.dataset.key];
      const snaps = ctx.snapshots || {};
      const rows = [
        ["Name", "Decision", "Final Score", "Experience", "Cost", "Charisma", "Price", "Rating", "Review Count"],
        ...Object.entries(snaps).map(([id, c]) => [
          c.name, ctx.decisions[id] || "", c.scores?.final?.toFixed(4), c.scores?.experience?.toFixed(4),
          c.scores?.cost?.toFixed(4), c.scores?.charisma?.toFixed(4), c.price, c.rating, c.reviewCount,
        ]),
      ];
      downloadCsv(rows, `ahp-${btn.dataset.key.replace(/[^a-z0-9]+/gi, "-")}.csv`);
    });
  });
}

// ---------- shared load/refresh ----------

function loadAll() {
  chrome.storage.local.get({ manualCandidates: [], ahpContexts: {} }, ({ manualCandidates, ahpContexts }) => {
    renderManualResults(manualCandidates);
    renderContexts(ahpContexts);
  });
}

Object.values(sliders).forEach((s) =>
  s.addEventListener("input", () => {
    renderWeightLabels();
    loadAll();
  })
);

document.getElementById("export-btn").addEventListener("click", () => {
  chrome.storage.local.get({ manualCandidates: [] }, ({ manualCandidates }) => {
    const ranked = window.AHPScoring.scoreCandidates(manualCandidates, currentWeights());
    const rows = [
      ["Rank", "Title", "URL", "Final Score", "Experience", "Cost", "Charisma", "Price", "Delivery Days", "Revisions", "Seller Level", "Review Score", "Review Count"],
      ...ranked.map((c, i) => [
        i + 1, c.title, c.id, c.scores.final.toFixed(4), c.scores.experience.toFixed(4),
        c.scores.cost.toFixed(4), c.scores.charisma.toFixed(4), c.price, c.deliveryDays,
        c.revisions, c.sellerLevel, c.reviewScore, c.totalReviewCount,
      ]),
    ];
    downloadCsv(rows, "ahp-manual-candidates.csv");
  });
});

document.getElementById("clear-btn").addEventListener("click", () => {
  if (!confirm("Remove all manually-added candidates? (Grid context tracking is left untouched.)")) return;
  chrome.storage.local.set({ manualCandidates: [] }, loadAll);
});

renderWeightLabels();
loadAll();
