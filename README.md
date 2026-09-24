# Tab Volume Control

A lightweight Firefox extension to set or boost the audio volume of an individual
tab — up to 600% — without affecting any other tab. The level is remembered while
you navigate within the tab and is cleared when the tab closes.

No ads, no tracking, no network access.

## Features

- Per-tab volume from 0% to 600% (boost past the browser's 100% cap)
- Doesn't affect other tabs
- Setting is cleared automatically when the tab closes
- Lightweight, vanilla JavaScript, Manifest V3

## Install

Available on [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/tab-volume-control-no-ads-tracking/).

## How it works

The tab level multiplies the page's own volume, so a site's volume slider keeps
working and the tab level scales on top of it. At or below 100% the extension
scales the media element's `volume`; above 100% it routes the element through a
Web Audio `GainNode` to exceed the cap. All processing happens locally in the
page.

## Development

```bash
# Build the extension package
./build.sh           # produces tab-volume-control.zip
```

Then load it in Firefox:

1. Open `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on…** → select `tab-volume-control.zip`
3. Reload any audio tab so the content script is injected

> On Flatpak/Snap Firefox, load the **zip**, not the unpacked folder — see
> [Mozilla bug 1852990](https://bugzilla.mozilla.org/show_bug.cgi?id=1852990).

## Releasing

1. Bump `version` in `manifest.json` and commit it.
2. Push to `main`.
3. Draft a [new GitHub Release](https://github.com/407dev/firefox-tab-volume/releases/new),
   tagged `v<version>` (e.g. `v1.0.5` for manifest version `1.0.5`) — the tag must match
   the manifest version exactly. The release description becomes the AMO changelog.
4. Publish the release.

Publishing triggers [`.github/workflows/publish.yml`](.github/workflows/publish.yml), which
builds the package, lints it, and submits it to AMO on the `listed` channel via
[`kewisch/action-web-ext`](https://github.com/kewisch/action-web-ext), then attaches the
built zip to the GitHub Release. AMO review can take anywhere from minutes to days — the
workflow submits and exits rather than waiting on it; check submission status on the
[AMO developer dashboard](https://addons.mozilla.org/developers/addons).

Requires `AMO_JWT_ISSUER` and `AMO_JWT_SECRET` repo secrets (from AMO's
[Manage API Keys](https://addons.mozilla.org/developers/addon/api/key/) page).

## Limitations

- Boosting above 100% isn't possible for cross-origin media served without CORS
  headers or for DRM/EME-protected media (Web Audio would output silence), so
  those are capped at 100%. Major streaming sites like YouTube are unaffected.

## License

[MIT](LICENSE) © 2026 [407 Dev](https://407.dev)
