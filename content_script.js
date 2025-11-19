// So You Think You Can Be The Reply Guy — Content Script
// Features: Smart Reply Detection + Tab Switching Bullying

(function () {
  const DEBUG = false;
  const SITES = ["x.com", "twitter.com"];

  // --- 1. HELPER: Logging & Error Suppression ---
  window.addEventListener('error', function(e) {
    if (e.message && e.message.includes('Extension context invalidated')) {
      e.preventDefault();
      e.stopPropagation();
      return true;
    }
  }, true);

  function log(...args) { if (DEBUG) console.debug("[ReplyGuy]", ...args); }

  // --- 2. DETECTION SELECTORS ---
  const REPLY_OPENER_SELECTORS = [
    '[data-testid="reply"]',
    '[data-testid="replyButton"]',
    'div[aria-label*="Reply"]',
    'div[role="button"][data-testid*="reply"]',
    'button[aria-label*="Reply"]'
  ];

  const SUBMIT_BUTTON_SELECTORS = [
    'button[data-testid="tweetButton"]',
    'button[data-testid="tweetButtonInline"]',
    '[data-testid="tweetButton"]',
    '[data-testid="tweetButtonInline"]',
    'div[role="button"][aria-label*="Post"]',
    'button[aria-label*="Post"]',
    'div[aria-label*="Post"]'
  ];

  // --- 3. STATE ---
  let openerTokenCounter = 1;
  let originalTitle = document.title;

  // --- 4. COMMUNICATION ---
  function sendIncrement() {
    try {
      chrome.runtime.sendMessage({ type: 'increment' }, (res) => {
        log("Increment sent, new count:", res?.newCount);
        // Update local title immediately if we are currently bullying
        if (document.title.includes("COME BACK")) {
           document.title = "X"; // Reset title temporarily
        }
      });
    } catch (err) {
      log("Send increment failed (context lost?):", err);
    }
  }

  // --- 5. TAB SWITCH BULLYING LOGIC ---
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === 'hidden') {
      checkQuotaAndBully();
    } else {
      // User returned
      if (originalTitle && !document.title.includes("Reply")) {
        document.title = originalTitle;
      }
    }
  });

  async function checkQuotaAndBully() {
    try {
      const data = await chrome.storage.sync.get(['count', 'requiredReplies']);
      const count = data.count || 0;
      const required = data.requiredReplies || 3;

      if (count < required) {
        // 1. Notify Background
        chrome.runtime.sendMessage({ type: 'USER_LEFT_TAB' });

        // 2. Update Tab Title (Passive Aggressive)
        originalTitle = document.title;
        document.title = `(${required - count} LEFT) DON'T LEAVE!`;
      }
    } catch (e) {
      // Context invalidated or storage error
    }
  }

  // --- 6. COMPOSER DETECTION LOGIC ---
  
  function composerLooksLikeReply(composer) {
    if (!composer) return false;
    const text = (composer.innerText || "").trim();

    // Textual cues
    if (text.match(/replying\s+to|in\s+reply\s+to/i)) return true;

    // DOM cues
    if (composer.querySelector('[aria-label*="Replying"]')) return true;
    if (composer.querySelector('[data-testid="reply"]')) return true;

    // Explicit markers from Opener
    if (composer.__replyGuyMarked === true) return true;
    if (composer.__replyGuyMarkedToken) return true;

    // URL Context
    if (location.href.includes('/status/') || location.href.includes('/i/web/status/')) return true;

    return false;
  }

  function findComposerContainer(node) {
    if (!node) return null;
    let el = node;
    for (let i = 0; i < 10 && el; i++) {
      if (el.getAttribute && el.getAttribute('data-testid') === 'tweetTextarea_0') return el.closest('[role="dialog"]') || el.closest('[data-testid="tweetButtonInline"]')?.parentElement || el.parentElement;
      if (el.querySelector && el.querySelector('[contenteditable="true"]')) return el;
      el = el.parentElement;
    }
    return document.querySelector('div[role="dialog"], div[aria-label*="Reply"], div[data-testid*="reply"]');
  }

  function attachSubmitListenersToComposer(composer) {
    if (!composer || composer.__replyGuySubmitAttached) return;
    composer.__replyGuySubmitAttached = true;

    // Click Listener
    SUBMIT_BUTTON_SELECTORS.forEach(sel => {
      const btns = composer.querySelectorAll(sel);
      btns.forEach(btn => {
        if (btn.__replyGuyBtnAttached) return;
        btn.__replyGuyBtnAttached = true;
        btn.addEventListener('click', () => {
          if (composerLooksLikeReply(composer)) {
            setTimeout(sendIncrement, 250); // Slight delay for X to process
          }
        }, true);
      });
    });

    // Keyboard Listener (Ctrl+Enter)
    const editables = composer.querySelectorAll('[contenteditable="true"], textarea');
    editables.forEach(editable => {
      if (editable.__replyGuyKeyAttached) return;
      editable.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          if (composerLooksLikeReply(composer)) {
            setTimeout(sendIncrement, 250);
          }
        }
      }, true);
      editable.__replyGuyKeyAttached = true;
    });
  }

  function replyOpenerClickHandler(e) {
    const opener = e.target.closest && e.target.closest(REPLY_OPENER_SELECTORS.join(','));
    if (!opener) return;

    const token = `token:${Date.now()}:${openerTokenCounter++}`;
    window.__replyGuyLastOpenerToken = token;

    setTimeout(() => {
      scanForNewComposersAndMark(token);
    }, 200);
  }

  function scanForNewComposersAndMark(token) {
    // Find dialogs or inline composers
    const candidates = document.querySelectorAll('div[role="dialog"], div[data-testid*="tweet"], div[aria-label*="Reply"]');
    for (const cand of candidates) {
      if (!cand.__replyGuyMarked && cand.querySelector('[contenteditable="true"]')) {
        cand.__replyGuyMarked = true;
        cand.__replyGuyMarkedToken = token;
        attachSubmitListenersToComposer(cand);
        return;
      }
    }
  }

  function startComposerObserver() {
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1) {
            // If new node has submit button or editable
            if (node.querySelector('[data-testid="tweetButton"]') || node.querySelector('[contenteditable="true"]')) {
              const composer = findComposerContainer(node) || node;
              if (composer && !composer.__replyGuySubmitAttached) {
                // Check if it matches our "opener" token
                if (window.__replyGuyLastOpenerToken && !composer.__replyGuyMarked) {
                  composer.__replyGuyMarked = true;
                  composer.__replyGuyMarkedToken = window.__replyGuyLastOpenerToken;
                }
                attachSubmitListenersToComposer(composer);
              }
            }
          }
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  function attachGlobalListeners() {
    document.addEventListener('click', replyOpenerClickHandler, true);
    
    // SPA Navigation Fixes
    const _push = history.pushState;
    history.pushState = function () {
      setTimeout(() => scanForNewComposersAndMark(null), 500);
      return _push.apply(this, arguments);
    };
    window.addEventListener('popstate', () => setTimeout(() => scanForNewComposersAndMark(null), 500));
  }

  // --- 7. INITIALIZATION ---
  try {
    attachGlobalListeners();
    startComposerObserver();
    // Initial scan in case reload happened on a page with open composer
    setTimeout(() => scanForNewComposersAndMark(null), 1000);
    log("ReplyGuy Active.");
  } catch (err) {
    console.error("[ReplyGuy] Init failed", err);
  }

})();