// content_script.js
// So You Think You Can Be The Reply Guy — Reply/Comment Detection (Counts replies/comments under posts only)
// Option C implementation: counts replies/comments under posts, ignores standalone posts (/compose/post).
//
// Features:
// - Flags composers opened from reply buttons (most reliable)
// - Heuristics: "Replying to" text, link to original author, or flagged opener => considered a reply
// - Attaches listeners to submit buttons (data-testid tweetButton, tweetButtonInline, etc.)
// - Handles Ctrl/Cmd+Enter keyboard submit
// - MutationObserver + SPA hooks for dynamic UI
// - Debug logs (toggle DEBUG)

(function () {
  const DEBUG = false;
  const SITES = ["x.com", "twitter.com"];

  function log(...args) { if (DEBUG) console.debug("[ReplyGuy]", ...args); }

  // Heuristic selectors for reply openers and submit buttons
  const REPLY_OPENER_SELECTORS = [
    '[data-testid="reply"]',
    '[data-testid="replyButton"]',
    'div[aria-label*="Reply"]',
    'div[role="button"][data-testid*="reply"]',
    'button[aria-label*="Reply"]',
    'button[aria-label*="reply"]',
    'div[aria-label*="reply"]',
    'div[aria-tooltip*="reply"]',
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

  // When an opener is clicked, it will set a marker on the composer when it appears.
  // We map opener element -> a temporary token and then mark the composer that matches the token.
  let openerTokenCounter = 1;

  // Increment counter directly in storage with context check
  function sendIncrement() {
    try {
      // Check if extension context is still valid before accessing chrome API
      if (!chrome || !chrome.runtime || !chrome.runtime.id) {
        return; // Context invalidated, silently exit
      }

      if (!chrome.storage || !chrome.storage.sync) {
        return;
      }

      chrome.storage.sync.get(["count", "requiredReplies"], function(data) {
        // Double-check context is still valid in callback
        if (!chrome || !chrome.runtime || !chrome.runtime.id) {
          return;
        }

        if (!data) return;
        
        const currentCount = parseInt(data.count) || 0;
        const required = parseInt(data.requiredReplies) || 3;
        const newCount = currentCount + 1;
        
        chrome.storage.sync.set({ count: newCount }, function() {
          // Silent success - no error logging
        });
      });
    } catch (e) {
      // Silent fail - extension context likely invalidated
      return;
    }
  }

  // Check whether composer content appears to be a reply to another tweet
  function composerLooksLikeReply(composer) {
    if (!composer) return false;
    const text = (composer.innerText || "").trim();

    // 1) direct textual cue - look for "Replying to", "Replying", "In reply to"
    if (text.match(/replying\s+to|in\s+reply\s+to/i)) {
      log("Reply detected: Found 'Replying to' text");
      return true;
    }

    // 2) Check for reply context elements in the DOM
    try {
      // Look for "Replying to @username" spans or divs
      if (composer.querySelector) {
        const replyText = composer.querySelector('[aria-label*="Replying"], [aria-label*="Reply to"]');
        if (replyText) {
          log("Reply detected: Found reply context element via aria-label");
          return true;
        }
        
        // Look for quoted tweet or author reference
        const quotedTweet = composer.querySelector('[data-testid="reply"], [data-testid*="quote"]');
        if (quotedTweet) {
          log("Reply detected: Found quoted tweet element");
          return true;
        }
      }
    } catch (e) {
      log("Error checking for reply elements:", e);
    }

    // 3) explicit marker set by reply-opener flow (see markComposerFromOpener)
    if (composer.__replyGuyMarked === true) {
      log("Reply detected: Explicitly marked");
      return true;
    }

    // 4) Check if this composer was opened via reply button
    if (composer.__replyGuyMarkedToken) {
      log("Reply detected: Has marked token");
      return true;
    }

    // 5) Check URL - if we're on a specific tweet's page (URL contains /status/), replies are likely
    const currentUrl = location.href || "";
    if (currentUrl.includes('/status/') || currentUrl.includes('/i/web/status/')) {
      log("Reply detected: On a tweet detail page (likely a reply)");
      return true;
    }

    // 6) Check if there's a parent tweet visible near the composer (indicates reply context)
    try {
      if (composer.querySelector && composer.querySelector('article')) {
        log("Reply detected: Found article element (likely reply to tweet)");
        return true;
      }
    } catch (e) {
      // ignore
    }

    return false;
  }

  // Given a node that likely is inside/near a composer, find the composer container
  function findComposerContainer(node) {
    if (!node) return null;

    // If node itself looks like a composer (contains contenteditable or textarea), return closest container
    let el = node;
    for (let i = 0; i < 10 && el; i++) {
      if (el.querySelector && (el.querySelector('[contenteditable="true"]') || el.querySelector('textarea'))) {
        return el;
      }
      // Some composers are the contenteditable itself
      if (el.getAttribute && (el.getAttribute('contenteditable') === 'true' || el.tagName === 'TEXTAREA')) {
        return el.closest('div[role="dialog"], div[aria-label*="Reply"], div[data-testid*="tweet"], div[role="application"]') || el.parentElement;
      }
      el = el.parentElement;
    }

    // General fallback: common composer containers
    return document.querySelector('div[role="dialog"], div[aria-label*="Reply"], div[data-testid*="reply"], div[data-testid*="tweet"]');
  }

  // Attach submit handler to a composer container so that clicking its submit counts if it's a reply
  function attachSubmitListenersToComposer(composer) {
    if (!composer || composer.__replyGuySubmitAttached) return;
    composer.__replyGuySubmitAttached = true;

    // 1) attach click listener to any submit buttons inside composer
    for (const sel of SUBMIT_BUTTON_SELECTORS) {
      try {
        const btns = composer.querySelectorAll(sel);
        btns.forEach(btn => {
          // avoid double attaching
          if (btn.__replyGuyBtnAttached) return;
          btn.__replyGuyBtnAttached = true;

          const handler = (ev) => {
            // Ensure we only count when the composer is a reply/comment
            const isReply = composerLooksLikeReply(composer);
            log("Submit button clicked. isReply:", isReply, "selector:", sel, "button:", btn);
            if (isReply) {
              // slight delay to allow X to perform the post action
              setTimeout(sendIncrement, 350);
            }
          };

          // Use capture true to catch it early
          btn.addEventListener('click', handler, true);
        });
      } catch (e) {
        // ignore errors for obscure nodes
      }
    }

    // 2) attach keyboard handler to contenteditable/textarea inside composer
    try {
      const editables = composer.querySelectorAll('[contenteditable="true"], textarea');
      editables.forEach(editable => {
        if (editable.__replyGuyKeyAttached) return;
        const keyHandler = (e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            const isReply = composerLooksLikeReply(composer);
            log("Keyboard submit detected. isReply:", isReply);
            if (isReply) {
              setTimeout(sendIncrement, 350);
            }
          }
        };
        editable.addEventListener('keydown', keyHandler, true);
        editable.__replyGuyKeyAttached = true;
      });
    } catch (e) {
      // ignore
    }

    log("Attached submit listeners to composer", composer);
  }

  // When a reply-opener (reply button) is clicked, we attempt to mark the composer that appears after it
  function replyOpenerClickHandler(e) {
    const opener = e.target.closest && e.target.closest(REPLY_OPENER_SELECTORS.join(','));
    if (!opener) return;

    // create a token and attach it to the opener so we can match it when composer appears
    const token = `replyGuyToken:${Date.now()}:${openerTokenCounter++}`;
    opener.__replyGuyToken = token;
    log("Reply opener clicked, token:", token, opener);

    // set a short-lived global lastOpenerToken to help match
    window.__replyGuyLastOpenerToken = token;

    // set up a timed attempt to find composer and mark it
    setTimeout(() => {
      // Try to find composer related to this opener
      const composer = findComposerContainer(opener);
      if (composer) {
        composer.__replyGuyMarked = true;
        composer.__replyGuyMarkedToken = token;
        log("Marked composer immediately after opener click", composer, token);
        attachSubmitListenersToComposer(composer);
      } else {
        // if not found, scan for recent composers and mark the first unmarked
        scanForNewComposersAndMark(token);
      }
    }, 220); // small delay to let composer materialize
  }

  // Scan DOM for composer elements that aren't yet marked and mark one (used after opener click)
  function scanForNewComposersAndMark(token) {
    // look for likely composer containers
    const candidates = Array.from(document.querySelectorAll('div[role="dialog"], div[aria-label*="Reply"], div[data-testid*="tweet"], div[data-testid*="reply"]'));
    for (const cand of candidates) {
      if (cand.__replyGuyMarked) continue;
      // if it contains editable area, mark it
      if (cand.querySelector && (cand.querySelector('[contenteditable="true"]') || cand.querySelector('textarea'))) {
        cand.__replyGuyMarked = true;
        cand.__replyGuyMarkedToken = token;
        log("Marked composer via scan", cand, token);
        attachSubmitListenersToComposer(cand);
        return;
      }
    }
    // fallback: try to mark generic composer containers
    const fallback = document.querySelector('[contenteditable="true"], textarea');
    if (fallback && fallback.closest) {
      const root = fallback.closest('div[role="dialog"], div[aria-label*="Reply"], div[data-testid*="tweet"]') || fallback.parentElement;
      if (root && !root.__replyGuyMarked) {
        root.__replyGuyMarked = true;
        root.__replyGuyMarkedToken = token;
        attachSubmitListenersToComposer(root);
        log("Marked fallback composer", root, token);
      }
    }
  }

  // MutationObserver to detect new composers dynamically and attach listeners
  function startComposerObserver() {
    const mo = new MutationObserver((mutations) => {
      let sawComposer = false;
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          // If node looks like a composer or contains contenteditable, try to attach
          if (node.querySelector && (node.querySelector('[contenteditable="true"]') || node.querySelector('textarea') || node.querySelector('[data-testid="tweetButton"]') || node.querySelector('[data-testid="tweetButtonInline"]'))) {
            const composer = findComposerContainer(node) || node;
            if (composer && !composer.__replyGuySubmitAttached) {
              // Determine if it should be marked as reply based on heuristic
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
        // cleanup lastOpenerToken after a short time so it doesn't incorrectly mark later composers
        setTimeout(() => { window.__replyGuyLastOpenerToken = null; }, 1200);
      }
    });

    mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
    window.__replyGuyComposerObserver = mo;
    log("Composer MutationObserver started");
  }

  // Attach global listeners: for reply opener clicks and for SPA navigation
  function attachGlobalListeners() {
    // Reply opener click listener (use capture to catch early)
    document.addEventListener('click', replyOpenerClickHandler, true);
    log("Global reply opener click listener attached");

    // Also attach a general click handler that listens for submit button clicks outside composer detection (extra safety)
    document.addEventListener('click', (e) => {
      const btn = e.target.closest && e.target.closest(SUBMIT_BUTTON_SELECTORS.join(','));
      if (!btn) return;
      // find composer near button and evaluate
      const composer = findComposerContainer(btn) || findComposerContainer(document.activeElement) || null;
      if (!composer) return;

      // If composer wasn't previously attached, attach now
      if (!composer.__replyGuySubmitAttached) {
        // Determine marking heuristics (don't mark if compose/post path)
        if (composerLooksLikeReply(composer)) {
          composer.__replyGuyMarked = true;
        }
        attachSubmitListenersToComposer(composer);
      }
      // We don't increment here directly because those attached handlers will run; this is only to ensure listeners exist.
    }, true);

    // SPA hooks: re-run light init on history changes
    const _push = history.pushState;
    history.pushState = function () {
      const res = _push.apply(this, arguments);
      setTimeout(() => { // allow DOM to settle
        try {
          scanForNewComposersAndMark(window.__replyGuyLastOpenerToken || null);
        } catch (e) {}
      }, 400);
      return res;
    };
    const _replace = history.replaceState;
    history.replaceState = function () {
      const res = _replace.apply(this, arguments);
      setTimeout(() => {
        try {
          scanForNewComposersAndMark(window.__replyGuyLastOpenerToken || null);
        } catch (e) {}
      }, 400);
      return res;
    };
    window.addEventListener('popstate', () => setTimeout(() => scanForNewComposersAndMark(null), 300));
    log("SPA history patched");
  }

  // Prevent counting on standalone compose page (/compose/post) by checking location
  function onSubmitCountGuard() {
    // This is handled per-composer: composerLooksLikeReply will return false on standalone compose page.
    // But also guard explicitly: if path is /compose/post, ignore unless composer marked.
    const path = location.pathname || "";
    if (path.includes('/compose') || path.includes('/compose/post')) {
      log("On /compose path; replies will not be counted unless composer explicitly marked as reply.");
    }
  }

  // Attach beforeunload handler (unchanged behavior: warning if quota not met)
  function attachUnloadHandler() {
    const host = location.hostname;
    if (!SITES.some(h => host.includes(h))) return;
    window.addEventListener('beforeunload', async (e) => {
      try {
        const data = await chrome.storage.sync.get(['count','requiredReplies']);
        const count = data.count || 0;
        const required = data.requiredReplies || 3;
        if (count < required) {
          const lines = [
            "Bro… you're really gonna leave BEFORE replying? Tragic.",
            "Hold up king/queen, you still owe the timeline some heat.",
            "Bruh. You still owe the timeline more replies. Don't walk away now.",
            "Oh wow, leaving already? Couldn't be me.",
            "Ratio alert: You're behind on replies."
          ];
          const line = lines[Math.floor(Math.random() * lines.length)];
          log("beforeunload blocking with line:", line);
          e.preventDefault();
          e.returnValue = line;
          return line;
        }
      } catch (err) {
        log("beforeunload storage read error", err);
      }
    }, { capture: true });
  }

  // Advanced detection: Monitor network requests to detect replies
  function setupNetworkMonitoring() {
    try {
      // Intercept fetch calls for new tweets
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        const promise = originalFetch.apply(this, args);
        
        promise.then(response => {
          try {
            // Check if this is a tweet creation endpoint
            if (args[0] && typeof args[0] === 'string') {
              const url = args[0];
              if (url.includes('/2/tweets') || url.includes('CreateTweet') || url.includes('/tweets')) {
                // Check the request body for reply context
                const body = args[1]?.body;
                if (body) {
                  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
                  // If it contains reply_settings or in_reply_to_tweet_id, it's a reply
                  if (bodyStr.includes('reply') || bodyStr.includes('in_reply_to')) {
                    log("Network monitoring: Tweet creation detected with reply context");
                    sendIncrement();
                  }
                }
              }
            }
          } catch (e) {
            // silently ignore monitoring errors
          }
        });
        
        return promise;
      };
      log("Network monitoring setup complete");
    } catch (e) {
      log("Could not setup network monitoring:", e);
    }
  }

  // Setup a periodic check to detect if extension context is lost
  function setupContextMonitor() {
    setInterval(() => {
      try {
        // Test if chrome.runtime is still accessible
        if (!chrome?.runtime) {
          log("Chrome runtime lost, attempting to reload...");
          // Reload the page to reinject the content script
          location.reload();
        }
      } catch (e) {
        log("Context monitor error:", e);
      }
    }, 5000); // Check every 5 seconds
  }

  // Init
  try {
    attachGlobalListeners();
    startComposerObserver();
    onSubmitCountGuard();
    attachUnloadHandler();
    setupNetworkMonitoring();
    setupContextMonitor();
    log("ReplyGuy content script initialized (Option C: replies/comments only, with enhanced detection)");
  } catch (err) {
    console.error("[ReplyGuy] init error:", err);
  }

})();
