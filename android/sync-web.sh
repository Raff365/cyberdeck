#!/bin/sh
# Copies the web app into the Android project's assets and minifies the copy (the checked-in source stays
# readable). CI runs this before Gradle; it needs Node (npx fetches pinned esbuild and svgo).
# SKIP_MINIFY=1 copies without minifying, to debug the packaged app against the readable source.
set -e
root="$(cd "$(dirname "$0")/.." && pwd)"
dest="$root/android/app/src/main/assets/www"
# build next to the destination and swap it in only when everything worked: never package a half-done copy
tmp="$dest.tmp"
rm -rf "$tmp"
mkdir -p "$tmp"
cp "$root/index.html" "$root/app.js" "$root/body-data.js" "$root/manifest.webmanifest" "$root/LICENSES.md" "$tmp/"
cp -R "$root/icons" "$root/fonts" "$root/ranks" "$root/bosses" "$root/vendor" "$tmp/"
if [ "${SKIP_MINIFY:-}" != "1" ]; then
  node "$root/tools/minify-web.mjs" "$tmp"
fi
rm -rf "$dest"
mv "$tmp" "$dest"
