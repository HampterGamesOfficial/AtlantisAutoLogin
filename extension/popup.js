const emailInput = document.getElementById("emailInput");
const saveBtn = document.getElementById("saveBtn");
const statusEl = document.getElementById("status");

// ── Load saved email on open ──────────────────────────────
chrome.storage.local.get("hampter_email", (data) => {
    if (data.hampter_email) {
        emailInput.value = data.hampter_email;
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
function showStatus(msg, type) {
    statusEl.textContent = msg;
    statusEl.className = `status ${type}`;
    setTimeout(() => { statusEl.className = "status hidden"; }, 2500);
}
