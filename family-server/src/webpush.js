// Web Push with WebCrypto only: VAPID (RFC 8292, ES256 JWT) and message encryption (RFC 8291, aes128gcm / RFC 8188).
// Works the same in workerd and in Node 20+ (globalThis.crypto), which is how the tests check it.
import { b64url, unb64url } from './util.js';

const enc = new TextEncoder();
const concat = (...a) => { const n = a.reduce((s, x) => s + x.length, 0), o = new Uint8Array(n); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };

/** A new VAPID keypair: {pub: base64url raw P-256 point (65 bytes), priv: JWK} */
export async function vapidKeys() {
  const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', k.publicKey));
  const priv = await crypto.subtle.exportKey('jwk', k.privateKey);
  return { pub: b64url(pub), priv: { kty: priv.kty, crv: priv.crv, x: priv.x, y: priv.y, d: priv.d } };
}

/** The VAPID Authorization header for one push service origin. sub: a mailto: or https: contact. */
export async function vapidAuth(endpoint, keys, sub, nowS = Math.floor(Date.now() / 1000)) {
  const aud = new URL(endpoint).origin;
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(enc.encode(JSON.stringify({ aud, exp: nowS + 12 * 3600, sub })));
  const key = await crypto.subtle.importKey('jwk', { ...keys.priv, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  // WebCrypto's ECDSA signature is already r||s (64 bytes): exactly what JWS ES256 wants
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${keys.pub}`;
}

async function hkdf(salt, ikm, info, bytes) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, bytes * 8));
}

/**
 * RFC 8291: encrypts payload for a subscription's p256dh (base64url, 65 bytes) and auth (base64url, 16 bytes).
 * One record (rs 4096), so the payload must stay under ~3.9 KB. Returns the aes128gcm body.
 * opts.salt / opts.asKeys exist only so the tests can reproduce RFC 8291's worked example.
 */
export async function encryptPayload(payload, p256dh, auth, opts = {}) {
  const ua = unb64url(p256dh), secret = unb64url(auth);
  if (ua.length !== 65 || ua[0] !== 4 || secret.length !== 16) throw new Error('bad subscription keys');
  const plain = typeof payload === 'string' ? enc.encode(payload) : payload;
  if (plain.length > 3800) throw new Error('payload too large');
  const uaKey = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const as = opts.asKeys || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" 0x00 ua_public as_public, 32)
  const ikm = await hkdf(secret, shared, concat(enc.encode('WebPush: info\0'), ua, asPub), 32);
  const salt = opts.salt || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(plain, new Uint8Array([2]))));   // 0x02: the last (only) record
  const rs = new Uint8Array([0, 0, 16, 0]);   // 4096
  return concat(salt, rs, new Uint8Array([65]), asPub, ct);
}

/** Push service hosts a subscription may point at (no SSRF to anywhere else). */
export function pushHostOk(endpoint, extra = []) {
  let u;
  try { u = new URL(endpoint); } catch (e) { return false; }
  if (extra.includes(u.host) && (u.protocol === 'http:' || u.protocol === 'https:')) return true;
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false;
  const h = u.hostname.toLowerCase();
  return h === 'web.push.apple.com' || /(^|\.)push\.apple\.com$/.test(h) || h === 'fcm.googleapis.com' || h === 'updates.push.services.mozilla.com'
    || /(^|\.)push\.services\.mozilla\.com$/.test(h) || /(^|\.)notify\.windows\.com$/.test(h);
}

/** Sends one notification. Resolves {status} (201 ok; 404/410: the subscription is gone). Never throws. */
export async function sendPush(sub, payloadObj, keys, contact, { ttl = 86400, urgency = 'high', topic, fetcher = fetch } = {}) {
  try {
    const body = await encryptPayload(JSON.stringify(payloadObj), sub.p256dh, sub.auth);
    const headers = { TTL: String(ttl), Urgency: urgency, 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', Authorization: await vapidAuth(sub.endpoint, keys, contact) };
    if (topic && /^[A-Za-z0-9_-]{1,32}$/.test(topic)) headers.Topic = topic;
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetcher(sub.endpoint, { method: 'POST', headers, body, signal: ctl.signal });
      return { status: r.status };
    } finally { clearTimeout(t); }
  } catch (e) {
    return { status: 0, error: String(e && e.message || e) };
  }
}
