/* LEVEL UP Family: the parent's web app. Reads what the kid's LEVEL UP shares (the same numbers as Parent mode on his
   phone), sends a few requests back (each confirmed first), and gets notifications. No framework, no build step.
   The device's token lives in this app's own storage only (an iPhone Home Screen app has its own, apart from Safari). */
'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};
const K = { token: 'luf.token', state: 'luf.state', name: 'luf.device', seen: 'luf.seen' };
const POLL = 30e3, STALE = 45 * 60e3;
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const STANDALONE = navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
const TABS = ['today', 'week', 'alerts', 'homework', 'actions'];
const LIMITS = [30, 45, 60, 90, 120];
const BOOK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3.5h11.5A2.5 2.5 0 0119 6v14.5H7.5A2.5 2.5 0 015 18zm2.2 2v12.2c0 .3.2.6.5.6h9.1V5.5zM9 8h6v2H9z" fill="currentColor"/></svg>';
const SHARE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l4.2 4.2-1.4 1.4L13 6.3V15h-2V6.3L9.2 8.1 7.8 6.7zM5 10h3v2H7v8h10v-8h-1v-2h3v12H5z" fill="currentColor"/></svg>';
const PLUS_SQ = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zm0 2v14h14V5zm6 3h2v3h3v2h-3v3h-2v-3H8v-2h3z" fill="currentColor"/></svg>';

let ST = null;          // the last state from the server: {now, child, lastKid, snap, nat, events, cmds, photos, devices, photosOn}
let fetchedAt = 0, skew = 0, online = true, busy = false, tab = 'today', pollT = 0;
const photoUrls = new Map();   // entry id -> object URL (memory only, never cached on disk)

const token = () => store.get(K.token);
const now = () => Date.now() + skew;   // the server's clock, so "3 min ago" is right even if this phone's clock is off
const kid = () => (ST && (ST.child || (ST.snap && ST.snap.name))) || 'your child';
const kidS = () => { const n = kid(); return /s$/i.test(n) ? `${n}'` : `${n}'s`; };
const clock = t => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayName = (k, long) => {
  const t = ymd(new Date(now())), y = ymd(new Date(now() - 864e5));
  if (k === t) return 'Today';
  if (k === y) return 'Yesterday';
  return new Date(k + 'T12:00:00').toLocaleDateString([], long ? { weekday: 'long', day: 'numeric', month: 'short' } : { weekday: 'short' });
};
const when = t => `${dayName(ymd(new Date(t)))} ${clock(t)}`;
const ago = t => {
  const m = Math.round((now() - t) / 60e3);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return when(t);
};
const fmtMins = m => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ''}`);
const limName = l => ({ 0: 'no limit', 30: '30 min', 45: '45 min', 60: '1 hour', 90: '1½ hours', 120: '2 hours' })[l] || `${l} min`;

function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3200);
}

/* ------------------------------------------------------------------ server */
async function api(path, { method = 'GET', body, raw } = {}) {
  const headers = { authorization: `Bearer ${token()}` };
  if (body) headers['content-type'] = 'application/json';
  let r;
  try {
    r = await fetch(`/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  } catch (e) {
    online = false; paintOffline();
    throw Object.assign(new Error('offline'), { code: 'offline' });
  }
  online = true;
  if (r.status === 401) { unpaired(); throw Object.assign(new Error('unpaired'), { code: 'unauthorized' }); }
  if (raw) { if (!r.ok) throw Object.assign(new Error('http'), { code: r.status }); return r; }
  let j = {};
  try { j = await r.json(); } catch (e) {}
  if (!r.ok) throw Object.assign(new Error(j.error || 'http'), { code: j.error || r.status });
  return j;
}

async function refresh(manual) {
  if (!token() || busy) return;
  busy = true; $('refresh').classList.add('spin');
  try {
    const t0 = Date.now(), s = await api('/parent/state');
    fetchedAt = Date.now(); skew = s.now - Math.round((t0 + fetchedAt) / 2);
    ST = s; store.set(K.state, JSON.stringify({ s, at: fetchedAt, skew }));
    render();
  } catch (e) {
    if (e.code === 'offline') { if (manual) toast("You're offline. Showing the last update."); }
    else if (e.code !== 'unauthorized' && manual) toast("Couldn't refresh. Try again in a moment.");
    paintTop();
  } finally {
    busy = false; $('refresh').classList.remove('spin');
  }
}

function unpaired() {
  store.del(K.token); store.del(K.state); ST = null;
  for (const u of photoUrls.values()) URL.revokeObjectURL(u);
  photoUrls.clear();
  showPair("This phone isn't linked any more. Ask for a new code from Parent mode on your child's phone.");
}

/* ------------------------------------------------------------------ frame */
function paintTop() {
  if (!ST) return;
  $('kid').textContent = kid();
  const last = ST.lastKid || 0, stale = last && now() - last > STALE;
  const sy = $('synced');
  sy.textContent = last ? `${kidS()} phone synced ${ago(last)}` : 'Waiting for the first sync';
  sy.classList.toggle('stale', !!stale);
  paintOffline();
  const seen = +store.get(K.seen) || 0, ev = (ST.events || []).filter(e => ['hw_off', 'blocker_off', 'over_limit', 'unlock', 'hw_early', 'clock'].includes(e.k) && e.t > seen);
  const nowAtt = ST.snap && (ST.snap.att || []).some(a => a.now);
  $('alertDot').hidden = !(ev.length || nowAtt) || tab === 'alerts';
}
function paintOffline() {
  const o = $('offline');
  if (online || !ST) { o.hidden = true; return; }
  o.hidden = false;
  o.textContent = `Offline. This is the last update, from ${fetchedAt ? ago(fetchedAt + skew) : 'earlier'}.`;
}

function setTab(t, push = true) {
  if (!TABS.includes(t) && t !== 'settings') t = 'today';
  tab = t;
  for (const b of document.querySelectorAll('.tabs button')) { if (b.dataset.tab === t) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }
  if (t === 'alerts' && ST) { store.set(K.seen, String(now())); }
  if (push && location.hash !== `#${t}`) history.replaceState(null, '', `#${t}`);
  render();
  scrollTo(0, 0);
}

