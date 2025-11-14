// service_worker.js
const DEFAULT_REQUIRED = 3;


async function ensureDefaults() {
const data = await chrome.storage.sync.get(["requiredReplies", "count", "lastResetDate"]);
if (data.requiredReplies == null) await chrome.storage.sync.set({ requiredReplies: DEFAULT_REQUIRED });
if (data.count == null) await chrome.storage.sync.set({ count: 0 });
if (!data.lastResetDate) await chrome.storage.sync.set({ lastResetDate: new Date().toISOString().slice(0,10) });
updateBadge();
}


function isoDateToday() {
return new Date().toISOString().slice(0,10);
}


async function maybeDailyReset() {
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
}


async function updateBadge() {
const data = await chrome.storage.sync.get(["count", "requiredReplies"]);
const count = data.count || 0;
const required = data.requiredReplies || DEFAULT_REQUIRED;
const text = String(count);
chrome.action.setBadgeText({ text });
chrome.action.setBadgeBackgroundColor({ color: [60,60,60,255] });
chrome.action.setTitle({ title: `Replies: ${count} / ${required}` });
}


chrome.runtime.onInstalled.addListener(() => {
ensureDefaults();
});


chrome.runtime.onStartup.addListener(() => {
ensureDefaults();
});


// Listen for increments from content script
chrome.runtime.onMessage.addListener(async (msg, sender) => {
if (msg && msg.type === 'increment') {
await maybeDailyReset();
const data = await chrome.storage.sync.get(["count"]);
const newCount = (data.count || 0) + 1;
await chrome.storage.sync.set({ count: newCount });
updateBadge();
}
if (msg && msg.type === 'resetCount') {
await chrome.storage.sync.set({ count: 0, lastResetDate: isoDateToday() });
updateBadge();
}
});


// Also expose a short command to refresh badge when options change
chrome.storage.onChanged.addListener(() => updateBadge());


// Periodic check for daily reset (simple interval)
setInterval(maybeDailyReset, 1000 * 60 * 30); // every 30 minutes