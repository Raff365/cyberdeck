// Renders the app icons from the Champion crest: node tools/build-icons.mjs (needs Playwright + Chromium)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
import { readFileSync } from 'node:fs';
const root = new URL('..', import.meta.url).pathname;
const crest = readFileSync(root + 'ranks/rank-7-champion.svg', 'utf8');
const page = pct => `<body style="margin:0;width:512px;height:512px;background:#0f1113;display:grid;place-items:center">
  <div style="width:${pct}%;height:${pct}%">${crest.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body>`;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
for (const [file, size, pct] of [['icon-512.png', 512, 74], ['maskable-512.png', 512, 58], ['icon-192.png', 192, 74], ['apple-touch-icon.png', 180, 70]]) {
  const p = await b.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: size / 512 });
  await p.setContent(page(pct)); await p.screenshot({ path: root + 'icons/' + file }); await p.close();
}
await b.close();