function render() {
  if (!token()) return;
  $('top').hidden = false; $('tabs').hidden = false; $('main').className = '';
  if (!ST) { $('main').innerHTML = '<p class="empty" style="margin-top:24px">Loading…</p>'; return; }
  paintTop();
  const v = { today: viewToday, week: viewWeek, alerts: viewAlerts, homework: viewHomework, actions: viewActions, settings: viewSettings }[tab] || viewToday;
  $('main').innerHTML = v();
  bind[tab] && bind[tab]();
}

/* ------------------------------------------------------------------ what the phone said, freshest first */
// the native facts (sent even with LEVEL UP closed) are newer than the app's own snapshot most of the time
function live() {
  const s = ST.snap, n = ST.nat, t = ymd(new Date(now()));
  const natToday = n && n.at && ymd(new Date(n.at)) === t, snapToday = s && s.day === t;
  const scr = { on: s ? s.scr.on : !!n, meas: s ? s.scr.meas : !!(n && n.usage), lim: s && snapToday ? s.scr.lim : 0, used: s && snapToday ? s.scr.used : 0, total: s && snapToday ? s.scr.total : 0, top: s && snapToday ? s.scr.top : [], at: s ? s.at : 0 };
  if (natToday && (!s || n.at >= s.at || !snapToday)) {
    if (n.usage && n.used >= 0) { scr.used = n.used; scr.total = Math.max(0, n.total); scr.meas = true; }
    scr.lim = n.lim; scr.at = n.at;
    if (!n.usage) scr.meas = false;
  }
  // homework right now: native's session if it's the newer word
  let hw = s && snapToday ? { ...s.hw } : { k: 'not', v: 'No news yet', sub: 'Nothing from today yet' };
  if (n && n.at && (!s || n.at >= s.at)) {
    if (n.hw) {
      const left = Math.max(0, n.hw.left - (now() - n.at));
      hw = { k: 'run', v: 'On now', sub: `Since ${clock(n.hw.start)} · ${left ? `${Math.ceil(left / 60e3)} min to go` : "time's up, photo next"}`, off: n.hw.off };
    } else if (hw.k === 'run') hw = { k: 'ended', v: 'Ended', sub: 'Just now' };
  } else if (s && s.hw.run) {
    const left = Math.max(0, s.hw.run.left - (now() - s.at));
    hw.sub = `Since ${clock(s.hw.run.start)} · ${left ? `${Math.ceil(left / 60e3)} min to go` : "time's up, photo next"}`;
    hw.off = s.hw.run.off;
  }
  const blocker = n ? n.blocker : null;
  return { s, n, scr, hw, blocker, snapToday, running: hw.k === 'run' };
}

/* ------------------------------------------------------------------ Today */
const tile = (lab, v, sub, cls = '') => `<div class="tile ${cls}"><span class="label">${lab}</span><b>${v}</b><small>${sub}</small></div>`;
function viewToday() {
  const L = live(), s = L.s;
  if (!s && !L.n) return `<div class="sec"><h2>Today</h2></div><div class="card calm"><p>Linked. Nothing from ${esc(kidS())} phone yet.</p><p class="fine">It sends an update when LEVEL UP opens and about every 15 minutes while the phone is online.</p></div>`;
  let h = `<div class="sec"><h1>Today</h1><span>${L.scr.at ? `as of ${clock(L.scr.at)}` : ''}</span></div>`;
  // right now: the things worth knowing first
  if (L.blocker === false && (L.scr.lim || (s && s.hw.cfg.set))) h += `<div class="status warn"><i></i><div><b>The blocker is off</b><small>Nothing on ${esc(kidS())} phone gets locked till it's back on.</small></div></div>`;
  if (L.running) h += `<div class="status${L.hw.off ? ' warn' : ''}"><i></i><div><b>Homework is on${L.hw.off ? ', but the blocker is off' : ''}</b><small>${esc(L.hw.sub)}</small></div></div>`;
  if (!L.snapToday && s) h += `<p class="fine">The last full update is from ${esc(when(s.at))}. Newer numbers arrive when LEVEL UP opens on ${esc(kidS())} phone.</p>`;
  if (L.scr.on) {
    if (!L.scr.meas) h += `<div class="card"><span class="label">Screen time</span><p class="line">Can't be measured: Usage access is off for LEVEL UP on ${esc(kidS())} phone.</p></div>`;
    else {
      const over = L.scr.lim > 0 && L.scr.used > L.scr.lim;
      h += `<div class="card hi"><span class="label">Screen time · ${L.scr.lim ? 'limited apps' : 'no limit set'}</span>
        <div class="big${over ? ' over' : ''}"><b>${L.scr.used}</b><span>${L.scr.lim ? `of ${L.scr.lim} min` : 'min on limited apps'}</span>${over ? '<em>Over</em>' : ''}</div>
        ${L.scr.lim ? `<div class="meter${over ? ' over' : ''}" aria-hidden="true"><i style="width:${Math.min(100, L.scr.used / L.scr.lim * 100).toFixed(1)}%"></i></div>` : ''}
        <p class="line">Whole phone today: <b>${fmtMins(L.scr.total)}</b>${s && L.snapToday && s.ulT ? ` · push-up unlocks: <b>${s.ulT}</b>` : ''}</p>
        ${L.scr.top.length ? `<div class="apps"><span class="label">Most used today</span>${L.scr.top.map(a => `<div class="app"><span class="nm">${esc(a.n)}</span><b>${fmtMins(a.m)}</b></div>`).join('')}</div>` : ''}</div>`;
    }
  }
  if (s && L.snapToday) {
    h += `<div class="tiles" style="margin-top:12px">${tile('Homework', esc(L.hw.v), esc(L.hw.sub), `hw ${L.hw.k}`)}
      ${tile('Daily check-ins', `${s.ck} <i>of ${s.ckN}</i>`, s.ck ? esc(s.ckd.join(', ')) : 'None yet today')}${tile('Quests', `${s.qd} <i>of ${s.qn}</i>`, !s.qn ? 'None due today' : s.qd >= s.qn ? 'All done' : `${s.qn - s.qd} to go`)}</div>`;
  } else if (L.running) h += `<div class="tiles" style="margin-top:12px">${tile('Homework', esc(L.hw.v), esc(L.hw.sub), 'hw run')}</div>`;
  if (s) h += `<div class="card" style="margin-top:12px"><span class="label">Coins</span><div class="big"><b>${s.coins.toLocaleString()}</b><span>coins</span></div>${s.bonus.length ? `<p class="line">Last bonus: <b>${s.bonus[0].n > 0 ? '+' : '−'}${Math.abs(s.bonus[0].n)}</b>${s.bonus[0].w ? ` · ${esc(s.bonus[0].w)}` : ''} · ${esc(when(s.bonus[0].at))}</p>` : ''}</div>`;
  const att = s ? s.att.filter(a => a.now || (a.t && ymd(new Date(a.t)) === ymd(new Date(now())))) : [];
  h += `<div class="sec"><h2>Worth a look today</h2><button class="act" data-go="alerts">All alerts</button></div><div class="card">${att.length ? `<div class="list">${att.slice(0, 4).map(attRow).join('')}</div>` : '<p class="empty">Nothing to flag today.</p>'}</div>`;
  return h;
}
const attWhen = a => (a.now ? 'Right now' : a.day ? dayName(a.day, true) : when(a.t));
const attRow = a => `<div class="row"><i class="pip ${a.k}"></i><div class="grow"><b>${esc(a.hd)}</b><small>${esc(attWhen(a))}${a.sub ? ` · ${esc(a.sub)}` : ''}</small></div></div>`;

