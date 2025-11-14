// content_script.js
// Detects replies on X and triggers a funny warning dialog when user tries to leave.
// Reply Guy Mode engaged.

(function () {
  const SITE_HINTS = ["x.com", "twitter.com"];

  // Funny Reply Guy lines for blocking exit
  const REPLY_GUY_LINES = [
    "Bro… you're really gonna leave BEFORE replying? Tragic.",
    "Hold up king/queen, you still owe the timeline some heat.",
    "Bruh. You still owe the timeline more replies. Don't walk away now.",
    "Oh wow, leaving already? Couldn't be me.",
    "Ratio alert: You're behind on replies.",
    "You said you'd reply more and now you're… leaving? Bold move."
  ];

  function getRandomLine() {
    return REPLY_GUY_LINES[Math.floor(Math.random() * REPLY_GUY_LINES.length)];
  }

  // Send increment message to background script
  function sendIncrement() {
    chrome.runtime.sendMessage({ type: "increment" });
  }

  // Try to identify a reply composer
  function findComposer(el) {
    let cur = el;

    // Check up the tree for “Replying to”
    for (let i = 0; i < 8 && cur; i++) {
      if (cur.innerText && cur.innerText.includes("Replying to")) return cur;
      cur = cur.parentElement;
    }

    // Check for dialog-based composer
    cur = el;
    for (let i = 0; i < 8 && cur; i++) {
      if (
        cur.getAttribute &&
        (cur.getAttribute("role") === "dialog" ||
          (cur.getAttribute("aria-label") || "")
            .toLowerCase()
            .includes("reply"))
      )
        return cur;
      cur = cur.parentElement;
    }

    return null;
  }

  // Detect clicking the reply/tweet button
  document.addEventListener(
    "click",
    function (e) {
      const btn =
        e.target.closest &&
        e.target.closest('div[role="button"], button');
      if (!btn) return;

      const isTweetButton =
        btn.querySelector &&
          btn.querySelector('[data-testid="tweetButtonInline"]') ||
        btn.getAttribute &&
          (btn.getAttribute("data-testid") === "tweetButtonInline" ||
            (btn.getAttribute("aria-label") || "")
              .toLowerCase()
              .includes("tweet"));

      if (!isTweetButton) return;

      // Check if it’s a reply
      const composer = findComposer(btn);
      if (
        composer &&
        composer.innerText &&
        composer.innerText.includes("Replying to")
      ) {
        setTimeout(sendIncrement, 500);
      }
    },
    true
  );

  // Keyboard shortcut detection (CTRL/CMD + Enter)
  document.addEventListener(
    "keydown",
    function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        const active = document.activeElement;
        const composer = findComposer(active || document.body);
        if (
          composer &&
          composer.innerText &&
          composer.innerText.includes("Replying to")
        ) {
          setTimeout(sendIncrement, 500);
        }
      }
    },
    true
  );

  // Check if user met required replies
  async function shouldBlockUnload() {
    try {
      const data = await chrome.storage.sync.get([
        "count",
        "requiredReplies",
      ]);
      const count = data.count || 0;
      const required = data.requiredReplies || 3;
      return count < required;
    } catch (err) {
      return false;
    }
  }

  // Attach warning dialog
  async function attachUnloadHandler() {
    const host = location.hostname;
    if (!SITE_HINTS.some((s) => host.includes(s))) return;

    window.addEventListener(
      "beforeunload",
      async function (e) {
        const block = await shouldBlockUnload();
        if (block) {
          const line = getRandomLine();
          e.preventDefault();
          e.returnValue = line; // Modern browsers ignore custom text but still trigger prompt
          return line;
        }
      },
      { capture: true }
    );
  }

  // Attach immediately
  attachUnloadHandler();

  // X is a single-page app → reattach handler on navigation
  const pushState = history.pushState;
  history.pushState = function () {
    pushState.apply(this, arguments);
    setTimeout(attachUnloadHandler, 500);
  };

  const replaceState = history.replaceState;
  history.replaceState = function () {
    replaceState.apply(this, arguments);
    setTimeout(attachUnloadHandler, 500);
  };
})();
