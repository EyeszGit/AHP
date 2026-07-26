// content.js
// Runs on Fiverr gig pages. Scrapes the visible, human-readable text on the page
// instead of relying on Fiverr's obfuscated CSS class names (which change often
// and break class-name-based scrapers). This is slower but far more resilient.
//
// LIMITATION: a single gig page only ever shows ONE package's price/delivery/
// revisions at a time (Basic is shown by default; Standard/Premium require
// clicking the tab). This scaffold scrapes whichever tier is currently visible.
// A future iteration should click through all three tabs before saving.

function textOf(el) {
  return (el.innerText || el.textContent || "").trim();
}

function findFirstMatch(regex) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const t = node.textContent.trim();
    if (t && regex.test(t)) {
      const m = t.match(regex);
      return m;
    }
  }
  return null;
}

function scrapeGig() {
  const title = document.querySelector("h1")?.innerText?.trim() || document.title;

  const levelMatch = findFirstMatch(/^Level\s+(\d+)/i);
  const sellerLevel = levelMatch ? parseInt(levelMatch[1], 10) : 0; // 0 = New Seller / Top Rated not "Level N"

  const reviewCountMatch = findFirstMatch(/^(\d+)\s+reviews?$/i) || findFirstMatch(/\((\d+)\)/);
  const totalReviewCount = reviewCountMatch ? parseInt(reviewCountMatch[1], 10) : null;

  const ratingMatch = findFirstMatch(/^(\d\.\d)$/);
  const reviewScore = ratingMatch ? parseFloat(ratingMatch[1]) : null;

  const priceMatch = findFirstMatch(/^[€$£]\s?[\d,.]+/);
  const price = priceMatch ? parseFloat(priceMatch[0].replace(/[^\d.]/g, "")) : null;

  const deliveryMatch = findFirstMatch(/(\d+)\s*-?\s*day(?:s)?\s+delivery/i);
  const deliveryDays = deliveryMatch ? parseInt(deliveryMatch[1], 10) : null;

  const revisionMatch = findFirstMatch(/(\d+|unlimited)\s+Revisions?/i);
  const revisions = revisionMatch
    ? (isNaN(parseInt(revisionMatch[1], 10)) ? "unlimited" : parseInt(revisionMatch[1], 10))
    : null;

  return {
    url: window.location.href.split("?")[0],
    title,
    sellerLevel,
    totalReviewCount,
    reviewScore,
    price,
    deliveryDays,
    revisions,
    scrapedAt: new Date().toISOString(),
  };
}

function injectButton() {
  if (document.getElementById("ahp-eval-btn")) return;
  const btn = document.createElement("button");
  btn.id = "ahp-eval-btn";
  btn.textContent = "+ Add to AHP Evaluation";
  Object.assign(btn.style, {
    position: "fixed",
    top: "90px",
    right: "20px",
    zIndex: 999999,
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
    const gig = scrapeGig();
    chrome.runtime.sendMessage({ type: "SAVE_GIG", gig }, (resp) => {
      btn.textContent = resp && resp.ok ? "✓ Added" : "Error - see console";
      setTimeout(() => (btn.textContent = "+ Add to AHP Evaluation"), 1500);
    });
  });
  document.body.appendChild(btn);
}

// Fiverr is a single-page app; the button/host element can get removed on
// client-side navigation, so keep re-checking.
injectButton();
setInterval(injectButton, 2000);
