# 🐹 Hampter Login

A Chrome extension that automatically logs into [Atlantis Education](https://atlantis.education)
by reading your Gmail magic link and navigating to it on your behalf — just install and go.

Developed by **Hampter Games** · MIT License · Copyright © 2026 Hampter Games

---

## How it works

1. You click **🐹 Log in with Hampter** on the Atlantis login page
2. The extension fills in your email and submits the login form
3. Chrome asks for permission to read your Gmail (one-time consent popup)
4. The extension watches your inbox for the magic link email
5. The link is found and you're logged in automatically

Everything runs inside Chrome.

---

## Install

1. Download the latest release zip from the [Releases](https://github.com/hamptergamesofficial/AtlantisAutoLogin/releases) page
2. Unzip the folder
3. Go to `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select the unzipped folder
4. Click the 🐹 icon in the toolbar → enter your Gmail address → **Save**

That's it. Navigate to the Atlantis login page and click the orange button.

---

## First-time use

The first time you click the button, Chrome will show a Google consent popup
asking permission to read your Gmail. Click **Allow** — this only happens once.
The extension only ever reads emails from Atlantis Education.

---

## File structure

```
AtlantisAutoLogin/
├── extension/
│   ├── manifest.json
│   ├── background.js
│   ├── content_script.js
│   ├── popup.html
│   ├── popup.js
│   ├── icon.png
│   └── icon.svg
├── privacy.html
├── tos.html
├── LICENSE
└── README.md
```

---

## Privacy

No data is collected, transmitted, or stored outside your own device.
Read the full [Privacy Policy](https://hamptergamesofficial.github.io/AtlantisAutoLogin/privacy.html).

---

## License

MIT License — Copyright © 2026 Hampter Games · See [LICENSE](./LICENSE)