/* ------------------------------------------------------------------ Week */
function viewWeek() {
  const s = ST.snap;
  if (!s || !s.week.days.length) return '<div class="sec"><h1>Last 7 days</h1></div><p class="empty">Nothing yet. The week fills in as LEVEL UP sends updates.</p>';
  const W = s.week, D = W.days;
  const short = k => new Date(k + 'T12:00:00').toLocaleDateString([], { weekday: 'short' });
  const col = (x, inner) => `<span class="${x.k === s.day ? 'today' : ''}">${inner}<small>${x.k === s.day ? 'Today' : esc(short(x.k))}</small></span>`;
  const smax = Math.max(60, ...D.map(x => Math.max(x.u || 0, x.l || 0)));
  const sb = D.map(x => col(x, `<i class="${x.l && x.u > x.l ? 'over' : x.ok ? 'hit' : ''}" style="--h:${x.u == null ? 0 : Math.min(100, x.u / smax * 100).toFixed(0)}%">${x.l ? `<s style="--l:${(x.l / smax * 100).toFixed(0)}%"></s>` : ''}<b>${x.u == null ? '' : x.u}</b></i>`)).join('');
  const lab = D.map(x => `${dayName(x.k, true)}: ${x.u == null ? 'no data' : `${x.u} min${x.l ? ` of ${x.l}` : ''}`}`).join(', ');
  const k0 = new Date(W.k0 + 'T12:00:00').toLocaleDateString([], { day: 'numeric', month: 'short' }), k1 = new Date(s.day + 'T12:00:00').toLocaleDateString([], { day: 'numeric', month: 'short' });
  return `<div class="sec"><h1>Last 7 days</h1><span>${esc(k0)} – ${esc(k1)}</span></div>
    ${s.scr.on ? `<div class="card"><span class="label">Screen time · limited apps, minutes</span><div class="bars-wrap"><div class="bars" role="img" aria-label="${esc(lab)}">${sb}</div></div><p class="fine">Dashed line: that day's limit. Green: under it.</p></div>` : ''}
    <div class="tiles" style="margin-top:12px">
      ${tile('Under the limit', W.limDays ? `${W.under} <i>of ${W.limDays} days</i>` : '–', W.limDays ? 'Finished days with a limit' : 'No limit on those days')}
      ${tile('Homework', `${W.hwN} <i>${W.hwN === 1 ? 'session' : 'sessions'}</i>`, W.hwN ? `${fmtMins(W.hwM)} · ${W.hwP} with a photo` : 'None this week', 'hw')}
      ${tile('Push-up unlocks', `${W.ulW}`, 'Emergency unlocks used')}
      ${tile('Workouts', `${W.wo}`, W.wo ? fmtMins(W.woM) : 'None this week')}
      ${tile('Daily check-ins', `${W.ckDays} <i>${W.ckDays === 1 ? 'day' : 'days'}</i>`, `With ${W.ckNeed} or more check-ins`)}
      ${tile('Coins', s.coins.toLocaleString(), 'Saved up now')}
    </div>`;
}

/* ------------------------------------------------------------------ Alerts: what's worth a look + what happened */
const EV = {
  hw_start: (d) => ['hw', d.by ? 'Homework started from a parent phone' : 'Homework started', ''],
  hw_done: d => ['ok', 'Homework done', [d.m ? `${d.m} min` : '', d.n].filter(Boolean).join(' · ')],
  hw_early: d => ['info', d.by ? 'Homework ended from a parent phone' : 'Homework ended early by a parent', d.m ? `After ${d.m} min` : ''],
  hw_off: d => ['warn', 'Homework ended with the blocker off', `${d.m || 0} min, no coins`],
  hw_time: () => ['info', 'Homework ran the full 4 hours', 'It ended by itself'],
  blocker_off: () => ['warn', 'Blocker switched off', 'In Settings on the phone'],
  blocker_on: () => ['ok', 'Blocker back on', ''],
  clock: () => ['warn', 'Phone clock changed during homework', ''],
  over_limit: d => ['warn', 'Screen time limit reached', d.lim ? `${d.lim} min on limited apps` : ''],
  unlock: d => ['unl', 'Push-up unlock used', `15 more minutes${Number.isInteger(d.left) ? ` · ${d.left} left today` : ''}`],
};
function viewAlerts() {
  const s = ST.snap, att = s ? s.att : [], ev = (ST.events || []).filter(e => EV[e.k]);
  let h = `<div class="sec"><h1>Alerts</h1><span>last 7 days</span></div>`;
  h += `<div class="sec"><h2>Worth a look</h2></div><div class="card">${att.length ? `<div class="list">${att.map(attRow).join('')}</div>` : '<p class="empty">Nothing to flag in the last 7 days.</p>'}</div>`;
  h += `<div class="sec"><h2>Activity</h2><span>as it happened</span></div><div class="card">`;
  if (!ev.length) h += '<p class="empty">Nothing yet. Homework, the blocker, the limit and push-up unlocks show up here as they happen.</p>';
  else {
    let day = '';
    h += ev.slice(0, 80).map(e => {
      const [k, hd, sub] = EV[e.k](e.d || {}), d = ymd(new Date(e.t)), head = d !== day ? `<div class="day-h">${esc(dayName(d, true))}</div>` : '';
      day = d;
      return `${head}<div class="row"><i class="pip ${k}"></i><div class="grow"><b>${esc(hd)}</b><small>${esc(clock(e.t))}${sub ? ` · ${esc(sub)}` : ''}</small></div></div>`;
    }).join('');
  }
  return h + '</div>';
}

/* ------------------------------------------------------------------ Homework */
const HOW = { proof: 'Done with a photo', pin: 'Ended by a parent', time: 'Ended after 4 hours', off: 'Ended with the blocker off' };
const TP = { off: 'Blocker switched off', on: 'Blocker back on', clock: 'Phone clock changed', boot: 'Phone restarted' };
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function pendingCmd(kind, test) { return (ST.cmds || []).find(c => c.kind === kind && (c.status === 'pending' || c.status === 'sent') && (!test || test(c.args))); }
function viewHomework() {
  const L = live(), s = L.s;
  let h = `<div class="sec"><h1>Homework</h1></div>`;
  h += `<div class="status${L.running ? (L.hw.off ? ' warn' : '') : L.hw.k === 'done' ? ' ok' : ''}"><i></i><div><b>${esc(L.hw.v)}</b><small>${esc(L.hw.sub)}</small></div></div>`;
  if (s) {
    const c = s.hw.cfg, ds = c.days.slice().sort(), days = ds.join() === '1,2,3,4,5' ? ['Mon–Fri'] : ds.length === 7 ? ['every day'] : ds.map(d => DAYS[d]), at = new Date(2000, 0, 1, Math.floor(c.at / 60), c.at % 60);
    h += `<p class="fine">${c.set ? `${c.on ? `Scheduled ${esc(days.join(', '))} at ${esc(clock(at.getTime()))}` : 'Not scheduled: it starts when someone taps Start'} · ${c.min} min · ${c.rule === 'parent' ? 'a photo, then a parent' : 'a photo to finish'}` : "Homework mode isn't set up on the phone yet."}</p>`;
  }
  h += `<div class="sec"><h2>Log</h2><span>${ST.photosOn ? 'Photos on' : 'Photos off'}</span></div>`;
  if (!ST.photosOn) h += `<p class="fine">Homework photos aren't shared. They can be switched on in Parent mode on ${esc(kidS())} phone.</p>`;
  const log = s ? s.log.slice().sort((a, b) => b.t1 - a.t1) : [];
  const have = new Set((ST.photos || []).map(p => p.entry));
  if (!log.length) return h + '<div class="card"><p class="empty">No homework sessions yet.</p></div>';
  h += `<div class="card">${log.map(e => {
    const bad = e.bad || e.how === 'off', tp = e.tp.filter(x => x[1] !== 'on' || e.bad).map(x => `${TP[x[1]]} at ${clock(x[0])}`).join(' · ');
    const ph = ST.photosOn && e.ph && have.has(e.id), chk = pendingCmd('hw_check', a => a.id === e.id), on = chk ? chk.args.on : e.pc;
    return `<div class="hrow${bad ? ' bad' : ''}">${ph ? `<button class="thumb" data-ph="${esc(e.id)}" aria-label="Homework photo, ${esc(dayName(ymd(new Date(e.t0)), true))}"><img data-entry="${esc(e.id)}" alt=""></button>` : `<span class="thumb">${BOOK}</span>`}
      <div class="grow"><b>${esc(dayName(ymd(new Date(e.t0)), true))}${e.n ? ` · ${esc(e.n)}` : ''}</b><small>${esc(clock(e.t0))}–${esc(clock(e.t1))} · ${e.m} min · ${HOW[e.how] || ''}</small>${tp ? `<small class="tp">${esc(tp)}</small>` : ''}</div>
      ${e.ph ? `<button class="chk${on ? ' on' : ''}" data-chk="${esc(e.id)}" aria-pressed="${!!on}"${chk ? ' disabled' : ''}>${chk ? 'Sending…' : on ? 'Checked' : 'Check'}</button>` : ''}</div>`;
  }).join('')}</div>`;
  return h;
}
async function loadPhotos() {
  const imgs = [...document.querySelectorAll('img[data-entry]')];
  for (const im of imgs) {
    const id = im.dataset.entry;
    if (!photoUrls.has(id)) {
      try { const r = await api(`/parent/photo?entry=${encodeURIComponent(id)}`, { raw: true }); photoUrls.set(id, URL.createObjectURL(await r.blob())); } catch (e) { continue; }
    }
    if (im.isConnected) im.src = photoUrls.get(id);
  }
}
function photoSheet(id) {
  const e = ST.snap && ST.snap.log.find(x => x.id === id), url = photoUrls.get(id);
  if (!e || !url) return;
  const on = e.pc;
  openSheet(`<h2 id="sheetTitle">${esc(dayName(ymd(new Date(e.t0)), true))}</h2><p class="dim">${esc(clock(e.t0))}–${esc(clock(e.t1))} · ${e.m} min${e.n ? ` · ${esc(e.n)}` : ''}</p>
    <img class="full" src="${url}" alt="Homework photo">
    <button class="go" data-s="chk">${on ? 'Mark not checked' : 'Mark checked'}</button><button class="ghost" data-s="close">Close</button>`, el => {
    el.querySelector('[data-s=close]').onclick = closeSheet;
    el.querySelector('[data-s=chk]').onclick = () => { closeSheet(); sendCmd('hw_check', { id, on: !on }, true); };
  });
}

