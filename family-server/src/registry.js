// One Durable Object for the whole server ("registry"): which family a live pairing code belongs to, and the
// per-IP rate limits for the two endpoints that take no token (making a family, redeeming a code).
// It only ever holds SHA-256(code) -> family id, for at most 10 minutes. No listing of anything.
import { DurableObject } from 'cloudflare:workers';
import { json, err, FID_RE } from './util.js';

const LIMITS = { create: [5, 3600e3], pair: [10, 600e3], pairAll: [600, 600e3] };

export class Registry extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.env = env;
    this.rl = new Map();   // in memory: "kind:ip" -> [window start, count]. Resets if the object is evicted (fine for abuse limits)
    this.off = 0;          // test clock offset (TEST_HOOKS only)
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS codes (h TEXT PRIMARY KEY, fid TEXT NOT NULL, exp INTEGER NOT NULL)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS codes_fid ON codes (fid)');
  }

  now() { return Date.now() + this.off; }

  limit(kind, key) {
    const [max, win] = LIMITS[kind], k = `${kind}:${key}`, now = this.now();
    let w = this.rl.get(k);
    if (!w || now - w[0] >= win || now < w[0]) { w = [now, 0]; this.rl.set(k, w); }
    if (this.rl.size > 5000) for (const [kk, ww] of this.rl) if (now - ww[0] >= LIMITS[kk.split(':')[0]][1]) this.rl.delete(kk);
    return ++w[1] <= max;
  }

  async fetch(req) {
    const url = new URL(req.url), b = req.method === 'POST' ? await req.json() : {};
    const now = this.now();
    switch (url.pathname) {
      case '/limit':   // {kind, key}: true while under the limit
        return json({ ok: this.limit(b.kind, String(b.key || '?').slice(0, 64)) });
      case '/put': {   // a family's new code replaces its old one
        if (!FID_RE.test(b.fid) || !/^[0-9a-f]{64}$/.test(b.h)) return err(400);
        this.sql.exec('DELETE FROM codes WHERE fid = ? OR exp < ?', b.fid, now);
        this.sql.exec('INSERT OR REPLACE INTO codes (h, fid, exp) VALUES (?, ?, ?)', b.h, b.fid, Math.min(+b.exp || 0, now + 600e3));
        return json({ ok: true });
      }
      case '/lookup': {   // {h, ip}: the family id, rate limited per IP and overall
        if (!this.limit('pair', b.ip || '?') || !this.limit('pairAll', 'all')) return err(429);
        if (!/^[0-9a-f]{64}$/.test(b.h)) return err(404);
        const r = this.sql.exec('SELECT fid FROM codes WHERE h = ? AND exp >= ?', b.h, now).toArray()[0];
        return r ? json({ fid: r.fid }) : err(404);
      }
      case '/drop':   // {fid}: used, replaced or unlinked
        this.sql.exec('DELETE FROM codes WHERE fid = ? OR exp < ?', String(b.fid || ''), now);
        return json({ ok: true });
      case '/test/clock':
        if (this.env.TEST_HOOKS !== '1') return err(404);
        this.off = +b.offset || 0;
        return json({ ok: true });
      case '/test/count':
        if (this.env.TEST_HOOKS !== '1') return err(404);
        return json({ codes: this.sql.exec('SELECT COUNT(*) AS n FROM codes').one().n });
      default:
        return err(404);
    }
  }
}
