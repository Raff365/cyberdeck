// Small helpers shared by the worker and the Durable Objects. No dependencies: WebCrypto only.

const enc = new TextEncoder();

export function b64url(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function unb64url(s) {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]*={0,2}$/.test(s)) throw new Error('bad base64url');
  const t = s.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '==='.slice((t.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const rand = n => crypto.getRandomValues(new Uint8Array(n));
export const randId = (n = 12) => b64url(rand(n));
// letters and digits only (ids that also pass the kid app's own id checks)
const AN = 'abcdefghijklmnopqrstuvwxyz0123456789';
export function randAlnum(n = 16) {
  const r = rand(n * 2);
  let s = '';
  for (let i = 0; s.length < n && i < r.length; i++) if (r[i] < 252) s += AN[r[i] % 36];
  return s.length === n ? s : randAlnum(n);
}
// pairing codes: 8 characters, no 0/O/1/I/L to misread, shown as ABCD-2345
export const CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function randCode() {
  let s = '';
  while (s.length < 8) {
    const r = rand(16);
    for (let i = 0; s.length < 8 && i < r.length; i++) if (r[i] < 248) s += CODE_ABC[r[i] % 31];
  }
  return s;
}
export function normCode(v) {
  if (typeof v !== 'string' || v.length > 20) return null;
  const c = v.toUpperCase().replace(/[\s-]/g, '');
  return c.length === 8 && [...c].every(ch => CODE_ABC.includes(ch)) ? c : null;
}

export async function sha256hex(s) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', typeof s === 'string' ? enc.encode(s) : s));
  return [...d].map(x => x.toString(16).padStart(2, '0')).join('');
}

/** Constant-time string compare (same-length hex digests in practice); never short-circuits on content. */
export function sameStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const n = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

// tokens: lu1.<family id>.<device id>.<secret>. The secret is only ever stored as a SHA-256 digest.
export const FID_RE = /^[A-Za-z0-9_-]{22}$/;
export const TID_RE = /^[A-Za-z0-9_-]{11}$/;
export function parseToken(h) {
  if (typeof h !== 'string' || h.length > 200) return null;
  const m = /^Bearer (lu1\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{11})\.([A-Za-z0-9_-]{43}))$/.exec(h.trim());
  return m ? { token: m[1], fid: m[2], tid: m[3], secret: m[4] } : null;
}
export function newToken(fid) {
  const tid = randId(8), secret = randId(32);
  return { tid, secret, token: `lu1.${fid}.${tid}.${secret}` };
}

// responses: JSON, never cached, generic errors only
export function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });
}
const MSG = { 400: 'bad_request', 401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 405: 'method_not_allowed', 409: 'conflict', 410: 'gone', 413: 'too_large', 415: 'unsupported', 429: 'rate_limited', 500: 'server_error', 503: 'unavailable' };
export const err = (status, code) => json({ error: code || MSG[status] || 'error' }, status, status === 429 ? { 'retry-after': '60' } : {});

/** Reads a body up to max bytes (Content-Length is checked first, then the real size). null: too large.
 *  A too-large body under 2 MB is still read to its end (and dropped), so the 413 reaches a client that is still sending. */
const DRAIN = 2 * 1024 * 1024;
export async function readBody(req, max) {
  const cl = req.headers.get('content-length');
  const tooBig = cl && (!/^\d+$/.test(cl) || +cl > max);
  if (!req.body) return tooBig ? null : new Uint8Array(0);
  if (tooBig && !(+cl <= DRAIN)) { try { await req.body.cancel(); } catch (e) {} return null; }
  const reader = req.body.getReader(), parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > DRAIN) { try { await reader.cancel(); } catch (e) {} return null; }
    if (n <= max) parts.push(value);
  }
  if (tooBig || n > max) return null;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.byteLength; }
  return out;
}

/** Reads (and drops) whatever is left of a request body, up to 2 MB: an early answer must not cut off a client still sending. */
export async function drain(req) {
  try {
    if (!req.body || req.bodyUsed) return;
    const r = req.body.getReader();
    let n = 0;
    for (;;) { const { done, value } = await r.read(); if (done) break; n += value.byteLength; if (n > DRAIN) { await r.cancel(); break; } }
  } catch (e) {}
}

/** A JSON object body up to max bytes; {err: Response} on anything else. */
export async function readJson(req, max = 4096) {
  const ct = (req.headers.get('content-type') || '').toLowerCase();
  const b = await readBody(req, max);   // read first, so a refused request never leaves its body unread on the connection
  if (b === null) return { err: err(413) };
  if (!ct.startsWith('application/json')) return { err: err(415) };
  try {
    const v = JSON.parse(new TextDecoder().decode(b));
    if (!v || typeof v !== 'object' || Array.isArray(v)) return { err: err(400) };
    return { v };
  } catch (e) {
    return { err: err(400) };
  }
}

// validation helpers: each returns a clean value or the fallback
export const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
export const int = (v, lo, hi, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
export const str = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n).trim() : '');
export const bool = v => v === true;
export const isDay = v => typeof v === 'string' && /^\d{4}-\d\d-\d\d$/.test(v);
export const ID_RE = /^[A-Za-z0-9]{4,24}$/;
export const oneOf = (v, list, d) => (list.includes(v) ? v : d);