/* ------------------------------------------------------------------ Actions */
let A = { mode: 'give', amt: 25, note: '' };
const CMD_TEXT = c => {
  const a = c.args || {};
  switch (c.kind) {
    case 'hw_end': return 'End homework now';
    case 'hw_start': return 'Start homework now';
    case 'coins': return `${a.n > 0 ? `Give ${a.n}` : `Take back ${-a.n}`} ${Math.abs(a.n) === 1 ? 'coin' : 'coins'}${a.w ? ` · ${a.w}` : ''}`;
    case 'limit': return a.mode === 'tighten' ? `Limit today to ${limName(a.limit)}` : `Allow ${limName(a.limit)} today`;
    case 'idea': return `Add the idea "${a.n}"`;   // I'm Bored is gone from the app; old requests stay in the history
    case 'hw_check': { const e = ST.snap && ST.snap.log.find(x => x.id === a.id); return `Mark homework${e ? ` from ${dayName(ymd(new Date(e.t0)), true)}` : ''} ${a.on ? 'checked' : 'not checked'}`; }
    default: return c.kind;
  }
};
const WHY = { inactive: 'No homework was running', blocker: 'The blocker is off on the phone', setup: "Homework mode isn't set up", nopin: 'No parent PIN on the phone', active: 'Homework was already on',
  nolimit: 'No screen time limit is set', notlower: "That isn't lower than today's limit", nothigher: "That isn't more than today's limit", nocoins: 'Not enough coins to take back', cap: 'Over 500 at a time',
  gone: "That entry isn't on the phone", dup: 'Already done', bad: "The phone didn't understand it", failed: "The phone couldn't do it" };
