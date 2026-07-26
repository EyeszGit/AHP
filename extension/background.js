// background.js (Manifest V3 service worker)
//
// Grid-mode data (per-context tracked/discarded decisions, live weights) is
// written directly by content.js via chrome.storage.local — no background
// round-trip needed for that.
//
// This service worker only handles the legacy single-gig-page "manual add"
// flow (content.js's injectSingleGigButton), storing scraped single gigs
// under the "manualCandidates" key so the popup can list/export them.

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SAVE_MANUAL_GIG") {
    chrome.storage.local.get({ manualCandidates: [] }, ({ manualCandidates }) => {
      const idx = manualCandidates.findIndex((c) => c.id === msg.gig.id);
      if (idx >= 0) manualCandidates[idx] = msg.gig;
      else manualCandidates.push(msg.gig);
      chrome.storage.local.set({ manualCandidates }, () => {
        sendResponse({ ok: true, count: manualCandidates.length });
      });
    });
    return true;
  }

  if (msg.type === "DELETE_MANUAL_GIG") {
    chrome.storage.local.get({ manualCandidates: [] }, ({ manualCandidates }) => {
      const next = manualCandidates.filter((c) => c.id !== msg.id);
      chrome.storage.local.set({ manualCandidates: next }, () => sendResponse({ ok: true }));
    });
    return true;
  }
});
