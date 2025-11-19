const DEFAULT_REQUIRED = 3;

// --- INITIALIZATION ---
chrome.runtime.onInstalled.addListener(() => {
  ensureDefaults();
  // Check date every 15 minutes to handle auto-reset reliably
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

// --- CORE LOGIC ---
async function ensureDefaults() {
  const data = await chrome.storage.sync.get(["requiredReplies", "count", "lastResetDate"]);
  if (!data.requiredReplies) await chrome.storage.sync.set({ requiredReplies: DEFAULT_REQUIRED });
  if (data.count == null) await chrome.storage.sync.set({ count: 0 });
  if (!data.lastResetDate) await chrome.storage.sync.set({ lastResetDate: isoDateToday() });
  updateBadge();
}

function isoDateToday() {
  // Returns YYYY-MM-DD in local time
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60000;
  return (new Date(date - offset)).toISOString().slice(0, 10);
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
    console.error("[ReplyGuy] Reset check error:", e);
  }
}

async function updateBadge() {
  const data = await chrome.storage.sync.get(["count", "requiredReplies"]);
  const count = data.count || 0;
  const required = data.requiredReplies || DEFAULT_REQUIRED;
  
  chrome.action.setBadgeText({ text: String(count) });
  
  if (count >= required) {
    chrome.action.setBadgeBackgroundColor({ color: "#4CAF50" }); // Green
  } else {
    chrome.action.setBadgeBackgroundColor({ color: "#333333" }); // Dark
  }
}

// --- BULLYING LOGIC ---
const ROASTS = [
  "Leaving X already? You haven't hit your quota. Pathetic.",
  "Hey! Come back. The timeline needs your trash takes.",
  "Don't run away. Reply to someone. Be a man.",
  "You thought you could leave? Ratio incoming.",
  "Zero replies? Are you even trying to be the Reply Guy?",
  "Switching tabs? Cringe. Finish your replies.",
  "Focus. You have a job to do here."
];

async function bullyUser() {
  const data = await chrome.storage.sync.get(["count", "requiredReplies"]);
  const count = data.count || 0;
  const required = data.requiredReplies || DEFAULT_REQUIRED;

  if (count < required) {
    const randomRoast = ROASTS[Math.floor(Math.random() * ROASTS.length)];
    
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png', // Make sure you have an icon.png in the root
      title: 'Get Back To Work',
      message: `${randomRoast} (${count}/${required} completed)`,
      priority: 2
    });
  }
}

// --- MESSAGE HANDLING ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'increment') {
    (async () => {
      await checkDailyReset(); // Ensure we are in the right day before counting
      const data = await chrome.storage.sync.get(["count"]);
      const newCount = (data.count || 0) + 1;
      await chrome.storage.sync.set({ count: newCount });
      updateBadge();
      sendResponse({ success: true, newCount });
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