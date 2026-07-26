// scoring.js
// Ports the AHP scoring logic validated in the "Fiverr's Candidate Evaluation"
// Google Sheet (tab: AHP Results) into the extension. Same shape of model:
// 3 top-level criteria (Experience, Cost, Charisma), equal-weighted leaves
// within each group, min-max normalization, best-tier-not-applicable here
// because the content script only captures the currently-open package tier.
//
// Default top-level weights match Ray's stated AHP judgment:
//   Charisma > Experience > Cost, Charisma vs Cost = 4.5x (moderate),
//   Experience placed at the consistent geometric midpoint (sqrt(4.5)).
const DEFAULT_WEIGHTS = { Experience: 0.2783, Cost: 0.1312, Charisma: 0.5904 };

function minMaxNormalize(values, higherIsBetter = true) {
  const nums = values.map((v) => (typeof v === "number" && !isNaN(v) ? v : null));
  const present = nums.filter((v) => v !== null);
  if (present.length === 0) return nums.map(() => 0.5);
  const min = Math.min(...present);
  const max = Math.max(...present);
  return nums.map((v) => {
    if (v === null) return 0.5; // neutral score for missing data
    if (max === min) return 1;
    const n = (v - min) / (max - min);
    return higherIsBetter ? n : 1 - n;
  });
}

function revisionsToNumber(revisions) {
  if (revisions === "unlimited") return 999; // treat as effectively best
  if (typeof revisions === "number") return revisions;
  return null;
}

// candidates: array of scraped gig objects from background storage
// weights: { Experience, Cost, Charisma } summing to 1 (not enforced, just used as given)
function scoreCandidates(candidates, weights = DEFAULT_WEIGHTS) {
  const sellerLevels = candidates.map((c) => c.sellerLevel ?? 0);
  const reviewCounts = candidates.map((c) => c.totalReviewCount);
  const reviewScores = candidates.map((c) => c.reviewScore);
  const prices = candidates.map((c) => c.price);
  const deliveryDays = candidates.map((c) => c.deliveryDays);
  const revisionsNum = candidates.map((c) => revisionsToNumber(c.revisions));
  const costPerDay = candidates.map((c, i) =>
    c.price != null && c.deliveryDays ? c.price / c.deliveryDays : null
  );

  const nSellerLevel = minMaxNormalize(sellerLevels, true);
  const nReviewCount = minMaxNormalize(reviewCounts, true);
  const nReviewScore = minMaxNormalize(reviewScores, true);
  const nCostPerDay = minMaxNormalize(costPerDay, false);
  const nPrice = minMaxNormalize(prices, false);
  const nRevisions = minMaxNormalize(revisionsNum, true);

  return candidates
    .map((c, i) => {
      const experience = (nSellerLevel[i] + nReviewCount[i]) / 2;
      const cost = (nCostPerDay[i] + nPrice[i] + nRevisions[i]) / 3;
      const charisma = nReviewScore[i];
      const final =
        weights.Experience * experience + weights.Cost * cost + weights.Charisma * charisma;
      return { ...c, scores: { experience, cost, charisma, final } };
    })
    .sort((a, b) => b.scores.final - a.scores.final);
}

// Exposed for popup.js (classic script include, no bundler in this scaffold)
window.AHPScoring = { scoreCandidates, DEFAULT_WEIGHTS };
