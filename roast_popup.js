(function () {
    let popupShown = false;

    // Listen for messages from service worker
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.type === 'SHOW_ROAST_POPUP') {
            if (!popupShown) {
                showRoastPopup(msg.roast, msg.count, msg.required);
                popupShown = true;
            }
        }
    });

    function showRoastPopup(roast, count, required) {
        // Don't show on X/Twitter pages
        if (window.location.hostname.includes('x.com') || window.location.hostname.includes('twitter.com')) {
            return;
        }

        // Create backdrop
        const backdrop = document.createElement('div');
        backdrop.id = 'reply-guy-roast-backdrop';
        backdrop.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(8px);
      z-index: 2147483646;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.3s ease-out;
    `;

        // Create popup container
        const popup = document.createElement('div');
        popup.id = 'reply-guy-roast-popup';
        popup.style.cssText = `
      background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
      border: 2px solid #ff5f57;
      border-radius: 16px;
      padding: 40px;
      max-width: 500px;
      width: 90%;
      box-shadow: 0 20px 60px rgba(255, 95, 87, 0.4);
      text-align: center;
      animation: popIn 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    `;

        // Create content
        const title = document.createElement('h1');
        title.textContent = '🚨 GET BACK TO WORK 🚨';
        title.style.cssText = `
      color: #ff5f57;
      font-size: 28px;
      margin: 0 0 20px 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
    `;

        const message = document.createElement('p');
        message.textContent = roast;
        message.style.cssText = `
      color: #ececec;
      font-size: 18px;
      margin: 0 0 30px 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.6;
    `;

        const stats = document.createElement('div');
        stats.textContent = `Replies: ${count}/${required}`;
        stats.style.cssText = `
      color: #8d8d8d;
      font-size: 16px;
      margin: 0 0 30px 0;
      font-family: monospace;
      background: rgba(0, 0, 0, 0.3);
      padding: 10px;
      border-radius: 8px;
      display: inline-block;
    `;

        const button = document.createElement('button');
        button.textContent = 'Get Back to X';
        button.style.cssText = `
      background: #ff5f57;
      color: white;
      border: none;
      padding: 15px 40px;
      font-size: 16px;
      font-weight: 600;
      border-radius: 8px;
      cursor: pointer;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      transition: all 0.2s ease;
      box-shadow: 0 4px 12px rgba(255, 95, 87, 0.3);
    `;

        button.onmouseover = () => {
            button.style.background = '#ff7b73';
            button.style.transform = 'scale(1.05)';
        };
        button.onmouseout = () => {
            button.style.background = '#ff5f57';
            button.style.transform = 'scale(1)';
        };

        button.onclick = () => {
            window.location.href = 'https://x.com';
        };

        // Add animations
        const style = document.createElement('style');
        style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes popIn {
        from {
          opacity: 0;
          transform: scale(0.8) translateY(-20px);
        }
        to {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }
    `;
        document.head.appendChild(style);

        // Assemble popup
        popup.appendChild(title);
        popup.appendChild(message);
        popup.appendChild(stats);
        popup.appendChild(button);
        backdrop.appendChild(popup);

        // Add to page
        document.body.appendChild(backdrop);

        // Prevent scrolling
        document.body.style.overflow = 'hidden';

        // Auto-focus button
        button.focus();
    }
})();
