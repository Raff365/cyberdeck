#!/bin/sh
# Copies the web app into the Android project's assets. CI runs this before Gradle.
set -e
root="$(cd "$(dirname "$0")/.." && pwd)"
dest="$root/android/app/src/main/assets/www"
rm -rf "$dest"
mkdir -p "$dest"
cp "$root/index.html" "$root/app.js" "$root/body-data.js" "$root/manifest.webmanifest" "$root/LICENSES.md" "$dest/"
cp -R "$root/icons" "$root/fonts" "$root/ranks" "$root/bosses" "$dest/"
