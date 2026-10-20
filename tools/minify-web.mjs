// Shrinks the web app copied into the APK (android/sync-web.sh runs it; the checked-in source stays readable).
//   node tools/minify-web.mjs <dir>
// Rewrites in <dir>: app.js and body-data.js (esbuild), index.html (its inline CSS/JS through esbuild, then
// whitespace between tags collapsed) and manifest.webmanifest (JSON re-serialized). Left alone: vendor/ (already
// minified), fonts, icons, and ranks/ + bosses/: tools/build-*.mjs already writes those SVGs without spare
// whitespace, and svgo (3.3.2) made them 3% smaller raw but 6% larger once deflated in the APK.
// Any failure throws, so the caller (set -e) stops before a half-minified app can be packaged.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ESBUILD = 'esbuild@0.24.0';
// app.js is classic-script ES2018 (object spread, async); this target neither lowers it nor lets the minifier
// introduce newer syntax (?? or ?.) that an un-updated WebView might not parse.
const JS_TARGET = 'es2018';

const dir = process.argv[2];
if (!dir || !statSync(dir).isDirectory()) throw new Error('usage: node tools/minify-web.mjs <dir>');

const npx = (args, input) => execFileSync('npx', ['--yes', ...args], {
  input, encoding: 'utf8', maxBuffer: 64 << 20, stdio: [input == null ? 'ignore' : 'pipe', 'pipe', 'inherit'],
});

// No --format and no bundling: esbuild then keeps every top-level name of a classic script (they are globals
// that the other script, the page and the Android bridge call), and only renames locals. No property mangling.
const js = src => npx([ESBUILD, '--loader=js', '--minify', `--target=${JS_TARGET}`, '--charset=utf8', '--legal-comments=none', '--log-level=warning'], src);
// CSS: no target, so nothing is lowered or rewritten for older engines (color-mix, :has, dvh stay as written).
const css = src => npx([ESBUILD, '--loader=css', '--minify', '--charset=utf8', '--log-level=warning'], src);

const sizes = [];
const rewrite = (file, fn) => {
  const p = join(dir, file), before = readFileSync(p, 'utf8'), after = fn(before);
  if (!after || !after.trim()) throw new Error(`minified ${file} is empty`);
  writeFileSync(p, after);
  sizes.push([file, Buffer.byteLength(before), Buffer.byteLength(after)]);
};

// Licence header of the vendored body paths must stay in the shipped file (MIT notice).
const keepHeader = src => { const m = /^\/\*[\s\S]*?\*\/\s*/.exec(src); return m ? m[0].trim() + '\n' : ''; };

rewrite('app.js', src => js(src).trim() + '\n');
rewrite('body-data.js', src => keepHeader(src) + js(src).trim() + '\n');
rewrite('manifest.webmanifest', src => JSON.stringify(JSON.parse(src)));
rewrite('index.html', minifyHtml);

let b = 0, a = 0;
for (const [f, x, y] of sizes) { b += x; a += y; console.log(`  ${f.padEnd(34)} ${String(x).padStart(8)} -> ${String(y).padStart(8)}`); }
console.log(`  ${'total'.padEnd(34)} ${String(b).padStart(8)} -> ${String(a).padStart(8)}`);

/**
 * Minifies the HTML without a full HTML minifier:
 *  - <style> and inline <script> bodies go through esbuild (scripts with src, or non-JS types, are left alone);
 *  - <pre>, <textarea> and attribute values are copied verbatim;
 *  - comments are dropped;
 *  - in text, every run of whitespace becomes one space. Normal CSS white-space collapsing renders that the same
 *    (the page uses no pre/pre-wrap/pre-line on static content), and no node becomes :empty or disappears;
 *  - whitespace-only text before <body> (never rendered) is removed.
 */
function minifyHtml(src) {
  // a tag (quoted attribute values may hold '>'), a comment, a doctype, or text
  const TOKEN = /<!--[\s\S]*?-->|<![^>]*>|<\/?[a-zA-Z][^\s/>]*(?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+|</g;
  const out = [];
  let preBody = true, m, i = 0;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(src))) {
    const t = m[0];
    if (m.index !== i) throw new Error('html tokenizer lost its place');
    i = TOKEN.lastIndex;
    if (t.startsWith('<!--')) continue;
    const tag = /^<(\/?)([a-zA-Z][^\s/>]*)/.exec(t);
    if (!tag) {   // text (or a lone '<')
      if (/^\s+$/.test(t) && preBody) continue;
      out.push(t.replace(/\s+/g, ' '));
      continue;
    }
    const name = tag[2].toLowerCase(), closing = tag[1] === '/';
    if (name === 'body' && !closing) preBody = false;
    out.push(t);
    if (closing) continue;
    if (['script', 'style', 'pre', 'textarea'].includes(name)) {
      const end = new RegExp(`</${name}\\s*>`, 'ig');
      end.lastIndex = i;
      const e = end.exec(src);
      if (!e) throw new Error(`unclosed <${name}>`);
      let body = src.slice(i, e.index);
      if (name === 'style') body = css(body).trim();
      else if (name === 'script') {
        const type = /\stype\s*=\s*["']?([^"'\s>]+)/i.exec(t);
        const isJs = !type || /^(text|application)\/(java|ecma)script$|^module$/i.test(type[1]);
        if (!/\ssrc\s*=/i.test(t) && isJs && body.trim()) {
          if (type && /^module$/i.test(type[1])) throw new Error('inline module scripts are not handled');
          body = js(body).trim();
        }
      }
      out.push(body, e[0]);
      i = TOKEN.lastIndex = end.lastIndex;
    }
  }
  if (i !== src.length) throw new Error('html tokenizer stopped early');
  return out.join('').trim() + '\n';
}
