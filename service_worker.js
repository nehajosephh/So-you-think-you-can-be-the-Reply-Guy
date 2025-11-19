const DEFAULT_REQUIRED = 3;

// --- HELPER FUNCTIONS ---

function isoDateToday() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60000;
  return (new Date(date - offset)).toISOString().slice(0, 10);
}

async function updateBadge() {
  try {
    const data = await chrome.storage.sync.get(["count", "requiredReplies"]);
    const count = data.count || 0;
    const required = data.requiredReplies || DEFAULT_REQUIRED;
    
    chrome.action.setBadgeText({ text: String(count) });
    
    if (count >= required) {
      chrome.action.setBadgeBackgroundColor({ color: "#4CAF50" }); // Green
    } else {
      chrome.action.setBadgeBackgroundColor({ color: "#333333" }); // Dark
    }
  } catch (e) {
    console.error(e);
  }
}

async function ensureDefaults() {
  try {
    const data = await chrome.storage.sync.get(["requiredReplies", "count", "lastResetDate"]);
    if (!data.requiredReplies) await chrome.storage.sync.set({ requiredReplies: DEFAULT_REQUIRED });
    if (data.count == null) await chrome.storage.sync.set({ count: 0 });
    if (!data.lastResetDate) await chrome.storage.sync.set({ lastResetDate: isoDateToday() });
    updateBadge();
  } catch (e) {
    console.error("Defaults error", e);
  }
}

async function checkDailyReset() {
  try {
    const data = await chrome.storage.sync.get(["lastResetDate"]);
    const today = isoDateToday();
    
    if (!data.lastResetDate || data.lastResetDate !== today) {
      console.log("[ReplyGuy] New day detected. Resetting count.");
      await chrome.storage.sync.set({ count: 0, lastResetDate: today });
      updateBadge();
    }
  } catch (e) {
    console.error("Reset error", e);
  }
}

// --- BULLYING LOGIC ---
const ROASTS = [
  "Leaving already? You haven't hit your quota.",
  "Hey! Come back. The timeline needs your takes.",
  "Don't run away. Reply to someone.",
  "You thought you could leave? Ratio incoming.",
  "Zero replies? Are you even trying?",
  "Switching tabs? Cringe. Finish your replies."
];

async function bullyUser() {
  const data = await chrome.storage.sync.get(["count", "requiredReplies"]);
  const count = data.count || 0;
  const required = data.requiredReplies || DEFAULT_REQUIRED;

  if (count < required) {
    const roast = ROASTS[Math.floor(Math.random() * ROASTS.length)];
    
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png', 
      title: 'Get Back To Work',
      message: `${roast} (${count}/${required})`,
      priority: 2
    });
  }
}

// --- LISTENERS ---

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
        const newCount = (data.count || 0) + 1;
        await chrome.storage.sync.set({ count: newCount });
        updateBadge();
        sendResponse({ success: true, newCount });
      } catch (err) {
        console.error(err);
      }
    })();
    return true; // Async response
  }
  
  if (msg.type === 'USER_LEFT_TAB') {
    bullyUser();
  }
  
  if (msg.type === 'UPDATE_BADGE') {
    updateBadge();
  }
});