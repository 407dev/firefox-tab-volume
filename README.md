# Tab Volume

A Firefox extension to set or boost the audio volume of an individual tab — up
to 600% — without affecting any other tab. The level is remembered while you
navigate within the tab and is cleared when the tab closes.

No ads, no tracking, no network access.

## Features

- Per-tab volume from 0% to 600% (boost past the browser's 100% cap)
- Doesn't affect other tabs
- Setting is cleared automatically when the tab closes
- Lightweight, vanilla JavaScript, Manifest V3

## Install

Available on [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/tab-volume/)
*(pending review)*.

## How it works

At or below 100% the extension sets the media element's `volume` directly. Above
100% it routes the element through a Web Audio `GainNode` to exceed the cap. All
processing happens locally in the page.

## Development

```bash
# Build the extension package
./build.sh           # produces tab-volume.zip
```

Then load it in Firefox:

1. Open `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on…** → select `tab-volume.zip`
3. Reload any audio tab so the content script is injected

> On Flatpak/Snap Firefox, load the **zip**, not the unpacked folder — see
> [Mozilla bug 1852990](https://bugzilla.mozilla.org/show_bug.cgi?id=1852990).

## Limitations

- Boosting above 100% on a cross-origin media file served without CORS headers
  produces silence (a Web Audio security rule). Staying at or below 100% always
  works, and major streaming sites are unaffected.
- DRM/EME-protected audio cannot be routed through Web Audio.

## License

[MIT](LICENSE) © 2026 [407 Dev](https://407.dev)