function cmdStatus(c) {
  if (c.status === 'done') return ['done', `Done ${c.done ? ago(c.done) : ''}`];
  if (c.status === 'failed') return ['fail', `Couldn't: ${WHY[c.result] || WHY.failed}`];
  if (c.status === 'expired') return ['fail', "Expired: the phone didn't sync within a day"];
  if (c.status === 'cancelled') return ['', 'Cancelled'];
  return ['wait', c.status === 'sent' ? 'On its way to the phone' : `Waiting for ${kidS()} phone`];
}
function viewActions() {
  const L = live(), s = L.s, cfgSet = s && s.hw.cfg.set;
  const coins = s ? s.coins : 0, lim = L.scr.lim || (s ? s.plan.lim : 0);
  const max = A.mode === 'give' ? 500 : Math.min(500, coins);
  if (A.amt > max) A.amt = Math.max(0, Math.min(25, max));
  let h = `<div class="sec"><h1>Actions</h1></div><p class="lead">Each one asks first. ${esc(kidS())} phone does it as soon as it syncs: right away while LEVEL UP is open, otherwise within about 15 minutes.</p><div class="acts">`;
  // homework
  h += `<div class="card grp"><h3>Homework</h3>${L.running ? `<p>On now · ${esc(L.hw.sub)}</p><button class="go" data-a="hw_end"${pendingCmd('hw_end') ? ' disabled' : ''}>End homework now</button>`
    : `<p>${cfgSet ? `Starts homework mode now: only the allowed apps open till it's done.` : "Homework mode isn't set up on the phone yet."}</p><button class="go" data-a="hw_start"${!cfgSet || pendingCmd('hw_start') ? ' disabled' : ''}>Start homework now</button>`}</div>`;
  // coins
  h += `<div class="card grp"><h3>Bonus coins</h3><p>${esc(kid())} has <b>${coins.toLocaleString()}</b> coins. Up to 500 at a time.</p>
    <div class="seg" style="--n:2"><button data-cm="give" aria-pressed="${A.mode === 'give'}">Give</button><button data-cm="take" aria-pressed="${A.mode === 'take'}"${coins ? '' : ' disabled'}>Take back</button></div>
    <div class="seg" style="--n:5;margin-top:8px">${[10, 25, 50, 100, 250].map(v => `<button data-amt="${v}" aria-pressed="${A.amt === v}"${v > max ? ' disabled' : ''}>${v}</button>`).join('')}</div>
    <label class="field"><span class="label">Or type it</span><input id="cAmt" type="number" inputmode="numeric" min="1" max="${max}" value="${A.amt || ''}"></label>
    <label class="field"><span class="label">What for? (optional)</span><input id="cNote" maxlength="60" value="${esc(A.note)}" placeholder="${A.mode === 'give' ? 'Helped with the groceries' : 'Phone at the dinner table'}" autocomplete="off"></label>
    <p class="err" id="cErr"></p><button class="go" data-a="coins" style="margin-top:12px">${A.mode === 'give' ? 'Give' : 'Take back'} coins</button></div>`;
  // screen time
  const lower = LIMITS.filter(l => lim && l < lim), higher = LIMITS.filter(l => lim && l > lim);
  h += `<div class="card grp"><h3>Screen time today</h3>${lim ? `<p>Today's limit: <b>${limName(lim)}</b> on limited apps.</p>
    <span class="label" style="margin:12px 2px 6px">Tighten it now</span>${lower.length ? `<div class="seg" style="--n:${lower.length}">${lower.map(l => `<button data-lim="${l}" data-mode="tighten">${limName(l)}</button>`).join('')}</div>` : '<p class="fine">Already at the tightest.</p>'}
    <span class="label" style="margin:14px 2px 6px">Allow more today</span>${higher.length ? `<div class="seg" style="--n:${higher.length}">${higher.map(l => `<button data-lim="${l}" data-mode="loosen">${limName(l)}</button>`).join('')}</div>` : '<p class="fine">Already at the most.</p>'}
    <p class="fine" style="margin-top:10px">Just for today. Tomorrow the usual plan applies again.</p>` : `<p>No screen time limit is set on the phone today.</p>`}</div>`;
  h += '</div>';
  // the requests
  const cmds = (ST.cmds || []).slice(0, 15);
  h += `<div class="sec"><h2>Requests</h2><span>last 30 days</span></div><div class="card">${cmds.length ? cmds.map(c => {
    const [k, t] = cmdStatus(c);
    return `<div class="req"><div class="grow"><b>${esc(CMD_TEXT(c))}</b><small class="${k}">${esc(t)}</small><small>${esc(when(c.created))}${c.mine ? '' : ' · another parent'}</small></div>${c.status === 'pending' ? `<button class="act" data-cancel="${esc(c.id)}">Cancel</button>` : ''}</div>`;
  }).join('') : '<p class="empty">No requests yet.</p>'}</div>`;
  return h;
}
const bind = {
  today() { const b = document.querySelector('[data-go=alerts]'); if (b) b.onclick = () => setTab('alerts'); },
  homework() {
    loadPhotos();
    for (const b of document.querySelectorAll('[data-ph]')) b.onclick = () => photoSheet(b.dataset.ph);
    for (const b of document.querySelectorAll('[data-chk]')) b.onclick = () => {
      const e = ST.snap.log.find(x => x.id === b.dataset.chk);
      if (e) sendCmd('hw_check', { id: e.id, on: !e.pc }, true);
    };
  },
  actions() {
    const m = $('main');
    const amt = $('cAmt'), note = $('cNote'), cerr = $('cErr');
    const coins = ST.snap ? ST.snap.coins : 0;
    const max = () => (A.mode === 'give' ? 500 : Math.min(500, coins));
    const valid = () => {
      const v = amt.value.trim(), n = /^\d+$/.test(v) ? +v : NaN, ok = Number.isInteger(n) && n >= 1 && n <= max();
      cerr.textContent = !v || ok ? '' : n > max() ? (A.mode === 'give' ? 'Up to 500 at a time.' : `Up to ${max()}.`) : 'A whole number, 1 or more.';
      const go = m.querySelector('[data-a=coins]');
      go.disabled = !ok; go.textContent = ok ? `${A.mode === 'give' ? 'Give' : 'Take back'} ${n} ${n === 1 ? 'coin' : 'coins'}` : `${A.mode === 'give' ? 'Give' : 'Take back'} coins`;
      for (const b of m.querySelectorAll('[data-amt]')) b.setAttribute('aria-pressed', +b.dataset.amt === n);
      return ok ? n : 0;
    };
    amt.oninput = () => { A.amt = +amt.value || 0; valid(); };
    note.oninput = () => { A.note = note.value; };
    valid();
    m.onclick = e => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.dataset.cm) { A.mode = b.dataset.cm; render(); }
      else if (b.dataset.amt) { A.amt = +b.dataset.amt; amt.value = A.amt; valid(); }
      else if (b.dataset.lim) confirmCmd('limit', { limit: +b.dataset.lim, mode: b.dataset.mode });
      else if (b.dataset.cancel) cancelCmd(b.dataset.cancel);
      else if (b.dataset.a === 'hw_end' || b.dataset.a === 'hw_start') confirmCmd(b.dataset.a, {});
      else if (b.dataset.a === 'coins') { const n = valid(); if (n) confirmCmd('coins', { n: A.mode === 'give' ? n : -n, w: A.note.replace(/\s+/g, ' ').trim().slice(0, 60) }); }
    };
  },
  settings() { bindSettings(); },
};
const CONFIRM = {
  hw_end: () => [`End homework now?`, `Homework mode ends on ${kidS()} phone, logged as "ended by a parent". No coins for it.`],
  hw_start: () => [`Start homework now?`, `Homework mode starts on ${kidS()} phone: only the allowed apps open till the time's done and a photo is taken.`],
  coins: a => [a.n > 0 ? `Give ${a.n} coins?` : `Take back ${-a.n} coins?`, `${a.n > 0 ? 'Added to' : 'Taken from'} ${kidS()} coins${a.w ? `, with the note "${a.w}"` : ''}. It shows on the phone as from a parent.`],
  limit: a => [a.mode === 'tighten' ? `Limit today to ${limName(a.limit)}?` : `Allow ${limName(a.limit)} today?`, `${a.mode === 'tighten' ? 'Tighter' : 'More time'} on the limited apps, starting now, just for today.`],
};
function confirmCmd(kind, args) {
  const [q, sub] = CONFIRM[kind](args);
  openSheet(`<h2 id="sheetTitle">${esc(q)}</h2><div class="sum">${esc(sub)}</div><p class="fine">It happens when ${esc(kidS())} phone next syncs. You can cancel it till then.</p>
    <button class="go" data-s="ok">Yes, send it</button><button class="ghost" data-s="no">Cancel</button>`, el => {
    el.querySelector('[data-s=no]').onclick = closeSheet;
    el.querySelector('[data-s=ok]').onclick = () => { closeSheet(); sendCmd(kind, args); };
  });
}
async function sendCmd(kind, args, quiet) {
  try {
    const r = await api('/parent/cmd', { method: 'POST', body: { kind, args } });
    ST.cmds = [r.cmd, ...(ST.cmds || [])];
    if (kind === 'coins') { A.note = ''; }
    toast(quiet ? 'Sent to the phone.' : `Sent. Waiting for ${kidS()} phone.`);
    render();
  } catch (e) {
    toast(e.code === 'offline' ? "You're offline. Try again when you're connected." : e.code === 'rate_limited' ? 'Too many requests at once. Try again later.' : "Couldn't send that. Try again.");
  }
}
async function cancelCmd(id) {
  try {
    const r = await api('/parent/cmd/cancel', { method: 'POST', body: { id } });
    toast(r.ok ? 'Cancelled.' : 'Too late: the phone already has it.');
  } catch (e) { toast("Couldn't cancel. Try again."); }
  refresh();
}

