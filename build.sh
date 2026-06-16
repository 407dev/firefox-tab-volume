#!/usr/bin/env bash
# Build the distributable extension package (tab-volume-control.zip).
set -euo pipefail
cd "$(dirname "$0")"

OUT="tab-volume-control.zip"
rm -f "$OUT"
zip -r -FS "$OUT" \
  manifest.json \
  background.js \
  content.js \
  popup.html \
  popup.css \
  popup.js \
  icons/icon-16.png \
  icons/icon-32.png \
  icons/icon-48.png \
  icons/icon-96.png \
  icons/icon-128.png

echo "Built $OUT"
