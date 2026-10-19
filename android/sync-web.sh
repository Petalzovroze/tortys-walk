#!/usr/bin/env bash
# Copies the web game (repo root) into the Android app's bundled assets.
set -euo pipefail
SRC="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
DST="$(cd "$(dirname "$0")" && pwd)/app/src/main/assets/web"
mkdir -p "$DST"
for f in index.html style.css app.js manifest.webmanifest icon.svg icon-192.png icon-512.png; do cp "$SRC/$f" "$DST/"; done
echo "Synced web game from $SRC -> $DST"
