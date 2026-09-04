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
| **Fast** | A result in two to three seconds |
| **Simple** | Minimum of buttons, maximum of use |
| **Readable** | Colour-coded by latency quality |
| **Honest** | Shows `ERROR` for unreachable sites instead of a made-up number |
| **Practical** | Keeps a history of your checks |

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
```

## Updating your own build

1. Replace the files in the folder.
2. Press **Reload** on the extension's card in `chrome://extensions/`.
3. The change takes effect immediately.

## Permissions

| Permission | Why it is needed |
|---|---|
| `activeTab` | Read the address of the tab you are on, so it can be pinged |
| `storage` | Keep the history of your checks locally |

Nothing is sent anywhere. The history lives in your browser and never leaves it.

## Contributing

Bug reports and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).
Found a security problem? Please
[report it privately](https://github.com/N0deZ3r0/Quick-Ping-Chrome-Extension/security/advisories/new)
rather than in a public issue.

## License

[MIT](LICENSE) — free to use, including commercially.
