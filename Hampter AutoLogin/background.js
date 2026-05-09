/**
 * background.js — Hampter Login service worker.
 *
 * Handles two jobs:
 *   1. GET_AUTH_TOKEN  — gets an OAuth token via chrome.identity.launchWebAuthFlow (PKCE)
 *   2. GET_MAGIC_LINK  — polls Gmail API until the magic link email arrives,
 *                        then returns the URL to the content script
 *
 * No local server required. All Gmail API calls are made directly from here.
 */

const GMAIL_API = "https://www.googleapis.com/gmail/v1/users/me";
const POLL_INTERVAL = 3000;  // ms between Gmail checks
const TIMEOUT = 60000; // ms before giving up

// ── Demo overrides (set to null for production) ───────────
const DEBUG_GMAIL_QUERY = "Fwd: Your Magic Link to securely log in to Atlantis";;

// ── Message handler ───────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "GET_AUTH_TOKEN") {
        handleGetAuthToken(message.email, sendResponse);
        return true;
    }
    if (message.type === "GET_MAGIC_LINK") {
        handleGetMagicLink(message.token, message.config, sendResponse);
        return true;
    }
});

// ── PKCE helpers ──────────────────────────────────────────

function base64URLEncode(buffer) {
    return btoa(String.fromCharCode(...buffer))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function generatePKCE() {
    const verifierBytes = new Uint8Array(32);
    crypto.getRandomValues(verifierBytes);
    const codeVerifier = base64URLEncode(verifierBytes);

    const digest = await crypto.subtle.digest(
        "SHA-256", new TextEncoder().encode(codeVerifier)
    );
    const codeChallenge = base64URLEncode(new Uint8Array(digest));

    return { codeVerifier, codeChallenge };
}

// ── Auth token (launchWebAuthFlow + PKCE, no client secret) ──

async function handleGetAuthToken(email, sendResponse) {
    setStatus("oauth");

    const { codeVerifier, codeChallenge } = await generatePKCE();
    const clientId = chrome.runtime.getManifest().oauth2.client_id;
    const redirectURL = chrome.identity.getRedirectURL();

    const authURL = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authURL.searchParams.set("client_id", clientId);
    authURL.searchParams.set("redirect_uri", redirectURL);
    authURL.searchParams.set("response_type", "code");
    authURL.searchParams.set("scope", "https://www.googleapis.com/auth/gmail.readonly");
    authURL.searchParams.set("code_challenge", codeChallenge);
    authURL.searchParams.set("code_challenge_method", "S256");
    authURL.searchParams.set("access_type", "offline");
    authURL.searchParams.set("prompt", "consent");
    if (email) authURL.searchParams.set("login_hint", email);

    chrome.identity.launchWebAuthFlow(
        { url: authURL.toString(), interactive: true },
        async (redirected) => {
            if (chrome.runtime.lastError || !redirected) {
                setStatus("idle");
                sendResponse({ error: chrome.runtime.lastError?.message || "Auth cancelled" });
                return;
            }

            const code = new URL(redirected).searchParams.get("code");
            if (!code) {
                setStatus("idle");
                sendResponse({ error: "No auth code returned" });
                return;
            }

            try {
                const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: new URLSearchParams({
                        client_id: clientId,
                        redirect_uri: redirectURL,
                        grant_type: "authorization_code",
                        code,
                        code_verifier: codeVerifier,
                    }),
                });

                const tokenData = await tokenResp.json();
                if (tokenData.error) {
                    setStatus("idle");
                    sendResponse({ error: tokenData.error_description || tokenData.error });
                    return;
                }

                if (tokenData.refresh_token) {
                    await chrome.storage.local.set({ hampter_refresh_token: tokenData.refresh_token });
                }

                // Verify the authenticated account matches the expected email
                if (email) {
                    const userInfoResp = await fetch("https://www.googleapis.com/gmail/v1/users/me/profile", {
                        headers: { "Authorization": `Bearer ${tokenData.access_token}` }
                    });
                    const userInfo = await userInfoResp.json();
                    const authenticatedEmail = userInfo.emailAddress;
                    if (authenticatedEmail?.toLowerCase() !== email.toLowerCase()) {
                        setStatus("idle");
                        sendResponse({ error: `Wrong account — please sign in with ${email} (signed in as ${authenticatedEmail})` });
                        return;
                    }
                }

                sendResponse({ token: tokenData.access_token });

            } catch (err) {
                setStatus("idle");
                sendResponse({ error: err.message });
            }
        }
    );
}

// ── Magic link polling ────────────────────────────────────

async function handleGetMagicLink(token, config, sendResponse) {
    const { sender, domain } = config;
    const deadline = Date.now() + TIMEOUT;
    const afterTs = Math.floor((Date.now() - 5 * 60 * 1000) / 1000);
    const query = DEBUG_GMAIL_QUERY ?? `from:${sender} after:${afterTs} is:unread`;
    const seenIds = new Set();

    setStatus("checking");

    while (Date.now() < deadline) {
        try {
            const messages = await gmailSearch(token, query);

            for (const msg of messages) {
                if (seenIds.has(msg.id)) continue;
                seenIds.add(msg.id);

                const body = await gmailFetchBody(token, msg.id);
                const link = extractLink(body, domain);
                if (link) {
                    setStatus("logging-in");
                    sendResponse({ link });
                    await sleep(2000);
                    setStatus("idle");
                    return;
                }
            }
        } catch (err) {
            if (err.status === 401) {
                try {
                    token = await refreshToken(token);
                } catch (_) {
                    setStatus("idle");
                    sendResponse({ error: "Gmail auth expired — please try again" });
                    return;
                }
            } else {
                setStatus("idle");
                sendResponse({ error: `Gmail API error: ${err.message}` });
                return;
            }
        }

        await sleep(POLL_INTERVAL);
    }

    setStatus("idle");
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

// ── Token refresh ─────────────────────────────────────────

async function refreshToken(oldToken) {
    const clientId = chrome.runtime.getManifest().oauth2.client_id;

    const { hampter_refresh_token: storedRefreshToken } =
        await chrome.storage.local.get("hampter_refresh_token");

    if (!storedRefreshToken) {
        throw new Error("No refresh token stored — user must re-authenticate");
    }

    const resp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: clientId,
            grant_type: "refresh_token",
            refresh_token: storedRefreshToken,
        }),
    });

    const data = await resp.json();
    if (data.error) throw new Error(data.error_description || data.error);
    return data.access_token;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Status helper ─────────────────────────────────────────

function setStatus(state) {
    chrome.storage.local.set({ hampter_status: state });
}