/* ------------------------------------------------------------------ Settings: notifications + devices */
function viewSettings() {
  const canPush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  let n;
  if (IOS && !STANDALONE) {   // Safari on iPhone: web push only exists in a Home Screen app
    n = `<p>On iPhone, notifications only work in the Home Screen app (iOS 16.4 or later).</p><ol class="steps">
      <li>Tap ${SHARE_ICON} <b>Share</b> in Safari's toolbar.</li><li>Tap ${PLUS_SQ} <b>Add to Home Screen</b>, then <b>Add</b>.</li><li>Open <b>LU Family</b> from the Home Screen and pair it with a new code from ${esc(kidS())} phone.</li><li>Come back here and turn notifications on.</li></ol>`;
  } else if (!canPush) {
    n = `<p class="dim">This browser can't show notifications from a web app.${IOS ? ' iPhone needs iOS 16.4 or later.' : ''}</p>`;
  } else {
    n = `<p id="nState" class="dim">Checking…</p><div id="nBtns"></div>`;
  }
  const devs = ST.devices || [];
  return `<div class="sec"><h1>Settings</h1></div>
    <div class="sec"><h2>Notifications</h2></div><div class="card" id="notif">${n}
      <p class="fine" style="margin-top:12px">You'll hear about: homework done, homework ended early, the blocker switched off, the screen time limit reached, a push-up unlock.</p></div>
    <div class="sec"><h2>Parent phones</h2><span>${devs.length} of 4</span></div><div class="card">${devs.map(d => `<div class="dev"><div class="grow"><b>${esc(d.name)}</b><small>Linked ${esc(when(d.created))}${d.seen ? ` · seen ${esc(ago(d.seen))}` : ''}${d.push ? ' · notifications on' : ''}</small></div>${d.me ? '<span class="pill">This phone</span>' : ''}</div>`).join('')}
      <p class="fine" style="margin-top:10px">To add a phone, make a new code in Parent mode on ${esc(kidS())} phone. A phone can be removed there too.</p>
      <button class="danger" id="leave" style="margin-top:12px">Unlink this phone</button></div>
    <div class="sec"><h2>What's shared</h2></div><div class="card"><ul class="share">
      <li>Screen time: minutes per day and the most used apps' names</li><li>Homework: when it ran, how it ended, and photos only if they're switched on in Parent mode</li>
      <li>Check-ins, quests, coins, push-up unlocks</li><li>Alerts like the blocker being switched off</li></ul>
      <p class="fine">Never messages, browsing, location or contacts. ${esc(kid())} sees "Family link on" in LEVEL UP whenever it's on. Everything older than 30 days is deleted automatically; Unlink &amp; delete in Parent mode deletes it all.</p></div>`;
}
async function bindSettings() {
  $('leave').onclick = () => openSheet(`<h2 id="sheetTitle">Unlink this phone?</h2><div class="sum">This phone stops seeing ${esc(kidS())} day and gets no more notifications. To see it again you'll need a new code.</div>
    <button class="danger" data-s="ok">Unlink this phone</button><button class="ghost" data-s="no">Keep it</button>`, el => {
    el.querySelector('[data-s=no]').onclick = closeSheet;
    el.querySelector('[data-s=ok]').onclick = async () => {
      closeSheet();
      try { await pushOff(true); await api('/parent/leave', { method: 'POST', body: {} }); } catch (e) { if (e.code !== 'unauthorized') { toast("Couldn't reach the server. Try again."); return; } }
      store.del(K.token); store.del(K.state); ST = null; showPair('This phone is unlinked.');
    };
  });
  if (!$('nState')) return;
  const st = $('nState'), btns = $('nBtns');
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
  const perm = Notification.permission;
  if (perm === 'denied') { st.textContent = `Notifications are blocked for this app. Turn them on in ${IOS ? 'Settings > Notifications > LU Family' : "the browser's site settings"}.`; return; }
  if (sub && perm === 'granted') {
    st.textContent = 'On for this phone.';
    btns.innerHTML = '<div class="btnrow"><button class="ghost" id="nTest">Send a test</button><button class="ghost" id="nOff">Turn off</button></div>';
    $('nTest').onclick = async () => { try { const r = await api('/parent/push/test', { method: 'POST', body: {} }); toast(r.ok ? 'Sent. It should arrive in a few seconds.' : "The push service didn't take it. Try turning notifications off and on."); } catch (e) { toast("Couldn't send a test."); } };
    $('nOff').onclick = async () => { await pushOff(); toast('Notifications off for this phone.'); render(); };
  } else {
    st.textContent = 'Off for this phone.';
    btns.innerHTML = '<button class="go" id="nOn">Turn on notifications</button>';
    $('nOn').onclick = pushOn;
  }
}
const b64u = s => { const p = s.replace(/-/g, '+').replace(/_/g, '/'), b = atob(p + '==='.slice((p.length + 3) % 4)); return Uint8Array.from(b, c => c.charCodeAt(0)); };
async function pushOn() {
  try {
    // permission first, straight from the tap (iOS only asks from a user gesture)
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('Notifications were not allowed.'); render(); return; }
    const { key } = await api('/parent/push/key');
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (sub) { try { await sub.unsubscribe(); } catch (e) {} }
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(key) });
    const j = sub.toJSON();
    await api('/parent/push/sub', { method: 'POST', body: { endpoint: j.endpoint, keys: j.keys } });
    toast('Notifications on.');
  } catch (e) {
    toast("Couldn't turn notifications on here.");
  }
  refresh();
}
async function pushOff(silent) {
  try {
    const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
    if (sub) { const ep = sub.endpoint; await sub.unsubscribe(); await api('/parent/push/unsub', { method: 'POST', body: { endpoint: ep } }); }
  } catch (e) { if (!silent) toast("Couldn't turn them off."); }
}

