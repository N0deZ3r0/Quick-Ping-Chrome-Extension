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
| **Steady** | Several samples per check, reported as a median with a jitter reading |
| **Simple** | Minimum of buttons, maximum of use |
| **Readable** | Colour-coded by latency quality, in a light or dark theme |
| **Honest** | Reports the number it measured, or `ERROR` — never a placeholder |
| **Watchful** | Keeps an eye on the hosts you pick and tells you when one drops |
| **Self-contained** | No CDN, no fonts, no analytics — everything ships in the package |

## What it measures

Not an ICMP ping: a browser extension cannot send ICMP packets. Quick Ping sends
a `GET` to the address and stops the clock when the response headers arrive,
then drops the body without downloading it. What you get is the time to first
byte — DNS plus TCP plus TLS plus the server thinking — which is the delay you
actually feel when you open a site.

### Cold, warm and jitter

One sample on its own is not comparable to the next. The first request to a host
carries the DNS lookup and the TLS handshake; every request after it reuses the
open connection and skips all of that. Reporting a single number would mean the
same site looks twice as fast the second time you press the button, for no
reason you could see.

So a check sends several requests and splits them:

| | |
|---|---|
| **cold** | the first sample, handshake included |
| **warm** | the median of the rest, on the reused connection |
| **jitter** | the spread across the warm samples |

The big number is the warm median when there is one, and the cold sample when
you asked for a single sample. A large gap between cold and warm points at
connection setup — DNS, TLS, distance. High jitter points at an unstable link.

### Other things worth knowing

- Any answer counts as an answer. A `403` or a `500` still proves the round trip
  worked, so it is reported as a normal result, flagged with its status code.
- A host that accepts the connection and then says nothing is given 5 seconds
  before the check is abandoned. Timeouts and connection failures are recorded
  separately — hover a history row to see which one happened.
- `http://`, ports, paths and IP addresses all work: `localhost:3000/health` and
  `192.168.1.1` are valid input.

## Watching a host

The **Watch** tab keeps a list of addresses that are checked in the background,
roughly on the interval you choose, whether or not the popup is open. You get a
desktop notification **only when a host changes state** — when it stops
answering, and again when it comes back. A tool that notified you on every check
is a tool you would mute within the hour.

Checks are scheduled with `chrome.alarms`, so the interval is approximate and one
minute is the floor Chrome guarantees. Background checks send a single sample:
the question there is whether the host is alive, not how fast it is.

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
background.js    background watching
lib/             shared modules
icons/           icon folder
_locales/        interface translations (English, Russian)
```

Everything else in the repository — `tests/`, `package.json`, `.github/` — is
tooling. The extension has no build step and no dependencies.

## Updating your own build

1. Replace the files in the folder.
2. Press **Reload** on the extension's card in `chrome://extensions/`.
3. The change takes effect immediately.

## Permissions

| Permission | Why it is needed |
|---|---|
| `storage` | Keep the history, pinned addresses and watch list locally |
| `http://*/*`, `https://*/*` | Send the request whose timing is the measurement, and read the status code that comes back |
| `activeTab` | Read the address of the current tab when you press **This tab** |
| `alarms` | Wake the extension to run background checks |
| `notifications` | Tell you when a watched host drops or comes back |

The host access is what makes an honest reading possible: without it the browser
hides the response behind CORS and the extension would have to guess from a
failed image load. It is used for the address you type, the address of the tab
you explicitly ask about, and the hosts you added to the watch list — and the
requests carry no cookies and no referrer.

`activeTab` grants nothing until you press the button: Chrome hands over the
current tab's address at that moment and takes it back afterwards. `alarms` and
`notifications` exist only for the watch list — with an empty list the alarm is
cleared and nothing runs in the background at all.

Nothing is sent anywhere else. The history lives in your browser and never
leaves it, there is no analytics, and the popup loads no remote fonts, styles or
scripts — every asset ships inside the extension.

## Keyboard shortcut

**Alt+Shift+P** opens the popup. Chrome lets you change or clear it at
`chrome://extensions/shortcuts`, and silently ignores the suggestion if
something else already claims that combination.

## Contributing

Bug reports and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).
Found a security problem? Please
[report it privately](https://github.com/N0deZ3r0/Quick-Ping-Chrome-Extension/security/advisories/new)
rather than in a public issue.

## License

[MIT](LICENSE) — free to use, including commercially.
