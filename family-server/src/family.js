// One Durable Object per family (SQLite storage). It is the family's whole server: the device tokens (hashed), the latest
// snapshot from the kid's phone, the events, the parents' commands, the optional homework photos and the Web Push
// subscriptions. Nothing here can list or reach another family. Everything older than 30 days is deleted by the alarm,
// and "Unlink & delete" on the kid's phone wipes it all (storage.deleteAll).
import { DurableObject } from 'cloudflare:workers';
import { json, err, readJson, readBody, drain, sha256hex, sameStr, newToken, parseToken, randAlnum, randCode, int, str, bool, isDay, isInt, ID_RE, oneOf, FID_RE } from './util.js';
import { vapidKeys, sendPush, pushHostOk } from './webpush.js';

const DAY = 864e5, KEEP = 30 * DAY, CMD_TTL = DAY, CODE_TTL = 10 * 60e3, IDLE_WIPE = 90 * DAY;
const MAX = { parents: 4, events: 3000, photos: 100, photoBytes: 400 * 1024, cmdsPending: 20, cmds: 300, subsPerDevice: 3, snapBytes: 48 * 1024, syncBytes: 96 * 1024 };
// requests per token per window: [max, window ms]
const RL = { k: [120, 600e3], kp: [40, 3600e3], kc: [10, 600e3], p: [300, 600e3], pc: [30, 3600e3], pp: [300, 600e3], pt: [6, 600e3] };
export const EVENT_KINDS = ['hw_start', 'hw_done', 'hw_early', 'hw_off', 'hw_time', 'blocker_off', 'blocker_on', 'clock', 'over_limit', 'unlock'];
const NOTIFY = new Set(['hw_done', 'hw_early', 'hw_off', 'blocker_off', 'over_limit', 'unlock']);
const LIMITS = [30, 45, 60, 90, 120];
const HOWS = ['proof', 'pin', 'time', 'off'];

// what a parent can ask the phone to do; args are checked here and again on the phone
export const COMMANDS = {
  hw_end: () => ({}),
  hw_start: () => ({}),
  coins: a => (isInt(a.n, -500, 500) && a.n !== 0 ? { n: a.n, w: str(a.w, 60) } : null),
  limit: a => (LIMITS.includes(a.limit) && (a.mode === 'tighten' || a.mode === 'loosen') ? { limit: a.limit, mode: a.mode } : null),
  hw_check: a => (typeof a.id === 'string' && ID_RE.test(a.id) && typeof a.on === 'boolean' ? { id: a.id, on: a.on } : null),
};

const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const arr = (v, n) => (Array.isArray(v) ? v.slice(0, n) : []);
const ms = (v, now) => int(v, 0, now + DAY);

