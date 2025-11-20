(function () {
  const DEBUG = true; 

  // --- 1. HELPER: Send Count to Background ---
  function sendIncrement() {
    if (chrome.runtime?.id) {
      chrome.runtime.sendMessage({ type: 'increment' }, (res) => {
        if (DEBUG) console.log("[ReplyGuy] Increment sent. New count:", res?.newCount);
        // Restore title if we were bullying
        if (document.title.includes("DON'T LEAVE")) document.title = "X";
      });
    }
  }

  // --- 2. BULLYING: Tab Switch & Close ---
  
  // A. Switch Tabs (Notification + Title Change)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === 'hidden') {
      checkQuota((count, required) => {
        if (count < required) {
          // Send trigger for System Notification
          chrome.runtime.sendMessage({ type: 'USER_LEFT_TAB' });
          // Change Title
          document.title = `(${required - count} LEFT) DON'T LEAVE!`;
        }
      });
    } else {
      // Restore title when coming back
      if (document.title.includes("DON'T LEAVE")) document.title = "X";
    }
  });

  // B. Close Tab (Browser Popup)
  window.addEventListener('beforeunload', (e) => {
    // We cannot use async storage here, so we rely on a flag set periodically
    if (window.__replyGuyQuotaMet === false) {
      e.preventDefault();
      e.returnValue = "You haven't finished your replies. Are you sure?";
      return e.returnValue;
    }
  });

  // Helper to check quota
  function checkQuota(callback) {
    if (chrome.runtime?.id) {
      chrome.storage.sync.get(['count', 'requiredReplies'], (data) => {
        const count = data.count || 0;
        const required = data.requiredReplies || 3;
        // Update global flag for beforeunload
        window.__replyGuyQuotaMet = (count >= required);
        callback(count, required);
      });
    }
  }

  // Check quota every 5 seconds to keep the 'beforeunload' flag fresh
  setInterval(() => checkQuota(() => {}), 5000);


  // --- 3. COUNTING LOGIC (The "Perfect" Logic) ---
  // Instead of complex heuristics, we look for the "Reply" text on the button clicked.

  document.addEventListener('click', (e) => {
    // Find the closest button
    const btn = e.target.closest('button') || e.target.closest('[role="button"]');
    
    if (btn) {
      const txt = btn.innerText || "";
      const label = btn.getAttribute('aria-label') || "";
      const testId = btn.getAttribute('data-testid') || "";

      // CHECK 1: Is it a Tweet Submit Button?
      if (testId === 'tweetButton' || testId === 'tweetButtonInline') {
        // CHECK 2: Is it a Reply?
        // X usually labels the submit button "Reply" when replying, and "Post" when posting.
        if (txt === 'Reply' || label === 'Reply' || txt === 'Reply all') {
          console.log("[ReplyGuy] Reply button clicked!");
          setTimeout(sendIncrement, 500); // Wait for network
        }
        // Fallback: Check if we are in a Reply Modal
        else {
            const modal = btn.closest('[role="dialog"]');
            if (modal) {
                // Check if modal title says "Reply"
                const heading = modal.querySelector('h2');
                if (heading && heading.innerText.includes('Reply')) {
                    console.log("[ReplyGuy] Reply Modal button clicked!");
                    setTimeout(sendIncrement, 500);
                }
            }
        }
      }
    }
  }, true); // Capture phase to catch it before X handles it

  console.log("[ReplyGuy] Loaded. Waiting for 'Reply' clicks...");

})();