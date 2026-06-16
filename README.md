# Tab Volume

A small, dependency-free Firefox extension to **set or boost the audio volume of
a single tab** — up to 600% — without affecting any other tab. The level is
remembered as you reload or navigate within the tab, and is **cleared when the
tab closes**.

No ads, no tracking, no network access, no monetization. Just the feature.

By [407 Dev](https://407.dev). Released under the MIT License.

## How it works

Firefox caps a media element's `.volume` at 100%. To go louder, the extension
routes a tab's `<audio>`/`<video>` through the Web Audio API and applies a
`GainNode`:

- **At or below 100%** it just sets `element.volume` directly — simple and with
  no side effects.
- **Above 100%** it connects the element to a gain node so it can exceed the cap.

All of this happens inside the page, so other tabs are untouched and the state
disappears with the tab. The per-tab level is stored in `storage.session`
(in-memory) keyed by tab id and deleted when the tab closes.

### Files

| File | Role |
| --- | --- |
| `manifest.json` | MV3 manifest |
| `content.js` | Per-page engine: finds media, applies gain |
| `background.js` | Per-tab level store + message routing |
| `popup.html` / `popup.css` / `popup.js` | The toolbar slider (active tab) |
| `icons/icon-*.png` | Toolbar / add-ons icons (`icon.svg` is the source) |

## Run it during development (no signing)

1. Build the zip (see the command under "Install permanently" below).
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and pick **`tab-volume.zip`**.
4. Pin the toolbar icon, play audio somewhere, and use the slider.

A temporary add-on is removed when Firefox restarts, and content scripts only
inject into pages loaded *after* it — reload the audio tab after (re)loading the
add-on. Rebuild the zip and reload after every edit.

> **Flatpak / Snap Firefox:** load the **zip**, not the unpacked folder.
> Selecting `manifest.json` only grants the sandbox access to that one file, so
> sibling files read as empty (blank popup, no icon, nothing works). This is
> [Mozilla bug 1852990](https://bugzilla.mozilla.org/show_bug.cgi?id=1852990).
> A single zip sidesteps it.

## Install permanently (signed, free, private)

Firefox only installs signed extensions permanently. You can get a signed copy
**without listing it publicly**:

1. From this folder, build a zip of the sources:
   ```bash
   zip -r -FS tab-volume.zip manifest.json background.js content.js \
     popup.html popup.css popup.js \
     icons/icon-16.png icons/icon-32.png icons/icon-48.png \
     icons/icon-96.png icons/icon-128.png
   ```
2. Create a free account at <https://addons.mozilla.org>, go to
   **Developer Hub → Submit a New Add-on**, and choose **"On your own"**
   (unlisted). Upload the zip.
3. After automated validation passes, download the **signed `.xpi`**.
4. Install it: open the `.xpi` in Firefox (or **Add-ons → gear → Install
   Add-on From File…**). It now survives restarts and stays private.

Publishing it publicly later is the same upload with **"On this site"** chosen —
no code changes needed.

## Privacy

This extension collects **no data**. It makes **no network requests**, has no
analytics, no ads, and no remote code. The only thing it stores is each tab's
chosen volume percentage, held in memory (`storage.session`) and discarded when
the tab closes or the browser quits. Permissions requested:

- **Access your data for all websites** (`<all_urls>`) — required to detect and
  adjust media on whatever site you're listening to. Audio is processed locally
  in the page; nothing is read or sent anywhere.
- **storage** — to remember the per-tab volume level during the session.

## Known limitations

- **Boosting** (above 100%) a **cross-origin** media file served **without CORS
  headers** produces silence — a Web Audio security rule, not a bug. Staying at
  or below 100% is always safe, and major streaming sites (YouTube, Netflix,
  etc.) use same-origin/MSE media and are unaffected.
- Some DRM / EME-protected audio cannot be routed through Web Audio.
- Pages that generate audio purely via the Web Audio API (some games/apps),
  rather than through media elements, aren't covered.

## License

[MIT](LICENSE) © 2026 407 Dev
