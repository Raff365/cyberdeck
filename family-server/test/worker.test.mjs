// LEVEL UP Family server tests: a real local worker (wrangler dev --local, i.e. workerd + Miniflare with SQLite Durable
// Objects) with the test hooks on, plus a local "push service" that records what the worker sends.
// Covers pairing, tokens, validation, rate limits, storage caps, the commands lifecycle, photos, the retention alarm,
// unlink, devices, and Web Push (RFC 8291 test vector, and a real notification decrypted with the subscriber's key).
// Run: npm test   (or node --test test/)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { encryptPayload, vapidAuth, pushHostOk } from '../src/webpush.js';
import { b64url, unb64url } from '../src/util.js';

const PORT = 8800 + Math.floor(Math.random() * 100), PUSH_PORT = PORT + 100, BASE = `http://127.0.0.1:${PORT}`;
const DAY = 864e5;
let wd, pushSrv, ipN = 0;
const pushes = [];       // what the "push service" received
let pushStatus = 201;    // what it answers

const ip = () => `10.1.${Math.floor(++ipN / 250)}.${ipN % 250}`;
async function req(p, { method = 'GET', token, body, headers = {}, raw, ipAddr } = {}) {
  const h = { ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  if (body !== undefined && !raw) h['content-type'] = 'application/json';
  if (ipAddr) h['cf-connecting-ip'] = ipAddr;
  const r = await fetch(BASE + p, { method, headers: h, body: raw ? body : body !== undefined ? JSON.stringify(body) : undefined });
  const ct = r.headers.get('content-type') || '';
  return { status: r.status, headers: r.headers, body: ct.includes('json') ? await r.json() : new Uint8Array(await r.arrayBuffer()) };
}
async function family(name = 'Raff') {
  const r = await req('/api/family', { method: 'POST', body: { name }, ipAddr: ip() });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
}
async function pair(code, name = "Mum's iPhone") {
  return req('/api/pair', { method: 'POST', body: { code, name }, ipAddr: ip() });
}
async function linked(name) {
  const f = await family(name), p = await pair(f.code);
  assert.equal(p.status, 200);
  return { ...f, parent: p.body.token };
}
const clock = (token, offset) => req('/api/_test/clock', { method: 'POST', token, body: { offset } });
const count = token => req('/api/_test/count', { token }).then(r => r.body);
const sync = (token, b) => req('/api/kid/sync', { method: 'POST', token, body: b });
const jpeg = (n = 2000) => { const b = new Uint8Array(n); b.set([0xff, 0xd8, 0xff, 0xe0]); b[n - 2] = 0xff; b[n - 1] = 0xd9; for (let i = 4; i < n - 2; i++) b[i] = (i * 31) & 0xff; return b; };
const putPhoto = (token, entry, bytes, ct = 'image/jpeg') => req(`/api/kid/photo?entry=${entry}&t=${Date.now()}`, { method: 'PUT', token, body: bytes, raw: true, headers: { 'content-type': ct } });
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const SNAP = () => ({ v: 1, at: Date.now(), day: today(), name: 'Raff', scr: { on: true, meas: true, lim: 60, used: 42, total: 125, top: [{ n: 'YouTube', m: 25 }, { n: 'Roblox', m: 12 }] },
  hw: { k: 'done', v: 'Done', sub: '47 min · finished 4:49 PM', next: 0, cfg: { set: true, on: true, min: 45, days: [1, 2, 3, 4, 5], at: 960, rule: 'photo' } },
  pf: 30, pfv: 30, ck: 3, ckN: 6, ckd: ['Fit', 'Water', 'Mood'], qd: 2, qn: 3, ulT: 1,
  week: { k0: today(), days: [{ k: today(), u: 42, l: 60, ok: false, fin: false, pf: 30, ck: 3 }], under: 3, limDays: 5, hwN: 4, hwM: 142, hwP: 3, ulW: 2, wo: 1, woM: 32, pfW: 58, ckDays: 2, ckNeed: 4 },
  att: [{ t: Date.now() - 3600e3, k: 'unl', hd: 'Push-up unlock used', sub: '10 push-ups on camera for 15 min of limited apps' }],
  log: [{ id: 'hwe4dddddddd', t0: Date.now() - 3 * 3600e3, t1: Date.now() - 2 * 3600e3, m: 47, how: 'proof', why: 'm', n: 'Science worksheet', ph: true, pc: false, bad: false, tp: [] }],
  coins: 1240, bonus: [{ at: Date.now() - DAY, n: 50, w: 'Helped with the groceries' }], plan: { lim: 60, apps: 5, next: null }, ideas: 1 });

before(async () => {
  pushSrv = http.createServer((rq, rs) => {
    const parts = [];
    rq.on('data', c => parts.push(c));
    rq.on('end', () => { pushes.push({ url: rq.url, headers: rq.headers, body: new Uint8Array(Buffer.concat(parts)) }); rs.writeHead(pushStatus); rs.end(); });
  });
  await new Promise(r => pushSrv.listen(PUSH_PORT, '127.0.0.1', r));
  const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'luf-'));
  wd = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--ip', '127.0.0.1', '--persist-to', persist, '--var', 'TEST_HOOKS:1', '--var', `TEST_PUSH_HOST:127.0.0.1:${PUSH_PORT}`, '--show-interactive-dev-session=false'],
    { cwd: new URL('..', import.meta.url).pathname, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let log = '';
  wd.stdout.on('data', d => { log += d; }); wd.stderr.on('data', d => { log += d; });
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(BASE + '/'); if (r.ok) return; } catch (e) {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('wrangler dev did not start:\n' + log.slice(-2000));
});
after(async () => {
  try { process.kill(-wd.pid, 'SIGTERM'); } catch (e) {}
  pushSrv.close();
});

