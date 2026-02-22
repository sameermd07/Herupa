// content.js — Herupa extension
// Loaded automatically on LeetCode and TUF+ problem pages.
// Actual data extraction happens via scripting.executeScript in popup.js

let lastUrl = location.href;

new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    chrome.runtime.sendMessage({ type: 'URL_CHANGED', url: lastUrl });
  }
}).observe(document.body, { subtree: true, childList: true });

console.log('[Herupa] Ready on:', window.location.href);