/** The kid app's snapshot, rebuilt field by field: only what Parent mode shows, every value typed and capped. */
export function cleanSnap(s, now) {
  s = obj(s);
  if (!isDay(s.day)) return null;
  const sc = obj(s.scr), h = obj(s.hw), w = obj(s.week), c = obj(h.cfg), pl = obj(s.plan), run = obj(h.run);
  return {
    v: 1, at: ms(s.at, now), day: s.day, name: str(s.name, 16),
    scr: { on: bool(sc.on), meas: bool(sc.meas), lim: int(sc.lim, 0, 1440), used: int(sc.used, 0, 1440), total: int(sc.total, 0, 1440),
      top: arr(sc.top, 5).map(a => ({ n: str(obj(a).n, 40), m: int(obj(a).m, 0, 1440) })).filter(a => a.n) },
    hw: { k: oneOf(h.k, ['run', 'done', 'ended', 'off', 'not'], 'not'), v: str(h.v, 24), sub: str(h.sub, 80), next: ms(h.next, now + 8 * DAY),
      run: h.run ? { start: ms(run.start, now), left: int(run.left, 0, 4 * 3600e3), off: bool(run.off) } : null,
      cfg: { set: bool(c.set), on: bool(c.on), min: int(c.min, 0, 240), days: arr(c.days, 7).filter(d => isInt(d, 0, 6)), at: int(c.at, 0, 1439), rule: oneOf(c.rule, ['photo', 'parent'], 'photo') } },
    ck: int(s.ck, 0, 20), ckN: int(s.ckN, 0, 20), ckd: arr(s.ckd, 10).map(x => str(x, 24)).filter(Boolean),
    qd: int(s.qd, 0, 200), qn: int(s.qn, 0, 200), ulT: int(s.ulT, 0, 20),
    week: { k0: isDay(w.k0) ? w.k0 : '', days: arr(w.days, 7).map(d => { d = obj(d); return { k: isDay(d.k) ? d.k : '', u: d.u == null ? null : int(d.u, 0, 1440), l: int(d.l, 0, 1440), ok: bool(d.ok), fin: bool(d.fin), ck: int(d.ck, 0, 20) }; }),
      under: int(w.under, 0, 7), limDays: int(w.limDays, 0, 7), hwN: int(w.hwN, 0, 200), hwM: int(w.hwM, 0, 20000), hwP: int(w.hwP, 0, 200), ulW: int(w.ulW, 0, 100),
      wo: int(w.wo, 0, 200), woM: int(w.woM, 0, 20000), ckDays: int(w.ckDays, 0, 7), ckNeed: int(w.ckNeed, 0, 20) },
    att: arr(s.att, 40).map(a => { a = obj(a); return { t: ms(a.t, now), now: bool(a.now), day: isDay(a.day) ? a.day : '', k: oneOf(a.k, ['warn', 'info', 'unl'], 'info'), hd: str(a.hd, 80), sub: str(a.sub, 120) }; }).filter(a => a.hd),
    log: arr(s.log, 40).map(e => { e = obj(e); return typeof e.id === 'string' && ID_RE.test(e.id) ? { id: e.id, t0: ms(e.t0, now), t1: ms(e.t1, now), m: int(e.m, 0, 240), how: oneOf(e.how, HOWS, 'pin'), why: oneOf(e.why, ['m', 's'], 'm'),
      n: str(e.n, 80), ph: bool(e.ph), pc: bool(e.pc), bad: bool(e.bad), tp: arr(e.tp, 10).filter(x => Array.isArray(x)).map(x => [ms(x[0], now), oneOf(x[1], ['off', 'on', 'clock', 'boot'], 'on')]) } : null; }).filter(Boolean),
    coins: int(s.coins, 0, 1e8), bonus: arr(s.bonus, 10).map(b => { b = obj(b); return { at: ms(b.at, now), n: int(b.n, -500, 500), w: str(b.w, 60) }; }).filter(b => b.n),
    plan: { lim: int(pl.lim, 0, 1440), apps: int(pl.apps, 0, 500), next: pl.next && isDay(obj(pl.next).from) ? { from: pl.next.from, lim: int(pl.next.lim, 0, 1440) } : null },
  };
}

/** Facts only the phone's native side knows, read at sync time (also from the background, without the app open). */
export function cleanNat(n, now) {
  n = obj(n);
  const h = obj(n.hw);
  return { at: ms(n.at, now), blocker: bool(n.blocker), usage: bool(n.usage), lim: int(n.lim, 0, 1440), used: int(n.used, -1, 1440, -1), total: int(n.total, -1, 1440, -1),
    hw: n.hw ? { start: ms(h.start, now), left: int(h.left, 0, 4 * 3600e3), off: bool(h.off) } : null, ulLeft: int(n.ulLeft, 0, 9), ulUntil: ms(n.ulUntil, now), ver: str(n.ver, 40) };
}

export function cleanEvent(e, now) {
  e = obj(e);
  if (typeof e.id !== 'string' || !ID_RE.test(e.id) || !EVENT_KINDS.includes(e.k)) return null;
  const d = obj(e.d);
  return { id: e.id, t: int(e.t, now - KEEP, now + 60e3, now), k: e.k,
    d: { m: int(d.m, 0, 240), how: oneOf(d.how, HOWS, ''), n: str(d.n, 80), lim: int(d.lim, 0, 1440), used: int(d.used, 0, 1440), left: int(d.left, 0, 9), by: oneOf(d.by, ['remote'], '') } };
}