/* ------------------------------------------------------------------ pairing */
test('a family: kid token, an 8-character code that expires in 10 minutes, a link', async () => {
  const f = await family();
  assert.match(f.family, /^[A-Za-z0-9_-]{22}$/);
  assert.match(f.kidToken, /^lu1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{11}\.[A-Za-z0-9_-]{43}$/);
  assert.match(f.code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
  assert.ok(f.codeExp - Date.now() > 9 * 60e3 && f.codeExp - Date.now() <= 10 * 60e3 + 1000);
  assert.equal(f.link, `${BASE}/#pair=${f.code}`);
  assert.ok(f.kidToken.split('.')[1] === f.family);
});

test('pairing: wrong code, the right one (any case, with a dash), single use, max 4 parents', async () => {
  const f = await family();
  assert.equal((await pair('ABCD2345')).status, 404);
  assert.equal((await pair('not a code')).body.error, 'bad_code');
  const p = await pair(`${f.code.slice(0, 4).toLowerCase()}-${f.code.slice(4)}`);
  assert.equal(p.status, 200);
  assert.match(p.body.token, /^lu1\./);
  assert.equal(p.body.child, 'Raff');
  assert.equal((await pair(f.code)).status, 404, 'a code works once');
  for (let i = 0; i < 3; i++) {
    const c = await req('/api/kid/code', { method: 'POST', token: f.kidToken });
    assert.equal((await pair(c.body.code)).status, 200);
  }
  const c5 = await req('/api/kid/code', { method: 'POST', token: f.kidToken });
  const p5 = await pair(c5.body.code);
  assert.equal(p5.status, 409);
  assert.equal(p5.body.error, 'full');
  const d = await req('/api/kid/devices', { token: f.kidToken });
  assert.equal(d.body.devices.length, 4);
  assert.ok(d.body.devices.every(x => /^[A-Za-z0-9_-]{11}$/.test(x.id) && x.name && !('h' in x) && !('token' in x)));
});

test('pairing: a new code replaces the old one; a code expires after 10 minutes', async () => {
  const f = await family();
  const c2 = await req('/api/kid/code', { method: 'POST', token: f.kidToken });
  assert.equal((await pair(f.code)).status, 404, 'the old code is gone');
  await clock(f.kidToken, 10 * 60e3 + 5000);
  assert.equal((await pair(c2.body.code)).status, 404, 'expired');
  await clock(f.kidToken, 0);
});

test('pairing: rate limited per IP (10 tries / 10 min)', async () => {
  const me = '10.200.0.1';
  const codes = [];
  for (let i = 0; i < 10; i++) codes.push((await req('/api/pair', { method: 'POST', body: { code: 'ZZZZ2222' }, ipAddr: me })).status);
  assert.deepEqual([...new Set(codes)], [404]);
  assert.equal((await req('/api/pair', { method: 'POST', body: { code: 'ZZZZ2222' }, ipAddr: me })).status, 429);
  assert.equal((await req('/api/pair', { method: 'POST', body: { code: 'ZZZZ2222' }, ipAddr: '10.200.0.2' })).status, 404, 'another IP is fine');
});

test('making families: rate limited per IP (5 / hour)', async () => {
  const me = '10.201.0.1', st = [];
  for (let i = 0; i < 6; i++) st.push((await req('/api/family', { method: 'POST', body: {}, ipAddr: me })).status);
  assert.deepEqual(st, [200, 200, 200, 200, 200, 429]);
});

/* ------------------------------------------------------------------ tokens */
test('tokens: hashed at rest, role-checked, malformed or wrong ones get a generic 401', async () => {
  const f = await linked();
  const c = await count(f.kidToken);
  assert.equal(c.tokens, 2);
  for (const t of c.tokenRows) { assert.match(t.h, /^[0-9a-f]{64}$/); assert.ok(!f.kidToken.includes(t.h) && !f.parent.includes(t.h)); }
  const secretK = f.kidToken.split('.')[3], secretP = f.parent.split('.')[3];
  assert.ok(!JSON.stringify(c).includes(secretK) && !JSON.stringify(c).includes(secretP), 'no secret stored');
  const bad = [
    f.kidToken.slice(0, -1) + (f.kidToken.endsWith('A') ? 'B' : 'A'),   // wrong secret
    f.kidToken.replace(/\.([^.]+)\.([^.]+)$/, (m, a, b) => `.${'A'.repeat(11)}.${b}`),   // unknown device
    'lu1.x.y.z', 'garbage', '',
  ];
  for (const t of bad) {
    const r = await req('/api/kid/devices', { token: t });
    assert.equal(r.status, 401); assert.deepEqual(r.body, { error: 'unauthorized' });
  }
  assert.equal((await req('/api/parent/state', { token: f.kidToken })).status, 401, 'kid token on a parent endpoint');
  assert.equal((await req('/api/kid/devices', { token: f.parent })).status, 401, 'parent token on a kid endpoint');
  const other = await linked();
  const forged = `lu1.${other.family}.${f.parent.split('.').slice(2).join('.')}`;
  assert.equal((await req('/api/parent/state', { token: forged })).status, 401, "a token can't open another family");
  assert.equal((await req('/api/parent/state', { token: f.parent })).status, 200);
});

test('no listing, no CORS, security headers, unknown routes 404', async () => {
  for (const p of ['/api/families', '/api/kid', '/api/parent', '/api/_init', '/api/registry', '/api/x']) assert.equal((await req(p)).status, p === '/api/kid' || p === '/api/parent' ? 404 : 404);
  const r = await fetch(BASE + '/api/family', { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } });
  assert.equal(r.headers.get('access-control-allow-origin'), null);
  const h = await fetch(BASE + '/');
  assert.match(h.headers.get('content-security-policy'), /default-src 'self'/);
  assert.match(h.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(h.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(h.headers.get('referrer-policy'), 'no-referrer');
  const a = await req('/api/parent/state');
  assert.equal(a.headers.get('cache-control'), 'no-store');
  assert.equal(a.headers.get('x-frame-options'), 'DENY');
  const m = await fetch(BASE + '/manifest.webmanifest');
  assert.equal(m.status, 200);
  assert.equal((await m.json()).display, 'standalone');
  for (const p of ['/sw.js', '/app.js', '/style.css', '/fonts/archivo-var.woff2', '/icons/icon-192.png']) assert.equal((await fetch(BASE + p)).status, 200, p);
});

/* ------------------------------------------------------------------ validation */
test('sync: content type, size, and the snapshot rebuilt field by field', async () => {
  const f = await linked();
  assert.equal((await req('/api/kid/sync', { method: 'POST', token: f.kidToken, body: 'x', raw: true, headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await req('/api/kid/sync', { method: 'POST', token: f.kidToken, body: '{bad json', raw: true, headers: { 'content-type': 'application/json' } })).status, 400);
  assert.equal((await req('/api/kid/sync', { method: 'POST', token: f.kidToken, body: '[1,2]', raw: true, headers: { 'content-type': 'application/json' } })).status, 400);
  assert.equal((await sync(f.kidToken, { pad: 'x'.repeat(100 * 1024) })).status, 413);
  assert.equal((await sync(f.kidToken, { snap: { day: 'yesterday' } })).status, 400);
  const s = SNAP();
  s.secretMessages = ['hi']; s.location = { lat: 1 }; s.scr.top.push({ n: '<img src=x onerror=alert(1)>' + 'A'.repeat(100), m: 99999 }); s.name = 'Raff\u0000 Murphy the Great and Powerful';
  s.att.push({ t: Date.now(), k: 'evil', hd: 'x', sub: 'y', html: '<b>' });
  const r = await sync(f.kidToken, { snap: s, nat: { at: Date.now(), blocker: true, usage: true, lim: 60, used: 44, total: 130, hw: null, ulLeft: 1, ulUntil: 0, ver: '1.0.41', contacts: ['x'] } });
  assert.equal(r.status, 200);
  const st = (await req('/api/parent/state', { token: f.parent })).body;
  assert.equal(st.snap.secretMessages, undefined); assert.equal(st.snap.location, undefined);
  assert.equal(st.snap.name, 'Raff Murphy the');
  assert.equal(st.snap.name.length <= 16, true);
  assert.equal(st.snap.scr.top[2].n.length, 40); assert.equal(st.snap.scr.top[2].m, 1440);
  assert.equal(st.snap.att[1].k, 'info'); assert.equal(st.snap.att[1].html, undefined);
  assert.equal(st.nat.contacts, undefined); assert.equal(st.nat.used, 44);
  assert.equal(st.child, 'Raff Murphy the');
  assert.deepEqual(Object.keys(st.snap).sort(), ['at', 'att', 'bonus', 'ckN', 'ck', 'ckd', 'coins', 'day', 'hw', 'ideas', 'log', 'name', 'pf', 'pfv', 'plan', 'qd', 'qn', 'scr', 'ulT', 'v', 'week'].sort());
});

test('events: unknown kinds dropped, ids deduplicated, timestamps clamped', async () => {
  const f = await linked();
  const ev = [{ id: 'ev0001aa', t: Date.now(), k: 'hw_start', d: {} }, { id: 'ev0001aa', t: Date.now(), k: 'hw_start' }, { id: 'ev0002aa', t: Date.now() + 365 * DAY, k: 'clock', d: { n: 'x'.repeat(500) } },
    { id: 'ev0003aa', t: Date.now(), k: 'keylog', d: {} }, { id: 'bad id!', k: 'hw_start' }];
  await sync(f.kidToken, { events: ev });
  await sync(f.kidToken, { events: ev });   // sent twice
  const st = (await req('/api/parent/state', { token: f.parent })).body;
  assert.deepEqual(st.events.map(e => e.id).sort(), ['ev0001aa', 'ev0002aa']);
  const c = st.events.find(e => e.id === 'ev0002aa');
  assert.ok(c.t <= Date.now() + 61e3); assert.equal(c.d.n.length, 80);
});

/* ------------------------------------------------------------------ rate limits + caps */
test('rate limits per token: kid 120 / 10 min, parent commands 30 / hour', async () => {
  const f = await linked();
  const st = [];
  for (let i = 0; i < 122; i++) st.push((await req('/api/kid/devices', { token: f.kidToken })).status);
  assert.equal(st.filter(s => s === 200).length, 120); assert.equal(st[121], 429);
  assert.equal((await req('/api/parent/state', { token: f.parent })).status, 200, "one device's limit doesn't touch another's");
  await clock(f.kidToken, 11 * 60e3);
  assert.equal((await req('/api/kid/devices', { token: f.kidToken })).status, 200, 'the window moves on');
  await clock(f.kidToken, 0);
  const g = await linked(), cs = [];
  for (let i = 0; i < 31; i++) {
    const r = await req('/api/parent/cmd', { method: 'POST', token: g.parent, body: { kind: 'idea', args: { n: `Idea ${i}`, min: 10, cat: 'out' } } });
    cs.push(r.status);
    if (r.status === 200 && i % 5 === 4) await sync(g.kidToken, { acks: (await sync(g.kidToken, {})).body.cmds.map(c => ({ id: c.id, ok: true })) });
  }
  assert.equal(cs.filter(s => s === 200).length, 30); assert.equal(cs[30], 429);
});

test('storage caps: newest 3000 events kept', async () => {
  const f = await linked();
  for (let b = 0; b < 61; b++) {
    const ev = Array.from({ length: 50 }, (_, i) => ({ id: `e${String(b * 50 + i).padStart(6, '0')}`, t: Date.now() - (3050 - b * 50 - i) * 1000, k: 'blocker_on', d: {} }));
    assert.equal((await sync(f.kidToken, { events: ev })).status, 200);
  }
  const c = await count(f.kidToken);
  assert.equal(c.events, 3000);
  const st = (await req('/api/parent/state', { token: f.parent })).body;
  assert.equal(st.events.length, 300, 'a parent gets the newest 300');
  assert.equal(st.events[0].id, 'e003049');
});

/* ------------------------------------------------------------------ commands */
test('commands: validation, delivery, ack (idempotent), cancel, expiry, pending cap', async () => {
  const f = await linked();
  const bad = [{ kind: 'wipe_phone' }, { kind: 'coins', args: { n: 501 } }, { kind: 'coins', args: { n: 0 } }, { kind: 'coins', args: { n: 2.5 } }, { kind: 'limit', args: { limit: 75, mode: 'tighten' } },
    { kind: 'limit', args: { limit: 60, mode: 'off' } }, { kind: 'idea', args: { n: '', min: 10, cat: 'out' } }, { kind: 'idea', args: { n: 'x', min: 11, cat: 'out' } }, { kind: 'idea', args: { n: 'x', min: 10, cat: 'nope' } },
    { kind: 'hw_check', args: { id: '../x', on: true } }, { kind: 'hw_check', args: { id: 'hwe4dddddddd', on: 'yes' } }];
  for (const b of bad) assert.equal((await req('/api/parent/cmd', { method: 'POST', token: f.parent, body: b })).status, 400, JSON.stringify(b));
  const mk = async (kind, args) => (await req('/api/parent/cmd', { method: 'POST', token: f.parent, body: { kind, args } })).body.cmd;
  const c1 = await mk('coins', { n: 50, w: 'Helped with the groceries\u0000<b>', extra: 1 });
  assert.match(c1.id, /^[a-z0-9]{16}$/); assert.equal(c1.status, 'pending'); assert.deepEqual(c1.args, { n: 50, w: 'Helped with the groceries <b>' });
  assert.ok(c1.exp - c1.created === DAY);
  const c2 = await mk('hw_end', {});
  const c3 = await mk('limit', { limit: 45, mode: 'tighten' });
  // cancel while pending
  assert.equal((await req('/api/parent/cmd/cancel', { method: 'POST', token: f.parent, body: { id: c3.id } })).body.ok, true);
  const s1 = await sync(f.kidToken, {});
  assert.deepEqual(s1.body.cmds.map(c => c.id), [c1.id, c2.id], 'pending ones, oldest first; not the cancelled one');
  assert.equal((await req('/api/parent/cmd/cancel', { method: 'POST', token: f.parent, body: { id: c1.id } })).body.ok, false, 'too late once it reached the phone');
  // still delivered till acked (a lost reply)
  assert.equal((await sync(f.kidToken, {})).body.cmds.length, 2);
  await sync(f.kidToken, { acks: [{ id: c1.id, ok: true }, { id: c2.id, ok: false, why: 'inactive' }] });
  await sync(f.kidToken, { acks: [{ id: c1.id, ok: false, why: 'late' }] });   // a second ack changes nothing
  assert.equal((await sync(f.kidToken, {})).body.cmds.length, 0);
  const st = (await req('/api/parent/state', { token: f.parent })).body.cmds;
  const by = Object.fromEntries(st.map(c => [c.id, c]));
  assert.equal(by[c1.id].status, 'done'); assert.equal(by[c2.id].status, 'failed'); assert.equal(by[c2.id].result, 'inactive'); assert.equal(by[c3.id].status, 'cancelled');
  assert.ok(by[c1.id].mine);
  // expiry: a day later, an undelivered one is expired and never delivered
  const c4 = await mk('hw_start', {});
  await clock(f.kidToken, DAY + 1000);
  assert.equal((await sync(f.kidToken, {})).body.cmds.length, 0);
  const st2 = (await req('/api/parent/state', { token: f.parent })).body.cmds;
  assert.equal(st2.find(c => c.id === c4.id).status, 'expired');
  // pending cap
  const g = await linked(), cs = [];
  for (let i = 0; i < 21; i++) cs.push((await req('/api/parent/cmd', { method: 'POST', token: g.parent, body: { kind: 'hw_start', args: {} } })).status);
  assert.equal(cs.filter(s => s === 200).length, 20); assert.equal(cs[20], 429);
  await clock(f.kidToken, 0);
});

/* ------------------------------------------------------------------ photos */
test('photos: off by default, JPEG only, 400 KB max, removed when switched off, 100 kept', async () => {
  const f = await linked();
  assert.equal((await putPhoto(f.kidToken, 'hwe4dddddddd', jpeg())).status, 403, 'off by default');
  let s = await sync(f.kidToken, { photos: true });
  assert.equal(s.body.photos, true);
  assert.equal((await putPhoto(f.kidToken, 'hwe4dddddddd', jpeg(), 'image/png')).status, 400);
  assert.equal((await putPhoto(f.kidToken, 'hwe4dddddddd', new TextEncoder().encode('x'.repeat(500)))).status, 400, 'not a JPEG');
  assert.equal((await putPhoto(f.kidToken, '../../x', jpeg())).status, 400);
  assert.equal((await putPhoto(f.kidToken, 'hwe4dddddddd', jpeg(400 * 1024 + 1))).status, 413);
  const pic = jpeg(400 * 1024);
  assert.equal((await putPhoto(f.kidToken, 'hwe4dddddddd', pic)).status, 200);
  s = await sync(f.kidToken, {});
  assert.deepEqual(s.body.have, ['hwe4dddddddd'], 'the phone learns what is already there');
  const got = await req('/api/parent/photo?entry=hwe4dddddddd', { token: f.parent });
  assert.equal(got.status, 200); assert.equal(got.headers.get('content-type'), 'image/jpeg'); assert.match(got.headers.get('cache-control'), /no-store/);
  assert.deepEqual(got.body, pic);
  assert.equal((await req('/api/parent/photo?entry=hwe4dddddddd', { token: f.kidToken })).status, 401);
  await sync(f.kidToken, { photos: false });
  assert.equal((await count(f.kidToken)).photos, 0, 'switched off: deleted');
  assert.equal((await req('/api/parent/photo?entry=hwe4dddddddd', { token: f.parent })).status, 404);
  // the cap (the photo rate limit is 40 an hour: the test clock moves the window)
  await sync(f.kidToken, { photos: true });
  for (let i = 0; i < 105; i++) {
    if (i && i % 30 === 0) await clock(f.kidToken, (i / 30) * 3600e3 + 1000);
    assert.equal((await putPhoto(f.kidToken, `hwcap${String(i).padStart(4, '0')}`, jpeg(300))).status, 200);
  }
  assert.equal((await count(f.kidToken)).photos, 100);
  await clock(f.kidToken, 0);
});

/* ------------------------------------------------------------------ retention + unlink */
test('retention alarm: older than 30 days deleted; an unused family deleted after 90 days', async () => {
  const f = await linked();
  await sync(f.kidToken, { snap: SNAP(), photos: true, events: [{ id: 'old00001', t: Date.now(), k: 'hw_done', d: { m: 45 } }] });
  await putPhoto(f.kidToken, 'hwe4dddddddd', jpeg());
  await req('/api/parent/cmd', { method: 'POST', token: f.parent, body: { kind: 'hw_start', args: {} } });
  let c = await count(f.kidToken);
  assert.deepEqual([c.snaps, c.events, c.photos, c.cmds], [1, 1, 1, 1]);
  assert.ok(c.alarm > Date.now(), 'an alarm is set');
  await clock(f.kidToken, 29 * DAY);
  await req('/api/_test/alarm', { method: 'POST', token: f.kidToken, body: {} });
  c = await count(f.kidToken);
  assert.deepEqual([c.snaps, c.events, c.photos, c.cmds], [1, 1, 1, 1], '29 days: kept');
  await clock(f.kidToken, 31 * DAY);
  await req('/api/kid/devices', { token: f.kidToken });   // still in use
  const a = await req('/api/_test/alarm', { method: 'POST', token: f.kidToken, body: {} });
  assert.ok(a.body.alarm, 'the alarm sets itself again');
  c = await count(f.kidToken);
  assert.deepEqual([c.snaps, c.events, c.photos, c.cmds, c.tokens], [0, 0, 0, 0, 2], '31 days: gone, the devices stay');
  const st = (await req('/api/parent/state', { token: f.parent })).body;
  assert.equal(st.snap, null); assert.equal(st.nat, null);
  // nobody used it for 90 days: all of it goes
  await clock(f.kidToken, 31 * DAY + 91 * DAY);
  await req('/api/_test/alarm', { method: 'POST', token: f.kidToken, body: {} });
  const z = await count(f.kidToken);
  assert.equal(z.live, false); assert.equal(z.keys, 0);
});

test('unlink & delete: everything wiped, every token dead, the code gone', async () => {
  const f = await linked();
  await sync(f.kidToken, { snap: SNAP(), photos: true, events: [{ id: 'unl00001', t: Date.now(), k: 'hw_done', d: {} }] });
  await putPhoto(f.kidToken, 'hwe4dddddddd', jpeg());
  const code = (await req('/api/kid/code', { method: 'POST', token: f.kidToken })).body.code;
  const r = await req('/api/kid/unlink', { method: 'POST', token: f.kidToken, body: {} });
  assert.equal(r.status, 200);
  const z = await count(f.kidToken);
  assert.equal(z.live, false); assert.equal(z.keys, 0, 'deleteAll: no rows, no keys');
  assert.equal((await req('/api/parent/state', { token: f.parent })).status, 401);
  assert.equal((await req('/api/kid/devices', { token: f.kidToken })).status, 401);
  assert.equal((await pair(code)).status, 404);
  assert.equal((await count(f.kidToken)).live, false, 'a dead token leaves nothing behind');
});

test('devices: the kid app revokes a parent phone (its token and push subscriptions go)', async () => {
  const f = await linked();
  const d = (await req('/api/kid/devices', { token: f.kidToken })).body.devices;
  assert.equal(d.length, 1); assert.equal(d[0].name, "Mum's iPhone");
  const r = await req('/api/kid/devices/revoke', { method: 'POST', token: f.kidToken, body: { id: d[0].id } });
  assert.equal(r.body.devices.length, 0);
  assert.equal((await req('/api/parent/state', { token: f.parent })).status, 401);
  // a parent can also leave on their own
  const g = await linked();
  assert.equal((await req('/api/parent/leave', { method: 'POST', token: g.parent, body: {} })).status, 200);
  assert.equal((await req('/api/parent/state', { token: g.parent })).status, 401);
});

/* ------------------------------------------------------------------ Web Push */
// RFC 8291 section 5's worked example, byte for byte
test('Web Push: RFC 8291 test vector', async () => {
  const asPub = unb64url('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8');
  const jwk = { kty: 'EC', crv: 'P-256', d: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', x: b64url(asPub.slice(1, 33)), y: b64url(asPub.slice(33)) };
  const asKeys = { privateKey: await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']),
    publicKey: await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, true, []) };
  const out = await encryptPayload('When I grow up, I want to be a watermelon', 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', 'BTBZMqHH6r4Tts7J_aSIgg',
    { salt: unb64url('DGv6ra1nlYgDCS1FRnbzlw'), asKeys });
  assert.equal(b64url(out), 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
});

async function decrypt(body, uaPriv, uaPub, auth) {
  const salt = body.slice(0, 16), rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0), idlen = body[20], asPub = body.slice(21, 21 + idlen), ct = body.slice(21 + idlen);
  assert.equal(rs, 4096); assert.equal(idlen, 65);
  const asKey = await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, uaPriv, 256));
  const hk = async (s, ikm, info, n) => new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: s, info }, await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), n * 8));
  const te = new TextEncoder(), cat = (...a) => { const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
  const ikm = await hk(auth, shared, cat(te.encode('WebPush: info\0'), uaPub, asPub), 32);
  const cek = await hk(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16), nonce = await hk(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), ct));
  let end = pt.length - 1; while (end >= 0 && pt[end] === 0) end--;
  assert.equal(pt[end], 2, 'last-record delimiter');
  return new TextDecoder().decode(pt.slice(0, end));
}

