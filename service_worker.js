// service_worker.js
const DEFAULT_REQUIRED = 3;

console.log("[ReplyGuy] Service worker starting...");

async function ensureDefaults() {
  try {
    const data = await chrome.storage.sync.get(["requiredReplies", "count", "lastResetDate"]);
    if (data.requiredReplies == null) await chrome.storage.sync.set({ requiredReplies: DEFAULT_REQUIRED });
    if (data.count == null) await chrome.storage.sync.set({ count: 0 });
    if (!data.lastResetDate) await chrome.storage.sync.set({ lastResetDate: new Date().toISOString().slice(0,10) });
    updateBadge();
  } catch (err) {
    console.error("[ReplyGuy] ensureDefaults error:", err);
  }
}

function isoDateToday() {
  return new Date().toISOString().slice(0,10);
}

async function maybeDailyReset() {
  try {
    const data = await chrome.storage.sync.get(["lastResetDate"]);
    const today = isoDateToday();
    if (!data.lastResetDate) {
      await chrome.storage.sync.set({ lastResetDate: today });
      return;
    }
    if (data.lastResetDate !== today) {
      await chrome.storage.sync.set({ count: 0, lastResetDate: today });
      updateBadge();
    }
  } catch (err) {
    console.error("[ReplyGuy] maybeDailyReset error:", err);
  }
}

async function updateBadge() {
  try {
    const data = await chrome.storage.sync.get(["count", "requiredReplies"]);
    const count = data.count || 0;
    const required = data.requiredReplies || DEFAULT_REQUIRED;
    const text = String(count);
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color: [60,60,60,255] });
    chrome.action.setTitle({ title: `Replies: ${count} / ${required}` });
  } catch (err) {
    console.error("[ReplyGuy] updateBadge error:", err);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("[ReplyGuy] Extension installed");
  ensureDefaults();
});

chrome.runtime.onStartup.addListener(() => {
  console.log("[ReplyGuy] Extension startup");
  ensureDefaults();
});

// Listen for increments from content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'increment') {
    (async () => {
      try {
        await maybeDailyReset();
        const data = await chrome.storage.sync.get(["count"]);
        const newCount = (data.count || 0) + 1;
        await chrome.storage.sync.set({ count: newCount });
        await updateBadge();
        console.log("[ReplyGuy] Reply counted! New count:", newCount);
        sendResponse({ success: true, count: newCount });
      } catch (err) {
        console.error("[ReplyGuy] Error incrementing count:", err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // Keep channel open for async response
  }
  if (msg && msg.type === 'resetCount') {
    (async () => {
      try {
        await chrome.storage.sync.set({ count: 0, lastResetDate: isoDateToday() });
        await updateBadge();
        sendResponse({ success: true });
      } catch (err) {
        console.error("[ReplyGuy] Error resetting count:", err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
});

// Also respond to storage changes (content script updates count directly now)
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && (changes.count || changes.requiredReplies)) {
    console.log("[ReplyGuy] Storage changed, updating badge");
    updateBadge();
  }
});

// Periodic check for daily reset (every 30 minutes)
setInterval(maybeDailyReset, 1000 * 60 * 30);

// Ensure defaults are set when service worker starts
ensureDefaults();

console.log("[ReplyGuy] Service worker ready");