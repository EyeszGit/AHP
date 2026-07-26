// background.js (Manifest V3 service worker)
// Central storage for scraped candidates. Local-only for this MVP scaffold
// (see README "Data Management" section for what's still needed for GDPR-grade
// storage per the Extension Requirements doc).

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SAVE_GIG") {
    chrome.storage.local.get({ candidates: [] }, ({ candidates }) => {
      const existingIdx = candidates.findIndex((c) => c.url === msg.gig.url);
      if (existingIdx >= 0) {
        candidates[existingIdx] = msg.gig; // refresh existing entry
      } else {
        candidates.push(msg.gig);
      }
      chrome.storage.local.set({ candidates }, () => {
        sendResponse({ ok: true, count: candidates.length });
      });
    });
    return true; // keep the message channel open for the async sendResponse
  }

  if (msg.type === "DELETE_GIG") {
    chrome.storage.local.get({ candidates: [] }, ({ candidates }) => {
      const next = candidates.filter((c) => c.url !== msg.url);
      chrome.storage.local.set({ candidates: next }, () => sendResponse({ ok: true }));
    });
    return true;
  }
});
