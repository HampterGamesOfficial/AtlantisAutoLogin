# 🐹 Hampter Login

A Chrome extension that automatically logs into [Atlantis Education](https://atlantis.education)
by reading your Gmail magic link and navigating to it — no server, no setup, just install and go.

Developed by **Hampter Games** · MIT License · Copyright © 2026 Hampter Games

---

## How it works

1. You click **🐹 Log in with Hampter** on the Atlantis login page
2. The extension fills in your email and submits the login form
3. Chrome asks for permission to read your Gmail (one-time consent popup)
4. The extension watches your inbox for the magic link email
5. The link is found and you're logged in automatically

Everything runs inside Chrome — no Python, no local server, nothing to keep running.

---

## Install

1. Download or clone this repository
2. Copy `extension/manifest.example.json` to `extension/manifest.json`
3. Fill in your login URL and OAuth Client ID in `manifest.json`
4. Go to `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select the `extension/` folder
5. Click the 🐹 icon in the toolbar → enter your Gmail address → **Save**

That's it. Navigate to the Atlantis login page and click the orange button.

---

## First-time use

The first time you click the button, Chrome will show a Google consent popup
asking permission to read your Gmail. Click **Allow** — this only happens once.
The extension only ever reads emails from Atlantis Education.

---

## Files excluded from this repository

`extension/manifest.json` is excluded via `.gitignore` as it contains your
personal OAuth Client ID and login URL. Use `manifest.example.json` as the
template.

---

## Privacy

No data is collected, transmitted, or stored outside your own device.
Read the full [Privacy Policy](./privacy.html).

---

## License

MIT License — Copyright © 2026 Hampter Games · See [LICENSE](./LICENSE)