/* ------------------------------------------------------------------ sheet */
let sheetOpen = false, lastFocus = null;
function openSheet(html, bindFn) {
  lastFocus = document.activeElement;
  $('sheet').innerHTML = html; $('sheetbg').hidden = false; sheetOpen = true;
  bindFn && bindFn($('sheet'));
  const f = $('sheet').querySelector('button'); f && f.focus({ preventScroll: true });
}
function closeSheet() { $('sheetbg').hidden = true; $('sheet').innerHTML = ''; sheetOpen = false; if (lastFocus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true }); }
$('sheetbg').onclick = e => { if (e.target === $('sheetbg')) closeSheet(); };
addEventListener('keydown', e => { if (e.key === 'Escape' && sheetOpen) closeSheet(); });

/* ------------------------------------------------------------------ pairing */
function showPair(msg, code) {
  $('top').hidden = true; $('tabs').hidden = true; $('offline').hidden = true;
  const m = $('main'); m.className = 'bare';
  const homeFirst = IOS && !STANDALONE;
  m.innerHTML = `<div class="brand"><img src="/icons/icon-192.png" alt=""><div><b>LEVEL <em>UP</em> Family</b><span>Your child's day, on your phone</span></div></div>
    ${msg ? `<div class="status warn"><i></i><div><b>${esc(msg)}</b></div></div>` : ''}
    ${homeFirst ? `<div class="card hi"><h2>Add it to your Home Screen first</h2><p class="dim">On iPhone, the Home Screen app keeps its own sign-in and is the only place notifications work.</p>
      <ol class="steps"><li>Tap ${SHARE_ICON} <b>Share</b> in Safari's toolbar.</li><li>Tap ${PLUS_SQ} <b>Add to Home Screen</b>, then <b>Add</b>.</li><li>Open <b>LU Family</b> from your Home Screen and type ${code ? 'this code' : 'the code'} there.</li></ol>
      ${code ? `<div class="code-big" aria-label="Pairing code">${esc(code.slice(0, 4))}-${esc(code.slice(4))}</div><p class="fine">It works once, for 10 minutes. If it runs out, make a new one in Parent mode.</p>` : ''}
      <button class="ghost" id="here" style="margin-top:12px">Use it in Safari instead</button></div>` : ''}
    <form id="pairForm" ${homeFirst ? 'hidden' : ''} novalidate>
      <h1>Link this phone</h1><p class="lead">Open LEVEL UP on your child's phone, then Parent mode > Family link. Type the 8-character code it shows.</p>
      <label class="field"><span class="label">Code</span><input id="code" class="code-in" autocomplete="one-time-code" autocapitalize="characters" autocorrect="off" spellcheck="false" maxlength="9" inputmode="text" placeholder="ABCD-2345" value="${code ? esc(code.slice(0, 4) + '-' + code.slice(4)) : ''}"></label>
      <label class="field"><span class="label">Name this phone</span><input id="dname" maxlength="24" autocomplete="off" value="${esc(store.get(K.name) || (IOS ? 'iPhone' : 'Phone'))}"></label>
      <p class="err" id="pErr" role="alert"></p>
      <button class="go" id="pairGo" type="submit" style="margin-top:16px">Link</button>
      <p class="fine" style="margin-top:14px">Only your family's phones can see your child's data. It's kept for 30 days, then deleted.</p>
    </form>`;
  const here = $('here');
  if (here) here.onclick = () => { $('pairForm').hidden = false; here.closest('.card').hidden = true; $('code').focus(); };
  const ci = $('code');
  ci.oninput = () => {
    const raw = ci.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    ci.value = raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
  };
  $('pairForm').onsubmit = async e => {
    e.preventDefault();
    const code = ci.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase(), name = $('dname').value.trim() || 'Parent', err = $('pErr'), go = $('pairGo');
    if (code.length !== 8) { err.textContent = 'The code has 8 letters and numbers.'; return; }
    err.textContent = ''; go.disabled = true; go.textContent = 'Linking…';
    try {
      const r = await fetch('/api/pair', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, name }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        err.textContent = j.error === 'full' ? 'Four phones are linked already. Remove one in Parent mode first.' : r.status === 429 ? 'Too many tries. Wait 10 minutes and try again.' : "That code didn't work. It works once, for 10 minutes: make a new one in Parent mode.";
        return;
      }
      store.set(K.token, j.token); store.set(K.name, name);
      history.replaceState(null, '', '#today');
      ST = null; tab = 'today'; online = true;
      render(); await refresh();
      toast('Linked.');
      startPolling();
    } catch (x) {
      err.textContent = "Couldn't reach the server. Check the connection and try again.";
    } finally {
      go.disabled = false; go.textContent = 'Link';
    }
  };
}

