<div align="center">

<img src="icons/icon128.png" width="88" alt="Quick Ping">

# Quick Ping ⚡

**Check any site's response time from the Chrome toolbar. Type an address, get milliseconds.**

[![CI](https://github.com/N0deZ3r0/Quick-Ping-Chrome-Extension/actions/workflows/ci.yml/badge.svg)](https://github.com/N0deZ3r0/Quick-Ping-Chrome-Extension/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/N0deZ3r0/Quick-Ping-Chrome-Extension?label=release)](https://github.com/N0deZ3r0/Quick-Ping-Chrome-Extension/releases/latest)
[![License](https://img.shields.io/github/license/N0deZ3r0/Quick-Ping-Chrome-Extension?color=blue)](LICENSE)
![Manifest V3](https://img.shields.io/badge/manifest-v3-4285F4?logo=googlechrome&logoColor=white)

**English** · [Русский](README.ru.md)

</div>

---

## What it does

A small extension for checking how fast any site responds. Enter an address, get
the latency in milliseconds. No account, no configuration, no telemetry.

| | |
|---|---|
| **Fast** | One request per check — usually a result in well under a second |
| **Simple** | Minimum of buttons, maximum of use |
| **Readable** | Colour-coded by latency quality |
| **Honest** | Reports the number it measured, or `ERROR` — never a placeholder |
| **Practical** | Keeps a history of your checks |
| **Self-contained** | No CDN, no fonts, no analytics — everything ships in the package |

## What it measures

Not an ICMP ping: a browser extension cannot send ICMP packets. Quick Ping sends
one `GET` to the address and stops the clock when the response headers arrive,
then drops the body without downloading it. What you get is the time to first
byte — DNS plus TCP plus TLS plus the server thinking — which is the delay you
actually feel when you open a site.

A few consequences worth knowing:

- The first check of a host is the slowest one; a repeat check reuses the open
  connection and skips the handshake.
- Any answer counts as an answer. A `403` or a `500` still proves the round trip
  worked, so it is reported as a normal result — hover a history row to see the
  status code.
- A host that accepts the connection and then says nothing is given 5 seconds
  before the check is abandoned.
- `http://`, ports, paths and IP addresses all work: `localhost:3000/health` and
  `192.168.1.1` are valid input.

## Install

The extension is not in the Chrome Web Store — load it unpacked.

1. **Download the files.** Open [Releases](https://github.com/N0deZ3r0/Quick-Ping-Chrome-Extension/releases/latest),
   download the archive and unpack it into any folder.
2. **Open the extensions page.** Go to `chrome://extensions/` and turn on
   **Developer mode** in the top-right corner.
3. **Load it.** Click **Load unpacked** and select the folder you unpacked.
4. **Pin it.** Click the pin icon 📌 next to Quick Ping so it stays in the toolbar.

That is all — there is now a ⚡ icon in Chrome.

### Chrome shows a warning

That is expected for any unpacked extension. Click **Details** under the warning,
then **Install anyway**. The extension works normally afterwards.

### Files the extension needs

```text
manifest.json    required
popup.html       required
popup.css        required
popup.js         required
icons/           icon folder
_locales/        interface translations (English, Russian)
```

## Updating your own build

1. Replace the files in the folder.
2. Press **Reload** on the extension's card in `chrome://extensions/`.
3. The change takes effect immediately.

## Permissions

| Permission | Why it is needed |
|---|---|
| `storage` | Keep the history of your checks locally |
| `http://*/*`, `https://*/*` | Send the request whose timing is the measurement, and read the status code that comes back |

The host access is what makes an honest reading possible: without it the browser
hides the response behind CORS and the extension would have to guess from a
failed image load. It is used only for the address you type, only when you ask
for a check, and the request carries no cookies and no referrer.

Nothing else is sent anywhere. The history lives in your browser and never
leaves it, there is no analytics, and the popup loads no remote fonts, styles or
scripts — every asset ships inside the extension.

## Contributing

Bug reports and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).
Found a security problem? Please
[report it privately](https://github.com/N0deZ3r0/Quick-Ping-Chrome-Extension/security/advisories/new)
rather than in a public issue.

## License

[MIT](LICENSE) — free to use, including commercially.