/** The words on a parent's lock screen. null: not worth a notification. */
export function notice(e, name) {
  const who = name || 'Your child', d = e.d || {};
  if (d.by === 'remote') return null;   // a parent did it from their own phone: they know
  switch (e.k) {
    case 'hw_done': return { title: 'Homework done', body: `${who} finished homework${d.m ? `: ${d.m} min` : ''}${d.n ? ` · ${d.n}` : ''}.` };
    case 'hw_early': return { title: 'Homework ended early', body: `Ended with the parent PIN${d.m ? ` after ${d.m} min` : ''}.` };
    case 'hw_off': return { title: 'Homework ended with the blocker off', body: `${who} switched the blocker off${d.m ? ` after ${d.m} min` : ''}. No coins for it.` };
    case 'blocker_off': return { title: 'Blocker switched off', body: `The LEVEL UP blocker on ${who}'s phone was switched off in Settings.` };
    case 'over_limit': return { title: 'Screen time limit reached', body: `${who} used ${d.lim ? `the ${d.lim} min` : "today's time"} on limited apps.` };
    case 'unlock': return { title: 'Push-up unlock used', body: `10 push-ups for 15 more minutes${Number.isInteger(d.left) ? ` (${d.left} left today)` : ''}.` };
    default: return null;
  }
}

