const emailInput = document.getElementById("emailInput");
const saveBtn = document.getElementById("saveBtn");
const statusEl = document.getElementById("status");
const updateBanner = document.getElementById("updateBanner");

// ── Update check ──────────────────────────────────────────
(async function checkForUpdate() {
    try {
        const currentVersion = chrome.runtime.getManifest().version;
        const resp = await fetch(
            "https://api.github.com/repos/hamptergamesofficial/AtlantisAutoLogin/releases/latest",
            { headers: { "Accept": "application/vnd.github+json" } }
        );
        if (!resp.ok) return;
        const data = await resp.json();
        const latestVersion = (data.tag_name || "").replace(/^v/, "");
        if (latestVersion && latestVersion !== currentVersion) {
            updateBanner.style.display = "block";
            updateBanner.innerHTML = `🐹 Update available — v${latestVersion} is out. <a href="https://github.com/hamptergamesofficial/AtlantisAutoLogin/releases" target="_blank">Download →</a>`;
        }
    } catch (_) {
        // Silently fail — no internet or API rate limit, no banner shown
    }
})();

// ── Load saved email on open ──────────────────────────────
chrome.storage.local.get(["hampter_email", "hampter_last_error"], (data) => {
    if (data.hampter_email) {
        emailInput.value = data.hampter_email;
    }
    if (data.hampter_last_error) {
        showStatus(data.hampter_last_error, "error", false);
    }
});

// ── Save on button click ──────────────────────────────────
saveBtn.addEventListener("click", () => {
    const email = emailInput.value.trim();

    if (!email || !email.includes("@")) {
        showStatus("Please enter a valid email address.", "error");
        return;
    }

    chrome.storage.local.set({ hampter_email: email }, () => {
        showStatus("Saved!", "success");
    });
});

// ── Save on Enter ─────────────────────────────────────────
emailInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveBtn.click();
});

// ── Helpers ───────────────────────────────────────────────
function showStatus(msg, type, autoHide = true) {
    statusEl.textContent = msg;
    statusEl.className = `status ${type}`;
    if (autoHide) {
        setTimeout(() => { statusEl.className = "status hidden"; }, 2500);
    }
}
