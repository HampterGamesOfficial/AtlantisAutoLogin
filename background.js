/**
 * background.js — Hampter Login service worker.
 *
 * Handles two jobs:
 *   1. GET_AUTH_TOKEN  — gets an OAuth token via chrome.identity
 *   2. GET_MAGIC_LINK  — polls Gmail API until the magic link email arrives,
 *                        then returns the URL to the content script
 *
 * No local server required. All Gmail API calls are made directly from here.
 */

const GMAIL_API = "https://www.googleapis.com/gmail/v1/users/me";
const POLL_INTERVAL = 3000;  // ms between Gmail checks
const TIMEOUT = 60000; // ms before giving up

// ── Message handler ───────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "GET_AUTH_TOKEN") {
        handleGetAuthToken(sendResponse);
        return true; // keep channel open for async response
    }

    if (message.type === "GET_MAGIC_LINK") {
        handleGetMagicLink(message.token, message.config, sendResponse);
        return true;
    }
});

// ── Auth token ────────────────────────────────────────────

function handleGetAuthToken(sendResponse) {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError || !token) {
            sendResponse({
                error: chrome.runtime.lastError?.message || "Failed to get token"
            });
        } else {
            sendResponse({ token });
        }
    });
}

// ── Magic link polling ────────────────────────────────────

async function handleGetMagicLink(token, config, sendResponse) {
    const { sender, domain } = config;
    const deadline = Date.now() + TIMEOUT;
    const afterTs = Math.floor((Date.now() - 5 * 60 * 1000) / 1000); // 5 min ago
    const query = `from:${sender} after:${afterTs} is:unread`;
    const seenIds = new Set();

    while (Date.now() < deadline) {
        try {
            // Search inbox
            const messages = await gmailSearch(token, query);

            for (const msg of messages) {
                if (seenIds.has(msg.id)) continue;
                seenIds.add(msg.id);

                const body = await gmailFetchBody(token, msg.id);
                const link = extractLink(body, domain);
                if (link) {
                    sendResponse({ link });
                    return;
                }
            }
        } catch (err) {
            // Token may have expired — try to refresh once
            if (err.status === 401) {
                try {
                    token = await refreshToken(token);
                } catch (_) {
                    sendResponse({ error: "Gmail auth expired — please try again" });
                    return;
                }
            } else {
                sendResponse({ error: `Gmail API error: ${err.message}` });
                return;
            }
        }

        await sleep(POLL_INTERVAL);
    }

    sendResponse({ error: "Timed out — no magic link email arrived within 60 seconds" });
}

// ── Gmail API helpers ─────────────────────────────────────

async function gmailSearch(token, query) {
    const resp = await apiFetch(
        `${GMAIL_API}/messages?q=${encodeURIComponent(query)}&maxResults=10`,
        token
    );
    return resp.messages || [];
}

async function gmailFetchBody(token, msgId) {
    const resp = await apiFetch(
        `${GMAIL_API}/messages/${msgId}?format=full`,
        token
    );
    return walkPayload(resp.payload || {});
}

async function apiFetch(url, token) {
    const resp = await fetch(url, {
        headers: { "Authorization": `Bearer ${token}` }
    });
    if (!resp.ok) {
        const err = new Error(`HTTP ${resp.status}`);
        err.status = resp.status;
        throw err;
    }
    return resp.json();
}

function walkPayload(payload) {
    const mime = payload.mimeType || "";
    if (mime === "text/plain" || mime === "text/html") {
        return decodePart(payload);
    }
    for (const part of payload.parts || []) {
        const result = walkPayload(part);
        if (result) return result;
    }
    return "";
}

function decodePart(part) {
    const data = part?.body?.data;
    if (!data) return "";
    // atob handles base64url if we swap chars first
    const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
    try {
        return atob(base64);
    } catch (_) {
        return "";
    }
}

function extractLink(text, domain) {
    const pattern = new RegExp(
        `https?://[^\\s"'<>]*${escapeRegex(domain)}[^\\s"'<>]*`, "i"
    );
    const match = text.match(pattern);
    return match ? match[0] : null;
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function refreshToken(oldToken) {
    // Remove the cached token and get a fresh one
    await new Promise((resolve) =>
        chrome.identity.removeCachedAuthToken({ token: oldToken }, resolve)
    );
    return new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: false }, (token) => {
            if (chrome.runtime.lastError || !token) {
                reject(new Error(chrome.runtime.lastError?.message || "Token refresh failed"));
            } else {
                resolve(token);
            }
        });
    });
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
