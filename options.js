const requiredEl = document.getElementById('requiredReplies');
const currentCountEl = document.getElementById('currentCount');
const resetBtn = document.getElementById('resetCount');


async function load() {
const data = await chrome.storage.sync.get(["requiredReplies","count"]);
requiredEl.value = data.requiredReplies || 3;
currentCountEl.innerText = (data.count || 0);
}


requiredEl.addEventListener('change', async () => {
const v = parseInt(requiredEl.value, 10) || 1;
await chrome.storage.sync.set({ requiredReplies: v });
chrome.runtime.sendMessage({ type: 'refreshBadge' });
});


resetBtn.addEventListener('click', async () => {
await chrome.runtime.sendMessage({ type: 'resetCount' });
const data = await chrome.storage.sync.get(["count"]);
currentCountEl.innerText = (data.count || 0);
});


load();


// Update current count if changed elsewhere
chrome.storage.onChanged.addListener((changes) => {
if (changes.count) currentCountEl.innerText = (changes.count.newValue || 0);
});