// LEVEL UP Family: the family's own relay between the kid's LEVEL UP app (Android) and the parents' web app (an iPhone
// Home Screen app). The worker only routes: /api/* goes to the family's Durable Object (found from the token), the rest
// is the parent web app from ./public. HTTPS only (workers.dev is), no CORS (the web app is same-origin and the kid app
// calls from native code), no listing endpoints, generic errors.
import { Family } from './family.js';
import { Registry } from './registry.js';
import { json, err, readJson, drain, parseToken, randId, normCode, sha256hex, str } from './util.js';

export { Family, Registry };

const SEC = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'cross-origin-opener-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'strict-transport-security': 'max-age=31536000',
};
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'";

const local = url => url.hostname === '127.0.0.1' || url.hostname === 'localhost';
const registry = env => env.REGISTRY.get(env.REGISTRY.idFromName('registry'));
const family = (env, fid) => env.FAMILY.get(env.FAMILY.idFromName(`family:${fid}`));
const post = (stub, path, body) => stub.fetch(`https://internal${path}`, { method: 'POST', body: JSON.stringify(body) });

function secure(res, html) {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(SEC)) h.set(k, v);
  if (html || (h.get('content-type') || '').includes('text/html')) h.set('content-security-policy', CSP);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

async function api(req, env, url) {
  const p = url.pathname, ip = req.headers.get('cf-connecting-ip') || 'local';
  // a new family: from the kid's phone, set up in Parent mode
  if (p === '/api/family') {
    if (req.method !== 'POST') return err(405);
    const { v: b, err: e } = await readJson(req, 1024);
    if (e) return e;
    const lim = await (await post(registry(env), '/limit', { kind: 'create', key: ip })).json();
    if (!lim.ok) return err(429);
    const fid = randId(16), r = await post(family(env, fid), '/_init', { fid, name: str(b.name, 16) });
    if (!r.ok) return err(500);
    const o = await r.json();
    return json({ ok: true, family: fid, kidToken: o.kidToken, code: o.code, codeExp: o.codeExp, link: `${url.origin}/#pair=${o.code}` });
  }
  // a parent's phone joins with the 8-character code (typed, or from the link)
  if (p === '/api/pair') {
    if (req.method !== 'POST') return err(405);
    const { v: b, err: e } = await readJson(req, 1024);
    if (e) return e;
    const code = normCode(b.code);
    const h = code ? await sha256hex(code) : '0'.repeat(64);
    const look = await post(registry(env), '/lookup', { h, ip });
    if (look.status === 429) return err(429);
    if (!code || !look.ok) return err(404, 'bad_code');
    const { fid } = await look.json();
    const r = await post(family(env, fid), '/_pair', { h, name: b.name });
    if (r.status === 409) return err(409, 'full');
    if (!r.ok) return err(404, 'bad_code');
    return json(await r.json());
  }
  if (p.startsWith('/api/_test/')) {
    if (env.TEST_HOOKS !== '1') return err(404);
    if (p === '/api/_test/registry') return registry(env).fetch(new Request(`https://internal/test/${url.searchParams.get('op')}`, req));
  }
  if (p.startsWith('/api/kid/') || p.startsWith('/api/parent/') || p.startsWith('/api/_test/')) {
    const t = parseToken(req.headers.get('authorization'));
    if (!t) return err(401);
    const fwd = new Request(req);
    fwd.headers.set('x-lu-origin', url.origin);
    return family(env, t.fid).fetch(fwd);
  }
  return err(404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.protocol !== 'https:' && !local(url)) {
      if (req.method === 'GET' || req.method === 'HEAD') return Response.redirect(`https://${url.host}${url.pathname}${url.search}`, 301);
      return secure(err(400));
    }
    try {
      if (url.pathname.startsWith('/api/')) { const res = await api(req, env, url); await drain(req); return secure(res); }
    } catch (e) {
      console.log('api error', e && e.stack || e);
      return secure(err(500));
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return secure(err(405));
    const res = await env.ASSETS.fetch(req);
    const out = secure(res, url.pathname === '/' || url.pathname.endsWith('.html'));
    // the service worker and the page itself always revalidate; fonts and icons can be cached
    if (url.pathname === '/sw.js' || url.pathname === '/' || url.pathname.endsWith('.html') || url.pathname.endsWith('.webmanifest')) out.headers.set('cache-control', 'no-cache');
    else if (/^\/(fonts|icons)\//.test(url.pathname)) out.headers.set('cache-control', 'public, max-age=604800');
    return out;
  },
};
