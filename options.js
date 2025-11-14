// options.js - powers the cleaner options UI for Reply Guy extension

const requiredEl = document.getElementById('requiredReplies');
const currentCountEl = document.getElementById('currentCount');
const resetBtn = document.getElementById('resetCount');
const saveBtn = document.getElementById('saveBtn');
const statusEl = document.getElementById('status');
const helpLink = document.getElementById('helpLink');

function showStatus(text, transient = true) {
  statusEl.innerText = text;
  if (transient) {
    setTimeout(() => { statusEl.innerText = 'Saved'; }, 1800);
  }
}

async function load() {
  const data = await chrome.storage.sync.get(['requiredReplies', 'count', 'lastResetDate']);
  requiredEl.value = data.requiredReplies || 3;
  currentCountEl.innerText = (data.count != null) ? String(data.count) : '0';
  showStatus('Loaded', true);
}

saveBtn.addEventListener('click', async () => {
  let v = parseInt(requiredEl.value, 10);
  if (!v || v < 1) v = 1;
  await chrome.storage.sync.set({ requiredReplies: v });
  showStatus('Saved', true);
  // update badge via storage change event; also send a message if needed
  try { chrome.runtime.sendMessage({ type: 'refreshBadge' }); } catch(e){/*ignore*/ }
});

resetBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'resetCount' });
  // small delay to show the storage update
  setTimeout(async () => {
    const data = await chrome.storage.sync.get(['count']);
    currentCountEl.innerText = (data.count != null) ? String(data.count) : '0';
    showStatus('Reset', true);
  }, 250);
});

// Live update current count when storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.count) {
    currentCountEl.innerText = String(changes.count.newValue || 0);
  }
  if (area === 'sync' && changes.requiredReplies) {
    requiredEl.value = changes.requiredReplies.newValue;
  }
});

helpLink.addEventListener('click', (e) => {
  e.preventDefault();
  // open a simple help popup / tutorial page — for now open a new tab to chrome extensions page for debug tips
  chrome.tabs.create({ url: 'https://support.google.com/chrome/answer/187443?hl=en' });
});

load();