test('Web Push: a real notification, VAPID-signed and decryptable only with the subscriber key; gone subscriptions dropped', async () => {
  const f = await linked();
  const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const uaPub = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey)), auth = crypto.getRandomValues(new Uint8Array(16));
  // only real push services (or this test's local one) are accepted
  for (const ep of ['https://evil.example/push', 'http://web.push.apple.com/x', 'https://web.push.apple.com:8443/x', 'https://user:pw@fcm.googleapis.com/x', 'file:///etc/passwd'])
    assert.equal((await req('/api/parent/push/sub', { method: 'POST', token: f.parent, body: { endpoint: ep, keys: { p256dh: b64url(uaPub), auth: b64url(auth) } } })).status, 400, ep);
  assert.ok(pushHostOk('https://web.push.apple.com/QGx1')); assert.ok(pushHostOk('https://fcm.googleapis.com/fcm/send/abc')); assert.ok(!pushHostOk('https://apple.com.evil.example/x'));
  const key = (await req('/api/parent/push/key', { token: f.parent })).body.key;
  assert.match(key, /^[A-Za-z0-9_-]{87}$/);
  assert.equal((await req('/api/parent/push/key', { token: f.parent })).body.key, key, 'one keypair per family, kept');
  const endpoint = `http://127.0.0.1:${PUSH_PORT}/push/${f.family}`;
  assert.equal((await req('/api/parent/push/sub', { method: 'POST', token: f.parent, body: { endpoint, keys: { p256dh: b64url(uaPub), auth: b64url(auth) } } })).status, 200);
  pushes.length = 0; pushStatus = 201;
  await sync(f.kidToken, { events: [{ id: 'push0001', t: Date.now(), k: 'hw_done', d: { m: 47, n: 'Science worksheet' } }, { id: 'push0002', t: Date.now(), k: 'hw_start', d: {} }] });
  for (let i = 0; i < 40 && !pushes.length; i++) await new Promise(r => setTimeout(r, 100));
  assert.equal(pushes.length, 1, 'one notification (hw_start is not one)');
  const p = pushes[0];
  assert.equal(p.headers['content-encoding'], 'aes128gcm'); assert.equal(p.headers.ttl, '86400'); assert.equal(p.headers.urgency, 'high');
  const m = /^vapid t=([^,]+), k=([A-Za-z0-9_-]+)$/.exec(p.headers.authorization);
  assert.ok(m, p.headers.authorization); assert.equal(m[2], key);
  const [hh, cc, sig] = m[1].split('.');
  const claims = JSON.parse(new TextDecoder().decode(unb64url(cc)));
  assert.equal(claims.aud, `http://127.0.0.1:${PUSH_PORT}`); assert.ok(claims.exp > Date.now() / 1000 && claims.exp <= Date.now() / 1000 + 24 * 3600);
  assert.match(claims.sub, /^(mailto:|https?:)/);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(unb64url(hh))), { typ: 'JWT', alg: 'ES256' });
  const vk = await crypto.subtle.importKey('raw', unb64url(key), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, vk, unb64url(sig), new TextEncoder().encode(`${hh}.${cc}`)), 'ES256 signature verifies with the public key');
  const msg = JSON.parse(await decrypt(p.body, ua.privateKey, uaPub, auth));
  assert.equal(msg.title, 'Homework done'); assert.equal(msg.body, 'Raff finished homework: 47 min · Science worksheet.'); assert.equal(msg.url, '/#homework');
  // the same event again: no second notification
  pushes.length = 0;
  await sync(f.kidToken, { events: [{ id: 'push0001', t: Date.now(), k: 'hw_done', d: { m: 47 } }] });
  await new Promise(r => setTimeout(r, 500));
  assert.equal(pushes.length, 0);
  // a parent's own remote command: no notification
  await sync(f.kidToken, { events: [{ id: 'push0003', t: Date.now(), k: 'hw_early', d: { m: 5, by: 'remote' } }] });
  await new Promise(r => setTimeout(r, 500));
  assert.equal(pushes.length, 0);
  // test button
  const t = await req('/api/parent/push/test', { method: 'POST', token: f.parent, body: {} });
  assert.equal(t.body.ok, true);
  assert.equal(JSON.parse(await decrypt(pushes[0].body, ua.privateKey, uaPub, auth)).tag, 'test');
  // the push service says the subscription is gone: it's dropped
  pushStatus = 410; pushes.length = 0;
  await sync(f.kidToken, { events: [{ id: 'push0004', t: Date.now(), k: 'blocker_off', d: {} }] });
  for (let i = 0; i < 40 && !pushes.length; i++) await new Promise(r => setTimeout(r, 100));
  await new Promise(r => setTimeout(r, 300));
  assert.equal((await count(f.kidToken)).subs, 0);
  pushStatus = 201;
});

test('Web Push: VAPID header works the same in Node (WebCrypto only, no dependencies)', async () => {
  const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = b64url(new Uint8Array(await crypto.subtle.exportKey('raw', k.publicKey))), j = await crypto.subtle.exportKey('jwk', k.privateKey);
  const h = await vapidAuth('https://web.push.apple.com/abc', { pub, priv: j }, 'https://levelup-family.example.workers.dev');
  assert.match(h, /^vapid t=[\w-]+\.[\w-]+\.[\w-]{86}, k=[\w-]{87}$/);
});
