// Renders every app icon from the Champion crest: node tools/build-icons.mjs (needs Playwright + Chromium)
// Web/PWA icons go to icons/; Android launcher icons go to android/app/src/main/res/.
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const root = new URL('..', import.meta.url).pathname;
const crest = readFileSync(root + 'ranks/rank-7-champion.svg', 'utf8');
// pct = how much of the square the crest fills; bg = ground colour or transparent
const page = (pct, bg = '#0c0a1d') => `<body style="margin:0;width:512px;height:512px;background:${bg};display:grid;place-items:center">
  <div style="width:${pct}%;height:${pct}%">${crest.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body>`;

const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
async function shot(path, size, pct, bg) {
  const p = await b.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: size / 512 });
  await p.setContent(page(pct, bg));
  await p.screenshot({ path, omitBackground: bg === 'transparent' });
  await p.close();
}

for (const [file, size, pct] of [['icon-512.png', 512, 74], ['maskable-512.png', 512, 58], ['icon-192.png', 192, 74], ['apple-touch-icon.png', 180, 70]]) {
  await shot(root + 'icons/' + file, size, pct);
}

// Android: legacy square icons (API < 26) and adaptive-icon foregrounds (108dp canvas,
// crest kept inside the 66dp safe zone so any launcher mask leaves it whole).
const res = root + 'android/app/src/main/res/';
const DENSITY = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(DENSITY)) {
  mkdirSync(`${res}mipmap-${d}`, { recursive: true });
  await shot(`${res}mipmap-${d}/ic_launcher.png`, Math.round(48 * k), 74);
  await shot(`${res}mipmap-${d}/ic_launcher_round.png`, Math.round(48 * k), 62);
  await shot(`${res}mipmap-${d}/ic_launcher_foreground.png`, Math.round(108 * k), 56, 'transparent');
}
mkdirSync(`${res}mipmap-anydpi-v26`, { recursive: true });
const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ground" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`;
writeFileSync(`${res}mipmap-anydpi-v26/ic_launcher.xml`, adaptive);
writeFileSync(`${res}mipmap-anydpi-v26/ic_launcher_round.xml`, adaptive);
await b.close();
