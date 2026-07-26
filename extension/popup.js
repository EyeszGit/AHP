// popup.js

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

function renderResults(candidates) {
  const container = document.getElementById("results");
  document.getElementById("count-badge").textContent = `${candidates.length} saved`;

  if (candidates.length === 0) {
    container.innerHTML = `<p class="empty">No candidates yet. Open a Fiverr gig page and click
      "+ Add to AHP Evaluation".</p>`;
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
          <a href="${c.url}" target="_blank" class="title">${c.title || c.url}</a>
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
        <button class="remove" data-url="${c.url}">&times;</button>
      </article>`;
    })
    .join("");

  container.querySelectorAll(".remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "DELETE_GIG", url: btn.dataset.url }, load);
    });
  });
}

function load() {
  chrome.storage.local.get({ candidates: [] }, ({ candidates }) => renderResults(candidates));
}

Object.values(sliders).forEach((s) =>
  s.addEventListener("input", () => {
    renderWeightLabels();
    load();
  })
);

document.getElementById("export-btn").addEventListener("click", () => {
  chrome.storage.local.get({ candidates: [] }, ({ candidates }) => {
    const ranked = window.AHPScoring.scoreCandidates(candidates, currentWeights());
    const rows = [
      ["Rank", "Title", "URL", "Final Score", "Experience", "Cost", "Charisma", "Price", "Delivery Days", "Revisions", "Seller Level", "Review Score", "Review Count"],
      ...ranked.map((c, i) => [
        i + 1, c.title, c.url, c.scores.final.toFixed(4), c.scores.experience.toFixed(4),
        c.scores.cost.toFixed(4), c.scores.charisma.toFixed(4), c.price, c.deliveryDays,
        c.revisions, c.sellerLevel, c.reviewScore, c.totalReviewCount,
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ahp-candidate-ranking.csv";
    a.click();
    URL.revokeObjectURL(url);
  });
});

document.getElementById("clear-btn").addEventListener("click", () => {
  if (!confirm("Remove all saved candidates?")) return;
  chrome.storage.local.set({ candidates: [] }, load);
});

renderWeightLabels();
load();
