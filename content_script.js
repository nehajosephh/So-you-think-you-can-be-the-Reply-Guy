// content_script.js
// So You Think You Can Be The Reply Guy
// Merged Logic: Robust Detection + Tab Switching Bullying

(function () {
  const DEBUG = false;
  const SITES = ["x.com", "twitter.com"];

  // Global error handler
  window.addEventListener('error', function(e) {
    if (e.message && e.message.includes('Extension context invalidated')) {
      e.preventDefault();
      return true;
    }
  }, true);

  function log(...args) { if (DEBUG) console.debug("[ReplyGuy]", ...args); }

  // --- 1. BULLYING FEATURE (New) ---
  let originalTitle = document.title;

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === 'hidden') {
      checkQuotaAndBully();
    } else {
      // User came back
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
        // Notify Service Worker to show notification
        chrome.runtime.sendMessage({ type: 'USER_LEFT_TAB' });
        
        // Passive Aggressive Title Change
        originalTitle = document.title;
        document.title = `(${required - count} LEFT) DON'T LEAVE!`;
      }
    } catch (e) {
      // Ignore context invalidation
    }
  }

  // --- 2. INCREMENT LOGIC (Updated) ---
  function sendIncrement() {
    try {
      chrome.runtime.sendMessage({ type: 'increment' }, (res) => {
        log("Reply counted via service worker.", res);
        // If we were bullying, reset title slightly
        if (document.title.includes("DON'T LEAVE")) {
          document.title = "X"; 
        }
      });
    } catch (err) {
      log("Increment error:", err);
    }
  }

  // --- 3. DETECTION LOGIC (Original Option C Restored) ---
  
  const REPLY_OPENER_SELECTORS = [
    '[data-testid="reply"]',
    '[data-testid="replyButton"]',
    'div[aria-label*="Reply"]',
    'div[role="button"][data-testid*="reply"]',
    'button[aria-label*="Reply"]',
    'button[aria-label*="reply"]',
    'div[aria-label*="reply"]',
    'svg[aria-label*="Reply"]'
  ];

  const SUBMIT_BUTTON_SELECTORS = [
    'button[data-testid="tweetButton"]',
    'button[data-testid="tweetButtonInline"]',
    '[data-testid="tweetButton"]',
    '[data-testid="tweetButtonInline"]',
    'div[role="button"][data-testid*="tweet"]',
    'div[role="button"][aria-label*="Tweet"]',
    'div[role="button"][aria-label*="Post"]',
    'button[aria-label*="Post"]',
    'button[aria-label*="Tweet"]',
    'div[aria-label*="Post"]'
  ];

  let openerTokenCounter = 1;

  function composerLooksLikeReply(composer) {
    if (!composer) return false;
    const text = (composer.innerText || "").trim();

    // 1) Textual cue
    if (text.match(/replying\s+to|in\s+reply\s+to/i)) return true;

    // 2) DOM context
    try {
      const replyText = composer.querySelector('[aria-label*="Replying"], [aria-label*="Reply to"]');
      if (replyText) return true;
      const quotedTweet = composer.querySelector('[data-testid="reply"], [data-testid*="quote"]');
      if (quotedTweet) return true;
    } catch (e) {}

    // 3) Explicit marker
    if (composer.__replyGuyMarked === true) return true;
    if (composer.__replyGuyMarkedToken) return true;

    // 4) URL Context
    const currentUrl = location.href || "";
    if (currentUrl.includes('/status/') || currentUrl.includes('/i/web/status/')) return true;

    // 5) Article nearby
    try {
      if (composer.querySelector && composer.querySelector('article')) return true;
    } catch (e) {}

    return false;
  }

  function findComposerContainer(node) {
    if (!node) return null;
    let el = node;
    for (let i = 0; i < 10 && el; i++) {
      if (el.querySelector && (el.querySelector('[contenteditable="true"]') || el.querySelector('textarea'))) {
        return el;
      }
      if (el.getAttribute && (el.getAttribute('contenteditable') === 'true' || el.tagName === 'TEXTAREA')) {
        return el.closest('div[role="dialog"], div[aria-label*="Reply"], div[data-testid*="tweet"], div[role="application"]') || el.parentElement;
      }
      el = el.parentElement;
    }
    return document.querySelector('div[role="dialog"], div[aria-label*="Reply"], div[data-testid*="reply"], div[data-testid*="tweet"]');
  }

  function attachSubmitListenersToComposer(composer) {
    if (!composer || composer.__replyGuySubmitAttached) return;
    composer.__replyGuySubmitAttached = true;

    // Button Clicks
    for (const sel of SUBMIT_BUTTON_SELECTORS) {
      try {
        const btns = composer.querySelectorAll(sel);
        btns.forEach(btn => {
          if (btn.__replyGuyBtnAttached) return;
          btn.__replyGuyBtnAttached = true;

          const handler = (ev) => {
            const isReply = composerLooksLikeReply(composer);
            if (isReply) {
              setTimeout(sendIncrement, 350);
            }
          };
          btn.addEventListener('click', handler, true);
        });
      } catch (e) {}
    }

    // Keyboard Submit (Ctrl+Enter)
    try {
      const editables = composer.querySelectorAll('[contenteditable="true"], textarea');
      editables.forEach(editable => {
        if (editable.__replyGuyKeyAttached) return;
        const keyHandler = (e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            const isReply = composerLooksLikeReply(composer);
            if (isReply) {
              setTimeout(sendIncrement, 350);
            }
          }
        };
        editable.addEventListener('keydown', keyHandler, true);
        editable.__replyGuyKeyAttached = true;
      });
    } catch (e) {}
  }

  function replyOpenerClickHandler(e) {
    const opener = e.target.closest && e.target.closest(REPLY_OPENER_SELECTORS.join(','));
    if (!opener) return;

    const token = `replyGuyToken:${Date.now()}:${openerTokenCounter++}`;
    opener.__replyGuyToken = token;
    window.__replyGuyLastOpenerToken = token;

    setTimeout(() => {
      const composer = findComposerContainer(opener);
      if (composer) {
        composer.__replyGuyMarked = true;
        composer.__replyGuyMarkedToken = token;
        attachSubmitListenersToComposer(composer);
      } else {
        scanForNewComposersAndMark(token);
      }
    }, 220);
  }

  function scanForNewComposersAndMark(token) {
    const candidates = Array.from(document.querySelectorAll('div[role="dialog"], div[aria-label*="Reply"], div[data-testid*="tweet"], div[data-testid*="reply"]'));
    for (const cand of candidates) {
      if (cand.__replyGuyMarked) continue;
      if (cand.querySelector && (cand.querySelector('[contenteditable="true"]') || cand.querySelector('textarea'))) {
        cand.__replyGuyMarked = true;
        cand.__replyGuyMarkedToken = token;
        attachSubmitListenersToComposer(cand);
        return;
      }
    }
  }

  function startComposerObserver() {
    const mo = new MutationObserver((mutations) => {
      let sawComposer = false;
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.querySelector && (node.querySelector('[contenteditable="true"]') || node.querySelector('textarea') || node.querySelector('[data-testid="tweetButton"]') || node.querySelector('[data-testid="tweetButtonInline"]'))) {
            const composer = findComposerContainer(node) || node;
            if (composer && !composer.__replyGuySubmitAttached) {
              if (composerLooksLikeReply(composer) || (window.__replyGuyLastOpenerToken && !composer.__replyGuyMarked)) {
                composer.__replyGuyMarked = true;
                composer.__replyGuyMarkedToken = window.__replyGuyLastOpenerToken || null;
              }
              attachSubmitListenersToComposer(composer);
            }
            sawComposer = true;
          }
        }
      }
      if (sawComposer) {
        setTimeout(() => { window.__replyGuyLastOpenerToken = null; }, 1200);
      }
    });

    mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
  }

  function attachGlobalListeners() {
    document.addEventListener('click', replyOpenerClickHandler, true);

    // Catch-all click listener for submit buttons
    document.addEventListener('click', (e) => {
      const btn = e.target.closest && e.target.closest(SUBMIT_BUTTON_SELECTORS.join(','));
      if (!btn) return;
      const composer = findComposerContainer(btn) || findComposerContainer(document.activeElement) || null;
      if (!composer) return;
      if (!composer.__replyGuySubmitAttached) {
        if (composerLooksLikeReply(composer)) {
          composer.__replyGuyMarked = true;
        }
        attachSubmitListenersToComposer(composer);
      }
    }, true);

    // SPA hooks
    const _push = history.pushState;
    history.pushState = function () {
      const res = _push.apply(this, arguments);
      setTimeout(() => { try { scanForNewComposersAndMark(window.__replyGuyLastOpenerToken || null); } catch (e) {} }, 400);
      return res;
    };
    const _replace = history.replaceState;
    history.replaceState = function () {
      const res = _replace.apply(this, arguments);
      setTimeout(() => { try { scanForNewComposersAndMark(window.__replyGuyLastOpenerToken || null); } catch (e) {} }, 400);
      return res;
    };
    window.addEventListener('popstate', () => setTimeout(() => scanForNewComposersAndMark(null), 300));
  }

  // --- 4. INIT ---
  try {
    attachGlobalListeners();
    startComposerObserver();
    log("ReplyGuy content script loaded (v3.2: Detection + Bullying)");
  } catch (err) {
    console.error("[ReplyGuy] init error:", err);
  }

})();