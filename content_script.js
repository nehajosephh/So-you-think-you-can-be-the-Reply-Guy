(function () {
  const DEBUG = false;
  
  // Global error handler to prevent context errors
  window.addEventListener('error', function(e) {
    if (e.message && e.message.includes('Extension context invalidated')) {
      e.preventDefault();
      return true;
    }
  }, true);

  function log(...args) { if (DEBUG) console.log("[ReplyGuy]", ...args); }

  // --- 1. STATE & SELECTORS ---
  let originalTitle = document.title;
  let openerTokenCounter = 1;

  const REPLY_OPENER_SELECTORS = [
    '[data-testid="reply"]',
    '[data-testid="replyButton"]',
    'div[aria-label*="Reply"]',
    'button[aria-label*="Reply"]'
  ];

  const SUBMIT_BUTTON_SELECTORS = [
    'button[data-testid="tweetButton"]',
    'button[data-testid="tweetButtonInline"]',
    '[data-testid="tweetButton"]',
    '[data-testid="tweetButtonInline"]',
    'div[role="button"][aria-label*="Post"]',
    'button[aria-label*="Post"]'
  ];

  // --- 2. MESSAGING HELPER ---
  function sendIncrement() {
    if (chrome.runtime?.id) {
      chrome.runtime.sendMessage({ type: 'increment' }, (res) => {
        log("Increment sent", res);
        // Reset title if we were bullying
        if (document.title.includes("DON'T LEAVE")) document.title = "X";
      });
    }
  }

  // --- 3. BULLYING: TAB SWITCHING ---
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === 'hidden') {
      checkQuotaAndBully();
    } else {
      if (originalTitle && !document.title.includes("Reply")) {
        document.title = originalTitle;
      }
    }
  });

  // --- 4. BULLYING: PREVENT CLOSING TAB ---
  window.addEventListener('beforeunload', (e) => {
    // We can't check storage synchronously reliably here, so we assume
    // if the title is currently "DON'T LEAVE", we should block.
    // OR we rely on the user "feeling" the block.
    // Standard chrome behavior requires setting returnValue.
    e.preventDefault();
    e.returnValue = "You haven't hit your reply quota yet. Are you sure?";
  });

  async function checkQuotaAndBully() {
    try {
      if (!chrome.runtime?.id) return;
      const data = await chrome.storage.sync.get(['count', 'requiredReplies']);
      const count = data.count || 0;
      const required = data.requiredReplies || 3;

      if (count < required) {
        // 1. Notify Background (Pop-up notification)
        chrome.runtime.sendMessage({ type: 'USER_LEFT_TAB' });

        // 2. Change Title
        originalTitle = document.title;
        document.title = `(${required - count} LEFT) DON'T LEAVE!`;
      }
    } catch (e) {}
  }

  // --- 5. DETECTION LOGIC (The "Eyes") ---

  function composerLooksLikeReply(composer) {
    if (!composer) return false;
    const text = (composer.innerText || "").trim();
    
    // Textual cues
    if (text.match(/replying\s+to/i)) return true;
    
    // DOM cues
    if (composer.querySelector('[aria-label*="Replying"]')) return true;
    
    // Context markers
    if (composer.__replyGuyMarked === true) return true;
    if (location.href.includes('/status/')) return true;

    return false;
  }

  function attachSubmitListenersToComposer(composer) {
    if (!composer || composer.__replyGuySubmitAttached) return;
    composer.__replyGuySubmitAttached = true;

    // Button Clicks
    SUBMIT_BUTTON_SELECTORS.forEach(sel => {
      const btns = composer.querySelectorAll(sel);
      btns.forEach(btn => {
        if (btn.__replyGuyBtnAttached) return;
        btn.__replyGuyBtnAttached = true;
        
        btn.addEventListener('click', () => {
          if (composerLooksLikeReply(composer)) {
            // Delay to allow X to process the tweet
            setTimeout(sendIncrement, 500);
          }
        }, true); // Capture phase
      });
    });

    // Cmd+Enter / Ctrl+Enter
    const editables = composer.querySelectorAll('[contenteditable="true"]');
    editables.forEach(ed => {
      if(ed.__replyGuyKeyAttached) return;
      ed.__replyGuyKeyAttached = true;
      ed.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          if (composerLooksLikeReply(composer)) {
            setTimeout(sendIncrement, 500);
          }
        }
      }, true);
    });
  }

  function scanForNewComposersAndMark(token) {
    // Find potential composers (modal or inline)
    const candidates = document.querySelectorAll('div[role="dialog"], div[aria-label*="Reply"], div[data-testid="tweetTextarea_0"]');
    candidates.forEach(cand => {
      // Find the actual container
      const composer = cand.closest('div[role="dialog"]') || cand.closest('div[class*="r-"]') || cand;
      
      if (composer && !composer.__replyGuyMarked) {
        // Check if it contains an editable field
        if (composer.querySelector('[contenteditable="true"]')) {
          composer.__replyGuyMarked = true;
          composer.__replyGuyMarkedToken = token;
          attachSubmitListenersToComposer(composer);
        }
      }
    });
  }

  function replyOpenerClickHandler(e) {
    const opener = e.target.closest && e.target.closest(REPLY_OPENER_SELECTORS.join(','));
    if (!opener) return;

    const token = `token:${Date.now()}:${openerTokenCounter++}`;
    window.__replyGuyLastOpenerToken = token;

    // Scan shortly after click
    setTimeout(() => scanForNewComposersAndMark(token), 250);
    setTimeout(() => scanForNewComposersAndMark(token), 800);
  }

  // --- 6. OBSERVER (Watches for new tweets/modals) ---
  function startObserver() {
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1) {
            // Check if a submit button or text area was added
            if (node.querySelector('[data-testid="tweetButton"]') || node.querySelector('[contenteditable="true"]')) {
              const composer = node.closest('div[role="dialog"]') || node;
              
              // If we clicked a reply button recently, mark this new composer
              if (window.__replyGuyLastOpenerToken && composer && !composer.__replyGuyMarked) {
                composer.__replyGuyMarked = true;
                composer.__replyGuyMarkedToken = window.__replyGuyLastOpenerToken;
              }
              attachSubmitListenersToComposer(composer);
            }
          }
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  // --- 7. INIT ---
  try {
    document.addEventListener('click', replyOpenerClickHandler, true);
    startObserver();
    // Initial scan
    setTimeout(() => scanForNewComposersAndMark(null), 1000);
    log("Reply Guy v3.3 Active");
  } catch (e) {}

})();