export class Family extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.env = env;
    this.sql = ctx.storage.sql;
    this.rl = new Map();
    this.off = 0;
    this.keys = null;
  }

  now() { return Date.now() + this.off; }

  live() { return this.sql.exec("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'meta'").one().n > 0; }

  schema() {
    const S = [
      'CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)',
      'CREATE TABLE IF NOT EXISTS tokens (id TEXT PRIMARY KEY, role TEXT NOT NULL, h TEXT NOT NULL, name TEXT, created INTEGER, seen INTEGER)',
      'CREATE TABLE IF NOT EXISTS snaps (day TEXT PRIMARY KEY, at INTEGER, rcv INTEGER, data TEXT)',
      'CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, t INTEGER, k TEXT, d TEXT, rcv INTEGER)',
      'CREATE INDEX IF NOT EXISTS events_rcv ON events (rcv)',
      'CREATE TABLE IF NOT EXISTS cmds (id TEXT PRIMARY KEY, kind TEXT, args TEXT, by TEXT, created INTEGER, exp INTEGER, status TEXT, result TEXT, done INTEGER)',
      'CREATE TABLE IF NOT EXISTS photos (entry TEXT PRIMARY KEY, t INTEGER, rcv INTEGER, size INTEGER, data BLOB)',
      'CREATE TABLE IF NOT EXISTS subs (id TEXT PRIMARY KEY, tok TEXT, endpoint TEXT UNIQUE, p256dh TEXT, auth TEXT, created INTEGER, fails INTEGER DEFAULT 0)',
    ];
    for (const q of S) this.sql.exec(q);
  }

  get(k, d = null) { const r = this.sql.exec('SELECT v FROM meta WHERE k = ?', k).toArray()[0]; return r ? JSON.parse(r.v) : d; }
  set(k, v) { this.sql.exec('INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)', k, JSON.stringify(v)); }

  limit(tid, b) {
    const [max, win] = RL[b], k = `${tid}:${b}`, now = this.now();
    let w = this.rl.get(k);
    if (!w || now - w[0] >= win || now < w[0]) { w = [now, 0]; this.rl.set(k, w); }
    return ++w[1] <= max;
  }

  async ensureAlarm() {
    if ((await this.ctx.storage.getAlarm()) == null) await this.ctx.storage.setAlarm(Date.now() + 6 * 3600e3);
  }

  /** The device behind a bearer token, or null. One lookup by device id, then a constant-time digest compare. */
  async auth(req, role) {
    const t = parseToken(req.headers.get('authorization'));
    if (!t || !this.live() || this.get('fid') !== t.fid) return null;
    const row = this.sql.exec('SELECT * FROM tokens WHERE id = ?', t.tid).toArray()[0];
    const h = await sha256hex(t.secret);
    if (!row || !sameStr(h, row.h) || row.role !== role) return null;
    const now = this.now();
    if (!row.seen || now - row.seen > 60e3) this.sql.exec('UPDATE tokens SET seen = ? WHERE id = ?', now, t.tid);
    return row;
  }

  async fetch(req) {
    const res = await this.route(req);
    await drain(req);
    return res;
  }

  async route(req) {
    const url = new URL(req.url), p = url.pathname;
    try {
      if (p === '/_init') return this.init(req);
      if (p === '/_pair') return this.pair(req);
      if (p.startsWith('/api/_test/')) return this.test(req, p);
      if (p.startsWith('/api/kid/')) {
        const me = await this.auth(req, 'kid');
        if (!me) return err(401);
        if (!this.limit(me.id, 'k')) return err(429);
        return await this.kid(req, p, me, url);
      }
      if (p.startsWith('/api/parent/')) {
        const me = await this.auth(req, 'parent');
        if (!me) return err(401);
        if (!this.limit(me.id, 'p')) return err(429);
        return await this.parent(req, p, me, url);
      }
      return err(404);
    } catch (e) {
      console.log('family error', e && e.stack || e);
      return err(500);
    }
  }

  // ------------------------------------------------------------------ setup and pairing (from the worker only)

  async init(req) {
    const b = await req.json();
    if (this.live() || !FID_RE.test(b.fid)) return err(409);
    this.schema();
    const now = this.now(), t = newToken(b.fid);
    this.set('fid', b.fid); this.set('name', str(b.name, 16)); this.set('created', now); this.set('lastKid', now); this.set('photos', false);
    this.sql.exec('INSERT INTO tokens (id, role, h, name, created, seen) VALUES (?, ?, ?, ?, ?, ?)', t.tid, 'kid', await sha256hex(t.secret), "Child's phone", now, now);
    await this.ensureAlarm();
    const code = await this.newCode();
    return json({ ok: true, kidToken: t.token, ...code });
  }

  async newCode() {
    const code = randCode(), h = await sha256hex(code), exp = this.now() + CODE_TTL;
    this.set('code', { h, exp });
    await this.env.REGISTRY.get(this.env.REGISTRY.idFromName('registry')).fetch('https://registry/put', { method: 'POST', body: JSON.stringify({ fid: this.get('fid'), h, exp }) });
    return { code, codeExp: exp };
  }

  /** {h: SHA-256 of the code, name}: a parent device joins, if the code is this family's live one and there's room. */
  async pair(req) {
    const b = await req.json();
    if (!this.live()) return err(404);
    const c = this.get('code'), now = this.now();
    if (!c || !sameStr(c.h, String(b.h)) || now > c.exp) return err(404);
    const n = this.sql.exec("SELECT COUNT(*) AS n FROM tokens WHERE role = 'parent'").one().n;
    if (n >= MAX.parents) return err(409, 'full');
    this.set('code', null);   // single use
    await this.env.REGISTRY.get(this.env.REGISTRY.idFromName('registry')).fetch('https://registry/drop', { method: 'POST', body: JSON.stringify({ fid: this.get('fid') }) });
    const t = newToken(this.get('fid')), name = str(b.name, 24) || 'Parent';
    this.sql.exec('INSERT INTO tokens (id, role, h, name, created, seen) VALUES (?, ?, ?, ?, ?, ?)', t.tid, 'parent', await sha256hex(t.secret), name, now, now);
    return json({ ok: true, token: t.token, child: this.get('name') });
  }

  devices(meId) {
    return this.sql.exec("SELECT id, name, created, seen FROM tokens WHERE role = 'parent' ORDER BY created").toArray()
      .map(r => ({ id: r.id, name: r.name, created: r.created, seen: r.seen, me: r.id === meId || undefined, push: this.sql.exec('SELECT COUNT(*) AS n FROM subs WHERE tok = ?', r.id).one().n > 0 }));
  }

  // ------------------------------------------------------------------ the kid's phone

  async kid(req, p, me, url) {
    const now = this.now();
    this.set('lastKid', now);
    if (p === '/api/kid/sync' && req.method === 'POST') {
      const { v: b, err: e } = await readJson(req, MAX.syncBytes);
      if (e) return e;
      if (b.snap !== undefined) {
        const s = cleanSnap(b.snap, now);
        if (!s) return err(400);
        if (JSON.stringify(s).length > MAX.snapBytes) return err(413);
        this.sql.exec('INSERT OR REPLACE INTO snaps (day, at, rcv, data) VALUES (?, ?, ?, ?)', s.day, s.at, now, JSON.stringify(s));
        if (s.name) this.set('name', s.name);
      }
      if (b.nat !== undefined) { const n = cleanNat(b.nat, now); n.rcv = now; this.set('nat', n); }
      if (typeof b.photos === 'boolean' && b.photos !== this.get('photos')) {
        this.set('photos', b.photos);
        if (!b.photos) this.sql.exec('DELETE FROM photos');   // switched off: what was uploaded goes too
      }
      const fresh = [];
      for (const raw of arr(b.events, 50)) {
        const ev = cleanEvent(raw, now);
        if (!ev) continue;
        const had = this.sql.exec('SELECT COUNT(*) AS n FROM events WHERE id = ?', ev.id).one().n;
        if (had) continue;   // sent twice (the reply was lost): stored once, notified once
        this.sql.exec('INSERT INTO events (id, t, k, d, rcv) VALUES (?, ?, ?, ?, ?)', ev.id, ev.t, ev.k, JSON.stringify(ev.d), now);
        fresh.push(ev);
      }
      for (const a of arr(b.acks, 50)) {   // idempotent: only a pending command changes
        const x = obj(a);
        if (typeof x.id !== 'string' || !/^[a-z0-9]{16}$/.test(x.id)) continue;
        this.sql.exec("UPDATE cmds SET status = ?, result = ?, done = ? WHERE id = ? AND status IN ('pending', 'sent')", x.ok === true ? 'done' : 'failed', str(x.why, 40), now, x.id);
      }
      this.trim();
      this.expireCmds(now);
      const cmds = this.sql.exec("SELECT id, kind, args, created, exp FROM cmds WHERE status IN ('pending', 'sent') AND exp > ? ORDER BY created", now).toArray()
        .map(c => ({ id: c.id, kind: c.kind, args: JSON.parse(c.args), created: c.created, exp: c.exp }));
      if (cmds.length) this.sql.exec(`UPDATE cmds SET status = 'sent' WHERE status = 'pending' AND id IN (${cmds.map(() => '?').join(',')})`, ...cmds.map(c => c.id));
      const have = this.get('photos') ? this.sql.exec('SELECT entry FROM photos').toArray().map(r => r.entry) : [];
      if (fresh.length) this.ctx.waitUntil(this.notify(fresh).catch(() => {}));
      await this.ensureAlarm();
      return json({ ok: true, now, cmds, photos: this.get('photos'), have, parents: this.sql.exec("SELECT COUNT(*) AS n FROM tokens WHERE role = 'parent'").one().n });
    }
    if (p === '/api/kid/photo' && req.method === 'PUT') {
      if (!this.limit(me.id, 'kp')) return err(429);
      if (!this.get('photos')) return err(403);
      const entry = url.searchParams.get('entry') || '', t = +url.searchParams.get('t');
      if (!ID_RE.test(entry) || (req.headers.get('content-type') || '') !== 'image/jpeg') return err(400);
      const body = await readBody(req, MAX.photoBytes);
      if (body === null) return err(413);
      if (body.length < 100 || body[0] !== 0xff || body[1] !== 0xd8 || body[2] !== 0xff) return err(400);
      this.sql.exec('INSERT OR REPLACE INTO photos (entry, t, rcv, size, data) VALUES (?, ?, ?, ?, ?)', entry, int(t, 0, now + DAY, now), now, body.length, body);
      this.trim();
      return json({ ok: true });
    }
    if (p === '/api/kid/code' && req.method === 'POST') {
      if (!this.limit(me.id, 'kc')) return err(429);
      return json({ ok: true, ...(await this.newCode()) });
    }
    if (p === '/api/kid/devices' && req.method === 'GET') return json({ ok: true, devices: this.devices(null) });
    if (p === '/api/kid/devices/revoke' && req.method === 'POST') {
      const { v: b, err: e } = await readJson(req, 512);
      if (e) return e;
      if (typeof b.id !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(b.id)) return err(400);
      this.sql.exec('DELETE FROM subs WHERE tok = ?', b.id);
      this.sql.exec("DELETE FROM tokens WHERE id = ? AND role = 'parent'", b.id);
      return json({ ok: true, devices: this.devices(null) });
    }
    if (p === '/api/kid/unlink' && req.method === 'POST') {
      await this.env.REGISTRY.get(this.env.REGISTRY.idFromName('registry')).fetch('https://registry/drop', { method: 'POST', body: JSON.stringify({ fid: this.get('fid') }) });
      await this.wipe();
      return json({ ok: true });
    }
    return err(404);
  }

  async wipe() {
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.rl.clear();
    this.keys = null;
  }

  // ------------------------------------------------------------------ a parent's phone

  async parent(req, p, me, url) {
    const now = this.now(), origin = req.headers.get('x-lu-origin');
    if (origin && /^https:\/\/[a-z0-9.-]+$/.test(origin) && this.get('origin') !== origin) this.set('origin', origin);   // the VAPID contact
    if (p === '/api/parent/state' && req.method === 'GET') {
      this.expireCmds(now);
      const snap = this.sql.exec('SELECT data, rcv FROM snaps ORDER BY day DESC, at DESC LIMIT 1').toArray()[0];
      const events = this.sql.exec('SELECT id, t, k, d FROM events WHERE rcv >= ? ORDER BY t DESC LIMIT 300', now - KEEP).toArray().map(e => ({ id: e.id, t: e.t, k: e.k, d: JSON.parse(e.d) }));
      const cmds = this.sql.exec('SELECT id, kind, args, by, created, exp, status, result, done FROM cmds ORDER BY created DESC LIMIT 40').toArray()
        .map(c => ({ id: c.id, kind: c.kind, args: JSON.parse(c.args), mine: c.by === me.id, created: c.created, exp: c.exp, status: c.status, result: c.result, done: c.done }));
      const photos = this.get('photos') ? this.sql.exec('SELECT entry, t, size FROM photos ORDER BY t DESC').toArray() : [];
      return json({ ok: true, now, child: this.get('name'), lastKid: this.get('lastKid'), photosOn: this.get('photos'), snap: snap ? JSON.parse(snap.data) : null, snapRcv: snap ? snap.rcv : 0,
        nat: this.get('nat'), events, cmds, photos, devices: this.devices(me.id) });
    }
    if (p === '/api/parent/photo' && req.method === 'GET') {
      if (!this.limit(me.id, 'pp')) return err(429);
      const r = this.get('photos') ? this.sql.exec('SELECT data FROM photos WHERE entry = ?', url.searchParams.get('entry') || '').toArray()[0] : null;
      if (!r) return err(404);
      return new Response(r.data, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
    }
    if (p === '/api/parent/cmd' && req.method === 'POST') {
      if (!this.limit(me.id, 'pc')) return err(429);
      const { v: b, err: e } = await readJson(req, 1024);
      if (e) return e;
      const check = COMMANDS[b.kind], args = check ? check(obj(b.args)) : null;
      if (!args) return err(400);
      this.expireCmds(now);
      if (this.sql.exec("SELECT COUNT(*) AS n FROM cmds WHERE status IN ('pending', 'sent')").one().n >= MAX.cmdsPending) return err(429);
      const id = randAlnum(16);
      this.sql.exec('INSERT INTO cmds (id, kind, args, by, created, exp, status) VALUES (?, ?, ?, ?, ?, ?, ?)', id, b.kind, JSON.stringify(args), me.id, now, now + CMD_TTL, 'pending');
      this.trim();
      return json({ ok: true, cmd: { id, kind: b.kind, args, mine: true, created: now, exp: now + CMD_TTL, status: 'pending' } });
    }
    if (p === '/api/parent/cmd/cancel' && req.method === 'POST') {
      const { v: b, err: e } = await readJson(req, 256);
      if (e) return e;
      this.sql.exec("UPDATE cmds SET status = 'cancelled', done = ? WHERE id = ? AND status = 'pending'", now, String(b.id || ''));
      const c = this.sql.exec('SELECT status FROM cmds WHERE id = ?', String(b.id || '')).toArray()[0];
      return c ? json({ ok: c.status === 'cancelled', status: c.status }) : err(404);
    }
    if (p === '/api/parent/push/key' && req.method === 'GET') return json({ ok: true, key: (await this.vapid()).pub });
    if (p === '/api/parent/push/sub' && req.method === 'POST') {
      const { v: b, err: e } = await readJson(req, 2048);
      if (e) return e;
      const k = obj(b.keys);
      if (typeof b.endpoint !== 'string' || b.endpoint.length > 1024 || !pushHostOk(b.endpoint, this.testHosts())) return err(400);
      if (typeof k.p256dh !== 'string' || !/^[A-Za-z0-9_-]{86,88}={0,2}$/.test(k.p256dh) || typeof k.auth !== 'string' || !/^[A-Za-z0-9_-]{22,24}={0,2}$/.test(k.auth)) return err(400);
      this.sql.exec('DELETE FROM subs WHERE endpoint = ?', b.endpoint);
      const mine = this.sql.exec('SELECT id FROM subs WHERE tok = ? ORDER BY created', me.id).toArray();
      for (const s of mine.slice(0, Math.max(0, mine.length - MAX.subsPerDevice + 1))) this.sql.exec('DELETE FROM subs WHERE id = ?', s.id);
      this.sql.exec('INSERT INTO subs (id, tok, endpoint, p256dh, auth, created) VALUES (?, ?, ?, ?, ?, ?)', randAlnum(12), me.id, b.endpoint, k.p256dh.replace(/=+$/, ''), k.auth.replace(/=+$/, ''), now);
      return json({ ok: true });
    }
    if (p === '/api/parent/push/unsub' && req.method === 'POST') {
      const { v: b, err: e } = await readJson(req, 2048);
      if (e) return e;
      this.sql.exec('DELETE FROM subs WHERE tok = ? AND endpoint = ?', me.id, String(b.endpoint || ''));
      return json({ ok: true });
    }
    if (p === '/api/parent/push/test' && req.method === 'POST') {
      if (!this.limit(me.id, 'pt')) return err(429);
      const subs = this.sql.exec('SELECT * FROM subs WHERE tok = ?', me.id).toArray();
      if (!subs.length) return err(404);
      const r = await this.pushTo(subs, { title: 'LEVEL UP Family', body: 'Notifications work on this phone.', tag: 'test', url: '/#alerts' });
      return json({ ok: r.some(x => x >= 200 && x < 300), sent: r.filter(x => x >= 200 && x < 300).length });
    }
    if (p === '/api/parent/leave' && req.method === 'POST') {
      this.sql.exec('DELETE FROM subs WHERE tok = ?', me.id);
      this.sql.exec('DELETE FROM tokens WHERE id = ?', me.id);
      return json({ ok: true });
    }
    return err(404);
  }

  // ------------------------------------------------------------------ push

  testHosts() { return this.env.TEST_HOOKS === '1' && this.env.TEST_PUSH_HOST ? [this.env.TEST_PUSH_HOST] : []; }

  async vapid() {
    if (this.keys) return this.keys;
    let k = this.get('vapid');
    if (!k) { k = await vapidKeys(); this.set('vapid', k); }   // made once per family, on first use; never leaves this object but the public half
    return (this.keys = k);
  }

  async pushTo(subs, payload) {
    const keys = await this.vapid(), contact = this.env.VAPID_SUBJECT || this.get('origin') || 'mailto:levelup-family@users.noreply.github.com';
    const out = await Promise.all(subs.map(async s => {
      const r = await sendPush({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, payload, keys, contact, { topic: payload.tag });
      if (r.status === 404 || r.status === 410) this.sql.exec('DELETE FROM subs WHERE id = ?', s.id);
      else if (!(r.status >= 200 && r.status < 300)) {
        this.sql.exec('UPDATE subs SET fails = fails + 1 WHERE id = ?', s.id);
        this.sql.exec('DELETE FROM subs WHERE id = ? AND fails >= 20', s.id);
      } else this.sql.exec('UPDATE subs SET fails = 0 WHERE id = ?', s.id);
      return r.status;
    }));
    return out;
  }

  async notify(events) {
    const subs = this.sql.exec('SELECT * FROM subs').toArray();
    if (!subs.length || !this.live()) return;
    const name = this.get('name');
    for (const e of events.filter(x => NOTIFY.has(x.k)).slice(-5)) {
      const n = notice(e, name);
      if (n) await this.pushTo(subs, { ...n, tag: e.k, url: e.k.startsWith('hw') ? '/#homework' : '/#alerts', at: e.t });
    }
  }

  // ------------------------------------------------------------------ retention

  expireCmds(now) {
    this.sql.exec("UPDATE cmds SET status = 'expired', done = ? WHERE status IN ('pending', 'sent') AND exp <= ?", now, now);
  }

  /** Storage caps: the newest events, photos and commands are kept. */
  trim() {
    this.sql.exec('DELETE FROM events WHERE id IN (SELECT id FROM events ORDER BY rcv DESC, t DESC LIMIT -1 OFFSET ?)', MAX.events);
    this.sql.exec('DELETE FROM photos WHERE entry IN (SELECT entry FROM photos ORDER BY t DESC LIMIT -1 OFFSET ?)', MAX.photos);
    this.sql.exec('DELETE FROM cmds WHERE id IN (SELECT id FROM cmds ORDER BY created DESC LIMIT -1 OFFSET ?)', MAX.cmds);
    this.sql.exec('DELETE FROM snaps WHERE day IN (SELECT day FROM snaps ORDER BY day DESC LIMIT -1 OFFSET 31)');
  }

  /** Every 6 hours: anything over 30 days old goes; a family nobody has used for 90 days goes entirely. */
  async alarm() {
    if (!this.live()) { await this.ctx.storage.deleteAll(); return; }
    const now = this.now(), cut = now - KEEP;
    const seen = Math.max(this.get('lastKid', 0), ...this.sql.exec('SELECT seen FROM tokens').toArray().map(r => r.seen || 0));
    if (now - seen > IDLE_WIPE) { await this.wipe(); return; }
    this.sql.exec('DELETE FROM events WHERE rcv < ?', cut);
    this.sql.exec('DELETE FROM snaps WHERE rcv < ?', cut);
    this.sql.exec('DELETE FROM photos WHERE rcv < ?', cut);
    this.sql.exec('DELETE FROM cmds WHERE created < ?', cut);
    this.expireCmds(now);
    const c = this.get('code');
    if (c && now > c.exp) this.set('code', null);
    const n = this.get('nat');
    if (n && n.rcv < cut) this.set('nat', null);
    this.trim();
    await this.ctx.storage.setAlarm(Date.now() + 6 * 3600e3);
  }

  // ------------------------------------------------------------------ test hooks (only with TEST_HOOKS=1, never set in production)

  async test(req, p) {
    if (this.env.TEST_HOOKS !== '1') return err(404);
    const b = req.method === 'POST' ? await req.json() : {};
    if (p === '/api/_test/clock') { this.off = +b.offset || 0; return json({ ok: true }); }
    if (p === '/api/_test/alarm') { await this.alarm(); return json({ ok: true, live: this.live(), alarm: await this.ctx.storage.getAlarm() }); }
    if (p === '/api/_test/count') {
      if (!this.live()) return json({ live: false, keys: (await this.ctx.storage.list()).size });
      const n = t => this.sql.exec(`SELECT COUNT(*) AS n FROM ${t}`).one().n;
      return json({ live: true, tokens: n('tokens'), snaps: n('snaps'), events: n('events'), cmds: n('cmds'), photos: n('photos'), subs: n('subs'), alarm: await this.ctx.storage.getAlarm(),
        tokenRows: this.sql.exec('SELECT id, role, h FROM tokens').toArray() });
    }
    return err(404);
  }
}
