/**
 * content_script.js
 * Injected on the Atlantis login page.
 * Injects the Hampter button below the site's Login button,
 * then drives the full login flow via background.js.
 */

// ── Find page elements ────────────────────────────────────

function findEmailInput() {
    return (
        document.querySelector('input[type="email"]') ||
        document.querySelector('input[type="text"]') ||
        document.querySelector('input[placeholder*="email" i]') ||
        document.querySelector('input[placeholder*="username" i]')
    );
}

function findLoginButton() {
    const buttons = Array.from(
        document.querySelectorAll("button, input[type='submit']")
    );
    return buttons.find((b) =>
        /login|sign\s*in/i.test(b.textContent || b.value || "")
    );
}

// ── Inject the Hampter button ─────────────────────────────

function injectHampterButton(loginBtn) {
    if (document.getElementById("hampter-btn")) return;

    const btn = document.createElement("button");
    btn.id = "hampter-btn";
    btn.type = "button";
    btn.textContent = "🐹 Log in with Hampter";
    btn.style.cssText = `
        display:        block;
        width:          100%;
        margin-top:     10px;
        padding:        14px;
        background:     #ff8c00;
        color:          #ffffff;
        border:         none;
        border-radius:  8px;
        font-size:      15px;
        font-weight:    600;
        cursor:         pointer;
        letter-spacing: 0.01em;
        transition:     background 0.15s;
    `;
    btn.onmouseenter = () => (btn.style.background = "#e07b00");
    btn.onmouseleave = () => (btn.style.background = "#ff8c00");

    loginBtn.parentNode.insertBefore(btn, loginBtn.nextSibling);
    btn.addEventListener("click", () => handleHampterLogin(btn));
}

// ── Main login flow ───────────────────────────────────────

async function handleHampterLogin(btn) {
    btn.disabled = true;

    // 1. Load saved email and config
    const { hampter_email: email, hampter_sender: sender, hampter_domain: domain }
        = await chromeGet(["hampter_email", "hampter_sender", "hampter_domain"]);

    if (!email) {
        setStatus(btn, "⚠️ No email saved — open the 🐹 extension first", "#c0392b");
        btn.disabled = false;
        return;
    }

    // 2. Fill the email field and submit the site's form
    const emailInput = findEmailInput();
    if (!emailInput) {
        setStatus(btn, "❌ Couldn't find the email field", "#c0392b");
        btn.disabled = false;
        return;
    }

    setStatus(btn, "⏳ Filling in email...", "#ff8c00");
    fillInput(emailInput, email);

    const loginBtn = findLoginButton();
    if (loginBtn) {
        loginBtn.click();
    } else {
        emailInput.closest("form")?.submit();
    }

    // 3. Get OAuth token via background.js
    setStatus(btn, "🔐 Getting Gmail access...", "#ff8c00");
    const tokenResult = await sendMessage({ type: "GET_AUTH_TOKEN" });
    if (tokenResult.error) {
        setStatus(btn, `❌ Gmail access denied: ${tokenResult.error}`, "#c0392b");
        btn.disabled = false;
        return;
    }

    // 4. Ask background.js to watch for the magic link email
    setStatus(btn, "📬 Waiting for magic link email...", "#ff8c00");
    const linkResult = await sendMessage({
        type: "GET_MAGIC_LINK",
        token: tokenResult.token,
        config: {
            sender: sender || "noreply@atlantis.education",
            domain: domain || "atlantis.education",
        },
    });

    if (linkResult.error) {
        setStatus(btn, `❌ ${linkResult.error}`, "#c0392b");
        btn.disabled = false;
        return;
    }

    // 5. Navigate to the magic link — login complete
    setStatus(btn, "✅ Got it! Logging in...", "#27ae60");
    setTimeout(() => { window.location.href = linkResult.link; }, 400);
}

// ── Helpers ───────────────────────────────────────────────

function chromeGet(keys) {
    return new Promise((resolve) =>
        chrome.storage.local.get(keys, resolve)
    );
}

function sendMessage(msg) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(msg, (response) => {
            if (chrome.runtime.lastError) {
                resolve({ error: chrome.runtime.lastError.message });
            } else {
                resolve(response || { error: "No response from background" });
            }
        });
    });
}

function fillInput(input, value) {
    // React-safe: trigger the page's own event handlers
    const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, "value"
    ).set;
    nativeSetter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
}

function setStatus(btn, text, color) {
    btn.textContent = text;
    btn.style.background = color;
    btn.style.fontSize = "13px";
    // Persist errors to storage so the popup can display them
    if (color === "#c0392b") {
        chrome.storage.local.set({ hampter_last_error: text });
    } else {
        chrome.storage.local.remove("hampter_last_error");
    }
}

// ── Entry point ───────────────────────────────────────────

(function init() {
    const loginBtn = findLoginButton();
    if (loginBtn) {
        injectHampterButton(loginBtn);
        return;
    }

    // Page may be JS-rendered — wait for the button to appear in the DOM
    const observer = new MutationObserver(() => {
        const btn = findLoginButton();
        if (btn) {
            observer.disconnect();
            injectHampterButton(btn);
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();
