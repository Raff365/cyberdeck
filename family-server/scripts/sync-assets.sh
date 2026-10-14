#!/bin/sh
# Copies the fonts and icons the parent web app shares with LEVEL UP from the repo into public/ (CI runs this before deploy).
set -e
here="$(cd "$(dirname "$0")/.." && pwd)"
root="$(cd "$here/.." && pwd)"
mkdir -p "$here/public/fonts" "$here/public/icons"
cp "$root/fonts/archivo-var.woff2" "$root/fonts/barlowc-600.woff2" "$root/fonts/barlowc-700.woff2" "$root/fonts/barlowc-800.woff2" "$here/public/fonts/"
cp "$root/icons/icon-192.png" "$root/icons/icon-512.png" "$root/icons/maskable-512.png" "$root/icons/apple-touch-icon.png" "$here/public/icons/"
