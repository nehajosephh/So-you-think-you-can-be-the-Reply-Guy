const DEFAULT_REQUIRED = 3;

// --- 1. DEFINE FUNCTIONS FIRST (Prevents Reference Errors) ---

function isoDateToday() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60000;
  return (new Date(date - offset)).toISOString().slice(0, 10);
}

async function updateBadge() {
  try {
    const data = await chrome.storage.sync.get(["count", "requiredReplies"]);
    // Safety check: ensure data exists
    const count = (data && data.count) ? data.count : 0;
    const required = (data && data.requiredReplies) ? data.requiredReplies : DEFAULT_REQUIRED;
    
    await chrome.action.setBadgeText({ text: String(count) });
    
    if (count >= required) {
      await chrome.action.setBadgeBackgroundColor({ color: "#4CAF50" }); // Green
    } else {
      await chrome.action.setBadgeBackgroundColor({ color: "#333333" }); // Dark
    }
  } catch (e) {
    console.error("[ReplyGuy] Badge Update Error:", e);
  }
}

async function ensureDefaults() {
  try {
    const data = await chrome.storage.sync.get(["requiredReplies", "count", "lastResetDate"]);
    const updates = {};
    let needsUpdate = false;

    if (!data.requiredReplies) { updates.requiredReplies = DEFAULT_REQUIRED; needsUpdate = true; }
    if (data.count === undefined) { updates.count = 0; needsUpdate = true; }
    if (!data.lastResetDate) { updates.lastResetDate = isoDateToday(); needsUpdate = true; }

    if (needsUpdate) {
      await chrome.storage.sync.set(updates);
    }
    updateBadge();
  } catch (e) {
    console.error("[ReplyGuy] Defaults Error:", e);
  }
}

async function checkDailyReset() {
  try {
    const data = await chrome.storage.sync.get(["lastResetDate"]);
    const today = isoDateToday();
    
    if (!data.lastResetDate || data.lastResetDate !== today) {
      console.log("[ReplyGuy] New day. Resetting count.");
      await chrome.storage.sync.set({ count: 0, lastResetDate: today });
      updateBadge();
    }
  } catch (e) {
    console.error("[ReplyGuy] Reset Error:", e);
  }
}

// --- 2. BULLYING LOGIC ---
const ROASTS = [
  "Leaving already? You haven't hit your quota. Pathetic.",
  "Hey! Come back. The timeline needs your trash takes.",
  "Don't run away. Reply to someone.",
  "You thought you could leave? Ratio incoming.",
  "Zero replies? Are you even trying?",
  "Switching tabs? Cringe. Finish your replies."
];

async function bullyUser() {
  const data = await chrome.storage.sync.get(["count", "requiredReplies"]);
  const count = (data && data.count) ? data.count : 0;
  const required = (data && data.requiredReplies) ? data.requiredReplies : DEFAULT_REQUIRED;

  if (count < required) {
    const roast = ROASTS[Math.floor(Math.random() * ROASTS.length)];
    
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png', // MAKE SURE THIS FILE EXISTS
      title: 'Get Back To Work',
      message: `${roast} (${count}/${required})`,
      priority: 2,
      requireInteraction: true
    });
  }
}

// --- 3. LISTENERS (Attached after functions are defined) ---

chrome.runtime.onInstalled.addListener(() => {
  ensureDefaults();
  chrome.alarms.create("dailyCheck", { periodInMinutes: 15 });
});

chrome.runtime.onStartup.addListener(() => {
  ensureDefaults();
  checkDailyReset();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "dailyCheck") {
    checkDailyReset();
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'increment') {
    (async () => {
      try {
        await checkDailyReset();
        const data = await chrome.storage.sync.get(["count"]);
        const newCount = ((data && data.count) ? data.count : 0) + 1;
        await chrome.storage.sync.set({ count: newCount });
        updateBadge();
        sendResponse({ success: true, newCount });
      } catch (err) {
        console.error(err);
      }
    })();
    return true; // Keep channel open for async response
  }
  
  if (msg.type === 'USER_LEFT_TAB') {
    bullyUser();
  }
  
  if (msg.type === 'UPDATE_BADGE') {
    updateBadge();
  }
});