/* ------------------------------------------------------------------ boot */
function startPolling() {
  clearInterval(pollT);
  pollT = setInterval(() => { if (!document.hidden) refresh(); }, POLL);
}
for (const b of document.querySelectorAll('.tabs button')) b.onclick = () => setTab(b.dataset.tab);
$('gear').onclick = () => setTab('settings');
$('refresh').onclick = () => refresh(true);
document.addEventListener('visibilitychange', () => { if (!document.hidden && token()) refresh(); });
addEventListener('online', () => { online = true; refresh(); });
addEventListener('offline', () => { online = false; paintOffline(); });
addEventListener('hashchange', () => { const h = location.hash.slice(1); if (token() && (TABS.includes(h) || h === 'settings') && h !== tab) setTab(h, false); });
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'open' && token()) { const t = String(e.data.tab || ''); setTab(TABS.includes(t) ? t : 'alerts'); refresh(); } });
}

(function boot() {
  const h = location.hash.slice(1), pm = /^pair=([A-Za-z0-9-]{8,9})$/.exec(h);
  if (!token()) { showPair('', pm ? pm[1].replace(/-/g, '').toUpperCase() : ''); return; }
  if (pm) history.replaceState(null, '', '#today');   // already linked: a pairing link just opens the app
  try {
    const c = JSON.parse(store.get(K.state) || 'null');
    if (c && c.s) { ST = c.s; fetchedAt = c.at; skew = c.skew || 0; online = navigator.onLine !== false; }
  } catch (e) {}
  tab = TABS.includes(h) || h === 'settings' ? h : 'today';
  setTab(tab, false);
  refresh();
  startPolling();
})();
