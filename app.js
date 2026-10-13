'use strict';
/* LEVEL UP: habits score your life like a player card. All data stays in this browser. */

const KEY = 'levelup.v1';
const DAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAME = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CATS = [['Health', 'HLT'], ['Gym', 'GYM'], ['Mind', 'MND'], ['Work', 'WRK'], ['Social', 'SOC']];
// each category's hue identifies it (icon tile + stripe) and means nothing else
const CAT_STYLE = {
  Health: ['#ff5d7a', 'M12 21s-7.4-4.5-9.4-9.1C1.1 8.4 3.3 5 6.7 5c2 0 3.4 1.1 4.3 2.4C11.9 6.1 13.3 5 15.3 5c3.4 0 5.6 3.4 4.1 6.9C17.4 16.5 12 21 12 21z'],
  Gym: ['#ffb020', 'M1.5 9.5h2v-2h3v9h-3v-2h-2zM22.5 9.5h-2v-2h-3v9h3v-2h2zM7.5 10.8h9v2.4h-9z'],
  Mind: ['#7c9cff', 'M2 5.2c3-1.4 6-1.2 9 .8v14.2c-3-1.8-6-2-9-.8zM22 5.2c-3-1.4-6-1.2-9 .8v14.2c3-1.8 6-2 9-.8z'],
  Work: ['#c38cff', 'M9 3.5h6a1 1 0 011 1V7h4a1 1 0 011 1v11a1 1 0 01-1 1H4a1 1 0 01-1-1V8a1 1 0 011-1h4V4.5a1 1 0 011-1zM10 7h4V5.5h-4z'],
  Social: ['#4fd1ff', 'M4 4h16a1 1 0 011 1v11a1 1 0 01-1 1h-9l-5 4v-4H4a1 1 0 01-1-1V5a1 1 0 011-1z'],
};
const FLAME = '<svg viewBox="0 0 13 16" aria-hidden="true"><path d="M6.5 0C7.4 3.2 13 5.6 13 10.2 13 13.6 10.2 16 6.5 16S0 13.6 0 10.2C0 7.7 1.6 6 2.9 4.9c0 2 .8 3.3 2 3.8C4.6 5.6 5.4 2.6 6.5 0z" fill="currentColor"/></svg>';

// Ranks: 8 tiers x 3 divisions spread over OVR 40-99. [name, glow colour, card material light, dark]
const TIERS = [
  ['Iron', '#a3abb6', '#4a515c', '#191c22'], ['Bronze', '#e09a5e', '#8a4f26', '#2a140a'],
  ['Silver', '#d6e0ee', '#7d8899', '#232833'], ['Gold', '#f5c64e', '#a8781c', '#2e1d05'],
  ['Platinum', '#4fe3d4', '#13827b', '#04211f'], ['Diamond', '#8ccaff', '#2f5fc4', '#0a1636'],
  ['Master', '#b98cff', '#5b31c4', '#170a3a'], ['Champion', '#ff5a6e', '#b3122f', '#33050f'],
];
const CRESTS = ['iron', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'champion'].map((n, i) => `ranks/rank-${i}-${n}.svg`);
const DIV = ['I', 'II', 'III'], STEPS = TIERS.length * 3, LO = 40, HI = 99, STEP = (HI - LO) / STEPS;

// Muscle levels are ordered, so they get a one-hue ramp that brightens with level (gold: earned,
// not flesh). Validated with the dataviz palette checker against the panel (#15181b): monotone
// lightness, every step visibly apart, dimmest step at 2.64:1. Untrained sits outside the ramp.
const LEVELS = [
  ['Untrained', '#3a3566'],
  ['Beginner', '#7a5418'], ['Intermediate', '#9a6a1c'], ['Experienced', '#b98322'],
  ['Advanced', '#d69e2e'], ['Elite', '#edbb45'], ['Champion', '#ffd977'],
];
// body-data slug -> muscle group (null = not a trainable muscle, drawn as body)
const GROUP = {
  chest: 'Chest', deltoids: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps', forearm: 'Forearms',
  abs: 'Abs', obliques: 'Obliques', trapezius: 'Traps', 'upper-back': 'Upper back', 'lower-back': 'Lower back',
  gluteal: 'Glutes', quadriceps: 'Quads', hamstring: 'Hamstrings', adductors: 'Adductors', calves: 'Calves', tibialis: 'Calves',
};
const MUSCLES = ['Chest', 'Shoulders', 'Biceps', 'Triceps', 'Forearms', 'Abs', 'Obliques', 'Traps', 'Upper back', 'Lower back', 'Glutes', 'Quads', 'Hamstrings', 'Adductors', 'Calves'];
const BODY_FILL = { head: '#2a2650', hair: '#1c1938', neck: '#25224a', hands: '#2a2650', feet: '#2a2650', knees: '#221f44', ankles: '#221f44' };
const VIEWBOX = { front: '39 86 650 1275', back: '759 87 650 1275' };

/* ------------------------------------------------------------------ dates */
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const today = () => ymd(new Date());
const fmtDate = (k, opts = { weekday: 'short', day: 'numeric', month: 'short' }) => new Date(k + 'T00:00:00').toLocaleDateString(undefined, opts);

/* ------------------------------------------------------------------ state */
const uid = () => Math.random().toString(36).slice(2, 9);
const ALL = [0, 1, 2, 3, 4, 5, 6];
function seed() {
  return {
    user: 'Raff',
    habits: [
      { id: uid(), name: 'Brush teeth', cat: 'Health', days: ALL.slice(), log: {}, created: today() },
      { id: uid(), name: 'Drink 2L water', cat: 'Health', days: ALL.slice(), log: {}, created: today() },
      { id: uid(), name: 'Gym', cat: 'Gym', days: [1, 3, 5], log: {}, created: today() },
      { id: uid(), name: 'Read 20 minutes', cat: 'Mind', days: ALL.slice(), log: {}, created: today() },
      { id: uid(), name: 'Sleep 8 hours', cat: 'Health', days: ALL.slice(), log: {}, created: today() },
    ],
    goals: [{ id: uid(), name: 'Get abs', date: ymd(addDays(new Date(), 90)), pct: 0 }],
    quit: { name: 'Doomscrolling', since: Date.now(), best: 0 },
    muscles: {},
    hm: null,
    peakIdx: null,
    sound: true,
    spent: 0, bank: 0, ach: {}, bossWins: {},
    owned: { skins: ['default'], titles: ['Rookie'] }, equip: { skin: 'default', title: 'Rookie' },
    workout: null, workouts: [], kit: 'home', units: /-US$/i.test(navigator.language || '') ? 'lb' : 'kg', woHint: false,
    muscleCap: {}, woPaid: {},
    screen: { plan: [], days: {} },
    fits: [], fitKept: {}, polls: [], well: { goal: 8, bz: true, days: {} }, fitCam: { facing: 'user', timer: 5 },
  };
}
// One-time carry-over from the first prototype (localStorage key lockin.v1).
function migrate(old) {
  const s = seed();
  s.user = old.user && old.user !== 'Blake' ? old.user : s.user;
  s.habits = (old.habits || []).map(h => ({ id: h.id || uid(), name: h.name, cat: CATS.some(c => c[0] === h.cat) ? h.cat : 'Health', days: h.days || ALL.slice(), log: h.log || {} }));
  s.goals = (old.goals || []).map(g => ({ id: g.id || uid(), name: g.name, date: g.date || '', pct: g.pct || 0 }));
  const rename = { Lats: 'Upper back', 'Lower Back': 'Lower back' };
  for (const [m, v] of Object.entries(old.muscles || {})) { const k = rename[m] || m; if (MUSCLES.includes(k)) s.muscles[k] = Math.min(6, (v | 0) + 1); }
  return s;
}
let S;
try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; }
const hadSave = !!(S && Array.isArray(S.habits));
if (!S || !Array.isArray(S.habits)) {
  let old = null; try { old = JSON.parse(localStorage.getItem('lockin.v1')); } catch (e) {}
  S = old && Array.isArray(old.habits) ? migrate(old) : seed();
}
for (const h of S.habits) {
  const first = Object.keys(h.log || {}).sort()[0];
  h.created = [h.created || today(), first || today()].sort()[0];
}
// saves from before the game layer get its fields
if (typeof S.spent !== 'number') S.spent = 0;
if (typeof S.bank !== 'number') S.bank = 0;
if (!S.ach) S.ach = {};
if (!S.bossWins) S.bossWins = {};
if (!S.owned) S.owned = { skins: ['default'], titles: ['Rookie'] };
if (!S.equip) S.equip = { skin: 'default', title: 'Rookie' };
if (S.sound === undefined) S.sound = true;
// ...and saves from before workouts get theirs (plain data only: EX and PLANS are declared further down)
if (!Array.isArray(S.workouts)) S.workouts = [];
if (!S.workout || typeof S.workout.started !== 'number' || !Array.isArray(S.workout.q) || !S.workout.q.length) S.workout = null;
if (S.kit !== 'gym') S.kit = 'home';
if (S.units !== 'kg' && S.units !== 'lb') S.units = /-US$/i.test(navigator.language || '') ? 'lb' : 'kg';
if (typeof S.woHint !== 'boolean') S.woHint = false;
// coins already banked per day from deleted past-day workouts (a floor, so a day never pays twice)
if (!S.woPaid || typeof S.woPaid !== 'object') S.woPaid = {};
// a starting level above Experienced (3) from before workouts stays pickable after a mis-tap lowers it
if (!S.muscleCap || typeof S.muscleCap !== 'object') S.muscleCap = {};
for (const [m, v] of Object.entries(S.muscles || {})) if (v > 3 && !(S.muscleCap[m] >= v)) S.muscleCap[m] = Math.min(6, v | 0);
// ...and saves from before screen time get theirs. plan: [{from, limit, apps}] sorted by from; the rule for a day is
// the last entry with from <= that day, and at most one entry (the change waiting for tomorrow) is in the future.
// days: {'YYYY-MM-DD': {u: limited-app minutes, t: whole phone, l: that day's limit (0 = none), f: 1 once final,
//   o: minutes on suggested games/videos/social NOT picked (they count for coins, never for blocking)}}
const SCR_LIMITS = [30, 45, 60, 90, 120];   // 0 = off
const SCR_PAY = l => (l <= 30 ? 60 : l <= 45 ? 50 : l <= 60 ? 40 : l <= 90 ? 25 : 15);   // a tighter limit pays more
const SCR_BACK = 7;                         // past days the phone can still report
if (!S.screen || typeof S.screen !== 'object' || Array.isArray(S.screen)) S.screen = {};
{
  const isDay = k => typeof k === 'string' && /^\d{4}-\d\d-\d\d$/.test(k), OKL = [0, ...SCR_LIMITS], t = today();
  S.screen.plan = (Array.isArray(S.screen.plan) ? S.screen.plan : [])
    .filter(e => e && isDay(e.from) && Array.isArray(e.apps))
    .map(e => ({ from: e.from, limit: OKL.includes(e.limit) ? e.limit : 60, apps: [...new Set(e.apps.filter(p => typeof p === 'string' && p && p !== 'app.levelup'))] }))
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))
    .filter((e, i, a) => !a[i + 1] || a[i + 1].from !== e.from);   // one entry per day, the later wins
  const fut = S.screen.plan.filter(e => e.from > t);
  if (fut.length > 1) S.screen.plan = S.screen.plan.filter(e => e.from <= t).concat(fut[fut.length - 1]);
  if (!S.screen.days || typeof S.screen.days !== 'object' || Array.isArray(S.screen.days)) S.screen.days = {};
  for (const [k, d] of Object.entries(S.screen.days)) {
    if (!isDay(k) || !d || typeof d.u !== 'number' || !(d.u >= 0)) { delete S.screen.days[k]; continue; }
    d.u = Math.round(d.u); d.t = typeof d.t === 'number' && d.t >= 0 ? Math.round(d.t) : 0; d.l = OKL.includes(d.l) ? d.l : 0;
    if (typeof d.o === 'number' && d.o >= 1) d.o = Math.round(d.o); else delete d.o;
    if (d.f !== 1 || k >= t) delete d.f;   // only past days can be final
  }
  // keep just enough history to know the rule for every day the phone can still report
  const cut = ymd(addDays(new Date(), -(SCR_BACK + 1)));
  while (S.screen.plan.length > 1 && S.screen.plan[1].from <= cut) S.screen.plan.shift();
}
// ...and saves from before Daily get theirs. fits: [{id, day, at, vibe}], the photos themselves live in IndexedDB (never
// in a backup); fitKept: {day: 1} past days whose photos were deleted, which still count; polls: voting links on cinolo.com
// [{id, url, at, exp, fits: [fit ids], title, res: {choices, counts, total, at} | null, gone}]; well.days: {'YYYY-MM-DD':
// {w: glasses, wg: the goal that day, s: {b, w} bed/wake 'HH:MM' (the night before), m: mood 1-5, n: note, b: breathing minutes, g: good thing}}
const VIBES = ['Clean', 'Comfy', 'Sporty', 'Drip', 'Bold', 'Chill'];
const POLL_URL = 'https://cinolo.com/fit/', POLL_KEEP = 3 * 864e5;   // a closed poll's last result shows 3 more days
{
  const isDay = k => typeof k === 'string' && /^\d{4}-\d\d-\d\d$/.test(k), t = today(), seen = new Set();
  const str = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '');
  const hm = v => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v), int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  S.fits = (Array.isArray(S.fits) ? S.fits : []).filter(f => f && typeof f.id === 'string' && /^[a-z0-9]{4,24}$/i.test(f.id) && !seen.has(f.id) && seen.add(f.id) && isDay(f.day))
    .map(f => ({ id: f.id, day: f.day, at: typeof f.at === 'number' && f.at > 0 ? f.at : Date.parse(f.day + 'T12:00:00'), vibe: VIBES.includes(f.vibe) ? f.vibe : '' }))
    .sort((a, b) => a.at - b.at);
  const kept = S.fitKept && typeof S.fitKept === 'object' && !Array.isArray(S.fitKept) ? S.fitKept : {};
  S.fitKept = {}; for (const k of Object.keys(kept)) if (isDay(k) && k < t) S.fitKept[k] = 1;
  S.polls = (Array.isArray(S.polls) ? S.polls : []).filter(p => p && typeof p.id === 'string' && /^[A-Za-z0-9]{10}$/.test(p.id) && p.url === POLL_URL + p.id && typeof p.exp === 'number' && p.exp + POLL_KEEP > Date.now())
    .map(p => {
      const r = p.res, ok = r && Array.isArray(r.choices) && Array.isArray(r.counts) && r.choices.length === r.counts.length && r.choices.length <= 3 && r.counts.every(c => int(c, 0, 1e6));
      return { id: p.id, url: p.url, at: typeof p.at === 'number' ? p.at : Date.now(), exp: p.exp, fits: (Array.isArray(p.fits) ? p.fits : []).filter(x => typeof x === 'string').slice(0, 3), title: str(p.title, 90),
        res: ok ? { choices: r.choices.map(c => str(c, 60)), counts: r.counts, total: r.counts.reduce((a, c) => a + c, 0), at: typeof r.at === 'number' ? r.at : 0 } : null, ...(p.gone ? { gone: 1 } : {}) };
    }).slice(-20);
  const w = S.well && typeof S.well === 'object' && !Array.isArray(S.well) ? S.well : {}, wd = w.days && typeof w.days === 'object' && !Array.isArray(w.days) ? w.days : {};
  S.well = { goal: int(w.goal, 4, 12) ? w.goal : 8, bz: w.bz !== false, days: {} };
  for (const [k, d] of Object.entries(wd)) {
    if (!isDay(k) || !d || typeof d !== 'object') continue;
    const o = {};
    if (int(d.w, 1, 20)) { o.w = d.w; if (int(d.wg, 4, 12)) o.wg = d.wg; }
    if (d.s && hm(d.s.b) && hm(d.s.w)) o.s = { b: d.s.b, w: d.s.w };
    if (int(d.m, 1, 5)) { o.m = d.m; if (str(d.n, 80)) o.n = str(d.n, 80); }
    if (int(d.b, 1, 99)) o.b = d.b;
    if (str(d.g, 120)) o.g = str(d.g, 120);
    if (Object.keys(o).length) S.well.days[k] = o;
  }
  const c = S.fitCam || {};
  S.fitCam = { facing: c.facing === 'environment' ? 'environment' : 'user', timer: [0, 3, 5, 10].includes(c.timer) ? c.timer : 5 };
}
const save =() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const buzz = ms => { try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(ms); } catch (e) {} };

/* ------------------------------------------------------------------ sound (synthesized, no files) */
const Sound = (() => {
  let ac = null;
  const ctx = () => { if (!ac) { const A = window.AudioContext || window.webkitAudioContext; if (A) ac = new A(); } if (ac && ac.state === 'suspended') ac.resume(); return ac; };
  function note(freq, at, dur, { type = 'triangle', vol = 0.12, to = null } = {}) {
    const a = ctx(); if (!a) return;
    const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  const on = () => S.sound !== false;
  function noise(at, dur, vol) {
    const a = ctx(); if (!a) return;
    const n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = a.createBufferSource(), g = a.createGain(), t = a.currentTime + at;
    src.buffer = buf; g.gain.setValueAtTime(vol, t); src.connect(g).connect(a.destination); src.start(t);
  }
  return {
    check() { if (!on()) return; note(660, 0, 0.09, { type: 'square', vol: 0.05 }); note(990, 0.07, 0.16, { vol: 0.1 }); },
    uncheck() { if (!on()) return; note(420, 0, 0.12, { vol: 0.07, to: 300 }); },
    clear() { if (!on()) return; [523, 659, 784, 1047].forEach((f, i) => note(f, i * 0.09, 0.22, { vol: 0.1 })); },
    rankUp() { if (!on()) return; [392, 523, 659, 784].forEach((f, i) => note(f, i * 0.11, 0.2, { type: 'square', vol: 0.05 })); note(1047, 0.46, 0.7, { vol: 0.14 }); note(1568, 0.46, 0.7, { vol: 0.06 }); },
    tap() { if (!on()) return; note(880, 0, 0.05, { type: 'sine', vol: 0.05 }); },
    hit() { if (!on()) return; noise(0, 0.12, 0.16); note(160, 0, 0.16, { type: 'square', vol: 0.06, to: 70 }); note(990, 0.02, 0.12, { vol: 0.07 }); },
    crit() { if (!on()) return; noise(0, 0.2, 0.22); note(220, 0, 0.22, { type: 'sawtooth', vol: 0.06, to: 60 }); note(1320, 0.04, 0.2, { vol: 0.1 }); note(1760, 0.12, 0.25, { vol: 0.07 }); },
    bossDown() { if (!on()) return; noise(0, 0.5, 0.18); note(300, 0, 0.6, { type: 'sawtooth', vol: 0.06, to: 50 }); [523, 659, 784, 1047, 1319].forEach((f, i) => note(f, 0.55 + i * 0.1, 0.3, { vol: 0.1 })); },
    achieve() { if (!on()) return; [1047, 1319, 1568, 2093].forEach((f, i) => note(f, i * 0.06, 0.25, { type: 'sine', vol: 0.07 })); },
    combo(n) { if (!on()) return; const f = 440 * Math.pow(2, Math.min(n, 10) / 6); note(f, 0, 0.12, { type: 'square', vol: 0.05 }); note(f * 1.5, 0.08, 0.18, { vol: 0.08 }); },
    buy() { if (!on()) return; note(1319, 0, 0.08, { vol: 0.08 }); note(1760, 0.07, 0.25, { vol: 0.1 }); noise(0.02, 0.06, 0.05); },
    nope() { if (!on()) return; note(180, 0, 0.12, { type: 'square', vol: 0.06 }); note(150, 0.12, 0.16, { type: 'square', vol: 0.06 }); },
    beep() { if (!on()) return; note(880, 0, 0.08, { type: 'square', vol: 0.05 }); },
    go() { if (!on()) return; note(660, 0, 0.1, { type: 'square', vol: 0.06 }); note(1320, 0.1, 0.25, { vol: 0.12 }); },
    shutter() { if (!on()) return; noise(0, 0.06, 0.22); note(2200, 0, 0.04, { type: 'square', vol: 0.03 }); noise(0.09, 0.05, 0.12); },
    drop() { if (!on()) return; note(700, 0, 0.1, { type: 'sine', vol: 0.1, to: 1400 }); note(1200, 0.07, 0.12, { type: 'sine', vol: 0.05, to: 600 }); },
    breath(up) { if (!on()) return; note(up ? 262 : 392, 0, 3.4, { type: 'sine', vol: 0.06, to: up ? 392 : 262 }); },
  };
})();

/* ------------------------------------------------------------------ scoring */
const due = (h, d) => h.days.includes(d.getDay()) && ymd(d) >= h.created;
function rate(habits, days) {
  let n = 0, done = 0;
  for (let i = 0; i < days; i++) {
    const d = addDays(new Date(), -i), k = ymd(d);
    for (const h of habits) if (due(h, d)) {
      // today only counts once it is done, so the score does not drop every morning
      if (i === 0 && !h.log[k]) continue;
      n++; if (h.log[k]) done++;
    }
  }
  return n ? done / n : null;
}
function streak(h) {
  let n = 0, d = new Date();
  if (!h.log[ymd(d)]) d = addDays(d, -1);
  for (let i = 0; i < 730; i++, d = addDays(d, -1)) { if (!due(h, d)) continue; if (h.log[ymd(d)]) n++; else break; }
  return n;
}
function bestStreak() {
  let best = 0;
  for (const h of S.habits) {
    let n = 0;
    for (let i = 730; i >= 0; i--) { const d = addDays(new Date(), -i); if (!due(h, d)) continue; if (h.log[ymd(d)]) best = Math.max(best, ++n); else if (i > 0) n = 0; }
  }
  return best;
}
function dayStreak() {   // consecutive days where every habit due was done
  const full = d => { const list = S.habits.filter(h => due(h, d)); return list.every(h => h.log[ymd(d)]); };
  let n = 0, d = new Date();
  if (!full(d)) d = addDays(d, -1);
  for (let i = 0; i < 730 && full(d); i++, d = addDays(d, -1)) if (S.habits.some(h => due(h, d))) n++;
  return n;
}
const checkins = () => S.habits.reduce((a, h) => a + Object.keys(h.log).length, 0);
const toRating = r => Math.round(LO + r * (HI - LO));
// How much of the 14-day window has history: day 1 counts 1/14, a full fortnight counts fully.
function confidence() {
  if (!S.habits.length) return 0;
  const oldest = S.habits.reduce((a, h) => (h.created < a ? h.created : a), today());
  const age = Math.round((new Date(today() + 'T00:00:00') - new Date(oldest + 'T00:00:00')) / 864e5) + 1;
  return Math.min(14, Math.max(1, age)) / 14;
}
function ovrExact() {
  const r = (rate(S.habits, 14) || 0) * confidence();
  const lv = MUSCLES.reduce((a, m) => a + muscleLevel(m), 0) / (MUSCLES.length * 6);
  return Math.min(HI, LO + r * 50 + lv * 9);
}
function rankOf(x) {
  const idx = Math.min(STEPS - 1, Math.max(0, Math.floor((x - LO) / STEP)));
  const into = Math.min(1, (x - LO - idx * STEP) / STEP);
  return { idx, tier: Math.floor(idx / 3), name: `${TIERS[Math.floor(idx / 3)][0]} ${DIV[idx % 3]}`, into, next: idx + 1 < STEPS ? `${TIERS[Math.floor((idx + 1) / 3)][0]} ${DIV[(idx + 1) % 3]}` : null, need: (idx + 1) * STEP + LO - x };
}

/* ------------------------------------------------------------------ home */
const rankName = idx => `${TIERS[Math.floor(idx / 3)][0]} ${DIV[idx % 3]}`;
function renderCard() {
  const x = ovrExact(), r = rankOf(x), placing = checkins() === 0;
  const tier = TIERS[placing ? 0 : r.tier], root = document.documentElement.style;
  root.setProperty('--rank', placing ? '#aba5cc' : tier[1]);
  root.setProperty('--card-a', placing ? '#3a3566' : tier[2]); root.setProperty('--card-b', placing ? '#141130' : tier[3]);
  $('card').className = `card${placing ? ' placing' : ''}${S.equip.skin && S.equip.skin !== 'default' ? ' skin-' + S.equip.skin : ''}`;
  $('ptitle').hidden = !S.equip.title; $('ptitle').textContent = S.equip.title || '';
  $('ovr').textContent = placing ? '?' : Math.floor(x);
  $('rankname').textContent = placing ? 'Unranked' : r.name;
  for (const id of ['ring', 'ringHalo']) {
    $(id).style.strokeDasharray = `${placing ? 0 : (r.into * 100).toFixed(1)} 100`;
    $(id).style.opacity = placing || r.into < 0.005 ? 0 : '';   // a zero-length round cap would draw a stray dot
  }
  $('ranknext').textContent = placing ? 'Tick a quest to start placement' : r.next ? `${Math.max(0.1, r.need).toFixed(1)} OVR to ${r.next}` : 'Top rank';
  $('crest').src = CRESTS[r.tier]; $('crest').alt = placing ? 'Unranked' : `${TIERS[r.tier][0]} crest`;
  $('who').innerHTML = `<i>${esc((S.user || '?').trim().charAt(0).toUpperCase())}</i>${esc(S.user)}`; $('who').setAttribute('aria-label', `${S.user}, edit name`);
  const ds = dayStreak();
  $('streak').hidden = !ds; $('streakN').textContent = ds; $('streak').setAttribute('aria-label', `${ds} perfect ${ds === 1 ? 'day' : 'days'} in a row`);
  const used = CATS.filter(([c]) => S.habits.some(h => h.cat === c)), conf = confidence();
  $('attrs').style.setProperty('--cols', Math.max(1, Math.min(3, used.length)));
  $('attrs').hidden = !used.length;
  $('attrs').innerHTML = used.map(([cat, ab]) => {
    const v = rate(S.habits.filter(h => h.cat === cat), 14);
    return `<div class="attr"><b class="${v === null ? 'gap' : ''}">${v === null ? '--' : toRating(v * conf)}</b><span class="label">${ab}</span></div>`;
  }).join('');
  if (placing) return;
  // celebrate only a new personal-best rank, never a rank you already reached
  if (S.peakIdx === null || S.peakIdx === undefined) { S.peakIdx = r.idx; save(); }
  else if (r.idx > S.peakIdx) { const from = S.peakIdx; S.peakIdx = r.idx; save(); rankUp(r, from); }
}
function rankUp(r, from) {
  celebrate({ hd: 'Rank up!', from: `${rankName(from)} \u2192 ${r.name}`, img: CRESTS[r.tier], name: r.name, color: TIERS[r.tier][1], sound: 'rankUp' });
}
// full-screen moments (rank-ups, boss kills) queue up and play one after another
const moments = [];
function celebrate(m) { moments.push(m); if (!$('rankup').classList.contains('open')) nextMoment(); }
function nextMoment() {
  const m = moments.shift(), ov = $('rankup');
  if (!m) { ov.classList.remove('open'); return; }
  $('rankupHd').textContent = m.hd; $('rankupFrom').textContent = m.from; $('rankupImg').src = m.img; $('rankupName').textContent = m.name;
  ov.style.setProperty('--rank', m.color);
  ov.classList.add('open'); buzz([20, 40, 60]); Sound[m.sound](); burst(m.color);
  setTimeout(() => $('rankupClose').focus(), 30);
}
$('rankupClose').onclick = () => { Sound.tap(); nextMoment(); };
// rank-up confetti: one canvas, a few seconds, then it stops drawing
function burst(color) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = $('fx'), g = c.getContext('2d'), dpr = devicePixelRatio || 1;
  c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  const cols = [color, '#ffffff', '#ffd23f', color];
  const ps = Array.from({ length: 110 }, (_, i) => {
    const a = Math.random() * Math.PI * 2, v = (4 + Math.random() * 9) * dpr;
    return { x: c.width / 2, y: c.height * 0.45, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 4 * dpr, s: (3 + Math.random() * 5) * dpr, r: Math.random() * 6, c: cols[i % cols.length], life: 1 };
  });
  let last = performance.now();
  (function frame(now) {
    const dt = Math.min(2, (now - last) / 16.7); last = now;
    g.clearRect(0, 0, c.width, c.height);
    let alive = 0;
    for (const p of ps) {
      if (p.life <= 0) continue; alive++;
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 0.35 * dpr * dt; p.vx *= 0.99; p.life -= 0.012 * dt; p.r += 0.2 * dt;
      g.save(); g.globalAlpha = Math.max(0, p.life); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.s, -p.s / 2, p.s * 2, p.s); g.restore();
    }
    if (alive && $('rankup').classList.contains('open')) requestAnimationFrame(frame); else g.clearRect(0, 0, c.width, c.height);
  })(last);
}

const CHECK = '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3 9.5l4 4 8-9" fill="none" stroke="#0c0a1d" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
let editing = false;
function renderHabits() {
  const k = today(), now = new Date(), list = S.habits.filter(h => due(h, now));
  const doneN = list.filter(h => h.log[k]).length, clear = list.length > 0 && doneN === list.length;
  $('todaycount').textContent = list.length ? `${doneN}/${list.length}` : '';
  paintHello(list.length, doneN);
  $('questtitle').textContent = clear ? 'All quests cleared' : 'Daily quests';
  $('questtitle').classList.toggle('clear', clear);
  $('questbar').classList.toggle('clear', clear);
  $('questbar').innerHTML = list.map((h, i) => `<i class="${i < doneN ? 'on' : ''}"></i>`).join('');
  const off = S.habits.filter(h => !due(h, now));
  const row = (h, isDue) => {
    const on = !!h.log[k], st = streak(h);
    const sched = h.days.length === 7 ? 'Every day' : h.days.map(d => DAY_NAME[d]).join(' ');
    const ctl = editing ? '' : `role="checkbox" aria-checked="${on}" tabindex="0"`;
    const [col, icon] = CAT_STYLE[h.cat] || CAT_STYLE.Health, go = h.cat === 'Gym' && isDue && !on && !S.workout && !editing;
    return `<div class="habit ${on ? 'on' : ''} ${isDue ? '' : 'offday'}${go ? ' has-go' : ''}" data-h="${h.id}" ${ctl} style="--cat:${col}">
      <div class="tile"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icon}" fill="currentColor"/></svg></div>
      <div class="grow"><div class="nm">${esc(h.name)}</div><div class="meta">${esc(h.cat)} · ${isDue ? sched : 'Off today'}</div></div>
      ${st ? `<div class="stk" title="${st} in a row">${FLAME}${st}</div>` : ''}
      ${go ? `<button class="qgo" data-go="${h.id}" aria-label="Start a workout for ${esc(h.name)}">GO</button>` : ''}
      <div class="box">${CHECK}</div>
      <button class="act quiet rm" data-rm="${h.id}">Remove</button>
    </div>`;
  };
  const el = $('habits');
  el.classList.toggle('editing', editing);
  el.innerHTML = S.habits.length
    ? list.map(h => row(h, true)).join('') + off.map(h => row(h, false)).join('')
    : '<p class="empty">No quests yet. Add one small thing you\'ll do every day.</p>';
  el.querySelectorAll('.habit').forEach(r => {
    const toggle = () => {
      if (editing) return;
      const h = S.habits.find(x => x.id === r.dataset.h), key = today(), before = ovrExact(), adding = !h.log[key], hpBefore = bossState().hp;
      const dueNow = S.habits.filter(x => due(x, new Date())), wasClear = dueNow.length > 0 && dueNow.every(x => x.log[key]);
      if (adding) { h.log[key] = Date.now(); buzz(12); } else { delete h.log[key]; Sound.uncheck(); }
      save(); renderAll();
      const nowClear = dueNow.length > 0 && dueNow.every(x => x.log[key]);
      if (adding) {
        if (nowClear && !wasClear) { Sound.clear(); buzz([15, 40, 15, 40, 30]); } else Sound.check();
        const dealt = hpBefore - bossState().hp;
        if (dealt > 0) showHit(dealt, hitOf(h, key) > HIT);
        combo();
        if (h.cat === 'Gym' && !S.workouts.length && !S.woHint) { S.woHint = true; save(); showNote('Nice! Want to log your sets too?', 'Next time tap Start workout. It ticks this quest and levels up your muscles', DB_ICON); }
      }
      const row = $('habits').querySelector(`[data-h="${h.id}"]`);
      if (row) {
        row.focus({ preventScroll: true });
        if (adding) row.classList.add('just');
        if (adding && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
          const box = row.querySelector('.box');
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2, sp = document.createElement('span');
            sp.className = 'spark'; sp.style.setProperty('--dx', `${Math.cos(a) * 26}px`); sp.style.setProperty('--dy', `${Math.sin(a) * 26}px`);
            box.appendChild(sp); sp.addEventListener('animationend', () => sp.remove());
          }
        }
        const delta = ovrExact() - before;
        if (adding && delta >= 0.05) {
          const tag = document.createElement('span'); tag.className = 'delta'; tag.textContent = `+${delta.toFixed(1)} OVR`;
          row.appendChild(tag); tag.addEventListener('animationend', () => tag.remove());
          setTimeout(() => tag.remove(), 1200);
        }
      }
    };
    r.onclick = e => { if (e.target.closest('[data-rm],[data-go]')) return; toggle(); };
    r.onkeydown = e => { if (e.target !== r) return; if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } };
  });
  el.querySelectorAll('[data-go]').forEach(b => b.onclick = e => { e.stopPropagation(); startWorkout(suggestPlan(S.kit), 2, null, b.dataset.go); });
  el.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
    const h = S.habits.find(x => x.id === b.dataset.rm);
    if (confirm(`Remove "${h.name}" and its history?`)) {
      S.bank += Object.keys(h.log).length * 10;   // coins you earned from it stay yours
      S.habits = S.habits.filter(x => x !== h); save(); renderAll();
    }
  });
  $('editHabits').textContent = editing ? 'Done' : 'Edit';
}
$('editHabits').onclick = () => { editing = !editing; renderHabits(); };
// one line over the card: hello by time of day, then what's left today
function paintHello(due, done) {
  const h = new Date().getHours(), hi = h < 5 ? 'Up late' : h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening', left = due - done, el = $('hello');
  const say = !S.habits.length ? 'Add a quest to get going.' : !due ? 'No quests today. Rest up.' : !left ? 'Every quest cleared. Legend.'
    : !checkins() ? "Let's get you ranked." : `${left} ${left === 1 ? 'quest' : 'quests'} to go today.`;
  el.classList.toggle('clear', due > 0 && !left);
  el.innerHTML = `<b>${hi}, ${esc((S.user || 'player').trim())}</b><span>${say}</span>`;
}

function renderGoals() {
  const el = $('goals');
  el.innerHTML = S.goals.length ? S.goals.map(g => {
    const left = g.date ? Math.round((new Date(g.date + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 864e5) : null;
    const when = g.date ? `${fmtDate(g.date, { day: 'numeric', month: 'long', year: 'numeric' })}${left !== null ? ` · ${left > 0 ? left + ' days left' : left === 0 ? 'due today' : Math.abs(left) + ' days over'}` : ''}` : 'No date';
    return `<div class="goal ${g.pct >= 100 ? 'done' : ''}" data-g="${g.id}" role="button" tabindex="0">
      <div><div class="nm">${esc(g.name)}</div><div class="d">${when}</div></div>
      <div class="pc">${g.pct}%</div>
      <div class="bar"><i style="width:${g.pct}%"></i></div></div>`;
  }).join('') : '<p class="empty">No goals yet. Pick something big: a 5K, a pull-up, a grade.</p>';
  el.querySelectorAll('[data-g]').forEach(r => { r.onclick = () => goalSheet(S.goals.find(g => g.id === r.dataset.g)); r.onkeydown = e => { if (e.key === 'Enter') r.click(); }; });
}

/* ------------------------------------------------------------------ body */
// fill(group) -> colour draws a plain figure (workout art); without it, the tappable level map
function bodySVG(side, fill) {
  const paths = BODY[side].map(([slug, d]) => {
    const g = GROUP[slug];
    if (!g) return `<path d="${d}" fill="${BODY_FILL[slug] || '#25224a'}"/>`;
    if (fill) return `<path d="${d}" fill="${fill(g)}"/>`;
    const lv = muscleLevel(g);
    return `<path class="mus l${lv}" data-m="${g}" d="${d}" fill="${LEVELS[lv][1]}"><title>${g}: ${LEVELS[lv][0]}</title></path>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX[side]}" ${fill ? 'aria-hidden="true"' : `role="img" aria-label="${side} muscle map"`}>
    <path d="${BODY.outline[side]}" fill="#1a1738" stroke="#4b4680" stroke-width="1.2" vector-effect="non-scaling-stroke"/>
    <g stroke="#0c0a1d" stroke-width="1.4" vector-effect="non-scaling-stroke" stroke-linejoin="round">${paths}</g></svg>`;
}
function renderBody() {
  $('bodies').innerHTML = ['front', 'back'].map(s => `<div class="fig">${bodySVG(s)}<div class="label">${s}</div></div>`).join('');
  $('mkey').innerHTML = LEVELS.map(([n, c]) => `<span><i style="background:${c}"></i>${n}</span>`).join('');
  $('mtable').innerHTML = MUSCLES.map(m => { const x = muscleXp(m), lv = lvFromXp(x); return `<tr data-m="${m}" tabindex="0"><td>${m}</td><td><i style="background:${LEVELS[lv][1]}"></i>${LEVELS[lv][0]}<small class="mxp"><b style="width:${xpPct(x).toFixed(0)}%"></b></small></td></tr>`; }).join('');
  document.querySelectorAll('#v-body [data-m]').forEach(el => { el.onclick = () => levelSheet(el.dataset.m); el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); levelSheet(el.dataset.m); } }; });
  renderLog();
}

/* ------------------------------------------------------------------ stats */
let tipKey = null;
function renderStats() {
  const sel = $('hmsel');
  if (!S.habits.length) { sel.innerHTML = '<option>No habits</option>'; $('heat').innerHTML = ''; $('months').innerHTML = ''; $('hmrate').innerHTML = ''; }
  else {
    if (!S.habits.some(h => h.id === S.hm)) S.hm = S.habits[0].id;
    sel.innerHTML = S.habits.map(h => `<option value="${h.id}" ${h.id === S.hm ? 'selected' : ''}>${esc(h.name)}</option>`).join('');
    const h = S.habits.find(x => x.id === S.hm), W = 17, now = new Date(), tk = today();
    const start = addDays(now, -(W * 7 - 1) + (6 - now.getDay()));   // Sunday, 17 weeks back; last column is this week
    let cells = '', n = 0, done = 0, months = '';
    for (let w = 0; w < W; w++) {
      const first = addDays(start, w * 7);
      const label = w === 0 || first.getDate() <= 7 ? first.toLocaleDateString(undefined, { month: 'short' }) : '';
      months += `<span>${label}</span>`;
      for (let d = 0; d < 7; d++) {
        const day = addDays(start, w * 7 + d), k = ymd(day);
        if (k > tk) { cells += '<button class="fut" tabindex="-1" aria-hidden="true"></button>'; continue; }
        if (k < h.created) { cells += '<button class="pre" tabindex="-1" aria-hidden="true"></button>'; continue; }
        const on = !!h.log[k], isDue = due(h, day);
        if (isDue && (k !== tk || on)) { n++; if (on) done++; }
        const cls = on ? 'hit' : isDue ? (k === tk ? '' : 'miss') : 'off';
        const desc = `${fmtDate(k)}: ${on ? 'done' : isDue ? (k === tk ? 'not yet' : 'missed') : 'off day'}`;
        cells += `<button class="${cls}${k === tk ? ' today' : ''}" data-k="${k}" data-desc="${desc}" aria-label="${desc}"></button>`;
      }
    }
    $('months').style.gridTemplateColumns = `repeat(${W}, 1fr)`; $('months').innerHTML = months;
    $('heat').style.gridTemplateColumns = `repeat(${W}, 1fr)`; $('heat').innerHTML = cells;
    $('hmrate').innerHTML = `${n ? Math.round(done / n * 100) : 0}%<small>${done} OF ${n} DUE DAYS</small>`;
    $('heat').querySelectorAll('button[data-k]').forEach(b => b.onclick = () => { tipKey = b.dataset.k; $('hmtip').textContent = b.dataset.desc; });
    const t = tipKey && $('heat').querySelector(`[data-k="${tipKey}"]`); $('hmtip').textContent = t ? t.dataset.desc : 'Tap a day for details';
  }
  $('f1').textContent = checkins().toLocaleString();
  $('f2').textContent = bestStreak();
  const r30 = rate(S.habits, 30); $('f3').textContent = r30 === null ? '–' : Math.round(r30 * 100) + '%';
  renderQuit();
}
$('hmsel').onchange = e => { S.hm = e.target.value; tipKey = null; save(); renderStats(); };

function renderQuit() {
  const q = S.quit;
  $('quitname').textContent = `${q.name} free`;
  const mins = Math.max(0, Math.floor((Date.now() - q.since) / 6e4)), d = Math.floor(mins / 1440), h = Math.floor(mins % 1440 / 60), m = mins % 60;
  $('timer').textContent = `${d}d ${h}h ${m}m`;
  const best = Math.max(q.best || 0, Date.now() - q.since);
  $('since').textContent = `Since ${new Date(q.since).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · best ${Math.floor(best / 864e5)}d`;
}
$('quitReset').onclick = () => {
  if (!confirm(`Reset your ${S.quit.name} timer to zero?`)) return;
  S.quit.best = Math.max(S.quit.best || 0, Date.now() - S.quit.since); S.quit.since = Date.now(); save(); renderQuit();
};
$('quitEdit').onclick = () => quitSheet();
const paintSound = () => { const on = S.sound !== false; $('soundToggle').innerHTML = `Sound<span class="val${on ? ' on' : ''}">${on ? 'On' : 'Off'}</span>`; $('soundToggle').setAttribute('aria-pressed', on); };
$('soundToggle').onclick = () => { S.sound = S.sound === false; save(); paintSound(); Sound.tap(); };
paintSound();
$('export').onclick = () => {
  if (window.LevelUpAndroid) { LevelUpAndroid.saveBackup(`levelup-${today()}.json`, JSON.stringify(S, null, 1)); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' }));
  a.download = `levelup-${today()}.json`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('import').onclick = () => $('importFile').click();
$('importFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const x = JSON.parse(await f.text());
    if (!x || !Array.isArray(x.habits)) throw new Error('not a LEVEL UP backup');
    if (!confirm('Replace everything on this phone with this backup?')) return;
    // a backup can't loosen today's screen-time limit: that waits for tomorrow, like in Screen time
    const sx = x.screen && typeof x.screen === 'object' && !Array.isArray(x.screen) ? x.screen : {};
    const P = (Array.isArray(sx.plan) ? sx.plan : []).filter(e => e && typeof e.from === 'string' && /^\d{4}-\d\d-\d\d$/.test(e.from) && Array.isArray(e.apps))
      .map(e => ({ from: e.from, limit: [0, ...SCR_LIMITS].includes(e.limit) ? e.limit : 60, apps: e.apps.filter(p => typeof p === 'string' && p) }))
      .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
    x.screen = { ...sx, plan: scrKeep(P) };
    localStorage.setItem(KEY, JSON.stringify(x)); location.reload();
  } catch (err) { alert(`Could not import: ${err.message}`); }
};
$('erase').onclick = () => {
  const keep = scrKeep([]);   // today's screen-time limit stays till midnight while the blocker is on
  if (!confirm(`Erase every habit, goal, level and fit photo on this phone? This cannot be undone.${keep.length ? ' Your screen time limit stays on till midnight.' : ''}`)) return;
  $('wo').hidden = true; $('wo').classList.remove('res'); woRes = null; stopTick(); keepOn(false); woRev++;
  ovClose(); fitReq = null; Object.keys(fitURLs).forEach(fitForget); FitDB.clear().catch(() => {}); dlyRev++;
  S = seed(); S.screen.plan = keep; save(); scrPush(); renderBody(); renderAll();   // native and JS agree on what is limited
};

/* ------------------------------------------------------------------ sheets */
let prevFocus = null;
function openSheet(html, bind) {
  prevFocus = document.activeElement;
  $('sheet').innerHTML = html.replace('<h2>', '<h2 id="sheetTitle">'); $('sheetbg').classList.add('open'); bind($('sheet'));
  const first = $('sheet').querySelector('input, select, button'); if (first) setTimeout(() => first.focus(), 50);
}
const closeSheet = () => {
  if (!$('sheetbg').classList.contains('open')) return;
  $('sheetbg').classList.remove('open');
  if (prevFocus && prevFocus.isConnected) prevFocus.focus({ preventScroll: true });
};
$('sheetbg').onclick = e => { if (e.target === $('sheetbg')) closeSheet(); };
addEventListener('keydown', e => { if (e.key === 'Escape' && (!$('pu').hidden || $('rankup').classList.contains('open') || $('sheetbg').classList.contains('open') || !$('ov').hidden || !$('wo').hidden)) levelupBack(); });

function habitSheet() {
  let pick = ALL.slice();
  openSheet(`<h2>New quest</h2>
    <label class="field"><span class="label">Name</span><input id="hName" maxlength="40" placeholder="Drink 2L water" autocomplete="off"></label>
    <label class="field"><span class="label">Attribute</span><select id="hCat">${CATS.map(([c, a]) => `<option value="${c}">${c} (${a})</option>`).join('')}</select></label>
    <div class="field"><span class="label">Days</span><div class="days" id="hDays"></div></div>
    <button class="go" id="hSave" disabled>Add quest</button>`, el => {
    const paint = () => {
      el.querySelector('#hDays').innerHTML = DAY.map((d, i) => `<button type="button" data-d="${i}" class="${pick.includes(i) ? 'on' : ''}" aria-pressed="${pick.includes(i)}" aria-label="${DAY_NAME[i]}">${d}</button>`).join('');
      el.querySelectorAll('#hDays button').forEach(b => b.onclick = () => { const i = +b.dataset.d; pick = pick.includes(i) ? pick.filter(x => x !== i) : [...pick, i].sort(); paint(); valid(); });
    };
    const valid = () => { el.querySelector('#hSave').disabled = !el.querySelector('#hName').value.trim() || !pick.length; };
    paint(); el.querySelector('#hName').oninput = valid;
    el.querySelector('#hSave').onclick = () => {
      S.habits.push({ id: uid(), name: el.querySelector('#hName').value.trim(), cat: el.querySelector('#hCat').value, days: pick.slice(), log: {}, created: today() });
      save(); closeSheet(); renderAll();
    };
  });
}
$('addHabit').onclick = habitSheet;

function goalSheet(g) {
  const isNew = !g; g = g || { id: uid(), name: '', date: '', pct: 0 };
  openSheet(`<h2>${isNew ? 'New goal' : 'Goal'}</h2>
    <label class="field"><span class="label">Goal</span><input id="gName" maxlength="40" value="${esc(g.name)}" placeholder="Get abs" autocomplete="off"></label>
    <label class="field"><span class="label">Target date</span><input id="gDate" type="date" value="${g.date}"></label>
    <label class="field"><span class="label">Progress <b id="gPctOut" style="color:var(--chalk)">${g.pct}%</b></span><input id="gPct" type="range" min="0" max="100" step="5" value="${g.pct}"></label>
    <button class="go" id="gSave">${isNew ? 'Add goal' : 'Save'}</button>
    ${isNew ? '' : '<div class="row2"><span></span><button class="act quiet" id="gDel">Remove goal</button></div>'}`, el => {
    const name = el.querySelector('#gName'), pct = el.querySelector('#gPct'), saveBtn = el.querySelector('#gSave');
    const valid = () => { saveBtn.disabled = !name.value.trim(); }; valid(); name.oninput = valid;
    pct.oninput = () => { el.querySelector('#gPctOut').textContent = pct.value + '%'; };
    saveBtn.onclick = () => {
      const was = g.pct; Object.assign(g, { name: name.value.trim(), date: el.querySelector('#gDate').value, pct: +pct.value });
      if (isNew) S.goals.push(g);
      save(); closeSheet(); renderGoals(); afterChange(); if (g.pct >= 100 && was < 100) buzz([20, 30, 20]);
    };
    const del = el.querySelector('#gDel');
    if (del) del.onclick = () => { if (confirm(`Remove "${g.name}"?`)) { S.goals = S.goals.filter(x => x.id !== g.id); save(); closeSheet(); renderGoals(); } };
  });
}
$('addGoal').onclick = () => goalSheet(null);

function quitSheet() {
  const q = S.quit, local = new Date(q.since - new Date(q.since).getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  openSheet(`<h2>Quit tracker</h2>
    <label class="field"><span class="label">What you are quitting</span><input id="qName" maxlength="30" value="${esc(q.name)}" autocomplete="off"></label>
    <label class="field"><span class="label">Quit since</span><input id="qSince" type="datetime-local" value="${local}" max="${new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16)}"></label>
    <button class="go" id="qSave">Save</button>`, el => {
    el.querySelector('#qSave').onclick = () => {
      const n = el.querySelector('#qName').value.trim(), t = new Date(el.querySelector('#qSince').value).getTime();
      if (n) q.name = n;
      if (!isNaN(t) && t <= Date.now()) { if (t > q.since) q.best = Math.max(q.best || 0, t - q.since); q.since = t; }
      save(); closeSheet(); renderQuit(); afterChange();
    };
  });
}
$('who').onclick = () => {
  openSheet(`<h2>Player</h2><label class="field"><span class="label">Name</span><input id="pName" maxlength="16" value="${esc(S.user)}" autocomplete="off"></label><button class="go" id="pSave">Save</button>`, el => {
    el.querySelector('#pSave').onclick = () => { const n = el.querySelector('#pName').value.trim(); if (n) { S.user = n; save(); } closeSheet(); renderCard(); };
  });
};


/* ------------------------------------------------------------------ game layer: bosses, coins, trophies, locker */
const COIN_SM = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#ffb020"/><circle cx="12" cy="12" r="7.6" fill="#ffd23f"/></svg>';
const TROPHY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 3h10v3h3a1 1 0 011 1v2a5 5 0 01-4.6 5A5.5 5.5 0 0113 17v2h3v2H8v-2h3v-2a5.5 5.5 0 01-3.4-3A5 5 0 013 9V7a1 1 0 011-1h3zM5 8v1a3 3 0 002.2 2.9A9 9 0 017 9.6V8zm14 0h-2v1.6a9 9 0 01-.2 2.3A3 3 0 0019 9z"/></svg>';

// Weekly bosses rotate each Monday. HP is 80% of the week's quest slots x 100, so you win by
// doing about four out of five of your quests. Each check-in hits for 100; crits (fixed per
// quest+day, so re-ticking can't reroll them) hit for 200.
const BOSSES = [
  { name: 'The Procrastinator', art: 'bosses/boss-0-procrastinator.svg', color: '#c9b8ff', taunt: 'Eh... do it tomorrow.' },
  { name: 'Doomscroll Hydra', art: 'bosses/boss-1-hydra.svg', color: '#4fe3d4', taunt: 'Just one more video.' },
  { name: 'Sugar Golem', art: 'bosses/boss-2-golem.svg', color: '#ff7ad9', taunt: 'Snack time. Forever.' },
  { name: 'Snooze Wraith', art: 'bosses/boss-3-wraith.svg', color: '#9fc4ff', taunt: 'Five more minutes...' },
  { name: 'Couch Kraken', art: 'bosses/boss-4-kraken.svg', color: '#ff8a5c', taunt: 'Stay. On. The. Couch.' },
];
const HIT = 100, CRIT_CHANCE = 0.15, BOSS_COINS = 250;
const weekStart = (d = new Date()) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const weekIndex = ws => Math.round((ws - new Date(2024, 0, 1)) / (7 * 864e5));   // 2024-01-01 was a Monday
const hash01 = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const hitOf = (h, k) => (hash01(`${h.id}|${k}`) < CRIT_CHANCE ? HIT * 2 : HIT);
function bossState(d = new Date()) {
  const ws = weekStart(d), key = ymd(ws), idx = ((weekIndex(ws) % BOSSES.length) + BOSSES.length) % BOSSES.length;
  const ok = woLedger().okDays; let slots = 0, dmg = 0, hits = 0, crits = 0, wo = 0;
  for (let i = 0; i < 7; i++) {
    const day = addDays(ws, i), k = ymd(day);
    for (const h of S.habits) {
      if (due(h, day)) slots++;
      if (h.log[k]) { const v = hitOf(h, k); dmg += v; hits++; if (v > HIT) crits++; }
    }
    if (ok.has(k)) { dmg += WO_HIT; wo++; }   // a finished workout is a bonus hit, once a day
  }
  const maxHp = Math.max(0, Math.round((slots * HIT * 0.8) / 50) * 50);
  return { key, idx, boss: BOSSES[idx], maxHp, hp: Math.max(0, maxHp - dmg), dmg, hits, crits, wo, end: addDays(ws, 7) };
}
function renderBoss() {
  const b = bossState(), el = $('boss');
  if (!b.maxHp) {
    el.className = 'boss empty'; el.style.removeProperty('--boss');
    el.innerHTML = `<div><span class="label">Weekly boss</span><div class="bossname">No boss yet</div><div class="taunt">Add a quest to summon this week's boss.</div></div>`;
    return;
  }
  const down = b.hp === 0 || !!S.bossWins[b.key], left = Math.ceil((b.end - Date.now()) / 864e5), pct = down ? 0 : (b.hp / b.maxHp) * 100;   // a win is permanent
  el.className = `boss${down ? ' down' : ''}`; el.style.setProperty('--boss', b.boss.color);
  el.innerHTML = `<img src="${b.boss.art}" alt="">
    <div><span class="label">Weekly boss · ${down ? 'new boss Monday' : left <= 1 ? 'last day!' : `${left} days left`}</span>
    <div class="bossname">${b.boss.name}</div>
    <div class="hp ${pct < 25 && !down ? 'low' : ''}"><i style="width:${pct.toFixed(1)}%"></i><span>${down ? 'DEFEATED' : `${b.hp} / ${b.maxHp} HP`}</span></div>
    <div class="taunt">${down ? `You beat it. +${BOSS_COINS} coins` : `“${b.boss.taunt}”`}</div></div>`;
  el.setAttribute('aria-label', `Weekly boss ${b.boss.name}: ${down ? 'defeated' : `${b.hp} of ${b.maxHp} HP left`}`);
}
function showHit(amount, crit) {
  const el = $('boss'); if (el.classList.contains('empty')) return;
  el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
  setTimeout(() => el.classList.remove('hit'), 400);
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const t = document.createElement('span'); t.className = `dmg${crit ? ' crit' : ''}`; t.textContent = crit ? `CRIT -${amount}` : `-${amount}`;
    el.appendChild(t); t.addEventListener('animationend', () => t.remove()); setTimeout(() => t.remove(), 1300);
  }
  crit ? Sound.crit() : Sound.hit();
}
// records a KO for the week containing d (a workout started last Sunday can still finish last week's boss)
function winBoss(d = new Date()) {
  const b = bossState(d);
  if (!b.maxHp || b.hp !== 0 || S.bossWins[b.key]) return null;
  S.bossWins[b.key] = { boss: b.idx, at: Date.now() }; save();
  return b;
}
const bossMoment = b => celebrate({ hd: 'Boss defeated!', from: `+${BOSS_COINS} coins`, img: b.boss.art, name: b.boss.name, color: b.boss.color, sound: 'bossDown' });
function checkBoss() { const b = winBoss(); if (b) bossMoment(b); }
$('boss').onclick = () => {
  const b = bossState(); if (!b.maxHp) return;
  const wins = Object.keys(S.bossWins).length;
  openSheet(`<h2>${b.boss.name}</h2>
    <div style="display:grid;grid-template-columns:120px 1fr;gap:14px;align-items:center">
      <img src="${b.boss.art}" alt="" style="width:120px;height:120px;filter:drop-shadow(0 0 16px ${b.boss.color})">
      <div><div class="label">This week</div>
        <p style="margin-top:8px;line-height:1.5">${b.hits} hits · ${b.crits} crits · ${b.dmg} damage · ${b.wo} workout days<br>${b.hp ? `${b.hp} HP left` : 'Defeated'} · reward ${BOSS_COINS} coins</p></div>
    </div>
    <p style="margin:14px 0 6px;color:var(--dim);line-height:1.5">Every quest you finish hits the boss for 100. Some hits are crits for 200. Finish about 4 out of 5 of this week's quests to beat it before Sunday night. A new boss shows up every Monday. A finished workout adds a 50 bonus hit, once a day.</p>
    <p style="color:var(--dim)">Bosses beaten: <b style="color:var(--chalk)">${wins}</b></p>
    <button class="go" id="bossOk">Back to the fight</button>`, el => { el.querySelector('#bossOk').onclick = closeSheet; });
};
$('boss').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('boss').click(); } };

// combos: quests checked within 10 seconds of each other
let comboN = 0, comboAt = 0;
function combo() {
  const now = Date.now(); comboN = now - comboAt < 10000 ? comboN + 1 : 1; comboAt = now;
  if (comboN < 2) return;
  Sound.combo(comboN);
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const c = document.createElement('div'); c.className = 'combo'; c.textContent = `COMBO x${comboN}!`;
    document.body.appendChild(c); c.addEventListener('animationend', () => c.remove()); setTimeout(() => c.remove(), 1200);
  }
  if (comboN >= 3) unlock('combo3');
  if (comboN >= 5) unlock('combo5');
}

// trophies
const catCount = cat => S.habits.filter(h => h.cat === cat).reduce((a, h) => a + Object.keys(h.log).length, 0);
const logTimes = () => S.habits.flatMap(h => Object.values(h.log)).filter(v => typeof v === 'number');
function clearDays() {
  const days = new Set(); for (const h of S.habits) for (const k of Object.keys(h.log)) days.add(k);
  let n = 0;
  for (const k of days) { const d = new Date(k + 'T00:00:00'), list = S.habits.filter(h => due(h, d)); if (list.length && list.every(h => h.log[k])) n++; }
  return n;
}
const quitDays = () => Math.max(S.quit.best || 0, Date.now() - S.quit.since) / 864e5;
const peak = () => (S.peakIdx == null ? -1 : S.peakIdx);
const ACH = [
  { id: 'first', name: 'First Blood', desc: 'Finish your first quest', coins: 25, test: () => checkins() >= 1 },
  { id: 'clear', name: 'Clean Sweep', desc: 'Clear every quest in a day', coins: 50, test: () => clearDays() >= 1 },
  { id: 'combo3', name: 'Combo Starter', desc: 'Hit a 3x combo', coins: 30 },
  { id: 'combo5', name: 'Combo King', desc: 'Hit a 5x combo', coins: 75 },
  { id: 'streak3', name: 'Warming Up', desc: '3 perfect days in a row', coins: 50, test: () => dayStreak() >= 3 },
  { id: 'streak7', name: 'On Fire', desc: '7 perfect days in a row', coins: 150, test: () => dayStreak() >= 7 },
  { id: 'streak30', name: 'Unstoppable', desc: '30 perfect days in a row', coins: 600, test: () => dayStreak() >= 30 },
  { id: 'grind50', name: 'Grinder', desc: '50 quests done', coins: 100, test: () => checkins() >= 50 },
  { id: 'grind250', name: 'Machine', desc: '250 quests done', coins: 300, test: () => checkins() >= 250 },
  { id: 'gym10', name: 'Gym Rat', desc: '10 Gym quests', coins: 100, test: () => catCount('Gym') >= 10 },
  { id: 'wo1', name: 'Day One', desc: 'Finish your first workout', coins: 50, test: () => woLedger().ok >= 1 },
  { id: 'wo10', name: 'Regular', desc: 'Finish 10 workouts', coins: 150, test: () => woLedger().ok >= 10 },
  { id: 'wo50', name: 'Gym Legend', desc: 'Finish 50 workouts', coins: 500, test: () => woLedger().ok >= 50 },
  { id: 'wo3wk', name: 'Hat Trick', desc: 'Work out on 3 days in one week', coins: 100, test: () => woLedger().maxWeek >= 3 },
  { id: 'pb', name: 'New Best', desc: 'Beat a personal best', coins: 50, test: () => woLedger().prs >= 1 },
  { id: 'plank60', name: 'Plank Boss', desc: 'Hold a plank for 60 seconds', coins: 75, test: () => woLedger().plank60 },
  { id: 'muscleup', name: 'Muscle Up', desc: 'Level up a muscle with workouts', coins: 75, test: () => MUSCLES.some(m => muscleLevel(m) > Math.min(6, S.muscles[m] || 0)) },
  { id: 'mind10', name: 'Big Brain', desc: '10 Mind quests', coins: 100, test: () => catCount('Mind') >= 10 },
  { id: 'health25', name: 'Health Nut', desc: '25 Health quests', coins: 100, test: () => catCount('Health') >= 25 },
  { id: 'early', name: 'Early Bird', desc: 'Finish a quest before 8am', coins: 50, test: () => logTimes().some(t => new Date(t).getHours() < 8) },
  { id: 'owl', name: 'Night Owl', desc: 'Finish a quest after 10pm', coins: 50, test: () => logTimes().some(t => new Date(t).getHours() >= 22) },
  { id: 'boss1', name: 'Boss Slayer', desc: 'Beat a weekly boss', coins: 150, test: () => Object.keys(S.bossWins).length >= 1 },
  { id: 'boss4', name: 'Raid Leader', desc: 'Beat 4 bosses', coins: 400, test: () => Object.keys(S.bossWins).length >= 4 },
  { id: 'gold', name: 'Golden', desc: 'Reach Gold rank', coins: 150, test: () => peak() >= 9 },
  { id: 'diamond', name: 'Diamond Hands', desc: 'Reach Diamond rank', coins: 300, test: () => peak() >= 15 },
  { id: 'champ', name: 'Champion', desc: 'Reach Champion rank', coins: 1000, test: () => peak() >= 21 },
  { id: 'quit7', name: 'Clean Week', desc: '7 days quit-free', coins: 100, test: () => quitDays() >= 7 },
  { id: 'quit30', name: 'Iron Will', desc: '30 days quit-free', coins: 300, test: () => quitDays() >= 30 },
  { id: 'shredded', name: 'Shredded', desc: 'Get a muscle to Elite', coins: 100, test: () => MUSCLES.some(m => muscleLevel(m) >= 5) },
  { id: 'goal', name: 'Goal Getter', desc: 'Finish a goal', coins: 100, test: () => S.goals.some(g => g.pct >= 100) },
  { id: 'drip', name: 'Drip', desc: 'Buy something in the Locker', coins: 50, test: () => S.owned.skins.length > 1 || S.owned.titles.length > 1 },
  // android: only shown where they can be earned (the Android app), or once earned
  { id: 'scr1', name: 'Unplugged', desc: 'Finish a day under your screen limit', coins: 50, android: true, test: () => scrLedger().under >= 1 },
  { id: 'scr7', name: 'Touch Grass', desc: '7 days in a row under your screen limit', coins: 150, android: true, test: () => scrLedger().best >= 7 },
  // Daily: fits and wellness check-ins
  { id: 'fit1', name: 'Fit Check', desc: 'Log your first fit', coins: 25, test: () => dlyLedger().n.fit >= 1 },
  { id: 'fit7', name: 'Drip Streak', desc: 'Log a fit 7 days in a row', coins: 150, test: () => dlyLedger().fitBest >= 7 },
  { id: 'fit30', name: 'Lookbook', desc: 'Log 30 fits', coins: 300, test: () => dlyLedger().n.fit >= 30 },
  { id: 'poll1', name: 'Crowd Pick', desc: 'Ask friends to vote on a fit', coins: 30, only: () => fitBridge(), test: () => S.polls.length >= 1 },
  { id: 'water7', name: 'Hydrated', desc: 'Hit your water goal on 7 days', coins: 75, test: () => dlyLedger().n.water >= 7 },
  { id: 'sleep7', name: 'Well Rested', desc: 'Log your sleep on 7 days', coins: 75, test: () => dlyLedger().n.sleep >= 7 },
  { id: 'mood7', name: 'Vibe Check', desc: 'Check in your mood on 7 days', coins: 75, test: () => dlyLedger().n.mood >= 7 },
  { id: 'zen10', name: 'Zen Mode', desc: 'Finish 10 breathing minutes', coins: 75, test: () => dlyLedger().breaths >= 10 },
  { id: 'good7', name: 'Good Vibes', desc: 'Write down 7 good things', coins: 75, test: () => dlyLedger().n.journal >= 7 },
  { id: 'daily7', name: 'Self-Care Streak', desc: 'Daily check-in 7 days in a row', coins: 200, test: () => dlyLedger().comboBest >= 7 },
];
function unlock(id) {
  if (S.ach[id]) return;
  const a = ACH.find(x => x.id === id); if (!a) return;
  S.ach[id] = today(); save(); showToast(a); renderCoins();
}
function checkAchievements() { for (const a of ACH) if (!S.ach[a.id] && a.test && a.test()) unlock(a.id); }

// coins are earned from what you did (so un-ticking a quest takes its coins back) minus what you spent
const coins = () => checkins() * 10 + clearDays() * 50 + Object.keys(S.bossWins).length * BOSS_COINS
  + ACH.reduce((a, x) => a + (S.ach[x.id] ? x.coins : 0), 0) + woLedger().coins + scrLedger().coins + dlyLedger().coins + S.bank - S.spent;
let shownCoins = null;
function renderCoins() {
  const c = coins(); $('coinsN').textContent = c.toLocaleString();
  if (shownCoins !== null && c > shownCoins) { const el = $('coins'); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  shownCoins = c;
  if ($('v-locker').classList.contains('on')) $('walletN').textContent = c.toLocaleString();
}
$('coins').onclick = () => document.querySelector('.nav button[data-v=locker]').click();

// achievement toasts queue up
const toasts = []; let toastBusy = false;
function showToast(a) { toasts.push(a); if (!toastBusy) nextToast(); }
// icon: the workout notes pass the dumbbell, so they never look like the app-update notice; label names the sender
function showNote(title, sub, icon = null, label = null) { showToast({ note: true, name: title, desc: sub, icon, label }); }
function nextToast() {
  const a = toasts.shift(), el = $('toast');
  if (!a) { toastBusy = false; return; }
  toastBusy = true;
  el.innerHTML = a.note
    ? `<div class="medal">${a.icon || UP_ICON}</div><div><span class="label">${a.label || (a.icon ? 'Workout' : 'LEVEL UP')}</span><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></div>`
    : `<div class="medal">${TROPHY}</div><div><span class="label">Achievement unlocked</span><b>${esc(a.name)}</b><small>${esc(a.desc)} · +${a.coins} coins</small></div>`;
  el.classList.add('show');
  if (a.note) Sound.tap(); else { Sound.achieve(); buzz([10, 30, 10]); }
  setTimeout(() => { el.classList.remove('show'); setTimeout(nextToast, 420); }, 2800);
}

// locker: card skins and titles
const SKINS = [['default', 'Standard', 0], ['circuit', 'Circuit', 350], ['holo', 'Holo', 500], ['galaxy', 'Galaxy', 600], ['inferno', 'Inferno', 750]];
const TITLES = [['Rookie', 0], ['Grinder', 100], ['Beast Mode', 150], ['No Days Off', 200], ['Main Character', 250], ['Built Different', 300], ['Final Boss', 500]];
function renderLocker() {
  const c = coins();
  $('walletN').textContent = c.toLocaleString();
  $('skins').innerHTML = SKINS.map(([id, name, price]) => {
    const own = S.owned.skins.includes(id), eq = S.equip.skin === id;
    return `<button class="item${eq ? ' eq' : ''}${!own && c < price ? ' locked' : ''}" data-skin="${id}" data-price="${price}">
      <div class="pv${id === 'default' ? '' : ' skin-' + id}"></div><div class="nm">${name}</div>
      <span class="buy${eq ? ' on' : own ? ' own' : ''}">${eq ? 'Equipped' : own ? 'Tap to equip' : COIN_SM + price}</span></button>`;
  }).join('');
  $('titles').innerHTML = TITLES.map(([t, price]) => {
    const own = S.owned.titles.includes(t), eq = S.equip.title === t;
    return `<button class="${eq ? 'eq' : own ? 'own' : ''}" data-title="${t}" data-price="${price}">${t}${own ? '' : `<small>${COIN_SM}${price}</small>`}</button>`;
  }).join('');
  const shown = ACH.filter(a => ((!a.android || scrOn()) && (!a.only || a.only())) || S.ach[a.id]), got = shown.filter(a => S.ach[a.id]).length;
  $('trophyCount').textContent = `${got}/${shown.length}`;
  const earn = [['+10', 'per quest'], ['+50', 'clear your day'], ['50', 'max per workout'], ['+250', 'beat the boss'],
    ...(scrOn() || scrLedger().coins > 0 ? [['60', 'max a day under your screen limit']] : []), ['10+', 'per Daily check-in'], [`+${CHECKIN_PAY}`, `${CHECKIN_N} check-ins a day`], ['25+', 'per trophy']];
  $('walletHow').innerHTML = `<span class="label">How to earn</span>` + earn.map(([v, t]) => `<span><b>${v}</b>${t}</span>`).join('');
  $('trophies').innerHTML = shown.map(a => `<div class="trophy${S.ach[a.id] ? '' : ' locked'}"><div class="medal">${TROPHY}</div><b>${esc(a.name)}</b><small>${esc(a.desc)}<br>+${a.coins} coins</small></div>`).join('');
  $('skins').querySelectorAll('[data-skin]').forEach(b => b.onclick = () => shop('skins', 'skin', b.dataset.skin, +b.dataset.price, b));
  $('titles').querySelectorAll('[data-title]').forEach(b => b.onclick = () => shop('titles', 'title', b.dataset.title, +b.dataset.price, b));
}
function shop(list, slot, id, price, btn) {
  if (!S.owned[list].includes(id)) {
    if (coins() < price) { Sound.nope(); btn.classList.remove('hit'); void btn.offsetWidth; btn.style.animation = 'shake .35s'; setTimeout(() => (btn.style.animation = ''), 400); return; }
    if (!confirm(`Buy ${id === 'default' ? 'this' : `"${slot === 'skin' ? SKINS.find(x => x[0] === id)[1] : id}"`} for ${price} coins?`)) return;
    S.spent += price; S.owned[list].push(id); Sound.buy(); buzz([10, 40, 10]);
  } else Sound.tap();
  S.equip[slot] = id; save(); renderLocker(); renderCard(); afterChange();
}
// ---- updates (Android app only): the native side checks GitHub and calls these
const UP_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 3h2v9.2l3.3-3.3 1.4 1.4L12 16l-5.7-5.7 1.4-1.4 3.3 3.3zM4 18h16v2H4z"/></svg>';
window.levelupUpdate = name => {
  const u = $('update');
  $('checkUpdate').textContent = 'Check for updates';
  u.hidden = false; u.classList.remove('busy'); u.style.removeProperty('--p');
  u.innerHTML = `<span class="ic">${UP_ICON}</span><span><b>Update ready</b><small>${esc(name)} · tap to install</small></span>`;
  u.onclick = () => {
    if (u.classList.contains('busy') || !window.LevelUpAndroid) return;
    u.classList.add('busy'); u.querySelector('small').textContent = 'Downloading...';
    LevelUpAndroid.installUpdate();
  };
  if (!$('v-home').classList.contains('on')) showNote('Update ready', 'Go to Home and tap the banner to install');
};
window.levelupUpdateProgress = pct => {
  const u = $('update'); if (u.hidden) return;
  u.style.setProperty('--p', `${pct}%`);
  u.querySelector('small').textContent = pct >= 100 ? 'Opening the installer...' : `Downloading ${pct}%`;
  if (pct >= 100) setTimeout(() => { u.classList.remove('busy'); u.querySelector('small').textContent = 'Not installed yet? Tap to try again'; }, 4000);
};
window.levelupUpdateFailed = msg => {
  const u = $('update'); u.classList.remove('busy'); u.style.removeProperty('--p');
  if (!u.hidden) u.querySelector('small').textContent = `${msg} · tap to retry`;
};
window.levelupUpdateNone = (detail, title) => {
  $('checkUpdate').textContent = 'Check for updates';
  showNote(title || "You're up to date", detail || `Version ${window.LevelUpAndroid ? LevelUpAndroid.version() : ''}`);
};
if (window.LevelUpAndroid) {
  $('checkUpdate').hidden = false;
  $('checkUpdate').onclick = () => { $('checkUpdate').textContent = 'Checking...'; LevelUpAndroid.checkForUpdate(); Sound.tap(); };
  try { $('appVersion').textContent = `Version ${LevelUpAndroid.version()}.`; } catch (e) {}
  // first open after an update: say so, so an update never lands silently
  const WHATS_NEW = 'New: the Daily tab. Snap your fit, drink water, breathe';
  try {
    const v = LevelUpAndroid.version(), seen = localStorage.getItem('levelup.version');
    if (hadSave && seen !== v) showNote('Updated!', `${v.split(' ')[0]} · ${WHATS_NEW}`);
    localStorage.setItem('levelup.version', v);
  } catch (e) {}
}

/* ------------------------------------------------------------------ workouts */
// Guided, bodyweight-first workouts: one move per screen, steppers instead of a keyboard. Every timer is
// computed from stored timestamps (WebView timers stop in the background and the app can be killed), and
// every reward is derived from S.workouts, so deleting or re-importing a workout never double-counts.
const WO_MIN_SETS = 6, WO_MIN_MS = 6 * 60e3, WO_STALE = 6 * 3600e3, WO_HIT = 50, WO_GUARD = 700;
const XP_P = 10, XP_S = 5, XP_DAY = 60, XP_WEEK = 150, BASE_MAX = 3, REP_CEIL = 60;
const XP_LV = [0, 20, 150, 450, 1000, 2000, 3500];          // total XP needed for Untrained..Champion
const WT = { db: { kg: [2, 4], lb: [5, 10] }, mc: { kg: [5, 20], lb: [10, 40] } };   // [step, first-time default]
const WT_MAX = { kg: 150, lb: 330 };
// [id, name, primary, secondary, kind 'r' reps|'s' secs, default, kit ''|'chair'|'bag'|'gym', easy, extra, cue]
// extra: 'leg'|'side'|'arm' = count is per side ("each leg"); 'sides' = timer runs 2x and beeps "Switch sides!" halfway; 'db'|'mc' = weighted
const EX_LIST = [
  ['jacks', 'Jumping jacks', ['Calves'], ['Shoulders'], 's', 30, '', '', '', 'Light and bouncy. Land soft.'],
  ['squat', 'Squats', ['Quads'], ['Glutes', 'Adductors'], 'r', 12, '', '', '', "Feet shoulder-width. Sit back like there's a chair, chest up."],
  ['lunge', 'Reverse lunges', ['Quads'], ['Glutes', 'Hamstrings'], 'r', 8, '', 'squat', 'leg', 'Step back and lower till your back knee nearly touches the floor.'],
  ['sumo', 'Sumo squats', ['Adductors'], ['Quads', 'Glutes'], 'r', 12, '', '', '', 'Wide feet, toes out. Knees follow your toes.'],
  ['bridge', 'Glute bridges', ['Glutes'], ['Hamstrings', 'Lower back'], 'r', 12, '', '', '', 'Feet flat, push through your heels, squeeze at the top for a second.'],
  ['goodam', 'Good mornings', ['Hamstrings'], ['Glutes', 'Lower back'], 'r', 12, '', 'bridge', '', 'Hands on your head, soft knees. Push your hips back till you feel a stretch.'],
  ['calf', 'Calf raises', ['Calves'], [], 'r', 15, '', '', '', 'Up on your toes, pause, lower slowly. Hold a wall for balance.'],
  ['wallsit', 'Wall sit', ['Quads'], ['Glutes'], 's', 30, '', 'squat', '', 'Back flat on the wall, knees bent like a chair. Breathe.'],
  ['pushup', 'Push-ups', ['Chest'], ['Triceps', 'Shoulders'], 'r', 8, '', 'kneepush', '', 'Body straight like a plank. Lower till your chest is a fist off the floor, then push.'],
  ['kneepush', 'Knee push-ups', ['Chest'], ['Triceps', 'Shoulders'], 'r', 10, '', 'inclinepush', '', 'Knees down, hips in line with your back. Lower slowly.'],
  ['inclinepush', 'Incline push-ups', ['Chest'], ['Triceps', 'Shoulders'], 'r', 10, '', '', '', 'Hands on a sofa or bed edge. Body straight, chest to the edge.'],
  ['pike', 'Pike push-ups', ['Shoulders'], ['Triceps', 'Traps'], 'r', 6, '', 'taps', '', 'Hips high like an upside-down V. Lower your head toward the floor.'],
  ['taps', 'Plank shoulder taps', ['Shoulders'], ['Abs', 'Obliques'], 'r', 8, '', '', 'side', 'Push-up position, tap each shoulder. Keep your hips still.'],
  ['dips', 'Chair dips', ['Triceps'], ['Chest', 'Shoulders'], 'r', 8, 'chair', 'kneepush', '', 'Sturdy chair against a wall. Elbows point back, lower a little, push up.'],
  ['snow', 'Reverse snow angels', ['Upper back'], ['Traps', 'Shoulders'], 'r', 10, '', '', '', 'Face down. Sweep your arms from your hips to overhead without touching the floor.'],
  ['yraise', 'Floor Y raises', ['Traps'], ['Upper back', 'Shoulders'], 'r', 10, '', '', '', 'Face down, arms in a Y, thumbs up. Lift, hold a second, lower.'],
  ['superman', 'Supermans', ['Lower back'], ['Glutes', 'Upper back'], 'r', 10, '', 'birddog', '', 'Face down. Lift your arms and legs a little, squeeze, lower slowly.'],
  ['birddog', 'Bird dogs', ['Lower back'], ['Glutes', 'Abs'], 'r', 5, '', '', 'side', 'On hands and knees, reach out the opposite arm and leg. Keep your back still.'],
  ['bprow', 'Backpack rows', ['Upper back'], ['Biceps', 'Traps'], 'r', 10, 'bag', 'snow', '', 'A few books in a backpack. Hinge forward, back flat, pull it to your belly.'],
  ['towelcurl', 'Towel curls', ['Biceps'], ['Forearms'], 'r', 10, '', '', '', 'Sit on a bed edge, towel under one foot, an end in each hand. Curl up while your foot pushes down.'],
  ['bpcurl', 'Backpack curls', ['Biceps'], ['Forearms'], 'r', 12, 'bag', 'towelcurl', '', 'Hold the straps, elbows at your sides. Curl up slow, lower slow.'],
  ['bphold', 'Backpack hold', ['Forearms'], ['Traps'], 's', 20, 'bag', '', 'sides', 'Grip the handle at your side and stand tall. Switch hands at the beep.'],
  ['plank', 'Plank', ['Abs'], ['Obliques', 'Shoulders'], 's', 30, '', 'deadbug', '', "Elbows under shoulders, body in one straight line. Don't let your hips sag."],
  ['sideplank', 'Side plank', ['Obliques'], ['Abs', 'Shoulders'], 's', 20, '', '', 'sides', 'Stack your feet and lift your hips. Switch sides at the beep.'],
  ['deadbug', 'Dead bugs', ['Abs'], ['Obliques'], 'r', 10, '', '', '', 'Lower back pressed to the floor. Reach the opposite arm and leg out slowly.'],
  ['bicycle', 'Bicycle crunches', ['Obliques'], ['Abs'], 'r', 16, '', 'deadbug', '', "Elbow to opposite knee, slowly. Don't pull on your neck."],
  ['climbers', 'Mountain climbers', ['Abs'], ['Shoulders', 'Quads'], 's', 30, '', '', '', 'Push-up position, drive your knees in. Steady pace.'],
  ['gsquat', 'Goblet squat', ['Quads'], ['Glutes', 'Adductors'], 'r', 10, 'gym', 'squat', 'db', 'Hold one dumbbell at your chest. Light weight, perfect form.'],
  ['dbbench', 'Dumbbell bench press', ['Chest'], ['Triceps', 'Shoulders'], 'r', 10, 'gym', '', 'db', 'Feet flat, press up over your chest, lower slowly.'],
  ['pulldown', 'Lat pulldown', ['Upper back'], ['Biceps'], 'r', 10, 'gym', '', 'mc', 'Pull the bar to your upper chest, elbows down. Let it up slowly.'],
  ['dbrow', 'One-arm dumbbell row', ['Upper back'], ['Biceps', 'Traps'], 'r', 10, 'gym', '', 'db arm', 'Hand and knee on a bench, pull the dumbbell to your hip.'],
  ['dbpress', 'Dumbbell shoulder press', ['Shoulders'], ['Triceps'], 'r', 10, 'gym', '', 'db', "Sit tall and press overhead. Don't arch your back."],
  ['rdl', 'Dumbbell Romanian deadlift', ['Hamstrings'], ['Glutes', 'Lower back'], 'r', 10, 'gym', 'goodam', 'db', 'Soft knees, push your hips back, back flat. Go light.'],
  ['legpress', 'Leg press', ['Quads'], ['Glutes'], 'r', 12, 'gym', '', 'mc', "Feet flat. Don't lock your knees at the top."],
  ['dbcurl', 'Dumbbell curls', ['Biceps'], ['Forearms'], 'r', 12, 'gym', '', 'db', 'Elbows at your sides, no swinging.'],
  ['pushdown', 'Cable push-downs', ['Triceps'], [], 'r', 12, 'gym', '', 'mc', 'Elbows pinned to your sides. Push down, let it up slowly.'],
  ['shrug', 'Dumbbell shrugs', ['Traps'], ['Forearms'], 'r', 12, 'gym', '', 'db', 'Shoulders straight up to your ears, pause, lower.'],
  ['farmer', "Farmer's carry", ['Forearms'], ['Traps', 'Abs'], 's', 30, 'gym', '', '', 'Two heavy-ish dumbbells. Walk tall and slow.'],
  ['hang', 'Dead hang', ['Forearms'], ['Upper back'], 's', 20, 'gym', '', '', 'Hang from a bar with straight arms. Step down when your grip goes.'],
];
const EX = {};
for (const [id, n, m, s, k, d, kit, easy, extra, cue] of EX_LIST) {
  const f = extra.split(' ');
  EX[id] = { id, n, m, s, k, d, kit, easy, cue, each: f.find(t => t === 'leg' || t === 'side' || t === 'arm') || '', sides: f.includes('sides'), wt: f.find(t => t === 'db' || t === 'mc') || '' };
}
const legal = (x, kit) => kit === 'gym' || EX[x].kit !== 'gym';
const PLANS = {
  full:  { name: 'Full body',  kit: 'home', mode: 'rounds',   rest: 45, moves: ['squat', 'pushup', 'bridge', 'snow', 'plank', 'lunge'] },
  legs:  { name: 'Legs',       kit: 'home', mode: 'rounds',   rest: 45, moves: ['squat', 'lunge', 'bridge', 'sumo', 'goodam', 'calf', 'wallsit'] },
  upper: { name: 'Upper body', kit: 'home', mode: 'rounds',   rest: 45, moves: ['pushup', 'snow', 'pike', 'dips', 'yraise', 'bpcurl'] },
  core:  { name: 'Core',       kit: 'home', mode: 'rounds',   rest: 30, moves: ['plank', 'deadbug', 'bicycle', 'sideplank', 'birddog', 'climbers'] },
  gym:   { name: 'Gym day',    kit: 'gym',  mode: 'straight', rest: 75, moves: ['gsquat', 'dbbench', 'pulldown', 'dbpress', 'rdl', 'plank'] },
  gymup: { name: 'Gym upper',  kit: 'gym',  mode: 'straight', rest: 75, moves: ['dbbench', 'dbrow', 'dbpress', 'dbcurl', 'pushdown', 'shrug'] },
  gymlo: { name: 'Gym legs',   kit: 'gym',  mode: 'straight', rest: 75, moves: ['legpress', 'rdl', 'gsquat', 'calf', 'farmer', 'plank'] },
};
const ROTATION = { home: ['full', 'legs', 'upper', 'core'], gym: ['gym', 'gymup', 'gymlo'] };
const TIPS = ['Shake it out. Sip some water.', 'Slow breaths. In through your nose.', 'Good form beats more reps.', 'Stretch whatever feels tight.', 'Halfway there. Keep it steady.'];
const DB_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${CAT_STYLE.Gym[1]}" fill="currentColor"/></svg>`;
const PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 1.5v13L14 8z" fill="currentColor"/></svg>';
const CHEV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9l7 7 7-7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// small helpers
const cur = w => w.q.findIndex(e => !e.at && !e.skip);   // -1: every set is done
const stale = w => Date.now() - w.last > WO_STALE;
const fmtS = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
function fmtClock(ms) { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600); return h ? `${h}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : fmtS(s); }
const kgOf = (w, u) => (u === 'lb' ? w * 0.4536 : w);
const conv = (w, from, to) => (from === to ? w : to === 'lb' ? w * 2.2046 : w * 0.4536);
const snapW = (w, st, u) => Math.max(st, Math.min(WT_MAX[u], Math.round(w / st) * st));
const setScore = (e, v, wt, u) => (e.wt ? (v >= 8 ? kgOf(wt, u) : 0) : Math.min(v, e.k === 'r' ? REP_CEIL : 600));
// a weighted best must beat the old one by more than the rounding a KG/LB switch can add (half the coarser step),
// while one real step in either unit (2 kg, 5 lb; 5 kg, 10 lb) always counts
const WT_TOL = { db: 1.15, mc: 2.5 };
const beats = (e, score, best) => score > best + (e.wt ? WT_TOL[e.wt] : 0.01);
// loot: 6 sets and 6 minutes, or every prescribed set done without cutting rests short
const woOk = (w, done, end) => done.length >= WO_MIN_SETS && (end - w.started >= WO_MIN_MS || (!w.rushed && done.length === w.q.length));
const LOOT_RULE = 'Loot needs 6 sets and 6 minutes, or every set done with full rests.';
const unitWord = e => (e.each ? 'each ' + e.each : 'reps');
const amount = (x, v) => (EX[x].k === 's' ? fmtS(v) : `${v} ${unitWord(EX[x])}`);
const chips = e => e.m.map(m => `<span class="p">${m}</span>`).join('') + e.s.map(m => `<span>${m}</span>`).join('');
const woMins = w => Math.max(1, Math.round((w.end - w.start) / 6e4));
const lastWith = x => S.workouts.filter(w => w.sets.some(s => s[0] === x)).sort((a, b) => b.start - a.start)[0];
function kitText(p) {
  if (p.kit === 'gym') return 'dumbbells and machines';
  const c = p.moves.some(x => EX[x].kit === 'chair'), b = p.moves.some(x => EX[x].kit === 'bag');
  return c && b ? 'needs a chair and a backpack' : c ? 'needs a chair' : b ? 'needs a backpack' : 'no equipment';
}
function suggestPlan(kit) {
  const rot = ROTATION[kit], last = S.workouts.filter(w => rot.includes(w.plan)).sort((a, b) => b.start - a.start)[0];
  return last ? rot[(rot.indexOf(last.plan) + 1) % rot.length] : rot[0];
}
function focusPlan(m, kit) {
  const ok = Object.values(EX).filter(e => legal(e.id, kit)), hit = ok.filter(e => e.m.includes(m));
  const moves = (kit === 'gym' ? [...hit.filter(e => e.kit === 'gym'), ...hit.filter(e => e.kit !== 'gym')] : hit).slice(0, 3);
  for (const e of ok) if (moves.length < 2 && !moves.includes(e) && e.s.includes(m)) moves.push(e);
  return { name: m + ' focus', kit, mode: 'straight', rest: kit === 'gym' ? 75 : 45, moves: moves.map(e => e.id) };
}
// next target from the last time you did the move: all sets hit -> one more; well short -> meet you where you were
function targetFor(x) {
  const e = EX[x], h = lastWith(x); if (!h) return e.d;
  const s = h.sets.filter(r => r[0] === x), t = Math.max(...s.map(r => r[2])), avg = s.reduce((a, r) => a + r[1], 0) / s.length;
  if (s.every(r => r[1] >= r[2])) return Math.max(t, e.k === 'r' ? Math.min(e.each ? 12 : 20, t + 1) : Math.min(60, t + 5));
  if (avg <= t - 3) return e.k === 'r' ? Math.max(1, Math.round(avg)) : Math.max(5, Math.round(avg / 5) * 5);
  return t;
}
function weightFor(x, u = S.units) {   // never goes up by itself
  const [st, def] = WT[EX[x].wt][u], h = lastWith(x), s = h && h.sets.filter(r => r[0] === x && r[3] > 0).pop();
  return s ? snapW(conv(s[3], h.u, u), st, u) : def;
}
function estMin(moves, n, rest) {
  const work = moves.reduce((a, x) => { const e = EX[x], t = targetFor(x); return a + (e.k === 'r' ? t * 3.5 * (e.each ? 2 : 1) : t * (e.sides ? 2 : 1)); }, 0);
  return Math.round((60 + work * n + (moves.length * n - 1) * rest) / 60);
}

// the ledger: XP (capped per muscle per day and week), coins (best workout per day), PRs, all derived and memoized
let woRev = 0, woMemo = null;       // every mutation of S.workouts does woRev++ (erase/import replace the array, which also invalidates)
function woLedger() {
  if (woMemo && woMemo.src === S.workouts && woMemo.rev === woRev) return woMemo.v;
  const v = { xp: {}, day: {}, week: {}, coins: 0, ok: 0, okDays: new Set(), maxWeek: 0, best: {}, prs: 0, plank60: false, per: {} };
  const paid = Object.assign({}, S.woPaid), weeks = {};   // coins banked from deleted past-day workouts count as paid
  for (const w of S.workouts.slice().sort((a, b) => a.start - b.start)) {
    const per = v.per[w.id] = { xp: {}, capped: {}, prs: [], coins: 0 };
    if (!w.ok) continue;
    const wk = ymd(weekStart(new Date(w.day + 'T12:00:00')));
    v.ok++; v.okDays.add(w.day);
    (weeks[wk] = weeks[wk] || new Set()).add(w.day); v.maxWeek = Math.max(v.maxWeek, weeks[wk].size);
    const pay = 20 + 2 * Math.min(15, w.sets.length);                      // 32..50, best workout per day pays
    per.coins = Math.max(0, pay - (paid[w.day] || 0)); v.coins += per.coins; paid[w.day] = Math.max(pay, paid[w.day] || 0);
    const top = {};
    for (const [x, val, , wt] of w.sets) {
      const e = EX[x]; if (!e) continue;                                    // unknown move: no XP, no PR
      const give = (m, n) => {
        const dk = w.day + '|' + m, kk = wk + '|' + m;
        const g = Math.max(0, Math.min(n, XP_DAY - (v.day[dk] || 0), XP_WEEK - (v.week[kk] || 0)));
        if (g < n) per.capped[m] = true;
        v.day[dk] = (v.day[dk] || 0) + g; v.week[kk] = (v.week[kk] || 0) + g; v.xp[m] = (v.xp[m] || 0) + g; per.xp[m] = (per.xp[m] || 0) + g;
      };
      e.m.forEach(m => give(m, XP_P)); e.s.forEach(m => give(m, XP_S));
      const score = setScore(e, val, wt, w.u);
      if (score > (top[x] || 0)) top[x] = score;
      if (x === 'plank' && val >= 60) v.plank60 = true;
    }
    for (const x in top) {                                                  // max one PR per move per workout; first time = baseline
      const b = v.best[x];
      if (b !== undefined && beats(EX[x], top[x], b)) { per.prs.push({ x, now: top[x], was: b }); v.prs++; }
      if (b === undefined || top[x] > b) v.best[x] = top[x];
    }
  }
  woMemo = { src: S.workouts, rev: woRev, v };
  return v;
}
const lvFromXp = x => { let l = 0; while (l < 6 && x >= XP_LV[l + 1]) l++; return l; };
const muscleXp = m => XP_LV[Math.min(6, S.muscles[m] || 0)] + (woLedger().xp[m] || 0);   // starting level is banked XP
const muscleLevel = m => lvFromXp(muscleXp(m));
const xpPct = x => { const l = lvFromXp(x); return l < 6 ? (x - XP_LV[l]) / (XP_LV[l + 1] - XP_LV[l]) * 100 : 100; };

// keep the screen on while the workout is on screen: the Android bridge (newer APKs) or the Wake Lock API
let wakeLock = null;
function wake(on) {
  try { if (window.LevelUpAndroid && typeof LevelUpAndroid.keepAwake === 'function') LevelUpAndroid.keepAwake(!!on); } catch (e) {}
  try { if (on && !wakeLock && navigator.wakeLock) navigator.wakeLock.request('screen').then(l => { wakeLock = l; l.addEventListener('release', () => { wakeLock = null; }); }).catch(() => {});
        else if (!on && wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; } } catch (e) {}
}
// the screen stays on only while the workout is on screen and something is happening: a rest or a timer
// running, or a tap in the last 10 minutes. Idle or STILL GOING? lets the phone sleep. Sent only on a change.
let woAwake = false;
function keepOn(want) { want = !!want; if (want !== woAwake) { woAwake = want; wake(want); } }
const wantAwake = (w, now = Date.now()) => !!w && !$('wo').hidden && !$('wo').classList.contains('res') && !stale(w) && (w.phase === 'rest' || !!w.run || now - w.last < 10 * 60e3);
const say = t => { $('woSay').textContent = t; };
let floatT = 0;
function floater(text) {   // same big floating text as a combo; back-to-back ones wait their turn
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const wait = Math.max(0, floatT - Date.now()); floatT = Date.now() + wait + 950;
  setTimeout(() => {
    const c = document.createElement('div'); c.className = 'combo fl'; c.textContent = text;
    document.body.appendChild(c); c.addEventListener('animationend', () => c.remove()); setTimeout(() => c.remove(), 1200);
  }, wait);
}

/* entry points: the slab on Home and Body, the LIVE pill, the start sheet */
// what is changing goes first, so a narrow slab cuts the plan name (also on the overlay), not the countdown
function liveText(w, now = Date.now()) {
  const i = cur(w), st = w.phase === 'warm' ? 'Warm-up' : w.phase === 'rest' ? `Rest ${fmtS(Math.max(0, Math.ceil((w.restEnd - now) / 1000)))}` : `Set ${i + 1} of ${w.q.length}`;
  return `${fmtClock(now - w.started)} · ${st} · ${w.name}`;
}
function renderTrain() {
  const w = S.workout, k = today(), d = new Date(), gym = S.habits.some(h => h.cat === 'Gym' && due(h, d) && !h.log[k]);
  for (const id of ['train', 'trainBody']) {
    let cls = 'train', aria = 'Start workout', sm;
    if (w) { cls += ' live'; aria = 'Resume workout'; sm = liveText(w); }
    else if (gym) { const p = PLANS[suggestPlan(S.kit)]; cls += ' due'; aria = "Start workout. Clears today's Gym quest."; sm = `${p.name} · ${estMin(p.moves, 2, p.rest)} min`; }
    else if (S.workouts.some(x => x.ok && x.day === k)) sm = 'Trained today · nice work';
    else sm = id === 'train' ? 'No gym needed · 7–20 min' : 'Or tap a muscle below';
    const el = $(id); el.className = cls; el.setAttribute('aria-label', aria);
    el.innerHTML = `<span class="ic">${DB_ICON}</span><span class="tx"><b>${w ? 'Resume workout' : 'Start workout'}</b><small>${esc(sm)}</small></span><span class="play">${PLAY}</span>`;
  }
  paintPill();
}
['train', 'trainBody'].forEach(id => { $(id).onclick = () => { Sound.tap(); S.workout ? openWorkout() : pickSheet(); }; });
function paintPill(now = Date.now()) {
  const w = S.workout, el = $('woPill'), show = !!w && $('wo').hidden;
  el.hidden = !show; document.body.classList.toggle('pill', show);
  if (!show) return;
  if (!el.firstChild) el.innerHTML = '<i></i><span></span>';
  el.lastChild.textContent = `LIVE ${fmtClock(now - w.started)}${w.phase === 'rest' && !stale(w) ? ` · REST ${fmtS(Math.max(0, Math.ceil((w.restEnd - now) / 1000)))}` : ''}`;
  // a RESUME slab under the pill already says the same thing: step aside (visibility only, so nothing reflows)
  const r = el.getBoundingClientRect();
  el.classList.toggle('away', ['train', 'trainBody'].some(id => { const b = $(id).getBoundingClientRect(); return b.height > 0 && b.bottom > r.top && b.top < r.bottom; }));
}
$('woPill').onclick = () => openWorkout();

function pickSheet() {
  let n = 2;
  const draw = () => {
    const kit = S.kit, id = suggestPlan(kit), p = PLANS[id], mus = [...new Set(p.moves.flatMap(x => EX[x].m))];
    const note = !S.workouts.length ? 'New here? If a move is too hard, tap Swap or do fewer reps.' : S.workouts.some(w => w.ok && w.day === today()) ? 'Already trained today: only a bigger workout earns more coins. Fresh muscles still get XP.' : '';
    return `<h2>Start workout</h2>
      <div class="seg" role="group" aria-label="Where are you training?">${[['home', 'At home'], ['gym', 'At a gym']].map(([k, t]) => `<button data-kit="${k}" class="${k === kit ? 'on' : ''}" aria-pressed="${k === kit}">${t}</button>`).join('')}</div>
      <div class="pick"><span class="label">Today's pick</span><div class="nm">${p.name}</div><div class="d">${p.moves.length} moves · about ${estMin(p.moves, n, p.rest)} min · ${kitText(p)}</div>
        <div class="wo-mus">${mus.map(m => `<span class="p">${m}</span>`).join('')}</div>
        <div class="rounds"><span class="label">${p.mode === 'rounds' ? 'Rounds' : 'Sets each'}</span>${[1, 2, 3].map(k => `<button data-n="${k}" class="${k === n ? 'on' : ''}" aria-pressed="${k === n}">${k}</button>`).join('')}</div>
        ${note ? `<p class="pick-note">${note}</p>` : ''}</div>
      <button class="go gold" id="pGo">Let's go</button>
      <div class="alts"><span class="label">Or pick one</span>${ROTATION[kit].filter(k => k !== id).map(k => { const a = PLANS[k], t = kitText(a); return `<button data-plan="${k}"><span><b>${a.name}</b><small>${t[0].toUpperCase() + t.slice(1)}</small></span><em>${estMin(a.moves, n, a.rest)} min</em></button>`; }).join('')}</div>
      <p class="pick-foot">Sharp pain? Stop. Feeling sore the next day is normal.${kit === 'gym' ? '<br>New to the gym? Ask a coach or an adult to show you the moves first.' : ''}</p>`;
  };
  const bind = el => {
    const redraw = sel => { el.innerHTML = draw().replace('<h2>', '<h2 id="sheetTitle">'); bind(el); el.querySelector(sel).focus({ preventScroll: true }); Sound.tap(); };
    el.querySelectorAll('[data-kit]').forEach(b => b.onclick = () => { S.kit = b.dataset.kit; save(); redraw(`[data-kit="${S.kit}"]`); });
    el.querySelectorAll('[data-n]').forEach(b => b.onclick = () => { n = +b.dataset.n; redraw(`[data-n="${n}"]`); });
    el.querySelector('#pGo').onclick = () => startWorkout(suggestPlan(S.kit), n);
    el.querySelectorAll('[data-plan]').forEach(b => b.onclick = () => startWorkout(b.dataset.plan, n));
  };
  openSheet(draw(), el => { bind(el); setTimeout(() => { const g = el.querySelector('#pGo'); if (g) g.focus({ preventScroll: true }); }, 60); });
}

/* engine: state transitions only; the ticker just paints and catches up from timestamps */
let woDraft = null, woTimer = null, woRes = null, woBeeps = new Set();
function startWorkout(id, n = 2, focus = null, hid = null) {
  if (S.workout) { openWorkout(); return; }
  const p = id === 'focus' ? focusPlan(focus, S.kit) : PLANS[id], now = Date.now(), q = [];
  const add = (x, s) => q.push({ x, s, t: targetFor(x), v: 0, w: 0, at: 0, skip: 0 });
  if (p.mode === 'rounds') for (let r = 0; r < n; r++) p.moves.forEach(add);
  else p.moves.forEach((x, s) => { for (let r = 0; r < n; r++) add(x, s); });
  S.workout = { id: uid(), plan: id, name: p.name, kit: p.kit, focus, hid, mode: p.mode, rounds: n, rest: p.rest, moves: p.moves.length, u: S.units,
    started: now, last: now, phase: 'warm', run: null, restEnd: 0, restLen: 0, shownAt: now, unlocked: false, hinted: false, q };
  woDraft = null; save(); startTick(); openWorkout(); Sound.go(); buzz(20); renderTrain(); renderHabits();
}
function openWorkout() {
  if (!S.workout) return;
  closeSheet(); $('wo').hidden = false; $('wo').classList.remove('res'); renderWorkout(); keepOn(wantAwake(S.workout)); renderTrain();
  const h = $('woIn').querySelector('.hide'), ua = navigator.userActivation;   // reopened at boot: no focus ring before a first tap
  if (h && (!ua || ua.hasBeenActive)) h.focus({ preventScroll: true });
}
function hideWorkout() {
  const w = S.workout; $('wo').hidden = true; keepOn(false); renderTrain();
  if (w && !w.hinted) { w.hinted = true; save(); showNote('Workout still running', 'Tap LIVE to jump back in', DB_ICON); }
}
function toSet(fresh) {
  const w = S.workout, was = w.phase, e = w.q[cur(w)];
  w.phase = 'set'; w.run = null; w.shownAt = Date.now();
  if (fresh && !document.hidden) { Sound.go(); buzz([40, 60, 40]); }
  if (fresh && $('wo').hidden && e) showNote(was === 'warm' ? 'Warm-up done' : 'Rest is over', 'Up next: ' + EX[e.x].n, DB_ICON);
  save(); renderWorkout();
  if (e) say(`${EX[e.x].n}, ${EX[e.x].k === 's' ? e.t + ' seconds' : e.t + ' ' + unitWord(EX[e.x])}`);
}
const endRest = fresh => toSet(fresh);
function draft(w, i) {   // the stepper values live in memory until DONE; they reset whenever the cursor moves
  if (!woDraft || woDraft.id !== w.id || woDraft.i !== i) {
    const e = w.q[i], prev = w.q.filter(q => q.at && q.x === e.x && q.w).pop();
    woDraft = { id: w.id, i, v: e.t, w: EX[e.x].wt ? (prev ? prev.w : weightFor(e.x, w.u)) : 0 };
  }
  return woDraft;
}
function logSet(v, at, auto = false) {
  const w = S.workout, i = cur(w); if (i < 0) return;
  const e = w.q[i], x = EX[e.x], quiet = auto && Date.now() - at > 3000;   // caught up after a long absence: no fanfare
  e.v = Math.max(1, Math.min(x.k === 'r' ? REP_CEIL : 600, Math.round(v))); e.w = x.wt ? draft(w, i).w : 0; e.at = at;
  // a set caught up from a timer never moves "last activity" back behind a newer tap (Keep going, say)
  w.last = auto ? Math.max(w.last, at) : Date.now(); w.run = null; woDraft = null;
  // the last set goes straight to the results screen, which shows the PRs and the loot itself
  if (cur(w) === -1) { finishWorkout(); return; }
  let loud = false;
  const prior = woLedger().best[e.x], score = setScore(x, e.v, e.w, w.u);
  if (prior > 0 && beats(x, score, prior) && !w.q.some((q, j) => j !== i && q.at && q.x === e.x && beats(x, setScore(x, q.v, q.w, w.u), prior))) { floater('NEW BEST!'); Sound.crit(); buzz([20, 40, 20]); loud = true; }
  if (!w.unlocked && woOk(w, w.q.filter(q => q.at), at)) { w.unlocked = true; floater('LOOT UNLOCKED'); if (!loud) Sound.clear(); loud = true; }
  w.phase = 'rest'; w.restLen = w.rest; w.restEnd = at + w.rest * 1000; w.shownAt = Date.now();
  save(); renderWorkout(); say(`Rest, ${w.rest} seconds`);
  if (!quiet && !loud) { Sound.check(); buzz(15); }
}
function skipSet() {
  const w = S.workout, i = cur(w); if (i < 0) return;
  w.q[i].skip = 1; w.last = Date.now(); w.run = null; woDraft = null;
  if (cur(w) >= 0) { toSet(false); return; }
  if (w.q.some(q => q.at)) finishWorkout(); else { discardWorkout(); showNote('Nothing to save', 'No sets were logged', DB_ICON); }
}
function swapTo(nx) {
  const w = S.workout, s = w.q[cur(w)].s;
  for (const q of w.q) if (q.s === s && !q.at && !q.skip) { q.x = nx; q.t = targetFor(nx); }
  w.run = null; w.last = w.shownAt = Date.now(); woDraft = null; save(); renderWorkout(); Sound.tap();   // a new screen: the tap guard restarts
}
function flipUnits() {
  const w = S.workout, to = w.u === 'kg' ? 'lb' : 'kg', cv = (x, v) => snapW(conv(v, w.u, to), WT[EX[x].wt][to][0], to);
  for (const e of w.q) if (e.w && EX[e.x].wt) e.w = cv(e.x, e.w);
  if (woDraft && woDraft.w) woDraft.w = cv(w.q[woDraft.i].x, woDraft.w);
  S.units = w.u = to; save(); renderWorkout(); Sound.tap();
}
function startTick() { if (!woTimer && S.workout) woTimer = setInterval(woTick, 250); }
function stopTick() { clearInterval(woTimer); woTimer = null; }
function woTick() {
  const w = S.workout; if (!w) { stopTick(); paintPill(); return; }
  if (cur(w) === -1) { w.q.some(q => q.at) ? finishWorkout() : discardWorkout(); return; }   // only a hand-edited save gets here
  if (!stale(w)) for (let n = 0; n < 4; n++) {                         // catch up on whatever ended while we were away
    const now = Date.now(), r = w.run;
    const move = (w.phase === 'warm' || w.phase === 'set') ? !!r && now >= r.end : w.phase === 'rest' && now >= w.restEnd;
    if (!move) break;
    // the screen is about to change under any sheet over the workout (End, Swap, Fix): close it so it can't act on old state
    if (!$('wo').hidden) closeSheet();
    if (w.phase === 'warm') toSet(now - r.end < 3000);
    else if (w.phase === 'set') logSet(w.q[cur(w)].t, r.end, true);
    else endRest(now - w.restEnd < 3000);
    if (S.workout !== w) return;
  }
  const now = Date.now();
  document.querySelectorAll('.train.live small').forEach(s => { s.textContent = liveText(w, now); });
  paintPill(now); woSounds(w, now); keepOn(wantAwake(w, now));
  if ($('wo').hidden) return;
  if (!!$('woIn').dataset.st !== stale(w)) { renderWorkout(); return; }
  const c = $('woClock'); if (c) c.textContent = fmtClock(now - w.started);
  paintRing(w, now);
}
function woSounds(w, now) {   // each beep is keyed by its timestamp, so it plays once and never for time spent away
  if (document.hidden || stale(w)) return;
  const r = w.run, once = (k, f) => { if (woBeeps.has(k)) return; if (woBeeps.size > 40) woBeeps.clear(); woBeeps.add(k); f(); };
  if (w.phase === 'set' && r) {
    const e = w.q[cur(w)], half = r.go + e.t * 1000;
    if (now < r.go) once(r.go + ':' + Math.ceil((r.go - now) / 1000), Sound.beep);
    else if (now - r.go < 1000) once(r.go + ':go', Sound.go);
    if (EX[e.x].sides && now >= half && now - half < 1500) once(r.go + ':sw', () => { Sound.beep(); buzz(60); });
  }
  if (w.phase === 'rest') { const s = Math.ceil((w.restEnd - now) / 1000); if (s >= 1 && s <= 3) once(w.restEnd + ':' + s, Sound.beep); }
}
// [count, sub, % of ring] for whatever ring is on screen
function ringState(w, now) {
  const r = w.run;
  if (w.phase === 'rest') { const l = Math.max(0, w.restEnd - now); return [fmtS(Math.ceil(l / 1000)), 'Set cleared', l / (w.restLen * 10)]; }
  if (w.phase === 'warm') { const l = r ? Math.max(0, r.end - now) : 60000; return [fmtS(Math.ceil(l / 1000)), r ? 'of 1:00' : 'Ready', l / 600]; }
  const e = w.q[cur(w)], x = e && EX[e.x]; if (!x || x.k !== 's') return null;
  if (!r) return [fmtS(e.t), 'Ready', 100];   // the Start button already says "a side"
  if (now < r.go) return [String(Math.ceil((r.go - now) / 1000)), 'Get ready', 100];
  const half = r.go + e.t * 1000, side = x.sides && now < half, l = Math.max(0, (side ? half : r.end) - now);
  return [fmtS(Math.ceil(l / 1000)), !x.sides ? 'of ' + fmtS(e.t) : side ? 'Left side' : now - half < 1500 ? 'Switch sides!' : 'Right side', l / (e.t * 10)];
}
function paintRing(w, now) {
  const c = $('woCount'), st = c && ringState(w, now); if (!st) return;
  c.textContent = st[0]; $('woSub').textContent = st[1];
  $('woIn').querySelectorAll('.ring .fil, .ring .halo').forEach(el => { el.style.strokeDasharray = `${Math.min(100, st[2]).toFixed(2)} 100`; el.style.opacity = st[2] < 0.5 ? 0 : ''; });
}
const ringHTML = cls => `<div class="ring${cls}"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="trk" cx="50" cy="50" r="45" pathLength="100"/><circle class="halo" cx="50" cy="50" r="45" pathLength="100"/><circle class="fil" cx="50" cy="50" r="45" pathLength="100"/></svg><output><span id="woCount"></span><small id="woSub"></small></output></div>`;

/* the overlay: rewritten only on state changes; taps are delegated so nothing is rebound */
function renderWorkout() {
  const w = S.workout, o = $('wo'); if (!w || o.hidden || o.classList.contains('res')) return;
  const now = Date.now(), i = cur(w), st = stale(w);
  const body = st ? stalePanel(w) : i < 0 ? '' : w.phase === 'warm' ? warmPanel(w) : w.phase === 'rest' ? restPanel(w, i) : setPanel(w, i);
  $('woIn').innerHTML = `<div class="wo-top"><button class="hide" data-a="hide" aria-label="Hide workout. It keeps running.">${CHEV}</button><div class="mid"><b>${esc(w.name)}</b><span id="woClock">${fmtClock(now - w.started)}</span></div><button class="act quiet" data-a="end">End</button></div>
    <div class="wo-bar" aria-hidden="true">${w.q.map((q, j) => `<i class="${q.at ? 'on' : q.skip ? 'skip' : j === i && w.phase === 'set' ? 'now' : ''}"></i>`).join('')}</div>${body}`;
  $('woIn').dataset.st = st ? '1' : '';
  const key = `${st}|${w.phase}|${i}|${!!w.run}`; if (o.dataset.k !== key) { o.dataset.k = key; o.scrollTop = 0; }
  paintRing(w, now);
}
function warmPanel(w) {
  return `<div class="wo-kick">Warm-up · 1 minute</div><h1 class="wo-name" id="woName">Get loose</h1>
    <p class="wo-cue">Jumping jacks, arm circles, march on the spot. Easy pace.</p>${S.workouts.length ? '' : '<p class="wo-cue">Sharp pain? Stop. Feeling sore the next day is normal.</p>'}
    ${ringHTML('')}<div class="wo-act">${w.run ? '<button class="ghost" data-a="warmdone">Done warming up</button>'
      : '<button class="go" data-a="warmgo">Start warm-up</button><div class="wo-row"><button class="act quiet" data-a="warmskip">Skip warm-up</button></div>'}</div>`;
}
function setPanel(w, i) {
  const e = w.q[i], x = EX[e.x], k = w.q.slice(0, i + 1).filter(q => q.s === e.s).length, h = lastWith(e.x), best = woLedger().best[e.x];
  const nx = w.q.find((q, j) => j > i && !q.at && !q.skip), ez = x.easy && legal(x.easy, w.kit), wv = v => snapW(v, WT[x.wt][w.u][0], w.u);
  const info = [];
  if (h) { const s = h.sets.filter(r => r[0] === e.x), r = s[Math.min(k, s.length) - 1]; info.push('Last time ' + (x.wt ? `${r[1]} × ${wv(conv(r[3], h.u, w.u))} ${w.u}` : x.k === 's' ? fmtS(r[1]) : r[1])); }
  else info.push('New move');
  if (best > 0) info.push('Best ' + (x.wt ? `${wv(conv(best, 'kg', w.u))} ${w.u}` : x.k === 's' ? fmtS(best) : best));
  info.push('Target ' + (x.k === 's' ? fmtS(e.t) : e.t));
  const next = nx ? `<div class="wo-next"><span class="label">Up next</span><div><b>${EX[nx.x].n}</b><small> · ${amount(nx.x, nx.t)}</small></div></div>` : '<div class="wo-next last"><span class="label">Up next</span><b>Last set!</b></div>';
  const head = `<div class="wo-kick">Move ${e.s + 1} of ${w.moves} · ${w.mode === 'rounds' ? 'Round' : 'Set'} ${k} of ${w.rounds}</div>
    <h1 class="wo-name" id="woName">${x.n}</h1><div class="wo-mus">${chips(x)}</div><p class="wo-cue">${esc(x.cue)}</p>
    <div class="wo-swap">${ez ? '<button class="act" data-a="easier">Too hard? Easier version</button>' : ''}<button class="act quiet" data-a="swap">Swap</button></div>`;
  if (x.k === 's') return `${head}${ringHTML('')}<p class="rest-tip">${info.join(' · ')}</p><div class="wo-act">${w.run ? '<button class="ghost" data-a="stop">Stop here</button>'
    : `<button class="go" data-a="tgo">Start · ${fmtS(e.t)}${x.sides ? ' a side' : ''}</button><div class="wo-row"><button class="act quiet" data-a="skip">Skip this set</button></div>`}${next}</div>`;
  const d = draft(w, i), fig = `<div class="wo-fig">${['front', 'back'].map(sd => bodySVG(sd, g => (x.m.includes(g) ? '#3ddc84' : x.s.includes(g) ? '#1f6b45' : '#2c2858'))).join('')}</div>`;
  return `${head}${fig}<div class="wo-act"><div class="wo-tgt"><span class="label">Reps you did</span><small>${info.join(' · ')}</small></div>
    <div class="step"><button data-a="minus" aria-label="One less">&minus;</button><output><span id="woV">${d.v}</span><small>${unitWord(x).toUpperCase()}</small></output><button data-a="plus" aria-label="One more">+</button></div>
    ${x.wt ? `<div class="step kg"><button data-a="wminus" aria-label="Lighter">&minus;</button><output><span id="woW">${d.w}</span><small><button class="unit" data-a="unit" aria-label="Weight in ${w.u === 'kg' ? 'kilograms. Switch to pounds' : 'pounds. Switch to kilograms'}">${w.u.toUpperCase()}</button></small></output><button data-a="wplus" aria-label="Heavier">+</button></div>
      <p class="wo-hint">${h ? 'Go up a step only when every set feels easy.' : 'Pick a weight you could lift 15 times with good form.'}</p>` : ''}
    <button class="go" id="woDone" data-a="done">Done · ${d.v} ${unitWord(x)}</button><div class="wo-row"><button class="act quiet" data-a="skip">Skip this set</button></div>${next}</div>`;
}
function restPanel(w, i) {
  const e = w.q[i], x = EX[e.x], last = w.q.filter(q => q.at).reduce((a, b) => (b.at > a.at ? b : a));
  return `<div class="rest-hd">Rest</div><p class="rest-tip">${TIPS[w.q.indexOf(last) % TIPS.length]}</p>${ringHTML(' rest')}
    <div class="wo-row" style="justify-content:center"><button class="act quiet" data-a="fix">Logged ${amount(last.x, last.v)} · Fix</button></div>
    <div class="nextbig"><span class="label">Up next · move ${e.s + 1} of ${w.moves}</span><div class="nm">${x.n}</div><div class="wo-mus">${chips(x)}</div><p>${esc(x.cue)}</p></div>
    <div class="wo-act"><div class="pair"><button class="ghost" data-a="more" aria-label="15 more seconds">+15 sec</button><button class="go rest" data-a="skiprest">Skip rest</button></div></div>`;
}
function stalePanel(w) {
  const d = new Date(w.started), k = ymd(d), n = w.q.filter(q => q.at).length;
  const when = k === today() ? 'today' : k === ymd(addDays(new Date(), -1)) ? 'yesterday' : 'on ' + DAY_NAME[d.getDay()];
  return `<div class="wo-kick">Still going?</div><h1 class="wo-name">${esc(w.name)}</h1>
    <p class="wo-cue">You started ${esc(w.name)} ${when} at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}.${n ? ` You did ${n} ${n === 1 ? 'set' : 'sets'}.` : ''}</p>
    <div class="wo-act">${n ? '<button class="go" data-a="ssave">Save what I did</button>' : ''}<div class="wo-row"><button class="act" data-a="skeep">Keep going</button><button class="act danger" data-a="stoss">Throw it away</button></div></div>`;
}
$('woIn').onclick = ev => {
  const b = ev.target.closest('[data-a]'), a = b && b.dataset.a; if (!a) return;
  if (a === 'claim') { claimResults(); return; }
  const w = S.workout; if (!w) return;
  const now = Date.now(), i = cur(w), e = w.q[i], x = e && EX[e.x];
  if (a === 'hide') hideWorkout();
  else if (a === 'end') endSheet();
  else if (a === 'warmgo') { w.run = { go: now, end: now + 60000 }; w.last = now; save(); renderWorkout(); Sound.go(); }
  else if (a === 'warmskip' || a === 'warmdone') { w.last = now; toSet(false); }
  else if (a === 'minus' || a === 'plus') { const d = draft(w, i); w.last = now; d.v = Math.max(1, Math.min(REP_CEIL, d.v + (a === 'plus' ? 1 : -1))); $('woV').textContent = d.v; $('woDone').textContent = `Done · ${d.v} ${unitWord(x)}`; Sound.tap(); }
  else if (a === 'wminus' || a === 'wplus') { const d = draft(w, i), st = WT[x.wt][w.u][0]; w.last = now; d.w = Math.max(st, Math.min(WT_MAX[w.u], d.w + (a === 'wplus' ? st : -st))); $('woW').textContent = d.w; Sound.tap(); }
  else if (a === 'unit') flipUnits();
  // every action that moves to a new screen is ignored inside WO_GUARD of that screen appearing, so a double tap
  // can't land on whatever the new screen puts under the finger (Skip -> Skip, Easier -> Easier, Start -> Stop)
  else if (now - w.shownAt < WO_GUARD && ['done', 'skip', 'easier', 'stop', 'skiprest'].includes(a)) return;
  else if (a === 'done') logSet(draft(w, i).v, now);
  else if (a === 'skip') skipSet();
  else if (a === 'easier') swapTo(x.easy);
  else if (a === 'swap') swapSheet();
  else if (a === 'tgo') { w.run = { go: now + 3000, end: now + 3000 + e.t * 1000 * (x.sides ? 2 : 1) }; w.last = w.shownAt = now; save(); renderWorkout(); say('Get ready'); }
  else if (a === 'stop' && w.run) {
    const el = Math.floor((now - w.run.go) / 1000);
    if (now < w.run.go || el < 3) { w.run = null; save(); renderWorkout(); } else logSet(x.sides ? Math.min(e.t, Math.floor(el / 2)) : el, now);
  }
  else if (a === 'fix') fixSheet();
  else if (a === 'more') { const add = Math.min(15000, now + 300000 - w.restEnd); if (add > 0) { w.restEnd += add; w.restLen += add / 1000; } w.last = now; save(); paintRing(w, now); paintPill(now); Sound.tap(); }
  else if (a === 'skiprest') { if (w.restEnd - now > 10000) w.rushed = true; Sound.tap(); endRest(false); }   // a cut rest: loot then needs the 6 minutes
  else if (a === 'ssave') finishWorkout();
  else if (a === 'skeep') { w.last = now; save(); woTick(); renderWorkout(); }
  else if (a === 'stoss') { if (confirm('Throw away this workout? Nothing gets saved.')) discardWorkout(); }
};

/* sheets over the workout */
function endSheet() {
  const w = S.workout, done = w.q.filter(e => e.at), n = done.length, ok = woOk(w, done, Math.max(0, ...done.map(e => e.at)));
  openSheet(`<h2>End workout?</h2>${n ? `<p>You did ${n} of ${w.q.length} sets.</p>${ok ? '' : `<p class="dim">${LOOT_RULE}${n < 6 ? ` ${6 - n} more ${6 - n === 1 ? 'set' : 'sets'} to go.` : ''}</p>`}` : "<p>You haven't done a set yet.</p>"}
    ${n ? `<button class="go gold" id="eFin">${ok ? 'Finish and collect loot' : 'Save and finish'}</button>` : '<button class="go gold" data-keep>Keep going</button>'}
    <div class="row2">${n ? '<button class="act" data-keep>Keep going</button>' : '<span></span>'}<button class="act danger" id="eToss">Throw it away</button></div>`, el => {
    el.querySelectorAll('[data-keep]').forEach(b => b.onclick = closeSheet);
    const fin = el.querySelector('#eFin'); if (fin) fin.onclick = () => { closeSheet(); finishWorkout(); };
    el.querySelector('#eToss').onclick = () => { if (confirm('Throw away this workout? Nothing gets saved.')) { closeSheet(); discardWorkout(); } };
  });
}
function swapSheet() {
  const w = S.workout, i = cur(w), x = w.q[i].x, e = EX[x], easy = new Set();
  for (let k = e.easy; k && !easy.has(k); k = EX[k].easy) easy.add(k);
  let list = Object.values(EX).filter(c => c.id !== x && c.m[0] === e.m[0] && legal(c.id, w.kit));
  // nothing else hits it first (Backpack hold at home): offer no-equipment moves that still work it
  if (!list.length) list = Object.values(EX).filter(c => c.id !== x && !c.kit && (c.m.includes(e.m[0]) || c.s.includes(e.m[0])));
  openSheet(`<h2>Swap ${esc(e.n)}</h2>${list.length ? `<div class="alts" style="margin-top:0">${list.map(c => `<button data-x="${c.id}"><span><b>${c.n}</b><small>${esc(c.cue)}</small></span>${easy.has(c.id) ? '<i class="tag">EASIER</i>' : ''}</button>`).join('')}</div>` : '<p>No other moves for this muscle. No kit for it? Tap Skip this set.</p>'}`, el => {
    // the timer may have moved on to the next set under the sheet: then the pick no longer applies
    el.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { closeSheet(); if (S.workout === w && cur(w) === i && w.phase === 'set') swapTo(b.dataset.x); });
  });
}
function fixSheet() {
  const w = S.workout, done = w.q.filter(q => q.at); if (!done.length) return;
  const e = done.reduce((a, b) => (b.at > a.at ? b : a)), x = EX[e.x], k = w.q.slice(0, w.q.indexOf(e) + 1).filter(q => q.s === e.s).length, st = x.wt ? WT[x.wt][w.u][0] : 0;
  let v = e.v, wt = e.w;
  openSheet(`<h2>Fix last set</h2><p>${x.n} · set ${k}</p>
    <div class="step"><button data-f="-1" aria-label="Less">&minus;</button><output><span id="fV">${x.k === 's' ? fmtS(v) : v}</span><small>${x.k === 's' ? 'TIME' : unitWord(x).toUpperCase()}</small></output><button data-f="1" aria-label="More">+</button></div>
    ${x.wt ? `<div class="step kg"><button data-g="-1" aria-label="Lighter">&minus;</button><output><span id="fW">${wt}</span><small>${w.u.toUpperCase()}</small></output><button data-g="1" aria-label="Heavier">+</button></div>` : ''}
    <button class="go gold" id="fSave">Save</button><div class="row2"><span></span><button class="act" id="fUndo">Undo this set</button></div>`, el => {
    el.querySelectorAll('[data-f]').forEach(b => b.onclick = () => {
      v = x.k === 's' ? Math.max(5, Math.min(120, Math.round((v + 5 * b.dataset.f) / 5) * 5)) : Math.max(1, Math.min(REP_CEIL, v + +b.dataset.f));
      el.querySelector('#fV').textContent = x.k === 's' ? fmtS(v) : v; Sound.tap();
    });
    el.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { wt = Math.max(st, Math.min(WT_MAX[w.u], wt + st * b.dataset.g)); el.querySelector('#fW').textContent = wt; Sound.tap(); });
    el.querySelector('#fSave').onclick = () => { e.v = v; if (x.wt) e.w = wt; w.last = Date.now(); save(); closeSheet(); renderWorkout(); };
    el.querySelector('#fUndo').onclick = () => {
      Object.assign(e, { at: 0, v: 0, w: 0 }); Object.assign(w, { run: null, phase: 'set', restEnd: 0, shownAt: Date.now(), last: Date.now() });
      woDraft = null; save(); closeSheet(); renderWorkout(); Sound.uncheck();
    };
  });
}

/* finish: save the entry, tick the quest, then show what it earned. renderAll waits for Collect */
function finishWorkout() {
  const w = S.workout; if (!w) return;
  closeSheet();   // a sheet left open over the workout (End, Swap) must not act on a workout that is now saved
  const done = w.q.filter(e => e.at), end = done.length ? Math.max(...done.map(e => e.at)) : w.started, day = ymd(new Date(w.started));
  const ok = woOk(w, done, end), sd = new Date(w.started), b0 = bossState(sd), c0 = coins(), lv0 = {};
  MUSCLES.forEach(m => { lv0[m] = muscleLevel(m); });
  const entry = { id: w.id, plan: w.plan, name: w.name, day, start: w.started, end, ok, quest: null, u: w.u, sets: done.map(e => [e.x, e.v, e.t, e.w]) };
  let h = null;
  if (ok) {   // off-day workouts never tick a quest; the GO pill's quest goes first
    const d = new Date(day + 'T12:00:00'), can = x => x && x.cat === 'Gym' && due(x, d) && !x.log[day];
    h = [S.habits.find(x => x.id === w.hid)].find(can) || S.habits.find(can) || null;
    if (h) { h.log[day] = end; entry.quest = h.id; }
  }
  S.workouts.push(entry); woRev++; S.workout = null; woDraft = null; save(); stopTick(); keepOn(false); renderTrain();
  const b1 = bossState(sd);
  woRes = { entry, coins: coins() - c0, dealt: b0.hp - b1.hp, ko: b1.hp === 0 && b0.hp > 0, crit: !!(h && hitOf(h, day) > HIT), won: !!S.bossWins[b0.key], maxHp: b0.maxHp,
    ups: MUSCLES.filter(m => muscleLevel(m) > lv0[m]), lv0, per: woLedger().per[entry.id], wk: b0.key, boss: null };
  // a workout started last week can KO last week's boss, which checkBoss (this week only) never looks at:
  // record the win now, celebrate it on Collect
  if (b0.key !== bossState().key) woRes.boss = winBoss(sd);
  const o = $('wo'); o.hidden = false; o.classList.add('res'); renderResults(); o.scrollTop = 0;
  ok ? Sound.clear() : Sound.check(); say(ok ? 'Workout cleared' : 'Short session saved');
  setTimeout(() => { const g = $('woIn').querySelector('[data-a=claim]'); if (g) g.focus({ preventScroll: true }); }, 30);
}
function renderResults() {
  const r = woRes, e = r.entry, per = r.per, L = woLedger(), P = new Set(), Sx = new Set();
  for (const [x] of e.sets) if (EX[x]) { EX[x].m.forEach(m => P.add(m)); EX[x].s.forEach(m => Sx.add(m)); }
  const reps = e.sets.reduce((a, s) => a + (EX[s[0]] && EX[s[0]].k === 'r' ? s[1] * (EX[s[0]].each ? 2 : 1) : 0), 0);
  const fill = g => (r.ups.includes(g) ? '#ffd977' : P.has(g) ? '#3ddc84' : Sx.has(g) ? '#1f6b45' : '#2c2858');
  let loot = `<p class="res-tip">Saved to your log. ${LOOT_RULE}</p>`;
  if (e.ok) {
    const d = new Date(e.day + 'T12:00:00'), gyms = S.habits.filter(h => h.cat === 'Gym'), wk = ymd(weekStart(d));
    const q = e.quest ? `<div class="q"><b>${CHECK}</b><span class="label">Gym quest</span></div>`
      : gyms.some(h => due(h, d) && h.log[e.day]) ? `<div class="q dim"><b>${CHECK}</b><span class="label">Done earlier</span></div>`
      : gyms.length ? '<div class="q"><b>+</b><span class="label">Bonus workout</span></div>' : '<div class="q dim"><b>&mdash;</b><span class="label">No Gym quest</span></div>';
    const boss = r.maxHp && !r.won && r.dealt > 0 ? `<div class="h"><b>${r.ko ? 'KO!' : '-' + r.dealt}</b><span class="label">Boss HP</span></div>` : '';
    const rows = MUSCLES.filter(m => per.xp[m] || per.capped[m]).map(m => ({ m, g: per.xp[m] || 0, up: r.ups.includes(m) })).sort((a, b) => b.up - a.up || b.g - a.g);
    loot = `<div class="loot" style="--n:${boss ? 3 : 2}"><div class="c"><b>+${r.coins}</b><span class="label">Coins</span></div>${q}${boss}</div>
      ${gyms.length ? '' : '<p class="res-tip">Add a Gym quest on Home and workouts will tick it for you.</p>'}
      ${per.prs.slice(0, 2).map(p => { const x = EX[p.x], s = e.sets.find(s => s[0] === p.x && setScore(x, s[1], s[3], e.u) >= p.now - 0.01);
        return `<div class="pr"><b>New best</b><span>${x.n} · ${x.wt ? `${s[3]} ${e.u} for 8+ reps` : x.k === 's' ? `${fmtS(s[1])} hold` : `${s[1]} reps in one set`}</span></div>`; }).join('')}
      <div class="xp">${rows.slice(0, 5).map(({ m, g, up }) => {
        const x = muscleXp(m), l = lvFromXp(x), full = (L.week[wk + '|' + m] || 0) >= XP_WEEK;
        const t = up ? `${LEVELS[r.lv0[m]][0]} → ${LEVELS[l][0]}!` : l >= 6 ? `+${g} XP · Max level` : `+${g} XP · ${x} / ${XP_LV[l + 1]} to ${LEVELS[l + 1][0]}${full ? ' · maxed this week' : per.capped[m] ? ' · maxed for today' : ''}`;
        return `<div><b>${m}</b><small class="${up ? 'up' : ''}">${t}</small><i><u style="width:${xpPct(x).toFixed(0)}%"></u></i></div>`;
      }).join('')}${rows.length > 5 ? `<small>+${rows.length - 5} more ${rows.length === 6 ? 'muscle' : 'muscles'}</small>` : ''}</div>`;
  }
  $('woIn').innerHTML = `<div class="wo-top"><span></span><div class="mid"><b>${esc(e.name)}</b><span>${fmtClock(e.end - e.start)}</span></div><span></span></div>
    <div class="res-hd${e.ok ? '' : ' short'}">${e.ok ? 'Workout<br>cleared' : 'Short<br>session'}</div>
    <p class="res-sub">${esc(e.name)} · ${woMins(e)} min · ${e.sets.length} sets${reps ? ` · ${reps} reps` : ''}</p>
    <div class="res-figs">${['front', 'back'].map(s => bodySVG(s, fill)).join('')}</div>${loot}
    <div class="wo-act"><button class="go" data-a="claim">${e.ok ? 'Collect loot' : 'Done'}</button></div>`;
}
function figURI(list) {
  const back = list.every(m => ['Traps', 'Upper back', 'Lower back', 'Glutes', 'Hamstrings'].includes(m));
  return 'data:image/svg+xml,' + encodeURIComponent(bodySVG(back ? 'back' : 'front', g => (list.includes(g) ? '#ffd977' : '#2c2858')));
}
function claimResults() {
  const r = woRes; woRes = null; $('wo').hidden = true; $('wo').classList.remove('res');
  document.querySelector('.nav button[data-v=home]').click();
  if (r && r.ups.length) {   // muscle-up first; renderCard then queues any rank-up, afterChange any boss kill and trophies
    const one = r.ups.length === 1 && r.ups[0];
    celebrate({ hd: 'Muscle up!', from: one ? `${LEVELS[r.lv0[one]][0]} → ${LEVELS[muscleLevel(one)][0]}` : 'Levelled up from your workout', img: figURI(r.ups),
      name: one || (r.ups.length === 2 ? r.ups.join(' + ') : `${r.ups.length} muscles`), color: '#ffd977', sound: 'rankUp' });
  }
  renderBody(); renderAll();
  if (r && r.boss) bossMoment(r.boss);
  if (r && r.dealt > 0 && r.wk === bossState().key) showHit(r.dealt, r.crit);   // last week's boss isn't the one on Home
}
function discardWorkout() {
  if (!S.workout) return;   // already saved or gone: never hide a results screen
  S.workout = null; woDraft = null; save(); stopTick(); keepOn(false); $('wo').hidden = true; renderTrain(); renderHabits(); Sound.uncheck();
}
function woBoot() {   // an in-progress workout (or one inside an imported backup) reopens by itself
  const w = S.workout; if (!w) return;
  w.q = w.q.filter(e => EX[e.x]);
  if (!w.q.length) { S.workout = null; save(); renderTrain(); return; }
  startTick(); woTick(); openWorkout();
}

/* body tab: level sheet, training log */
function levelSheet(m) {
  const x = muscleXp(m), l = lvFromXp(x), base = S.muscles[m] || 0, wk = woLedger().week[ymd(weekStart()) + '|' + m] || 0;
  const cap = Math.max(base, S.muscleCap[m] || 0), fp = focusPlan(m, S.kit), kit = kitText(fp);   // cap: a level set before workouts stays pickable
  const opts = [...Array(BASE_MAX + 1).keys()].concat(cap > BASE_MAX ? [cap] : []);
  openSheet(`<h2>${m}</h2>
    <div class="lv-now"><i style="background:${LEVELS[l][1]}"></i>${LEVELS[l][0]}<small>${l < 6 ? `${x} / ${XP_LV[l + 1]} XP to ${LEVELS[l + 1][0]}` : 'Max level. Legend.'}</small></div>
    <div class="xp" style="margin:10px 0 8px"><div><i><u style="width:${xpPct(x).toFixed(0)}%"></u></i></div></div>
    <p class="dim">This week: ${wk} / ${XP_WEEK} XP${wk >= XP_WEEK ? ' · Maxed. Muscles grow on rest days.' : ''}</p>
    <button class="go gold" id="lTrain">${S.workout ? 'Resume workout' : `Train ${m}`}</button>
    ${S.workout ? '' : `<p class="dim lv-kit">${fp.moves.map(k => EX[k].n).join(' + ')} · about ${estMin(fp.moves, 3, fp.rest)} min · ${kit}</p>`}
    <span class="label">Starting level</span>
    <div class="levels">${opts.map(i => `<button data-l="${i}" class="${i === base ? 'cur' : ''}"><i style="background:${LEVELS[i][1]}"></i>${LEVELS[i][0]}</button>`).join('')}</div>
    <p class="dim">Trained before LEVEL UP? Set where you're starting. Advanced and up are earned in workouts.</p>`, el => {
    el.querySelector('#lTrain').onclick = () => { closeSheet(); S.workout ? openWorkout() : startWorkout('focus', 3, m); };
    el.querySelectorAll('[data-l]').forEach(b => b.onclick = () => { S.muscles[m] = +b.dataset.l; save(); closeSheet(); buzz(10); renderBody(); renderCard(); afterChange(); });
  });
}
let logAll = false;
function renderLog() {
  const list = S.workouts.slice().sort((a, b) => b.start - a.start), n = list.length;
  $('logCount').textContent = n || '';
  $('wlog').innerHTML = !n ? '<p class="empty">No workouts yet. Hit Start workout up top.</p>'
    : list.slice(0, logAll ? n : 10).map(w => `<div class="wlog" role="button" tabindex="0" data-w="${w.id}"><span class="grow"><b>${esc(w.name)}</b><small>${fmtDate(w.day)} · ${woMins(w)} min · ${w.sets.length} sets</small></span>${w.ok ? CHECK : '<span class="label">Short</span>'}</div>`).join('')
      + (n > 10 ? `<button class="act" id="logMore">${logAll ? 'Show fewer' : `Show all (${n})`}</button>` : '');
  $('wlog').querySelectorAll('[data-w]').forEach(r => { r.onclick = () => historySheet(r.dataset.w); r.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); r.click(); } }; });
  const more = $('logMore'); if (more) more.onclick = () => { logAll = !logAll; renderLog(); };
}
function historySheet(id) {
  const w = S.workouts.find(x => x.id === id); if (!w) return;
  const per = woLedger().per[id], by = new Map();
  for (const [x, v, , wt] of w.sets) by.set(x, [...(by.get(x) || []), EX[x] && EX[x].wt ? `${wt} ${w.u} × ${v}` : EX[x] && EX[x].k === 's' ? fmtS(v) : v]);
  openSheet(`<h2>${esc(w.name)}</h2>
    <p class="dim">${fmtDate(w.day)} · ${new Date(w.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · ${woMins(w)} min${w.quest ? ' · Ticked your Gym quest' : w.ok ? '' : ' · Short session, no loot'}</p>
    <div class="hist">${[...by].map(([x, l]) => `<p><b>${esc(EX[x] ? EX[x].n : x)}</b> ${l.join(' · ')}</p>`).join('')}</div>
    ${w.ok && per ? `<p class="dim">+${per.coins} coins · +${Object.values(per.xp).reduce((a, b) => a + b, 0)} XP</p>` : ''}
    <div class="row2"><span></span><button class="act danger" id="hDel">Delete workout</button></div>`, el => {
    el.querySelector('#hDel').onclick = () => {
      if (confirm(w.day === today() ? 'Delete this workout? Its coins, muscle XP and boss hit go too.' : 'Delete this workout? Its muscle XP goes too. Coins you earned stay yours.')) woDelete(id);
    };
  });
}
function woDelete(id) {   // the quest tick stays (untick it on Home); coins from past days stay yours
  const e = S.workouts.find(w => w.id === id); if (!e) return;
  const before = coins();
  // what that day has paid so far (best workout of the day, or a floor from an earlier delete)
  const level = Math.max(S.woPaid[e.day] || 0, ...S.workouts.filter(w => w.ok && w.day === e.day).map(w => 20 + 2 * Math.min(15, w.sets.length)));
  S.workouts = S.workouts.filter(w => w.id !== id); woRev++;
  if (e.day !== today()) {   // the day stays paid up to that level, so a later workout credited to it can't pay it twice
    S.woPaid[e.day] = level; woRev++;
    S.bank += Math.max(0, before - coins());
  }
  save(); closeSheet(); renderBody(); renderAll();
}

/* ------------------------------------------------------------------ screen time (Android app only) */
// Native measures usage (Usage access) and blocks (an accessibility service); JS owns the plan with its commitment
// rules and the rewards. Coins come only from S.screen.days: today is provisional, a past day is read once and frozen.
// Fail open: if the phone can't measure usage, nothing is blocked and the card says so.
const HOURGLASS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v2h-1.2v2.6c0 1.9-1 3.6-2.6 4.6l-1.3.8 1.3.8c1.6 1 2.6 2.7 2.6 4.6V20H18v2H6v-2h1.2v-2.6c0-1.9 1-3.6 2.6-4.6l1.3-.8-1.3-.8C8.2 10.2 7.2 8.5 7.2 6.6V4H6zm3.2 2v2.6c0 .5.1 1 .3 1.4h5c.2-.4.3-.9.3-1.4V4zm2.8 9.2l-1.2.8c-1 .6-1.6 1.7-1.6 2.9V18l2.8-1.6 2.8 1.6v-1.1c0-1.2-.6-2.3-1.6-2.9z" fill="currentColor"/></svg>';
const LOCK = '<svg class="lock" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7.5a5 5 0 0110 0V10h1a1 1 0 011 1v9a1 1 0 01-1 1H6a1 1 0 01-1-1v-9a1 1 0 011-1zm2 0h6V7.5a3 3 0 00-6 0z" fill="currentColor"/></svg>';
const CHEV_R = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const scrOn = () => !!(window.LevelUpAndroid && typeof LevelUpAndroid.screenTimeStatus === 'function');
const scrAt = k => { let e = null; for (const p of S.screen.plan) if (p.from <= k) e = p; return e; };
const scrNext = () => S.screen.plan.find(p => p.from > today()) || null;
const fmtMins = m => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ''}`);
const limName = l => ({ 0: 'no limit', 30: '30 min', 45: '45 min', 60: '1 hour', 90: '1½ hours', 120: '2 hours' })[l];
const sameApps = (a, b) => a.length === b.length && a.every(p => b.includes(p));
let scr = { st: null, now: null, apps: null, at: 0, tried: { usage: false, a11y: false } };   // live, never saved
function scrCall(name, arg) {   // never throws; JSON in, JSON out
  try { const r = arg === undefined ? LevelUpAndroid[name]() : LevelUpAndroid[name](JSON.stringify(arg)); return typeof r === 'string' && r ? JSON.parse(r) : r; }
  catch (e) { return null; }
}
// native works out each day's rule with the same "last from <= day" rule, so tomorrow's change starts at midnight by itself
function scrPush() {
  if (!scrOn()) return;
  // the whole plan (it is trimmed to ~8 days), so any clock setting finds the right rule
  try { LevelUpAndroid.setScreenTimeConfig(JSON.stringify({ v: 1, plan: S.screen.plan })); } catch (e) {}
}
// the commitment survives Erase all and Import: while the blocker is on, today's rule can only get stricter, and
// anything looser starts tomorrow (native enforces the same). P: a plan that is about to replace S.screen.plan
function scrKeep(P) {
  const t = today(), cur = scrAt(t);
  if (!scrOn() || !scrLim(cur) || !(scrCall('screenTimeStatus') || {}).blocker) return P;
  const at = k => { let e = null; for (const p of P) if (p.from <= k && (!e || p.from >= e.from)) e = p; return e; };
  const n = at(t), nl = n ? n.limit : 0, na = n ? n.apps : [];
  if (nl > 0 && nl <= cur.limit && cur.apps.every(p => na.includes(p))) return P;
  const fut = P.filter(p => p.from > t), nx = fut[fut.length - 1] || n || { limit: 0, apps: [] };
  return P.filter(p => p.from < t).concat({ from: t, limit: nl > 0 ? Math.min(nl, cur.limit) : cur.limit, apps: [...new Set([...cur.apps, ...na])] },
    { from: ymd(addDays(new Date(), 1)), limit: nx.limit, apps: [...nx.apps] });
}
// a day only limits something when it has a limit and at least one app (an empty list must never pay)
const scrLim = e => (e && e.apps.length ? e.limit : 0);
// a finished day pays when the picked apps stayed under the limit, and unpicked time-sinks would have too
const scrOk = d => !!d && d.f === 1 && d.l > 0 && d.u + (d.o || 0) <= d.l;

let scrRev = 0, scrMemo = null;   // scrRev++ on every write to S.screen.days
function scrLedger() {
  const k = today();
  if (scrMemo && scrMemo.d === S.screen.days && scrMemo.k === k && scrMemo.r === scrRev) return scrMemo.v;
  const ks = Object.keys(S.screen.days).sort(); let coins = 0, under = 0, best = 0, run = 0, prev = null;
  for (const k of ks) {
    const d = S.screen.days[k], ok = scrOk(d);
    if (ok) { coins += SCR_PAY(d.l); under++; run = prev === ymd(addDays(new Date(k + 'T12:00:00'), -1)) && run ? run + 1 : 1; best = Math.max(best, run); } else run = 0;
    prev = ok ? k : null;
  }
  let now = 0;
  for (let i = 1; i < 400; i++) { const d = S.screen.days[ymd(addDays(new Date(), -i))]; if (scrOk(d)) now++; else break; }
  scrMemo = { d: S.screen.days, k, r: scrRev, v: { coins, under, best, now } };
  return scrMemo.v;
}

// reads status, today and any past day not yet final. Returns false when it skipped (ran under 2s ago, unforced)
function scrRefresh(force) {
  if (!scrOn() || (!force && Date.now() - scr.at < 2000 && Date.now() >= scr.at)) return false;
  scr.at = Date.now();
  scr.st = scrCall('screenTimeStatus');
  if (!scr.st || !scr.st.usage) { scr.now = null; return true; }
  const t = today(), D = S.screen.days, e = scrAt(t); let changed = false;
  const now = scrCall('screenTimeToday', { apps: e ? e.apps : [] });
  scr.now = now && now.ok && now.day === t && typeof now.used === 'number' ? now : null;
  if (scr.now) {
    const rec = { u: Math.max(0, Math.round(now.used)), t: Math.max(0, Math.round(now.total || 0)), l: scrLim(e) }, o = Math.round(+now.other || 0);
    if (o >= 1) rec.o = o;
    if (!D[t] || D[t].u !== rec.u || D[t].t !== rec.t || D[t].l !== rec.l || (D[t].o || 0) !== (rec.o || 0) || D[t].f) { D[t] = rec; changed = true; }
  }
  const ask = [];
  for (let i = 1; i <= SCR_BACK; i++) {
    const k = ymd(addDays(new Date(), -i));
    if (!(D[k] && D[k].f === 1)) ask.push({ day: k, apps: (scrAt(k) || S.screen.plan[0] || { apps: [] }).apps });
  }
  const won = [];
  if (ask.length) {
    const r = scrCall('screenTimeDays', { days: ask });
    for (const q of ask) {
      const d = r && r.ok && r.days && r.days[q.day];
      if (!d || typeof d.used !== 'number' || (D[q.day] && D[q.day].f === 1)) continue;   // a final record is never rewritten
      const rec = { u: Math.max(0, Math.round(d.used)), t: Math.max(0, Math.round(d.total || 0)), l: scrLim(scrAt(q.day)), f: 1 }, o = Math.round(+d.other || 0);
      if (o >= 1) rec.o = o;
      D[q.day] = rec; changed = true;
      if (scrOk(rec)) won.push(q.day);
    }
  }
  won.sort();
  if (won.length === 1) {
    const d = D[won[0]], y = won[0] === ymd(addDays(new Date(), -1));
    showNote(`${y ? 'Yesterday' : fmtDate(won[0])}: ${d.u} of ${d.l} min`, `+${SCR_PAY(d.l)} coins for staying under`, HOURGLASS, 'Screen time');
  } else if (won.length > 1) showNote(`${won.length} days under your limit`, `+${won.reduce((a, k) => a + SCR_PAY(D[k].l), 0)} coins`, HOURGLASS, 'Screen time');   // days over: no note
  if (changed) { scrRev++; save(); }
  return true;
}
const scrUsed = () => (scr.now ? scr.now.used : S.screen.days[today()] ? S.screen.days[today()].u : 0);
const scrBlocker = () => !!(scr.st && scr.st.blocker);

/* Home card */
function notches(limit, left) {
  const n = limit / 5, lit = Math.min(n, Math.ceil(Math.max(0, left) / 5));
  return `<div class="notch${n > 12 ? ' many' : ''}" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<i class="${i < lit ? 'on' : ''}${i === lit - 1 ? ' last' : ''}"></i>`).join('')}</div>`;
}
function nxLine(cur, nx) {
  if (!cur || !nx) return '';
  const parts = [];
  if (nx.limit !== cur.limit) parts.push(nx.limit ? limName(nx.limit) : 'no limit');
  if (nx.limit && !sameApps(nx.apps, cur.apps)) parts.push(`${nx.apps.length} ${nx.apps.length === 1 ? 'app' : 'apps'}`);
  return parts.length ? `<div class="scr-ft nx"><span>From tomorrow: ${parts.join(', ')}</span></div>` : '';
}
let scrUnlT = 0;
function renderScreen() {
  const el = $('scr');
  clearTimeout(scrUnlT);
  delete el.dataset.retry;
  if (!scrOn() || !scr.st) { el.hidden = true; return; }   // a browser never shows it; on the phone, wait for the first read
  el.hidden = false;
  const t = today(), cur = scrAt(t), nx = scrNext(), st = scr.st, slab = (b, sm) => {
    el.className = 'scr setup';
    el.innerHTML = `<span class="ic">${HOURGLASS}</span><span class="tx"><b>${b}</b><small>${sm}</small></span>${CHEV_R}`;
  };
  if (!S.screen.plan.length) { slab('Screen time limit', '1 hour a day on games and videos'); el.setAttribute('aria-label', 'Set up a screen time limit'); return; }
  if (!st.usage) { slab('Screen time', "Can't see your screen time, so nothing gets locked. Tap to fix"); el.setAttribute('aria-label', "Screen time: can't see your screen time, so nothing gets locked. Set it up"); return; }
  // access is on but today can't be read: native fails open, so say nothing gets locked (never a stale countdown)
  if (!scr.now) { slab('Screen time', "Can't read today's screen time, so nothing gets locked. Tap to retry"); el.dataset.retry = '1'; el.setAttribute('aria-label', "Screen time: can't read today's screen time, so nothing gets locked. Retry"); return; }
  const used = scrUsed(), D = S.screen.days[t], total = scr.now ? scr.now.total : D ? D.t : 0;
  const top = of => `<div class="scr-top"><span class="label">Screen time</span><span class="of">${of}</span></div>`, ft = (h, coin) => `<div class="scr-ft">${coin ? COIN_SM : ''}<span>${h}</span></div>`;
  if (!cur || !cur.limit || !cur.apps.length) {   // tracking only
    const soon = !cur && nx && nx.limit > 0;
    el.className = 'scr';
    el.innerHTML = top(soon ? 'STARTS TOMORROW' : 'NO LIMIT') + `<div class="scr-hd"><b>${used}</b><span>min today</span></div>`
      + ft(soon ? `Your ${limName(nx.limit)} limit starts at midnight` : (cur || nx) && !(cur || nx).limit ? `Whole phone today: ${fmtMins(total)}` : 'No apps picked. Tap to pick some');
    el.setAttribute('aria-label', `Screen time: ${used} minutes today, ${soon ? `your ${limName(nx.limit)} limit starts at midnight` : 'no limit'}.`);
    return;
  }
  const L = cur.limit, left = L - used, pay = SCR_PAY(L), run = scrLedger().now;
  // unpicked games and videos count for coins (never for the lock): say so once they cost today's coins
  const oth = Math.round(+scr.now.other || 0), lost = used <= L && used + oth > L, lostFt = ft(`No coins today: ${fmtMins(oth)} on unpicked games and videos`);
  const flame = run >= 2 ? `<span class="streak" aria-label="Streak: ${run} days under your limit in a row">${FLAME}${run}</span>` : '';
  const streakSay = run >= 2 ? ` ${run} days under in a row.` : '';
  let cls = 'scr', hd, n = notches(L, left), f, aria;
  if (!st.blocker) {
    hd = used > L ? `<b>${used - L}</b><span>min over</span>${flame}` : `<b>${left}</b><span>min left</span>${flame}`;
    f = lost ? lostFt : left > 0 ? ft(`Stay under till midnight: +${pay} coins`, 1) : left === 0 ? ft(`At your limit. Stop now and you still get +${pay} coins`, 1) : ft('No screen coins today. New day at midnight.');
    aria = used > L ? `Screen time: ${used - L} minutes over. Blocker is off.` : `Screen time: ${left} minutes left of ${limName(L)}. Blocker is off.${streakSay}`;
  } else if (left <= 0 && unlLeft()) {   // an emergency unlock is running: native blocks again when it ends
    const m = Math.ceil(unlLeft() / 60e3), at = clockAt(+st.unlockUntil);
    cls += ' unl'; hd = `<b>${m}</b><span>min left</span><span class="tag">Unlocked</span>`; n = notches(L, 0);
    f = ft(`Emergency unlock · apps lock again at ${at}`);
    aria = `Screen time: unlocked, ${m} minutes left. Your apps lock again at ${at}.`;
  } else if (left <= 0) {
    cls += ' off'; hd = `${LOCK}<b>TIME'S UP</b>`; n = notches(L, 0);
    f = used <= L && !lost ? ft(`Locked till midnight · you still bank +${pay} coins`, 1) : ft('Locked till midnight · no screen coins today');
    aria = "Screen time: time's up. Limited apps locked till midnight.";
  } else {
    if (left <= 5) { cls += ' low'; f = ft('Wrap it up. Your apps lock at zero.'); } else f = lost ? lostFt : ft(`Stay under till midnight: +${pay} coins`, 1);
    hd = `<b>${left}</b><span>min left</span>${flame}`;
    aria = `Screen time: ${left} minutes left of ${limName(L)}.${streakSay}`;
  }
  el.className = cls;
  el.innerHTML = top(`${used} / ${L} MIN`) + `<div class="scr-hd">${hd}</div>` + n + f + nxLine(cur, nx)
    + (st.blocker ? '' : `<div class="scr-warn"><span>Blocker's off, so nothing gets locked.</span><button class="act" data-scr-fix>Turn on</button></div>`)
    + (cls.includes('off') && puCan() === null ? `<button class="scr-unl" data-scr-unl><b>Emergency unlock · 10 push-ups</b><small>15 min on camera · ${st.unlocksLeft} left today</small></button>` : '');
  el.setAttribute('aria-label', aria);
  const fix = el.querySelector('[data-scr-fix]');
  if (fix) fix.onclick = ev => { ev.stopPropagation(); Sound.tap(); setupSheet(); };
  const sos = el.querySelector('[data-scr-unl]');
  if (sos) sos.onclick = ev => { ev.stopPropagation(); Sound.tap(); levelupOpenPushups(null); };
  // the unlock's minutes count down on the card, and the card locks again the moment it ends
  if (cls.includes('unl')) { const ms = unlLeft(); scrUnlT = setTimeout(() => (unlLeft() ? renderScreen() : levelupScreenTimeChanged()), (ms - 1) % 60e3 + 200); }
}
$('scr').onclick = () => {
  Sound.tap();
  if ($('scr').dataset.retry) {   // today couldn't be read: read again
    levelupScreenTimeChanged();
    if (!scr.now && scr.st && scr.st.usage) showNote("Still can't read your screen time", 'Nothing gets locked till it works. Try again in a bit.', HOURGLASS, 'Screen time');
    return;
  }
  !S.screen.plan.length || !scr.st || !scr.st.usage ? setupSheet() : settingsSheet();
};
$('scr').onkeydown = e => { if (e.target === $('scr') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); $('scr').click(); } };
$('scrOpen').hidden = !scrOn();
$('scrOpen').onclick = () => { Sound.tap(); S.screen.plan.length ? settingsSheet() : setupSheet(); };

/* commitment rules: tightening applies now, loosening waits for midnight. Past entries are never edited */
function scrCur() {   // today's entry, copying an older one to today first so past days keep the rule they had
  const t = today(), c = scrAt(t); if (!c || c.from === t) return c;
  const n = { from: t, limit: c.limit, apps: [...c.apps] };
  S.screen.plan.splice(S.screen.plan.indexOf(c) + 1, 0, n); return n;
}
function scrNxMake() {
  let n = scrNext(); if (n) return n;
  const c = scrAt(today()); n = { from: ymd(addDays(new Date(), 1)), limit: c.limit, apps: [...c.apps] };
  S.screen.plan.push(n); return n;
}
function scrAfter() {
  const P = S.screen.plan, t = today();
  for (let i = P.length - 1; i > 0; i--) {   // drop an entry that changes nothing (a cancelled change, a no-op copy)
    if (P[i].from >= t && P[i].limit === P[i - 1].limit && sameApps(P[i].apps, P[i - 1].apps) && P[i - 1].from <= t) P.splice(i, 1);
  }
  save(); scrPush(); scrRefresh(true); renderScreen(); scrRepaint(); afterChange();
}
function scrSetLimit(v) {
  const c0 = scrAt(today()), nx = scrNext();
  if (!c0) { if (nx) nx.limit = v; Sound.tap(); scrAfter(); return; }   // the plan hasn't started: change it freely
  if (v > 0 && (!c0.limit || v <= c0.limit)) {
    const used = scrUsed();
    if (scrBlocker() && c0.apps.length && used >= v && !(c0.limit && used >= c0.limit)
      && !confirm(`You've used ${used} min today. A ${limName(v)} limit locks your apps right now. Set it?`)) return;
    scrCur().limit = v; if (nx) nx.limit = v;   // also cancels a raise waiting for tomorrow
  } else if (v !== c0.limit) scrNxMake().limit = v;
  else if (nx) nx.limit = v;
  Sound.tap(); buzz(8); scrAfter();
}
function scrToggle(pkg) {
  const c0 = scrAt(today()), nx = scrNext(), app = (scr.apps || []).find(a => a.pkg === pkg);
  if (!c0) { if (nx) nx.apps = nx.apps.includes(pkg) ? nx.apps.filter(p => p !== pkg) : [...nx.apps, pkg]; }
  else if (c0.apps.includes(pkg)) {
    if (!nx || nx.apps.includes(pkg)) { const n = scrNxMake(); n.apps = n.apps.filter(p => p !== pkg); }   // removal: from tomorrow
    else nx.apps.push(pkg);   // undo a waiting removal
  } else {   // adding counts right away
    const used = scrUsed(), m = app ? app.min || 0 : 0;
    if (scrBlocker() && c0.limit && used < c0.limit && used + m >= c0.limit
      && !confirm(`${app ? app.name : 'This app'} has ${m} min today, so you'd be at ${used + m} of ${c0.limit} min and your apps lock right now. Add it?`)) return;
    scrCur().apps.push(pkg); if (nx && !nx.apps.includes(pkg)) nx.apps.push(pkg);
  }
  Sound.tap(); buzz(8); scrAfter();
}
function scrLoadApps() {
  const r = scrCall('screenTimeApps');
  if (r && r.ok && Array.isArray(r.apps)) scr.apps = r.apps.filter(a => a && typeof a.pkg === 'string' && a.pkg !== 'app.levelup').map(a => ({ pkg: a.pkg, name: String(a.name || a.pkg), min: a.min | 0, suggest: !!a.suggest, icon: typeof a.icon === 'string' && /^data:image\//.test(a.icon) ? a.icon : '' }));
  // setup made the plan while the list wouldn't load: tick the suggested apps now (adding apps applies at once)
  if (scr.apps && scr.autoEmpty) {
    scr.autoEmpty = false;
    const P = S.screen.plan;
    if (P.length === 1 && !P[0].apps.length) { P[0].apps = scr.apps.filter(a => a.suggest).map(a => a.pkg); save(); scrPush(); }
  }
  return scr.apps;
}
// the setup flow creates the plan once Usage access is on: 1 hour on the suggested apps
function scrEnsurePlan() {
  if (S.screen.plan.length || !scr.st || !scr.st.usage) return;
  const apps = scr.apps || scrLoadApps();   // the list failed: make the plan anyway, step 2 offers Try again
  S.screen.plan.push({ from: today(), limit: 60, apps: apps ? apps.filter(a => a.suggest).map(a => a.pkg) : [] });
  if (!apps) scr.autoEmpty = true;
  save(); scrPush(); scrRefresh(true);
}
function scrOpenSettings(which) {
  Sound.tap();
  let ok = false;
  try { ok = LevelUpAndroid.openScreenTimeSettings(which) === true; } catch (e) {}
  if (which === 'usage') scr.tried.usage = true;
  if (which === 'accessibility') scr.tried.a11y = true;
  if (!ok) showNote("Couldn't open Settings", { usage: 'Open Settings and search for "Usage access"', accessibility: 'Open Settings and search for "Accessibility"', appinfo: 'Open Settings > Apps > LEVEL UP' }[which], HOURGLASS, 'Screen time');
}

/* setup sheet: three steps, re-rendered in place when the user comes back from Settings */
const TICK = '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3 9.5l4 4 8-9" fill="none" stroke="#0c0a1d" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
let stpWas = null;   // which steps were done when last drawn, to cheer the one that just got done
function scrSummary(e) {
  const by = new Map((scr.apps || []).map(a => [a.pkg, a]));
  const names = e.apps.filter(p => by.has(p)).sort((a, b) => by.get(b).min - by.get(a).min || by.get(a).name.localeCompare(by.get(b).name)).map(p => by.get(p).name);
  const n = scr.apps ? names.length : e.apps.length;
  return `<b>${limName(e.limit) || 'No limit'}</b> a day · ${!n ? 'no apps picked yet' : scr.apps ? esc(names.slice(0, 4).join(', ')) + (n > 4 ? ` + ${n - 4} more` : '') : `${n} ${n === 1 ? 'app' : 'apps'}`}`;
}
function setupHTML() {
  const st = scr.st || {}, t = today(), cur = scrAt(t), nx = scrNext(), e = cur || nx, s1 = !!st.usage, s2 = s1 && !!e && e.apps.length > 0, s3 = !!st.blocker, r13 = (st.sdk || 0) >= 33;
  const all = s1 && s2 && s3;
  const step = (n, ok, title, body, extra = '') => `<div class="stp${ok ? ' ok' : ''}${n === 2 && !s1 ? ' locked' : ''}"><span class="n">${ok ? TICK : n}</span><div><b>${title}</b>${body}${extra}</div></div>`;
  const got = '<span class="got">Done</span>';
  // Android 13+ "Restricted setting": the fix lives under step 3, or under step 1 once the blocker is already on
  const rst = (open, sum, again) => `<details class="rst"${open ? ' open' : ''}><summary>${sum}</summary><ol>
      <li>Tap <b>OK</b> on that message.</li>
      <li>Tap <b>Open App info</b> below. Tap <b>⋮</b> in the top corner, then <b>Allow restricted settings</b>. Confirm with your PIN or fingerprint.</li>
      <li>Come back and tap <b>${again}</b> again. The switch works now.</li></ol>
      <button class="do ghost2" data-open="appinfo">Open App info</button></details>`;
  const hint1 = scr.tried.usage && r13;
  const one = s1 ? got : `<p class="stp-d">Android calls this <q>Usage access</q>. Switch LEVEL UP on, then come back here.</p>
    ${hint1 ? `<p class="stp-d">Switch greyed out or says <q>Restricted setting</q>? Use the fix ${s3 ? 'below' : 'under step 3'}, then try again.</p>` : ''}
    <button class="do" data-open="usage">Open Usage access</button>${hint1 && s3 ? rst(true, 'Says “Restricted setting”?', 'Open Usage access') : ''}`;
  const two = !s1 ? '<p class="stp-d">Unlocks after step 1.</p>'
    : !e ? '<p class="stp-d">Loading your apps...</p>'
    : !e.apps.length && !scr.apps ? `<div class="sum">${scrSummary(e)}</div><p class="stp-d">Couldn't load your apps.</p><button class="act" data-retry-apps>Try again</button>`
    : `<div class="sum">${scrSummary(e)}</div>${all ? '' : `<button class="act" data-change>${e.apps.length ? 'Change' : 'Pick apps'}</button>`}`;
  const failed = scr.tried.a11y && !s3, inst = /samsung/i.test(st.maker || '');
  const three = s3 ? got : `<p class="stp-d">In Accessibility, find LEVEL UP (it may be under <q>${inst ? 'Installed apps' : 'Downloaded apps'}</q> or <q>${inst ? 'Downloaded apps' : 'Installed apps'}</q>) and switch it on.</p>
    <p class="stp-d">Android will warn that LEVEL UP gets <q>full control</q>. It only checks which app is open, so it can send you home when time's up. It can't read your messages or type anything.</p>
    <button class="do" data-open="accessibility">Open Accessibility</button>
    ${r13 ? rst(failed, failed ? "Didn't work? It's probably this:" : 'Says “Restricted setting”?', 'Open Accessibility') : ''}`;
  // already over today's limit with the blocker still off: it would lock at once, so offer to start at midnight
  let heads = '';
  if (s1 && !s3) {
    const P = S.screen.plan;
    if (P.length === 1 && P[0].from > t) heads = `<div class="heads">Your limit starts at midnight. Today doesn't count. <button class="act" data-when="today">Start today after all</button></div>`;
    else if (scrLim(cur) && scrUsed() >= cur.limit) heads = `<div class="heads">Heads up: you've used ${fmtMins(scrUsed())} today already, so your apps lock as soon as the blocker is on.${P.length === 1 && P[0].from === t ? ' <button class="act" data-when="tomorrow">Start tomorrow instead</button>' : ''}</div>`;
  }
  const hd = all ? `<h2>You're set</h2><p class="dim">Your limit is on. ${limName(e.limit) || 'No limit'} a day on ${e.apps.length} ${e.apps.length === 1 ? 'app' : 'apps'}.</p>`
    : `<h2>Screen time limit</h2><p class="dim">1 hour a day on games, videos and social apps. When it runs out, LEVEL UP sends you to your home screen till midnight.</p>`;
  return hd + step(1, s1, 'See your screen time', one) + step(2, s2, 'Check what counts', two) + step(3, s3, 'Turn on the blocker', three, heads)
    + (all ? '<button class="go" data-done>Let\'s go</button>' : '')
    + '<p class="st-foot">Calls, texts, Settings and the camera are never blocked. You can switch the blocker off in Android Settings any time.</p>';
}
function stpState() { const st = scr.st || {}, e = scrAt(today()) || scrNext(); return { u: !!st.usage, p: !!(st.usage && e && e.apps.length), b: !!st.blocker }; }
function bindSetup(el) {
  el.querySelectorAll('[data-open]').forEach(b => b.onclick = () => scrOpenSettings(b.dataset.open));
  const ch = el.querySelector('[data-change]'); if (ch) ch.onclick = () => { Sound.tap(); settingsSheet(); };
  const ra = el.querySelector('[data-retry-apps]');
  if (ra) ra.onclick = () => { Sound.tap(); if (!scrLoadApps()) showNote("Couldn't load your apps", 'Try again in a bit, or pick them later in Screen time.', HOURGLASS, 'Screen time'); scrRefresh(true); renderScreen(); scrRepaint(); };
  const go = el.querySelector('[data-done]'); if (go) go.onclick = () => { Sound.tap(); closeSheet(); };
  el.querySelectorAll('[data-when]').forEach(b => b.onclick = () => {
    const P = S.screen.plan; if (P.length !== 1) return;
    P[0].from = b.dataset.when === 'tomorrow' ? ymd(addDays(new Date(), 1)) : today();   // back to today is a tightening: allowed any time
    Sound.tap(); scrAfter();
  });
}
function setupSheet() {
  scrRefresh(true); scrEnsurePlan();
  stpWas = stpState();
  openSheet(`<div data-scr="setup">${setupHTML()}</div>`, bindSetup);
  renderScreen();
}

/* settings sheet */
let wkKey = null, stList = null;   // stList: the app order, fixed when the sheet opens so rows never jump under a finger
function settingsHTML() {
  const t = today(), cur = scrAt(t), nx = scrNext(), e = cur || nx, used = scrUsed(), D = S.screen.days, run = scrLedger().now;
  const total = scr.now ? scr.now.total : D[t] ? D[t].t : 0;
  const tip = k => {
    if (k === t) return scrLim(cur) ? `Today so far: ${used} of ${cur.limit} min` : `Today so far: ${fmtMins(used)}`;
    const d = D[k], when = fmtDate(k);
    if (!d || d.f !== 1) return `${when}: no data`;
    if (!d.l) return `${when}: ${fmtMins(d.t)} · no limit`;
    return scrOk(d) ? `${when}: ${d.u} of ${d.l} min · +${SCR_PAY(d.l)} coins` : d.u <= d.l ? `${when}: ${d.u} of ${d.l} min + ${d.o} unpicked · no coins` : `${when}: ${d.u} of ${d.l} min · over`;
  };
  const wk = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(new Date(), i - 6), k = ymd(day), d = D[k];
    const cls = k === t ? 'today' : d && d.f === 1 && d.l > 0 ? (scrOk(d) ? 'hit' : 'miss') : 'off';
    return `<button class="${cls}${k === wkKey ? ' sel' : ''}" data-k="${k}" aria-label="${esc(tip(k))}"><i></i>${DAY[day.getDay()]}</button>`;
  }).join('');
  const lims = [...SCR_LIMITS, 0].map(v => {
    const on = cur ? cur.limit === v : false, waiting = nx && nx.limit === v && (!cur || cur.limit !== v);
    return `<button class="${on ? 'on' : ''}${waiting ? ' nx' : ''}" data-lim="${v}" aria-pressed="${on}"${waiting ? ` aria-label="${v ? limName(v) : 'Off'}, starts tomorrow"` : ''}><b>${v ? limName(v) : 'Off'}</b>${v ? `<small>${COIN_SM}+${SCR_PAY(v)}/day</small>` : '<small class="none">no coins</small>'}</button>`;
  }).join('');
  const pend = !cur && nx ? `<div class="pend"><span>Your limit starts at midnight.</span><button class="act" data-now>Start now</button></div>`
    : cur && nx && nx.limit !== cur.limit ? `<div class="pend"><span>Tomorrow: <b>${limName(nx.limit)}</b>. Today stays at ${limName(cur.limit)}.</span><button class="act" data-keep>Keep ${limName(cur.limit)}</button></div>` : '';
  const picked = e ? e.apps : [];
  const search = stList && scr.apps && scr.apps.length > 12 ? `<input class="search" type="search" placeholder="Search apps" aria-label="Search apps" value="${esc(stList.q)}" autocomplete="off">` : '';
  const bl = scrBlocker() ? '<div><b>On</b><small>Sends you home when time\'s up</small></div>'
    : '<div><b class="off">Off</b><small>Nothing gets locked</small></div><button class="act" data-fix>Turn on</button>';
  return `<h2>Screen time</h2>
    <div class="st-today"><div><span class="label">Today · limited apps</span><div class="big">${used}<small>min</small></div></div><div class="tot"><b>${fmtMins(total)}</b>whole phone today</div></div>
    <div class="wk" role="group" aria-label="Last 7 days">${wk}</div>
    <div class="wk-tip" aria-live="polite">${esc(wkKey ? tip(wkKey) : run >= 2 ? `${run} days under in a row · tap a day` : 'Tap a day to see it')}</div>
    <span class="label">Daily limit</span>
    <div class="lim">${lims}</div>${pend}
    <p class="rule-note">Lower limits start now. Higher limits and Off start tomorrow, so you can't cave at 10pm.</p>
    <span class="label">Apps that count · ${picked.length}</span>
    ${search}<div data-alist>${scrListHTML()}</div>
    <p class="rule-note">Adding an app counts right away. Removing one still counts till midnight. For coins, unpicked games and video apps count too.</p>
    <p class="rule-note">Can't find an app? Phone, texts, Settings, camera, clock, keyboards and LEVEL UP itself can never be limited, so they're not here.</p>
    <span class="label">Blocker</span>
    <div class="st-blk">${bl}</div>
    <p class="st-foot">LEVEL UP looks back 7 days, so open it at least once a week to bank every coin.</p>`;
}
// the app rows (+ Show all), redrawn on their own while searching so the search box is never replaced mid-word
function scrListHTML() {
  if (!stList || !scr.apps) return '<div class="alist"><p class="dim">Loading your apps...</p></div>';
  const t = today(), cur = scrAt(t), nx = scrNext(), e = cur || nx, picked = e ? e.apps : [];
  const by = new Map(scr.apps.map(a => [a.pkg, a])), q = stList.q.trim().toLowerCase();
  const row = a => {
    const on = (cur ? cur.apps : picked).includes(a.pkg), leaving = !!(cur && nx && on && !nx.apps.includes(a.pkg));
    return `<button class="arow${leaving ? ' leaving' : ''}" role="checkbox" aria-checked="${on}" data-pkg="${esc(a.pkg)}"><span class="ai">${a.icon ? `<img src="${a.icon}" alt="">` : esc((a.name.trim()[0] || '?').toUpperCase())}</span><span class="grow"><span class="nm">${esc(a.name)}</span>${leaving ? '<span class="mt nx">Counts till midnight</span>' : ''}</span><span class="min">${a.min ? `${a.min} min` : ''}</span><span class="ck">${CHECK}</span></button>`;
  };
  const ids = q ? stList.order.filter(p => by.get(p).name.toLowerCase().includes(q)) : stList.all ? stList.order : stList.order.slice(0, stList.top);
  const list = ids.length ? ids.map(p => row(by.get(p))).join('') : `<p class="dim">${q ? 'No app called that' : 'No apps to show'}</p>`;
  const rest = stList.order.length - stList.top;
  return `<div class="alist">${list}</div>${!q && !stList.all && rest > 0 ? `<button class="act" data-more>Show all apps (${rest})</button>` : ''}`;
}
function bindList(el) {
  el.querySelectorAll('[data-pkg]').forEach(b => b.onclick = () => scrToggle(b.dataset.pkg));
  const m = el.querySelector('[data-more]');
  if (m) m.onclick = () => { stList.all = true; Sound.tap(); scrRepaint(); const r = $('sheet').querySelectorAll('.arow')[stList.top]; if (r) r.focus({ preventScroll: true }); };
}
function bindSettings(el) {
  el.querySelectorAll('.wk [data-k]').forEach(b => b.onclick = () => { wkKey = b.dataset.k; Sound.tap(); scrRepaint(); });
  el.querySelectorAll('[data-lim]').forEach(b => b.onclick = () => scrSetLimit(+b.dataset.lim));
  bindList(el);
  const on = (sel, f) => { const b = el.querySelector(sel); if (b) b.onclick = f; };
  on('[data-keep]', () => scrSetLimit(scrAt(today()).limit));
  on('[data-now]', () => { const n = scrNext(); if (n && !scrAt(today())) { n.from = today(); Sound.tap(); scrAfter(); } });
  on('[data-fix]', () => { Sound.tap(); setupSheet(); });
  const s = el.querySelector('.search');
  if (s) s.oninput = () => { stList.q = s.value; const box = el.querySelector('[data-alist]'); if (box) { box.innerHTML = scrListHTML(); bindList(box); } };
}
function settingsSheet() {
  scrRefresh(true);
  if (!scr.st || !scr.st.usage || !S.screen.plan.length) { setupSheet(); return; }
  wkKey = null; stList = null;
  openSheet(`<div data-scr="settings">${settingsHTML()}</div>`, bindSettings);
  setTimeout(() => {   // the app list is slow to build: show the sheet first
    if (!scrLoadApps()) scr.apps = [];
    const t = today(), e = scrAt(t) || scrNext(), picked = new Set(e ? e.apps : []);
    const a = scr.apps.filter(x => picked.has(x.pkg)).sort((x, y) => y.min - x.min || x.name.localeCompare(y.name));
    const b = scr.apps.filter(x => !picked.has(x.pkg) && x.min > 0).sort((x, y) => y.min - x.min || x.name.localeCompare(y.name));
    const c = scr.apps.filter(x => !picked.has(x.pkg) && !(x.min > 0)).sort((x, y) => x.name.localeCompare(y.name));
    stList = { order: [...a, ...b, ...c].map(x => x.pkg), top: a.length + b.length, all: false, q: '' };
    scrRepaint();
  }, 30);
}
// redraws an open screen-time sheet in place: same scroll position, focus back on the same control
function scrRepaint() {
  if (!$('sheetbg').classList.contains('open')) return;
  const box = $('sheet').querySelector('[data-scr]'); if (!box) return;
  const a = document.activeElement, keyOf = x => !x || !box.contains(x) ? null
    : x.dataset.pkg ? `[data-pkg="${CSS.escape(x.dataset.pkg)}"]` : x.dataset.lim ? `[data-lim="${x.dataset.lim}"]` : x.dataset.k ? `[data-k="${x.dataset.k}"]` : x.classList.contains('search') ? '.search' : x.dataset.open ? `[data-open="${x.dataset.open}"]` : null;
  const focus = keyOf(a), top = $('sheet').scrollTop, kind = box.dataset.scr;
  if (kind === 'setup') {
    scrEnsurePlan();
    const was = stpWas, now = stpState(), open = !!box.querySelector('.rst[open]');
    box.innerHTML = setupHTML().replace('<h2>', '<h2 id="sheetTitle">'); bindSetup(box);
    if (open) { const d = box.querySelector('.rst'); if (d) d.open = true; }
    if (was && now.u && now.p && now.b && !(was.u && was.p && was.b)) {
      const e = scrAt(today()) || scrNext();
      Sound.clear(); buzz([15, 40, 15]);
      showNote("Limit's on", `${limName(e.limit) || 'No limit'} a day. Stay under for +${SCR_PAY(e.limit)} coins a day.`, HOURGLASS, 'Screen time');
    } else if (was && ((now.u && !was.u) || (now.b && !was.b))) { Sound.check(); buzz(12); }
    stpWas = now;
  } else {
    box.innerHTML = settingsHTML().replace('<h2>', '<h2 id="sheetTitle">'); bindSettings(box);
  }
  $('sheet').scrollTop = top;
  const f = focus && box.querySelector(focus);
  if (f) { f.focus({ preventScroll: true }); if (f.classList.contains('search')) f.setSelectionRange(f.value.length, f.value.length); }
}
// native calls these: on every return to the app (from Settings or a limited app), and from the block screen
window.levelupScreenTimeChanged = () => { if (!scrOn()) return; scrRefresh(true); renderScreen(); scrRepaint(); afterChange(); };
window.levelupOpenWorkout = () => {
  if (!$('wo').hidden && $('wo').classList.contains('res')) claimResults();
  $('rankup').classList.remove('open'); closeSheet();
  if (!$('v-home').classList.contains('on')) document.querySelector('.nav button[data-v=home]').click();
  S.workout ? openWorkout() : pickSheet();
};

/* ------------------------------------------------------------------ emergency unlock: 10 push-ups on camera */
// Native owns the rules (15 min, twice a day, only once today's limit is used up) and blocks again when the time
// runs out; JS only counts reps. The pose model (MediaPipe, vendor/) runs on the phone: frames never leave it, nothing
// is saved. Anyone can still switch the blocker off in Android Settings: this is a way out that costs effort, not a lock.
// Rep counter, side view: UP (elbow > 150°) -> DOWN (< 95°) -> UP, only in a plank (shoulder-hip line within 35° of
// level, wrists below shoulders), the shoulder dropping at least 0.12 x shoulder-hip, at least 0.5 s a rep, 10 inside
// 5 minutes of the first. Pure, so it can be tested with made-up landmarks.
const PU = { N: 10, UP: 150, DOWN: 95, PLANK: 35, DROP: 0.12, MIN_MS: 500, WIN: 5 * 60e3, VIS: 0.5, TAU: 90, LOST: 1500, OFF: 400 };
const PU_SIDES = [[11, 13, 15, 23], [12, 14, 16, 24]];   // shoulder, elbow, wrist, hip: left, right
// ar: the frame's width / height (landmarks are 0..1 on each axis); angles are measured in real proportions
const puNew = (ar = 1) => ({ n: 0, phase: 'wait', ang: null, sy: null, t: null, ar, first: 0, last: -1e9, top: 0, upY: 0, downY: 0, minA: 180,
  lost: 0, off: 0, cond: 'none', tip: null, tipAt: 0, ev: null, side: -1, done: false });
function pushupStep(st, lm, t) {
  const s = { ...st, ev: null };
  if (s.done) return s;
  if (s.n && t - s.first > PU.WIN) Object.assign(s, { n: 0, first: 0, phase: 'wait', ev: 'reset', tip: 'reset', tipAt: t });
  // the side facing the camera: the one the model is surer of, with every joint we use clearly seen
  let side = -1, best = PU.VIS;
  if (lm && lm.length > 24) PU_SIDES.forEach((ix, i) => { const v = Math.min(...ix.map(j => +lm[j].visibility || 0)); if (v > best) { best = v; side = i; } });
  if (side < 0) {   // lost: pause with the count kept; a half-done rep is forgotten after a moment
    if (!s.lost) s.lost = t;
    if (t - s.lost > PU.LOST) Object.assign(s, { phase: 'wait', ang: null, sy: null });
    s.cond = lm && lm.length ? 'body' : 'none'; s.t = t; return s;
  }
  s.lost = 0; s.side = side;
  const [sh, el, wr, hp] = PU_SIDES[side].map(j => lm[j]), X = p => p.x * s.ar;
  const a1 = Math.atan2(sh.y - el.y, X(sh) - X(el)), a2 = Math.atan2(wr.y - el.y, X(wr) - X(el));
  let raw = Math.abs(a1 - a2) * 180 / Math.PI; if (raw > 180) raw = 360 - raw;
  // smooth with a time-based EMA, so a slow phone and a fast one behave the same
  const k = s.ang == null || s.t == null ? 1 : 1 - Math.exp(-Math.max(0, t - s.t) / PU.TAU);
  s.ang = s.ang == null ? raw : s.ang + k * (raw - s.ang);
  s.sy = s.sy == null ? sh.y : s.sy + k * (sh.y - s.sy);
  s.t = t;
  const tx = X(hp) - X(sh), ty = hp.y - sh.y, torso = Math.hypot(tx, ty), tilt = Math.atan2(Math.abs(ty), Math.abs(tx)) * 180 / Math.PI;
  if (!(torso > 0.04 && tilt <= PU.PLANK && wr.y > sh.y)) {   // not in a plank: standing, sitting, facing the phone
    s.cond = 'plank';
    if (!s.off) s.off = t;
    if (t - s.off > PU.OFF) s.phase = 'wait';
    return s;
  }
  s.off = 0; s.cond = null;
  const a = s.ang;
  if (s.phase === 'down') {
    s.downY = Math.max(s.downY, s.sy);
    if (a > PU.UP) {   // back up: a rep, if the body really went down and it wasn't a twitch
      const deep = s.downY - s.upY >= PU.DROP * torso, slow = t - s.top >= PU.MIN_MS && t - s.last >= PU.MIN_MS;
      if (deep && slow) { s.n++; s.last = t; if (s.n === 1) s.first = t; s.ev = 'rep'; s.tip = null; s.done = s.n >= PU.N; }
      else { s.tip = deep ? 'fast' : 'lower'; s.tipAt = t; }
      Object.assign(s, { phase: 'up', top: t, upY: s.sy, minA: 180 });
    }
  } else if (a > PU.UP) {
    if (s.phase === 'up' && s.minA < PU.UP - 20) { s.tip = 'lower'; s.tipAt = t; }   // bent, but not far enough
    if (s.phase === 'wait') s.upY = s.sy;
    Object.assign(s, { phase: 'up', top: t, upY: Math.min(s.upY, s.sy), minA: 180 });
  } else if (s.phase === 'up') {
    s.minA = Math.min(s.minA, a);
    if (a < PU.DOWN) { s.phase = 'down'; s.downY = s.sy; }
  }
  return s;
}

const PU_TIPS = {
  none: "Can't see you. Get your whole body in the picture, side-on",
  body: 'Get your whole body in the picture, side-on',
  plank: 'Get in push-up position, side-on to the phone',
  lower: 'Go lower', fast: 'Slow down. All the way down, then up', reset: 'Over 5 minutes, so the count restarted',
};
const PU_BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];
const PU_FIG = `<svg class="pu-fig" viewBox="0 0 320 112" aria-hidden="true"><path d="M8 100h304" stroke="var(--rule-hi)" stroke-width="2"/>
  <rect x="14" y="74" width="20" height="26" rx="3" fill="var(--panel-hi)" stroke="var(--rule-hi)" stroke-width="2"/>
  <rect x="34" y="52" width="13" height="48" rx="3" transform="rotate(14 40 100)" fill="var(--ground)" stroke="var(--chalk)" stroke-width="2.4"/><circle cx="47" cy="61" r="2.2" fill="#ffb020"/>
  <path d="M74 34h76" stroke="var(--dim)" stroke-width="2" stroke-dasharray="5 5"/><path d="M144 28l8 6-8 6" fill="none" stroke="var(--dim)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="183" cy="50" r="9" fill="var(--chalk)"/><path d="M196 58L300 92" stroke="var(--chalk)" stroke-width="9" stroke-linecap="round"/>
  <path d="M199 60l-3 39" stroke="#ffb020" stroke-width="7" stroke-linecap="round"/><path d="M188 99h16" stroke="#ffb020" stroke-width="5" stroke-linecap="round"/></svg>`;
const X_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
const puBridge = () => scrOn() && typeof LevelUpAndroid.grantPushupUnlock === 'function';
const clockAt = t => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s/g, '\u00a0');   // never "10:50 / PM"
const unlLeft = () => { const u = scr.st && +scr.st.unlockUntil; return u > Date.now() ? u - Date.now() : 0; };
// null when an unlock can be had right now, else why not. Native checks again and has the last word.
function puCan() {
  if (!puBridge()) return 'demo';
  const st = scr.st || {}, cur = scrAt(today());
  if (unlLeft()) return 'active';
  if (!(st.unlocksLeft > 0)) return 'none_left';
  if (!st.blocker || !scrLim(cur) || !scr.now || scrUsed() < cur.limit) return 'not_over';
  return null;
}
const PU_WHY = {
  active: () => `You're unlocked: ${Math.ceil(unlLeft() / 60e3)} min left.`, none_left: () => 'No unlocks left today. You get 2 again at midnight.',
  not_over: () => "You're not over your limit, so there's nothing to unlock.", failed: () => "Couldn't unlock. Try again.",
};

let pu = null, puRun = 0, puTs = 0, puModel = null;   // pu: the open screen (never saved); puRun: bumps to cancel a running camera
function puLoad() {   // the pose model, loaded once and kept; a failed load can be tried again
  if (!puModel) puModel = import('./vendor/mediapipe/vision_bundle.mjs').then(({ PoseLandmarker }) => {
    const base = 'vendor/mediapipe';
    return PoseLandmarker.createFromOptions({ wasmLoaderPath: base + '/wasm/vision_wasm_internal.js', wasmBinaryPath: base + '/wasm/vision_wasm_internal.wasm' },
      { baseOptions: { modelAssetPath: base + '/pose_landmarker_lite.task', delegate: 'CPU' }, runningMode: 'VIDEO', numPoses: 1 });
  }).catch(e => { puModel = null; throw e; });
  return puModel;
}
// native: EMERGENCY UNLOCK on the block screen (pkg: the app it covered). Home's card calls it too.
window.levelupOpenPushups = pkg => {
  if (scrOn()) scrRefresh(true);
  let name = '';
  try { if (pkg && puBridge() && typeof LevelUpAndroid.appName === 'function') name = String(LevelUpAndroid.appName(pkg) || ''); } catch (e) {}
  $('rankup').classList.remove('open'); closeSheet(); ovClose();
  if (pu) puStop();
  pu = { pkg: name ? pkg : null, name, step: 'setup', st: null, res: null, err: null, stream: null, frames: 0, poses: 0, ready: false };
  $('pu').hidden = false; puRender();
};
function puStop() {   // camera off. The count stays (a paused screen can go on)
  puRun++;
  if (pu && pu.stream) { pu.stream.getTracks().forEach(t => t.stop()); pu.stream = null; }
  const v = $('puVid'); if (v) { try { v.pause(); } catch (e) {} v.srcObject = null; }
  wake(woAwake);   // a running workout may still want the screen on
}
function puClose() {
  if (!pu) return;
  const got = pu.res && pu.res.ok; puStop(); pu = null; $('pu').hidden = true; $('puIn').innerHTML = '';
  if (got) levelupScreenTimeChanged(); else renderScreen();
}
async function puStart() {
  const id = ++puRun, keep = pu.st;
  Object.assign(pu, { step: 'live', ready: false, err: null }); puRender();
  const model = puLoad(); model.catch(() => {});   // loads while Android asks for the camera
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error('no camera API'), { name: 'NotFoundError' });
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    if (id !== puRun) { stream.getTracks().forEach(t => t.stop()); return; }
    pu.stream = stream;
    const v = $('puVid'); v.srcObject = stream; await v.play();
    if (id !== puRun) return;
    wake(true); $('puTip').textContent = 'Almost ready...';
    let pl; try { pl = await model; } catch (e) { e.name = 'model'; throw e; }
    if (id !== puRun) return;
    pu.pl = pl; pu.st = keep && keep.ar === v.videoWidth / v.videoHeight ? keep : Object.assign(puNew(v.videoWidth / v.videoHeight), keep ? { n: keep.n, first: keep.first } : {});
    pu.ready = true; puLive(); puLoop(id);
  } catch (e) {
    if (id !== puRun) return;
    puStop();
    const n = e && e.name;
    pu.err = n === 'model' ? 'model' : n === 'NotAllowedError' || n === 'SecurityError' || n === 'PermissionDeniedError' ? 'denied' : n === 'NotReadableError' || n === 'AbortError' || n === 'TrackStartError' ? 'busy' : 'nocam';
    pu.step = 'err'; puRender(); Sound.nope();
  }
}
function puLoop(id) {
  const v = $('puVid'), next = f => (v.requestVideoFrameCallback ? v.requestVideoFrameCallback(f) : requestAnimationFrame(f));
  const frame = () => {
    if (id !== puRun || !pu || pu.step !== 'live') return;
    if (v.readyState >= 2) {
      puTs = Math.max(performance.now(), puTs + 1);   // the model wants strictly increasing timestamps
      let lm = null;
      try { const r = pu.pl.detectForVideo(v, puTs); lm = r && r.landmarks && r.landmarks[0] || null; } catch (e) {}
      pu.st = pushupStep(pu.st, lm, puTs); pu.frames++; if (lm) pu.poses++;
      puDraw(lm, pu.st); puLive();
      if (pu.st.ev === 'rep') { Sound.combo(pu.st.n); buzz(pu.st.done ? [40, 60, 40] : 35); }
      if (pu.st.done) { puDone(); return; }
    }
    next(frame);
  };
  next(frame);
}
function puDraw(lm, st) {
  const c = $('puCv'), v = $('puVid'); if (!c || !v.videoWidth) return;
  if (c.width !== v.videoWidth || c.height !== v.videoHeight) { c.width = v.videoWidth; c.height = v.videoHeight; }
  const g = c.getContext('2d'), W = c.width, H = c.height, ok = j => lm[j] && (+lm[j].visibility || 0) > 0.3;
  g.clearRect(0, 0, W, H);
  if (!lm) return;
  const used = st.side >= 0 && !st.cond ? PU_SIDES[st.side] : [];
  g.lineCap = 'round';
  for (const [a, b] of PU_BONES) {
    if (!ok(a) || !ok(b)) continue;
    const hot = used.includes(a) && used.includes(b);
    g.strokeStyle = hot ? '#ffb020' : 'rgba(241,238,249,.7)'; g.lineWidth = Math.max(2, W / (hot ? 90 : 160));
    g.beginPath(); g.moveTo(lm[a].x * W, lm[a].y * H); g.lineTo(lm[b].x * W, lm[b].y * H); g.stroke();
  }
  for (let j = 11; j <= 28; j++) {
    if (!ok(j)) continue;
    g.fillStyle = used.includes(j) ? '#ffd23f' : '#f1eef9';
    g.beginPath(); g.arc(lm[j].x * W, lm[j].y * H, Math.max(3, W / 110), 0, 7); g.fill();
  }
}
// the live screen's numbers, written in place (the video element must never be rebuilt)
function puLive() {
  const el = $('puIn'), st = pu.st, set = (sel, v) => { const e = el.querySelector(sel); if (e && e.textContent !== v) e.textContent = v; };
  if (!st || !pu.ready) return;
  const now = performance.now(), tip = st.cond ? PU_TIPS[st.cond] : st.tip && now - st.tipAt < 2500 ? PU_TIPS[st.tip]
    : st.phase === 'wait' ? 'Arms straight to start' : st.phase === 'down' ? 'Push up!' : st.n ? 'Nice. Keep going' : 'Go down till your arms bend';
  set('#puN', String(st.n)); set('#puTip', tip);
  const left = st.n ? Math.max(0, PU.WIN - (now - st.first)) : 0;
  set('#puClock', st.n ? `${Math.floor(left / 60e3)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')} left` : '5 min to do 10');
  const stg = el.querySelector('.pu-stage'); stg.dataset.load = '0'; stg.classList.toggle('warn', !!st.cond);
  const say = $('puSay'); if (st.ev === 'rep' && say) say.textContent = `${st.n} of ${PU.N}`;
}
function puDone() {
  puStop();
  pu.step = 'done';
  if (puBridge()) {
    pu.res = scrCall('grantPushupUnlock') || { ok: false, why: 'failed' };
    if (scrOn()) { scrRefresh(true); renderScreen(); }
  }
  pu.res && pu.res.ok || !puBridge() ? Sound.clear() : Sound.nope();
  puRender();
}
function puBackToApp() {
  let ok = false;
  try { ok = LevelUpAndroid.openApp(pu.pkg) === true; } catch (e) {}
  if (ok) puClose(); else { Sound.nope(); showNote(`Couldn't open ${pu.name}`, 'Open it from your home screen.', HOURGLASS, 'Screen time'); }
}
function puRender() {
  const el = $('puIn'), can = puCan(), demo = can === 'demo', left = scr.st && scr.st.unlocksLeft, p = pu;
  const top = (mid = '') => `<div class="pu-top"><button class="pu-x" data-pu="close" aria-label="Close">${X_ICON}</button><div class="mid">${mid}</div><span></span></div>`;
  const fine = '<p class="pu-fine">The camera only counts reps. Frames never leave your phone and nothing is saved.</p>';
  let h;
  if (p.step === 'setup') {
    const why = can && !demo ? PU_WHY[can]() : '';
    h = top() + `<div class="pu-body"><div class="wo-kick">${demo ? 'Push-up counter' : 'Emergency unlock'}</div><h2 class="pu-hd">10 push-ups</h2>
      <p class="pu-sub">${demo ? 'Practice mode. Nothing gets unlocked here.' : why ? esc(why) : `= 15 more minutes on your apps.<span class="pu-left">${left} ${left === 1 ? 'unlock' : 'unlocks'} left today</span>`}</p>
      ${p.st && p.st.n && !why ? `<p class="pu-sub keep">Paused at ${p.st.n} of ${PU.N}. Your count is kept.</p>` : ''}
      ${PU_FIG}<ol class="pu-how"><li>Lean your phone on something, about 2 big steps away.</li><li>Side-on. Whole body in the picture.</li><li>All the way down, then all the way up.</li></ol></div>
      <div class="pu-act">${fine}${why ? (can === 'active' && p.pkg ? `<button class="go" data-pu="app">Back to ${esc(p.name)}</button>` : '') + '<button class="ghost" data-pu="close">Close</button>'
        : `<button class="go" data-pu="start">${p.st && p.st.n ? 'Resume camera' : 'Start camera'}</button>`}</div>`;
  } else if (p.step === 'live') {
    h = top('<b>10 push-ups</b><span id="puClock">5 min to do 10</span>') + `<div class="pu-stage" data-load="${p.ready ? 0 : 1}"><video id="puVid" playsinline muted></video><canvas id="puCv"></canvas>
      <div class="pu-count" aria-hidden="true"><b id="puN">${p.st ? p.st.n : 0}</b><span>/ ${PU.N}</span></div>
      <div class="pu-load"><i></i>Loading the rep counter...</div></div>
      <p class="pu-tip" id="puTip" aria-live="polite">Starting the camera...</p><p class="sr" id="puSay" aria-live="assertive"></p>
      <div class="pu-act">${fine}<button class="ghost" data-pu="close">Cancel</button></div>`;
  } else if (p.step === 'err') {
    const E = {
      denied: ["Camera's off", 'LEVEL UP needs the camera to count your push-ups. Allow it in App info > Permissions > Camera, then try again.'],
      busy: ['Camera busy', 'Another app is using the camera. Close it and try again.'],
      nocam: ['No camera', "Couldn't start the camera on this phone."],
      model: ["Counter didn't load", "The rep counter couldn't start. Try again."],
    }[p.err];
    h = top() + `<div class="pu-body"><div class="wo-kick">${demo ? 'Push-up counter' : 'Emergency unlock'}</div><h2 class="pu-hd sm">${E[0]}</h2><p class="pu-sub">${E[1]}</p></div>
      <div class="pu-act">${p.err === 'denied' && scrOn() ? '<button class="go" data-pu="settings">Open settings</button>' : ''}${p.err === 'nocam' ? '' : `<button class="${p.err === 'denied' && scrOn() ? 'ghost' : 'go'}" data-pu="start">Try again</button>`}<button class="ghost" data-pu="close">Close</button></div>`;
  } else {   // done
    const r = p.res, ok = r && r.ok;
    const sub = demo ? 'Nice set. Practice mode, so nothing got unlocked.' : ok ? `Your apps lock again at ${clockAt(r.until)}.<br>${r.left} ${r.left === 1 ? 'unlock' : 'unlocks'} left today.`
      : esc((PU_WHY[r && r.why] || PU_WHY.failed)());
    h = top() + `<div class="pu-body pu-win"><div class="wo-kick">10 of 10</div><h2 class="res-hd${demo || ok ? '' : ' short'}">${ok ? 'Unlocked' : demo ? 'Set done' : 'Not unlocked'}</h2>
      ${ok ? '<div class="pu-big">15<small>min</small></div>' : ''}<p class="res-sub">${sub}</p></div>
      <div class="pu-act">${ok && p.pkg ? `<button class="go" data-pu="app">Back to ${esc(p.name)}</button><button class="ghost" data-pu="close">Stay here</button>` : '<button class="go" data-pu="close">Done</button>'}</div>`;
  }
  $('pu').classList.toggle('live', p.step === 'live');
  el.innerHTML = h;
  el.querySelectorAll('[data-pu]').forEach(b => b.onclick = () => {
    const a = b.dataset.pu; Sound.tap();
    if (a === 'close') puClose(); else if (a === 'start') puStart(); else if (a === 'app') puBackToApp();
    else if (a === 'settings') { let ok = false; try { ok = LevelUpAndroid.openScreenTimeSettings('appinfo') === true; } catch (e) {} if (!ok) showNote("Couldn't open Settings", 'Open Settings > Apps > LEVEL UP > Permissions', HOURGLASS, 'Camera'); }
  });
  if (p.step !== 'live') el.focus({ preventScroll: true });   // the dialog itself, for screen readers; no ring on a button
}
document.addEventListener('visibilitychange', () => {   // the camera never runs in the background: pause, keep the count
  if (document.hidden && pu && pu.step === 'live') { puStop(); pu.step = 'setup'; puRender(); }
});

/* ------------------------------------------------------------------ daily: fit of the day + wellness check-ins */
// Six small things a day (a fit, water, sleep, mood, a breathing minute, one good thing). Each pays once a day and doing
// CHECKIN_N of them pays a bonus; like quests, every reward is derived from what is logged, so un-logging takes it back.
// Fit photos stay on the phone in IndexedDB (S only keeps a log); only "Ask friends" sends one anywhere, and only when tapped.
const DLY = [
  ['fit', 'Fit', '#ff6fd8', 'M8.2 3L3 6l2 4.2 2.2-1V21h9.6V9.2l2.2 1L21 6l-5.2-3c-.6 1.7-2 2.7-3.8 2.7S8.8 4.7 8.2 3z', 'FIT LOGGED'],
  ['water', 'Water', '#4fb4ff', 'M12 2.5s-6.5 7.3-6.5 11.8a6.5 6.5 0 0013 0C18.5 9.8 12 2.5 12 2.5z', 'HYDRATED'],
  ['sleep', 'Sleep', '#9b8cff', 'M14.5 2.5a9.5 9.5 0 107 15.2 8 8 0 01-7-15.2z', 'SLEEP LOGGED'],
  ['mood', 'Mood', '#ffc94a', 'M12 2a10 10 0 110 20 10 10 0 010-20zM8.6 8.4a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm6.8 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM7.4 13.6c1 2.3 2.6 3.5 4.6 3.5s3.6-1.2 4.6-3.5z', 'CHECKED IN'],
  ['breathe', 'Breathe', '#46e0c8', 'M3 7.2h10.5a2.7 2.7 0 10-2.7-2.7h-2a4.7 4.7 0 114.7 4.7H3zm0 4h15a3.5 3.5 0 11-3.5 3.5h2a1.5 1.5 0 101.5-1.5H3zm0 4h7v2H3z', 'ZEN'],
  ['journal', 'Good thing', '#ff8f6b', 'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z', 'NOTED'],
];
const DLY_PAY = { fit: 15, water: 10, sleep: 10, mood: 10, breathe: 10, journal: 10 }, CHECKIN_N = 4, CHECKIN_PAY = 25;
const dIcon = (id, cls = '') => { const x = DLY.find(d => d[0] === id); return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${x[3]}" fill="currentColor" fill-rule="evenodd"/></svg>`; };
const CAM_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3.5h6L16.6 6H20a1.5 1.5 0 011.5 1.5v11A1.5 1.5 0 0120 20H4a1.5 1.5 0 01-1.5-1.5v-11A1.5 1.5 0 014 6h3.4zM12 8.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9zm0 2a2.5 2.5 0 110 5 2.5 2.5 0 010-5z" fill="currentColor" fill-rule="evenodd"/></svg>';
const PIC_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3.5h16A1.5 1.5 0 0121.5 5v14a1.5 1.5 0 01-1.5 1.5H4A1.5 1.5 0 012.5 19V5A1.5 1.5 0 014 3.5zm.5 2v11.3l4.3-4.6 3.1 3.2 4-5.2 3.6 4.6V5.5zM8 7a2 2 0 110 4 2 2 0 010-4z" fill="currentColor" fill-rule="evenodd"/></svg>';
const FLIP_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 11a7.5 7.5 0 0113.2-4.6M19.5 13a7.5 7.5 0 01-13.2 4.6M18.5 2.5v4.4h-4.4M5.5 21.5v-4.4h4.4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SEND_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 3a3 3 0 11-2.8 4l-5.5 3.2a3 3 0 010 1.6l5.5 3.2a3 3 0 11-1 1.7l-5.5-3.2a3 3 0 110-3l5.5-3.2A3 3 0 0117 3z" fill="currentColor"/></svg>';
const ARROW = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d ? 'M9 5l7 7-7 7' : 'M15 5l-7 7 7 7'}" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const MOODS = [[1, 'Rough', '#8f9bff', 'M8 17.2c1-1.7 2.4-2.5 4-2.5s3 .8 4 2.5'], [2, 'Meh', '#b49cff', 'M8.5 16.4c1.1-.8 2.3-1.1 3.5-1.1s2.4.3 3.5 1.1'],
  [3, 'Okay', '#cfc9ee', 'M8.5 15.6h7'], [4, 'Good', '#5fe0b5', 'M8 14.6c1 1.7 2.4 2.5 4 2.5s3-.8 4-2.5'], [5, 'Great', '#ffd23f', 'M7.4 13.6h9.2c-.6 2.7-2.4 4.1-4.6 4.1s-4-1.4-4.6-4.1z']];
const face = m => { const x = MOODS[m - 1]; return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="${x[2]}"/><circle cx="8.8" cy="10" r="1.4" fill="#0c0a1d"/><circle cx="15.2" cy="10" r="1.4" fill="#0c0a1d"/><path d="${x[3]}" ${m === 5 ? 'fill="#0c0a1d"' : 'fill="none" stroke="#0c0a1d" stroke-width="1.8" stroke-linecap="round"'}/></svg>`; };
const GOOD_ASK = ['Something that made you smile', 'Someone who helped you out', 'Something you did well', "Something you're looking forward to", 'A song, game or show you liked', 'Something new you learned', 'A small win, any size'];
const hm2m = v => +v.slice(0, 2) * 60 + +v.slice(3);
const sleepMin = s => (s ? (hm2m(s.w) - hm2m(s.b) + 1440) % 1440 : 0);
const fmtHM = m => `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`;
const wday = (k = today()) => S.well.days[k] || (S.well.days[k] = {});
const fitBridge = () => !!(window.LevelUpAndroid && typeof LevelUpAndroid.createFitPoll === 'function');

let dlyRev = 0, dlyMemo = null;   // dlyRev++ on every write to S.fits, S.fitKept or S.well (erase/import replace S, which also invalidates)
function dayDone(k, fd) {
  const w = S.well.days[k] || {};
  return { fit: fd.has(k), water: (w.w || 0) >= (w.wg || S.well.goal), sleep: !!w.s, mood: !!w.m, breathe: (w.b || 0) > 0, journal: !!w.g };
}
function dlyLedger() {
  const t = today();
  if (dlyMemo && dlyMemo.rev === dlyRev && dlyMemo.s === S && dlyMemo.t === t) return dlyMemo.v;
  const fd = new Set(S.fits.map(f => f.day)); for (const k of Object.keys(S.fitKept)) fd.add(k);
  const n = { fit: 0, water: 0, sleep: 0, mood: 0, breathe: 0, journal: 0 }, combo = new Set();
  let coins = 0, breaths = 0;
  for (const k of new Set([...fd, ...Object.keys(S.well.days)])) {
    const d = dayDone(k, fd); let c = 0;
    for (const [id] of DLY) if (d[id]) { n[id]++; c++; coins += DLY_PAY[id]; }
    if (c >= CHECKIN_N) { combo.add(k); coins += CHECKIN_PAY; }
    breaths += (S.well.days[k] || {}).b || 0;
  }
  const run = set => { let x = 0, d = new Date(); if (!set.has(ymd(d))) d = addDays(d, -1); while (set.has(ymd(d))) { x++; d = addDays(d, -1); } return x; };
  const best = set => { let b = 0, x = 0, prev = null; for (const k of [...set].sort()) { x = prev && ymd(addDays(new Date(prev + 'T12:00:00'), 1)) === k ? x + 1 : 1; prev = k; b = Math.max(b, x); } return b; };
  const v = { coins, n, fd, combo, breaths, today: dayDone(t, fd), fitRun: run(fd), fitBest: best(fd), comboRun: run(combo), comboBest: best(combo) };
  dlyMemo = { rev: dlyRev, s: S, t, v };
  return v;
}
// every Daily write goes through here: what got done (or undone) today is diffed, so the floaters say exactly what was earned
function dlyChange(fn) {
  const k = today(), a = dlyLedger(), was = a.today, hadCombo = a.combo.has(k);
  fn(); dlyRev++;
  if (S.well.days[k] && !Object.keys(S.well.days[k]).length) delete S.well.days[k];
  save();
  const b = dlyLedger(), got = DLY.filter(([id]) => b.today[id] && !was[id]), lost = DLY.filter(([id]) => !b.today[id] && was[id]), combo = !hadCombo && b.combo.has(k);
  for (const [id, , , , word] of got) floater(`${word} +${DLY_PAY[id]}`);
  if (combo) { floater(`CHECK-IN +${CHECKIN_PAY}`); Sound.clear(); buzz([15, 40, 15, 40, 30]); } else if (got.length) { Sound.check(); buzz(12); } else if (lost.length) Sound.uncheck();
  renderToday(); renderDaily(); afterChange();
  return { got: got.length, lost: lost.length, combo };
}

/* photos: IndexedDB 'levelup-fits', one record per fit {id, full: JPEG Blob (<=1080px), thumb: JPEG Blob (<=360px)} */
const FitDB = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    if (!window.indexedDB) throw new Error('no IndexedDB');
    const r = indexedDB.open('levelup-fits', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('photos', { keyPath: 'id' });
    r.onsuccess = () => { const db = r.result; db.onversionchange = () => { db.close(); dbp = null; }; res(db); };
    r.onerror = () => rej(r.error || new Error('IndexedDB failed')); r.onblocked = () => rej(new Error('IndexedDB blocked'));
  }).catch(e => { dbp = null; throw e; }));
  const run = (mode, fn) => open().then(db => new Promise((res, rej) => {
    const t = db.transaction('photos', mode), q = fn(t.objectStore('photos')); let out;
    if (q) q.onsuccess = () => { out = q.result; };
    t.oncomplete = () => res(out); t.onerror = t.onabort = () => rej(t.error || new Error('IndexedDB aborted'));
  }));
  return { put: r => run('readwrite', s => s.put(r)), get: id => run('readonly', s => s.get(id)), del: id => run('readwrite', s => s.delete(id)),
    keys: () => run('readonly', s => s.getAllKeys()), clear: () => run('readwrite', s => s.clear()) };
})();
const fitURLs = {};   // id -> {thumb, full}: promises of object URLs, null when the photo isn't on this phone
function fitSrc(id, sz = 'thumb') {
  const c = fitURLs[id] || (fitURLs[id] = {});
  return c[sz] || (c[sz] = FitDB.get(id).then(r => (r && r[sz] instanceof Blob ? URL.createObjectURL(r[sz]) : null)).catch(() => null));
}
function fitForget(id) { const c = fitURLs[id]; if (c) for (const p of Object.values(c)) p.then(u => u && URL.revokeObjectURL(u)); delete fitURLs[id]; }
// <span class="ph"><img data-fit=id></span>: the shirt shows until (unless) the photo loads
const ph = (id, sz = 'thumb', cls = '') => `<span class="ph${cls}">${dIcon('fit')}<img data-fit="${esc(id)}" data-sz="${sz}" alt=""></span>`;
function hydrate(root) {
  root.querySelectorAll('img[data-fit]:not([src])').forEach(im => fitSrc(im.dataset.fit, im.dataset.sz).then(u => { if (u && im.isConnected) im.src = u; }));
}
// decoded and upright (the EXIF turn applied), from a picked file
async function loadImg(blob) {
  if (window.createImageBitmap) try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch (e) {}
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(blob), im = new Image();
    im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('bad image')); }; im.src = u;
  });
}
function grab(src, max) {   // a canvas copy, longest edge <= max
  const w0 = src.videoWidth || src.naturalWidth || src.width, h0 = src.videoHeight || src.naturalHeight || src.height, k = Math.min(1, max / Math.max(w0, h0));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
const jpeg = (c, q) => new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('encode failed'))), 'image/jpeg', q));
async function shots(src) { const c = grab(src, 1080); return { full: await jpeg(c, 0.86), thumb: await jpeg(grab(c, 360), 0.78) }; }
// the server takes <= 400 KB a photo: step the quality down, then the size
async function small(blob, cap = 380 * 1024) {
  const im = await loadImg(blob);
  for (let max = 900; ; max = Math.round(max * 0.8)) {
    const c = grab(im, max);
    for (const q of [0.8, 0.7, 0.6]) { const b = await jpeg(c, q); if (b.size <= cap || max < 300) return b; }
  }
}
const b64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
// 2-3 fits side by side, lettered like the voting page, for "share the photo instead"
async function collage(ids) {
  const ims = []; for (const id of ids) { const r = await FitDB.get(id).catch(() => null); if (r && r.full) ims.push(await loadImg(r.full)); }
  if (!ims.length) throw new Error('no photos');
  if (ims.length === 1) return small(await jpeg(grab(ims[0], 1080), 0.86), 900 * 1024);
  const W = 600, H = 800, G = 12, c = document.createElement('canvas'); c.width = ims.length * W + (ims.length + 1) * G; c.height = H + 2 * G;
  const g = c.getContext('2d'); g.fillStyle = '#0c0a1d'; g.fillRect(0, 0, c.width, c.height);
  ims.forEach((im, i) => {
    const w0 = im.naturalWidth || im.width, h0 = im.naturalHeight || im.height, k = Math.max(W / w0, H / h0), x = G + i * (W + G);
    g.save(); g.beginPath(); g.rect(x, G, W, H); g.clip(); g.drawImage(im, x + (W - w0 * k) / 2, G + (H - h0 * k) / 2, w0 * k, h0 * k); g.restore();
    g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(x + 46, G + H - 46, 30, 0, 7); g.fill();
    g.fillStyle = '#0c0a1d'; g.font = 'italic 800 38px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ABC'[i], x + 46, G + H - 44);
  });
  return small(await jpeg(c, 0.86), 900 * 1024);
}

/* ---- home strip + the Daily tab */
function renderToday() {
  const L = dlyLedger(), d = L.today, n = DLY.filter(([id]) => d[id]).length, el = $('dstrip');
  el.classList.toggle('done', n >= CHECKIN_N);
  el.innerHTML = `<span class="tx"><b>Daily check-in</b><small>${n >= CHECKIN_N ? `Done · +${CHECKIN_PAY} bonus` : `${n}/${DLY.length} · ${CHECKIN_N - n} more for +${CHECKIN_PAY}`}</small></span>
    <span class="dots">${DLY.map(([id, , c]) => `<i class="${d[id] ? 'on' : ''}" style="--c:${c}">${dIcon(id)}</i>`).join('')}</span>${CHEV_R}`;
  el.setAttribute('aria-label', `Daily check-in: ${n} of ${DLY.length} done today. Open Daily`);
  $('navDaily').classList.toggle('dot', n < CHECKIN_N && new Date().getHours() >= 9);
}
$('dstrip').onclick = () => document.querySelector('.nav button[data-v=daily]').click();

let lbAll = false;
function renderDaily() {
  if (!$('v-daily').classList.contains('on')) return;
  const L = dlyLedger(), k = today(), d = L.today, w = S.well.days[k] || {}, n = DLY.filter(([id]) => d[id]).length;
  $('dlyCount').textContent = `${n}/${DLY.length}`;
  $('dlyStreak').hidden = !L.comboRun; $('dlyStreakN').textContent = L.comboRun;
  $('dlyStreak').setAttribute('aria-label', `${L.comboRun} check-in ${L.comboRun === 1 ? 'day' : 'days'} in a row`);
  $('ckbar').classList.toggle('clear', n >= CHECKIN_N);
  $('ckbar').innerHTML = DLY.map(([id], i) => `<i class="${i < n ? 'on' : ''}${i === CHECKIN_N - 1 ? ' ck4' : ''}"></i>`).join('');
  $('cknote').textContent = n >= DLY.length ? 'All six. Legendary.' : n >= CHECKIN_N ? `Check-in done: +${CHECKIN_PAY} bonus. ${DLY.length - n} more for all six.` : `Do ${CHECKIN_N} of these today for a +${CHECKIN_PAY} bonus.`;
  // today's fit
  const mine = S.fits.filter(f => f.day === k), f = mine[mine.length - 1], fc = $('fitCard');
  const streak = L.fitRun ? `<span class="fstk">${FLAME}${L.fitRun} day fit streak</span>` : '';
  fc.className = `fitc${f ? ' has' : ''}`;
  fc.innerHTML = f
    ? `<button class="fitc-pic" data-d="view" data-id="${f.id}" aria-label="Today's fit, full screen">${ph(f.id, 'thumb')}${mine.length > 1 ? `<em>${mine.length}</em>` : ''}</button>
      <div class="fitc-tx"><span class="label">Today's fit</span><b>Locked in</b>${f.vibe ? `<span class="vchip">${f.vibe}</span>` : ''}${streak}
      <div class="fitc-act"><button class="fbtn" data-d="cam">${CAM_ICON}Another</button><button class="fbtn ask" data-d="ask">${SEND_ICON}Ask friends</button></div></div>`
    : `<div class="fitc-hd"><span class="ic">${dIcon('fit')}</span><div><span class="label">Daily Fit · +${DLY_PAY.fit}</span><b>Snap today's fit</b>${streak || '<small>Prop your phone up, set the timer, strike a pose.</small>'}</div></div>
      <div class="fitc-act"><button class="fbtn main" data-d="cam">${CAM_ICON}Snap</button><button class="fbtn" data-d="pick">${PIC_ICON}Upload</button></div>`;
  // wellness tiles
  const glasses = w.w || 0, goal = w.wg || S.well.goal, sl = w.s, mood = w.m;
  const tile = (id, val, sub, act) => `<button class="wtile${d[id] ? ' on' : ''}" data-d="${act}" style="--c:${DLY.find(x => x[0] === id)[2]}"><span class="ic">${id === 'mood' && mood ? face(mood) : dIcon(id)}</span>
    <span class="label">${DLY.find(x => x[0] === id)[1]}</span><b>${val}</b><small>${sub}</small>${d[id] ? `<span class="ok">${TICK}</span>` : ''}</button>`;
  $('wtiles').innerHTML = `<div class="water${d.water ? ' on' : ''}" style="--f:${Math.min(100, glasses / goal * 100).toFixed(0)}%">
      <button class="glass" data-d="w+" aria-label="Add a glass of water"><i></i>${dIcon('water', 'gd')}</button>
      <div class="tx"><span class="label">Water</span><b>${glasses}<small> / ${goal}<i> glasses</i></small></b><button class="act quiet" data-d="wgoal">Goal: ${S.well.goal}</button></div>
      <button class="wbtn" data-d="w-" aria-label="Remove a glass"${glasses ? '' : ' disabled'}>&minus;</button><button class="wbtn plus" data-d="w+" aria-label="Add a glass">+</button></div>
    <div class="wgrid">${tile('sleep', sl ? fmtHM(sleepMin(sl)) : 'Log it', sl ? `${sl.b} to ${sl.w}` : 'Last night', 'sleep')}
    ${tile('mood', mood ? MOODS[mood - 1][1] : 'How are you?', mood ? (w.n ? esc(w.n) : 'Checked in') : 'Tap a face', 'mood')}
    ${tile('breathe', w.b ? `${w.b} min` : '1 min', w.b ? 'Calm unlocked' : 'Box breathing', 'breathe')}
    ${tile('journal', w.g ? 'Written' : 'One line', w.g ? esc(w.g) : GOOD_ASK[new Date().getDay()], 'journal')}</div>`;
  renderPolls();
  // lookbook: newest first, by month
  const all = S.fits.slice().reverse(), show = lbAll ? all : all.slice(0, 18);
  $('lbCount').textContent = all.length ? all.length : '';
  let h = '', mon = '';
  for (const x of show) {
    const m = fmtDate(x.day, { month: 'long', year: 'numeric' });
    if (m !== mon) { if (mon) h += '</div>'; mon = m; h += `<div class="lbm label">${m}</div><div class="lb">`; }
    h += `<button class="lbi" data-d="view" data-id="${x.id}" aria-label="Fit from ${fmtDate(x.day)}${x.vibe ? ', ' + x.vibe : ''}">${ph(x.id)}<small>${fmtDate(x.day, { weekday: 'short', day: 'numeric' })}${x.vibe ? ` · ${x.vibe}` : ''}</small></button>`;
  }
  if (mon) h += '</div>';
  $('lookbook').innerHTML = all.length ? h + (all.length > show.length ? `<button class="act" data-d="lball">Show all ${all.length}</button>` : '')
    : '<p class="empty">Your fits land here. One a day and you\'ve got a style history.</p>';
  hydrate($('v-daily'));
}
const pollLeft = p => { const d = Math.ceil((p.exp - Date.now()) / 864e5); return p.gone || d <= 0 ? 'Closed' : d === 1 ? 'Last day' : `${d} days left`; };
function renderPolls() {
  const el = $('polls'), list = S.polls.slice().reverse();
  if (!list.length) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="sec"><h2>Friend votes</h2></div><div class="rows">' + list.map(p => {
    const r = p.res, open = !p.gone && p.exp > Date.now(), busy = !!pollReq[p.id], top = r && r.total ? Math.max(...r.counts) : -1;
    const bars = r ? r.choices.map((c, i) => { const pc = r.total ? Math.round(r.counts[i] / r.total * 100) : 0; return `<div class="pbar${r.counts[i] === top ? ' lead' : ''}"><span>${esc(c)}</span><i><u style="width:${pc}%"></u></i><b>${pc}%</b></div>`; }).join('') : '';
    return `<div class="poll${open ? '' : ' closed'}"><div class="poll-hd"><b>${esc(p.title || 'Which fit should I wear?')}</b><small>${r ? `${r.total} ${r.total === 1 ? 'vote' : 'votes'} · ` : ''}${pollLeft(p)}</small></div>
      <div class="pthumbs">${p.fits.map((id, i) => `<span class="pt">${ph(id)}${p.fits.length > 1 ? `<em>${'ABC'[i]}</em>` : ''}</span>`).join('')}</div>
      ${r ? bars : `<p class="dim">${open ? 'No votes yet. Send the link, then check back.' : 'Closed before any votes came in.'}</p>`}
      ${p.err && open ? `<p class="dim">${esc(POLL_ERR[p.err] || POLL_ERR.other)}</p>` : ''}
      ${open ? `<div class="poll-act"><button class="act" data-d="pref" data-id="${p.id}"${busy || !fitBridge() ? ' disabled' : ''}>${busy ? 'Checking...' : 'Check votes'}</button><button class="act quiet" data-d="psend" data-id="${p.id}">Send again</button></div>` : ''}</div>`;
  }).join('') + '</div>';
  hydrate(el);
}
$('v-daily').onclick = e => {
  const b = e.target.closest('[data-d]'); if (!b || b.disabled) return;
  const a = b.dataset.d;
  if (a === 'cam') { Sound.tap(); camOpen(); }
  else if (a === 'pick') { Sound.tap(); $('fitFile').click(); }
  else if (a === 'view') { Sound.tap(); viewOpen(b.dataset.id); }
  else if (a === 'ask') { Sound.tap(); askSheet(); }
  else if (a === 'w+' || a === 'w-') water(a === 'w+' ? 1 : -1, b);
  else if (a === 'wgoal') { Sound.tap(); goalSheetW(); }
  else if (a === 'sleep') { Sound.tap(); sleepSheet(); }
  else if (a === 'mood') { Sound.tap(); moodSheet(); }
  else if (a === 'breathe') { Sound.tap(); brOpen(); }
  else if (a === 'journal') { Sound.tap(); goodSheet(); }
  else if (a === 'lball') { lbAll = true; renderDaily(); }
  else if (a === 'pref') { Sound.tap(); pollRefresh(b.dataset.id, true); }
  else if (a === 'psend') { Sound.tap(); const p = S.polls.find(x => x.id === b.dataset.id); if (p) sendLink(p); }
};

/* ---- water, sleep, mood, one good thing */
function water(dn, btn) {
  const k = today(), cur = (S.well.days[k] || {}).w || 0;
  if (cur + dn < 0 || cur + dn > 20) { Sound.nope(); return; }
  const r = dlyChange(() => { const d = wday(k); d.w = cur + dn; d.wg = S.well.goal; if (!d.w) { delete d.w; delete d.wg; } });
  if (dn > 0) { if (!r.got && !r.combo) Sound.drop(); buzz(10); bubbles(); }
  const g = $('wtiles').querySelector('.glass'); if (g && dn > 0) { g.classList.remove('slosh'); void g.offsetWidth; g.classList.add('slosh'); }
  if (btn && btn.isConnected) btn.focus({ preventScroll: true }); else { const nb = $('wtiles').querySelector(`[data-d="${dn > 0 ? 'w+' : 'w-'}"]:not(.glass)`); if (nb && !nb.disabled) nb.focus({ preventScroll: true }); }
}
function bubbles() {
  const g = $('wtiles').querySelector('.glass'); if (!g || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (let i = 0; i < 6; i++) { const b = document.createElement('span'); b.className = 'bub'; b.style.left = `${15 + Math.random() * 70}%`; b.style.animationDelay = `${i * 60}ms`; g.appendChild(b); b.addEventListener('animationend', () => b.remove()); setTimeout(() => b.remove(), 1500); }
}
function goalSheetW() {
  openSheet(`<h2>Water goal</h2><p class="dim">Glasses a day. Pick what feels right for you.</p>
    <div class="lim" id="wg">${[4, 5, 6, 7, 8, 9, 10, 11, 12].map(g => `<button data-g="${g}" class="${g === S.well.goal ? 'on' : ''}" aria-pressed="${g === S.well.goal}"><b>${g}</b></button>`).join('')}</div>
    <span class="label">This week</span><div class="wkc bars wat">${weekCols(k => { const w = S.well.days[k] || {}; const f = Math.min(1, (w.w || 0) / (w.wg || S.well.goal)); return `<i style="--h:${(f * 100).toFixed(0)}%" class="${f >= 1 ? 'hit' : ''}"></i>`; })}</div>
    <button class="go" id="wgOk">Done</button>`, el => {
    el.querySelectorAll('[data-g]').forEach(b => b.onclick = () => {
      Sound.tap(); const g = +b.dataset.g;
      dlyChange(() => { S.well.goal = g; const d = S.well.days[today()]; if (d && d.w) d.wg = g; });
      el.querySelectorAll('[data-g]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
    });
    el.querySelector('#wgOk').onclick = closeSheet;
  });
}
// the last 7 days, oldest first: each column a day letter and whatever cell(k) draws
const weekCols = cell => Array.from({ length: 7 }, (_, i) => { const d = addDays(new Date(), i - 6), k = ymd(d); return `<span class="${i === 6 ? 'today' : ''}">${cell(k, d)}<small>${i === 6 ? 'Today' : DAY[d.getDay()]}</small></span>`; }).join('');
function sleepSheet() {
  const k = today(), cur = (S.well.days[k] || {}).s, last = cur || Object.keys(S.well.days).sort().reverse().map(x => S.well.days[x].s).find(Boolean) || { b: '22:00', w: '07:00' };
  const bars = () => weekCols(x => { const m = sleepMin((S.well.days[x] || {}).s); return `<i class="${m ? 'hit' : ''}" style="--h:${Math.min(100, m / 720 * 100).toFixed(0)}%"><b>${m ? (m / 60).toFixed(m % 60 ? 1 : 0) : ''}</b></i>`; });
  openSheet(`<h2>Sleep</h2><p class="dim">Last night. Just a log: notice how you feel after more or less.</p>
    <div class="slp"><label class="field"><span class="label">Went to bed</span><input type="time" id="sB" value="${last.b}"></label><label class="field"><span class="label">Woke up</span><input type="time" id="sW" value="${last.w}"></label></div>
    <div class="slp-h"><b id="sH"></b><small>of sleep</small></div>
    <button class="go" id="sOk">${cur ? 'Update' : 'Log sleep'}</button>${cur ? '<div class="row2"><span></span><button class="act quiet" id="sDel">Clear today</button></div>' : ''}
    <span class="label">This week</span><div class="wkc bars" id="sBars">${bars()}</div><p class="dim sm">Hours slept, by the day you woke up.</p>`, el => {
    const B = el.querySelector('#sB'), W = el.querySelector('#sW'), ok = el.querySelector('#sOk');
    const paint = () => { const good = /^\d\d:\d\d/.test(B.value) && /^\d\d:\d\d/.test(W.value); ok.disabled = !good; el.querySelector('#sH').textContent = good ? fmtHM(sleepMin({ b: B.value.slice(0, 5), w: W.value.slice(0, 5) })) : '--'; };
    B.oninput = W.oninput = paint; paint();
    ok.onclick = () => { dlyChange(() => { wday(k).s = { b: B.value.slice(0, 5), w: W.value.slice(0, 5) }; }); closeSheet(); };
    const del = el.querySelector('#sDel'); if (del) del.onclick = () => { dlyChange(() => { delete wday(k).s; }); closeSheet(); };
  });
}
function moodSheet() {
  const k = today(), cur = S.well.days[k] || {}; let pick = cur.m || 0;
  openSheet(`<h2>Mood</h2><p class="dim">How's today going? Every answer counts.</p>
    <div class="moods" role="radiogroup" aria-label="Mood">${MOODS.map(([m, n]) => `<button role="radio" data-m="${m}" aria-checked="${m === pick}" class="${m === pick ? 'on' : ''}">${face(m)}<small>${n}</small></button>`).join('')}</div>
    <p class="dim kind" id="mKind"${pick === 1 ? '' : ' hidden'}>Rough days happen. Talking to someone you trust can help.</p>
    <label class="field"><span class="label">What's up? (optional)</span><input id="mN" maxlength="80" value="${esc(cur.n || '')}" placeholder="One line" autocomplete="off"></label>
    <button class="go" id="mOk"${pick ? '' : ' disabled'}>${cur.m ? 'Update' : 'Check in'}</button>${cur.m ? '<div class="row2"><span></span><button class="act quiet" id="mDel">Clear today</button></div>' : ''}
    <span class="label">This week</span><div class="wkc faces">${weekCols(x => { const m = (S.well.days[x] || {}).m; return m ? face(m) : '<i></i>'; })}</div>`, el => {
    el.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
      pick = +b.dataset.m; Sound.tap();
      el.querySelectorAll('[data-m]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
      el.querySelector('#mKind').hidden = pick !== 1; el.querySelector('#mOk').disabled = false;
    });
    el.querySelector('#mOk').onclick = () => { const n = el.querySelector('#mN').value.replace(/\s+/g, ' ').trim().slice(0, 80); dlyChange(() => { const d = wday(k); d.m = pick; if (n) d.n = n; else delete d.n; }); closeSheet(); };
    const del = el.querySelector('#mDel'); if (del) del.onclick = () => { dlyChange(() => { const d = wday(k); delete d.m; delete d.n; }); closeSheet(); };
  });
}
function goodSheet() {
  const k = today(), cur = (S.well.days[k] || {}).g || '';
  const past = Object.keys(S.well.days).filter(x => x !== k && S.well.days[x].g).sort().reverse().slice(0, 7);
  openSheet(`<h2>One good thing</h2><p class="dim">${GOOD_ASK[new Date().getDay()]}?</p>
    <label class="field"><span class="label">Today</span><input id="gT" maxlength="120" value="${esc(cur)}" placeholder="Big or tiny, it counts" autocomplete="off"></label>
    <button class="go" id="gOk"${cur ? '' : ' disabled'}>${cur ? 'Update' : 'Save'}</button>${cur ? '<div class="row2"><span></span><button class="act quiet" id="gDel">Clear today</button></div>' : ''}
    ${past.length ? `<span class="label">Lately</span><div class="glist">${past.map(x => `<p><small>${fmtDate(x)}</small>${esc(S.well.days[x].g)}</p>`).join('')}</div>` : ''}
    <p class="st-foot">Private: it stays on this phone (and in your backups).</p>`, el => {
    const T = el.querySelector('#gT'), ok = el.querySelector('#gOk');
    T.oninput = () => { ok.disabled = !T.value.trim(); };
    T.onkeydown = e => { if (e.key === 'Enter' && !ok.disabled) ok.click(); };
    ok.onclick = () => { const v = T.value.replace(/\s+/g, ' ').trim().slice(0, 120); dlyChange(() => { wday(k).g = v; }); closeSheet(); };
    const del = el.querySelector('#gDel'); if (del) del.onclick = () => { dlyChange(() => { delete wday(k).g; }); closeSheet(); };
  });
}

/* ---- full-screen Daily screens (#ov): camera, review, photo, breathe. Below sheets, above everything else */
let ov = null, ovRun = 0;   // ov: the open screen (never saved); ovRun: bumps to cancel a running camera or breathing loop
const REDUCED = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function ovOpen(o) { closeSheet(); if (ov) { ovStop(); if (ov.url) URL.revokeObjectURL(ov.url); } ov = o; $('ov').hidden = false; ovRender(); }
function ovStop() {
  ovRun++;
  if (!ov) return;
  if (ov.stream) { ov.stream.getTracks().forEach(t => t.stop()); ov.stream = null; }
  const v = $('ovVid'); if (v) { try { v.pause(); } catch (e) {} v.srcObject = null; }
  clearInterval(ov.tick); ov.tick = null; ov.t0 = 0; ov.run = 0;
  wake(woAwake);
}
function ovClose() {
  if (!ov) return;
  ovStop(); if (ov.url) URL.revokeObjectURL(ov.url);
  ov = null; $('ov').hidden = true; $('ovIn').innerHTML = '';
}
const ovTop = (mid = '', right = '<span></span>') => `<div class="pu-top"><button class="pu-x" data-o="close" aria-label="Close">${X_ICON}</button><div class="mid">${mid}</div>${right}</div>`;
function ovRender() {
  const o = ov, el = $('ovIn'); let h = '';
  $('ov').className = `pu ov ${o.kind}${['cam', 'review', 'view'].includes(o.step) ? ' live' : ''}`;
  if (o.step === 'cam') {
    h = ovTop(`<b>Snap your fit</b><span id="fcTm">${S.fitCam.timer ? `${S.fitCam.timer}s timer` : 'No timer'}</span>`)
      + `<div class="pu-stage fcam${o.mirror ? ' mirror' : ''}" data-load="${o.ready ? 0 : 1}"><video id="ovVid" playsinline muted></video><div class="fc-num" id="fcNum" aria-hidden="true"></div><div class="fc-flash" id="fcFlash"></div>
        <div class="pu-load"><i></i>Starting the camera...</div></div>
      <div class="fc-tm" role="radiogroup" aria-label="Self-timer">${[0, 3, 5, 10].map(t => `<button role="radio" data-o="tm" data-t="${t}" aria-checked="${t === S.fitCam.timer}" class="${t === S.fitCam.timer ? 'on' : ''}">${t ? t + 's' : 'Off'}</button>`).join('')}</div>
      <div class="fc-ctl"><button class="fc-side" data-o="pick" aria-label="Pick from your photos">${PIC_ICON}</button><button class="fc-shut" id="fcShut" data-o="shoot" aria-label="Take the photo"><i></i></button><button class="fc-side" data-o="flip" aria-label="Switch camera">${FLIP_ICON}</button></div>
      <p class="fc-tip" id="fcTip">${S.fitCam.timer ? 'Prop the phone up, tap, step back, pose' : 'Tap to snap'}</p><p class="sr" id="fcSay" aria-live="assertive"></p>`;
  } else if (o.step === 'review' || o.step === 'view') {
    const f = o.step === 'view' && S.fits.find(x => x.id === o.id), list = S.fits.slice().reverse(), i = f ? list.indexOf(f) : -1, vibe = f ? f.vibe : o.vibe;
    h = ovTop(f ? `<b>${fmtDate(f.day, { weekday: 'long', day: 'numeric', month: 'short' })}</b><span>${i + 1} of ${list.length}</span>` : '<b>Your fit</b><span>Looking good</span>')
      + `<div class="pu-stage fpic">${f ? ph(f.id, 'full', ' big') : `<img src="${o.url}" alt="Your fit">`}
        ${f && list.length > 1 ? `<button class="fnav l" data-o="prev" aria-label="Newer fit"${i <= 0 ? ' disabled' : ''}>${ARROW(0)}</button><button class="fnav r" data-o="next" aria-label="Older fit"${i >= list.length - 1 ? ' disabled' : ''}>${ARROW(1)}</button>` : ''}</div>
      <div class="vibes" role="group" aria-label="Vibe, optional"><span class="label">Vibe</span>${VIBES.map(v => `<button data-o="vibe" data-v="${v}" aria-pressed="${v === vibe}" class="${v === vibe ? 'on' : ''}">${v}</button>`).join('')}</div>
      <div class="pu-act">${f ? `<div class="pair2"><button class="ghost" data-o="del">Delete</button><button class="go" data-o="ask">${SEND_ICON}Ask friends</button></div>`
        : `<button class="go" data-o="save">${S.fits.some(x => x.day === today()) ? 'Save fit' : `Save fit · +${DLY_PAY.fit}`}</button><button class="ghost" data-o="${o.from === 'cam' ? 'retake' : 'repick'}">${o.from === 'cam' ? 'Retake' : 'Pick another'}</button>`}</div>`;
  } else if (o.step === 'err') {
    const E = { denied: ["Camera's off", 'Allow the camera in App info > Permissions > Camera, or pick a photo instead.'], busy: ['Camera busy', 'Another app is using the camera. Close it and try again, or pick a photo.'], nocam: ['No camera', "Couldn't start a camera on this phone. Pick a photo instead."] }[o.err] || ['No camera', ''];
    h = ovTop() + `<div class="pu-body"><div class="wo-kick">Daily Fit</div><h2 class="pu-hd sm">${E[0]}</h2><p class="pu-sub">${E[1]}</p></div>
      <div class="pu-act"><button class="go" data-o="pick">${PIC_ICON}Pick a photo</button>${o.err === 'denied' && scrOn() ? '<button class="ghost" data-o="settings">Open settings</button>' : ''}${o.err === 'nocam' ? '' : '<button class="ghost" data-o="retake">Try again</button>'}</div>`;
  } else if (o.kind === 'breathe') {
    const done = o.step === 'done';
    h = ovTop(`<b>Breathe</b><span>${done ? 'Done' : 'Box breathing · 1 min'}</span>`)
      + `<div class="br${o.run ? ' run' : ''}"><div class="br-box"><i class="br-orb" id="brOrb"></i><i class="br-dot" id="brDot"></i>
        <div class="br-say"><b id="brSay">${done ? 'Nice.' : o.run ? '' : 'Ready?'}</b><span id="brN">${done ? 'One calm minute' : o.run ? '' : 'In 4 · hold 4 · out 4 · hold 4'}</span></div></div>
        <p class="br-round" id="brRound">${done ? ((S.well.days[today()] || {}).b > 1 ? 'Another calm minute, logged' : `+${DLY_PAY.breathe} coins`) : o.note ? esc(o.note) : 'Four rounds. Follow the dot around the box.'}</p><p class="sr" id="brSr" aria-live="polite"></p></div>
      <div class="pu-act"><div class="br-tg"><button class="act" data-o="snd">Sound: ${S.sound === false ? 'Off' : 'On'}</button><button class="act" data-o="bz">Buzz: ${S.well.bz ? 'On' : 'Off'}</button></div>
        ${o.run ? '<button class="ghost" data-o="brstop">Stop</button>' : done ? '<button class="go" data-o="close">Done</button><button class="ghost" data-o="brgo">Again</button>' : '<button class="go" data-o="brgo">Start</button>'}</div>`;
  }
  el.innerHTML = h;
  if (o.step === 'view') hydrate(el);
  if (o.step === 'cam' && o.stream) { const v = $('ovVid'); v.srcObject = o.stream; v.play().catch(() => {}); }
  if (o.step !== 'cam') el.focus({ preventScroll: true });
}
$('ovIn').onclick = e => {
  const b = e.target.closest('[data-o]'); if (!b || b.disabled || !ov) return;
  const a = b.dataset.o, o = ov;
  if (a !== 'shoot' && a !== 'vibe') Sound.tap();
  if (a === 'close') ovClose();
  else if (a === 'shoot') camShoot();
  else if (a === 'tm') { if (o.t0) camCancel(); S.fitCam.timer = +b.dataset.t; save(); camPaint(); }
  else if (a === 'flip') { if (o.t0) camCancel(); S.fitCam.facing = S.fitCam.facing === 'user' ? 'environment' : 'user'; save(); camStart(); }
  else if (a === 'pick' || a === 'repick') $('fitFile').click();
  else if (a === 'retake') camOpen();
  else if (a === 'settings') { let ok = false; try { ok = LevelUpAndroid.openScreenTimeSettings('appinfo') === true; } catch (e) {} if (!ok) showNote("Couldn't open Settings", 'Open Settings > Apps > LEVEL UP > Permissions', FIT_NOTE, 'Camera'); }
  else if (a === 'vibe') {
    Sound.tap(); const v = b.dataset.v, f = o.step === 'view' && S.fits.find(x => x.id === o.id);
    if (f) { f.vibe = f.vibe === v ? '' : v; dlyRev++; save(); renderDaily(); } else o.vibe = o.vibe === v ? '' : v;
    const now = f ? f.vibe : o.vibe; $('ovIn').querySelectorAll('[data-o=vibe]').forEach(x => { x.classList.toggle('on', x.dataset.v === now); x.setAttribute('aria-pressed', x.dataset.v === now); });
  }
  else if (a === 'save') fitSave();
  else if (a === 'prev' || a === 'next') { const list = S.fits.slice().reverse(), i = list.findIndex(x => x.id === o.id), n = list[i + (a === 'next' ? 1 : -1)]; if (n) { o.id = n.id; ovRender(); } }
  else if (a === 'del') fitDelete(o.id);
  else if (a === 'ask') { const id = o.id; ovClose(); askSheet([id]); }
  else if (a === 'brgo') brStart();
  else if (a === 'brstop') { brStop('Stopped early. Finish the whole minute to log it.'); }
  else if (a === 'snd') { S.sound = S.sound === false; save(); paintSound(); b.textContent = `Sound: ${S.sound === false ? 'Off' : 'On'}`; }
  else if (a === 'bz') { S.well.bz = !S.well.bz; save(); b.textContent = `Buzz: ${S.well.bz ? 'On' : 'Off'}`; if (S.well.bz) buzz(20); }
};
const FIT_NOTE = dIcon('fit');

/* camera: front by default (prop the phone, step back), a self-timer, the photo saved the right way round (not mirrored) */
function camOpen() { ovOpen({ kind: 'fit', step: 'cam', ready: false }); camStart(); }
async function camStart() {
  const o = ov; if (!o) return;
  if (o.stream) { o.stream.getTracks().forEach(t => t.stop()); o.stream = null; }
  const id = ++ovRun;
  Object.assign(o, { step: 'cam', ready: false, err: null }); ovRender();
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error('no camera API'), { name: 'NotFoundError' });
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: S.fitCam.facing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    if (id !== ovRun || ov !== o) { stream.getTracks().forEach(t => t.stop()); return; }
    o.stream = stream;
    const tr = stream.getVideoTracks()[0], st = tr && tr.getSettings ? tr.getSettings() : {};
    o.mirror = (st.facingMode || S.fitCam.facing) === 'user';
    const v = $('ovVid'); v.srcObject = stream; await v.play();
    if (id !== ovRun || ov !== o) return;
    o.ready = true; wake(true); camPaint();
  } catch (e) {
    if (id !== ovRun || ov !== o) return;
    ovStop();
    const n = e && e.name;
    o.err = n === 'NotAllowedError' || n === 'SecurityError' || n === 'PermissionDeniedError' ? 'denied' : n === 'NotReadableError' || n === 'AbortError' || n === 'TrackStartError' ? 'busy' : 'nocam';
    o.step = 'err'; ovRender(); Sound.nope();
  }
}
function camPaint() {   // in place: the video element must never be rebuilt
  const o = ov, el = $('ovIn'); if (!o || o.step !== 'cam' || !el.querySelector('.fcam')) return;
  const stg = el.querySelector('.fcam'); stg.dataset.load = o.ready ? '0' : '1'; stg.classList.toggle('mirror', !!o.mirror);
  el.querySelectorAll('[data-o=tm]').forEach(b => { const on = +b.dataset.t === S.fitCam.timer; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  $('fcTm').textContent = S.fitCam.timer ? `${S.fitCam.timer}s timer` : 'No timer';
  $('fcShut').classList.toggle('counting', !!o.t0); $('fcShut').setAttribute('aria-label', o.t0 ? 'Cancel the timer' : 'Take the photo');
  $('fcTip').textContent = o.t0 ? 'Tap the button to cancel' : S.fitCam.timer ? 'Prop the phone up, tap, step back, pose' : 'Tap to snap';
}
function camShoot() {
  const o = ov; if (!o || !o.ready) return;
  if (o.t0) { camCancel(); Sound.uncheck(); return; }
  const n = S.fitCam.timer;
  if (!n) { camSnap(); return; }
  Sound.tap(); o.t0 = Date.now(); o.last = 0;
  const num = $('fcNum');
  const step = () => {
    const left = Math.ceil((o.t0 + n * 1000 - Date.now()) / 1000);
    if (left <= 0) { clearInterval(o.tick); o.tick = null; o.t0 = 0; num.textContent = ''; camSnap(); return; }
    if (left !== o.last) {
      o.last = left; num.textContent = left; num.classList.remove('pop'); void num.offsetWidth; num.classList.add('pop'); $('fcSay').textContent = left;
      if (left <= 3) { Sound.beep(); buzz(25); }
    }
  };
  o.tick = setInterval(step, 100); step(); camPaint();
}
function camCancel() { const o = ov; if (!o) return; clearInterval(o.tick); o.tick = null; o.t0 = 0; const n = $('fcNum'); if (n) n.textContent = ''; camPaint(); }
async function camSnap() {
  const o = ov, v = $('ovVid'); if (!o || !v || !v.videoWidth) return;
  const c = grab(v, 1080);   // the frame first, then the camera goes off
  const fl = $('fcFlash'); if (fl) { fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go'); }
  Sound.shutter(); buzz(40);
  const id = ovRun;
  try {
    const full = await jpeg(c, 0.86), thumb = await jpeg(grab(c, 360), 0.78);
    if (ov !== o || id !== ovRun) return;
    ovStop(); toReview({ full, thumb }, 'cam');
  } catch (e) { showNote("Couldn't take the photo", 'Try again, or pick one from your photos.', FIT_NOTE, 'Daily Fit'); }
}
function toReview(p, from) {
  if (ov && ov.url) URL.revokeObjectURL(ov.url);
  if (!ov || ov.kind !== 'fit') ovOpen({ kind: 'fit' });
  Object.assign(ov, { step: 'review', from, full: p.full, thumb: p.thumb, url: URL.createObjectURL(p.full), vibe: ov.vibe || '' });
  ovRender();
}
$('fitFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    if (!/^image\//.test(f.type) && !/\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(f.name)) throw new Error('not an image');
    const im = await loadImg(f), p = await shots(im);
    if (ov && ov.kind === 'fit') ovStop();
    toReview(p, 'pick');
  } catch (err) { Sound.nope(); showNote("Couldn't open that photo", 'Try a JPG or PNG from your gallery.', FIT_NOTE, 'Daily Fit'); }
};
async function fitSave() {
  const o = ov; if (!o || o.saving) return;
  o.saving = true;
  const id = uid() + uid(), at = Date.now();
  let stored = true;
  try { await FitDB.put({ id, full: o.full, thumb: o.thumb, at }); } catch (e) { stored = false; }
  const k = ymd(new Date(at));
  dlyChange(() => { S.fits.push({ id, day: k, at, vibe: o.vibe || '' }); });
  if (ov === o) ovClose();
  if (!stored) showNote('Fit logged, photo not saved', "This phone wouldn't store the photo. Your streak still counts.", FIT_NOTE, 'Daily Fit');
}
function fitDelete(id) {
  const f = S.fits.find(x => x.id === id); if (!f) return;
  const k = today(), last = !S.fits.some(x => x !== f && x.day === f.day);
  if (!confirm(f.day === k && last ? `Delete today's fit? Today's +${DLY_PAY.fit} goes with it.` : f.day < k && last ? 'Delete this photo? That day still counts for your streak.' : 'Delete this photo?')) return;
  const list = S.fits.slice().reverse(), i = list.indexOf(f), next = list[i + 1] || list[i - 1];
  dlyChange(() => { S.fits = S.fits.filter(x => x !== f); if (f.day < k && last) S.fitKept[f.day] = 1; });
  S.polls.forEach(p => { if (p.fits.includes(id)) p.fits = p.fits.map(x => (x === id ? '' : x)); });
  FitDB.del(id).catch(() => {}); fitForget(id);
  if (ov && ov.step === 'view') { if (next) { ov.id = next.id; ovRender(); } else ovClose(); }
}
function viewOpen(id) { if (S.fits.some(f => f.id === id)) ovOpen({ kind: 'fit', step: 'view', id }); }

/* breathe: box breathing, 4 rounds of in 4 / hold 4 / out 4 / hold 4 = 64 s, all from one start time */
const BR = { SIDE: 4000, ROUNDS: 4 }, BR_SAY = ['Breathe in', 'Hold', 'Breathe out', 'Hold'];
function brOpen() { ovOpen({ kind: 'breathe', step: 'intro' }); }
function brStart() {
  const o = ov; ovStop();
  Object.assign(o, { step: 'run', run: performance.now(), ph: -1, note: '' }); wake(true); ovRender();
  const id = ovRun, still = REDUCED();
  const frame = now => {
    if (id !== ovRun || ov !== o || !o.run) return;
    const el = Math.max(0, now - o.run);   // a frame stamped just before the start time would index phase -1
    if (el >= BR.SIDE * 4 * BR.ROUNDS) { brDone(); return; }
    const ph = Math.floor(el / BR.SIDE) % 4, fr = (el % BR.SIDE) / BR.SIDE, rd = Math.floor(el / (BR.SIDE * 4)) + 1;
    // the dot goes up the left side (in), across the top (hold), down the right (out), back along the bottom (hold)
    const [x, y] = [[0, 1 - fr], [fr, 0], [1, fr], [1 - fr, 1]][ph], s = [0.55 + 0.45 * fr, 1, 1 - 0.45 * fr, 0.55][ph];
    const dot = $('brDot'), orb = $('brOrb');
    if (dot && !still) { dot.style.left = `${x * 100}%`; dot.style.top = `${y * 100}%`; orb.style.transform = `scale(${s.toFixed(3)})`; }
    const n = String(4 - Math.floor(fr * 4));
    if ($('brN').textContent !== n) $('brN').textContent = n;
    if (ph !== o.ph) {
      o.ph = ph; $('brSay').textContent = BR_SAY[ph]; $('brRound').textContent = `Round ${rd} of ${BR.ROUNDS}`; $('brSr').textContent = BR_SAY[ph];
      if (still) orb.style.transform = `scale(${ph === 0 || ph === 1 ? 1 : 0.55})`;
      if (ph === 0 || ph === 2) Sound.breath(ph === 0); else Sound.tap();
      if (S.well.bz) buzz(ph === 0 ? [30, 60, 30] : 30);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
function brStop(note) { const o = ov; if (!o || o.kind !== 'breathe') return; ovStop(); Object.assign(o, { step: 'intro', note }); ovRender(); }
function brDone() {
  const o = ov; ovStop();
  dlyChange(() => { const d = wday(); d.b = Math.min(99, (d.b || 0) + 1); });
  Object.assign(o, { step: 'done', note: '' }); ovRender(); buzz([20, 40, 20]);
}
document.addEventListener('visibilitychange', () => {   // the camera and the breathing clock never run in the background
  if (!ov) return;
  if (document.hidden) {
    if (ov.step === 'cam' && (ov.stream || !ov.ready)) { ovStop(); ov.paused = true; }
    if (ov.kind === 'breathe' && ov.step === 'run') brStop('Paused. Start again when you are ready.');
  } else if (ov.step === 'cam' && ov.paused) { ov.paused = false; camStart(); }
});

/* ---- ask friends: a voting link on cinolo.com (made by the Android app), or the photo itself */
const POLL_ERR = {
  network: "No connection. Couldn't reach the voting site.", timeout: "The voting site didn't answer. Try again in a bit.", rate_limited: 'Too many links today. Try again tomorrow.',
  image_too_large: "That photo was too big to send.", bad_image: "That photo couldn't be sent.", busy: 'Still making your last link. Give it a sec.', missing: "That photo isn't on this phone anymore.",
  not_found: 'This vote has closed.', other: "The voting site didn't answer right. Try again later.",
};
let fitReq = null;   // the link being made: {req, sel, title, timer}
const pollReq = {};  // id -> timeout while a refresh is out
function askSheet(pre = []) {
  const list = S.fits.slice().reverse().slice(0, 12);
  if (!list.length) { showNote('No fits yet', 'Snap one first, then ask your friends.', FIT_NOTE, 'Daily Fit'); return; }
  let sel = pre.filter(id => list.some(f => f.id === id)).slice(0, 3);
  if (!sel.length) sel = [list[0].id];
  const link = fitBridge();
  openSheet(`<h2>Ask friends</h2><p class="dim">Pick up to 3 fits. Friends tap the one you should wear. No sign-up.</p>
    <div class="fpick" id="fpick">${list.map(f => `<button data-id="${f.id}" aria-label="Fit from ${fmtDate(f.day)}">${ph(f.id)}<em></em><small>${fmtDate(f.day, { weekday: 'short', day: 'numeric' })}</small></button>`).join('')}</div>
    <label class="field"><span class="label">Question</span><input id="askT" maxlength="90" autocomplete="off"></label>
    <p class="dim ask-st" id="askSt" aria-live="polite"></p>
    <button class="go fitgo" id="askGo">${link ? 'Make voting link' : 'Share photo'}</button>
    <p class="st-foot">${link ? 'Anyone with the link can see these photos for 7 days, then they delete themselves. Only send it to people you know.' : 'Voting links work in the LEVEL UP Android app. Here you can share the photo itself.'}</p>`, el => {
    const T = el.querySelector('#askT'), go = el.querySelector('#askGo');
    const paint = () => {
      el.querySelectorAll('#fpick button').forEach(b => { const i = sel.indexOf(b.dataset.id); b.classList.toggle('on', i >= 0); b.setAttribute('aria-pressed', i >= 0); b.querySelector('em').textContent = i >= 0 && sel.length > 1 ? 'ABC'[i] : i >= 0 ? '\u2713' : ''; });
      T.placeholder = sel.length > 1 ? 'Which fit should I wear?' : 'Should I wear this?'; go.disabled = !sel.length || !!fitReq;
    };
    el.querySelectorAll('#fpick button').forEach(b => b.onclick = () => {
      const id = b.dataset.id;
      if (sel.includes(id)) sel = sel.filter(x => x !== id); else if (sel.length >= 3) { Sound.nope(); el.querySelector('#askSt').textContent = 'Up to 3 fits.'; return; } else sel.push(id);
      Sound.tap(); el.querySelector('#askSt').textContent = ''; paint();
    });
    paint(); hydrate(el);
    go.onclick = async () => {
      const title = T.value.replace(/\s+/g, ' ').trim() || T.placeholder, ids = sel.slice();
      go.disabled = true; go.textContent = link ? 'Making your link...' : 'Getting it ready...';
      if (!link) { await shareOut(ids, title); go.disabled = false; go.textContent = 'Share photo'; return; }
      try {
        const options = [];
        for (const id of ids) { const r = await FitDB.get(id).catch(() => null); if (!r || !r.full) throw Object.assign(new Error(), { why: 'missing' }); options.push({ img: await b64(await small(r.full)), label: '' }); }
        const req = uid(); fitReq = { req, sel: ids, title, timer: setTimeout(() => window.levelupFitPollMade(req, '{"ok":false,"error":"timeout"}'), 60000) };
        LevelUpAndroid.createFitPoll(JSON.stringify({ req, title, options }));
      } catch (e) { askFailed(ids, title, e.why || 'other'); }
    };
  });
}
// native: the voting link is made (or not)
window.levelupFitPollMade = (req, json) => {
  if (!fitReq || fitReq.req !== req) return;
  const q = fitReq; clearTimeout(q.timer); fitReq = null;
  let r; try { r = JSON.parse(json); } catch (e) { r = { ok: false, error: 'other' }; }
  if (!r || !r.ok || !/^[A-Za-z0-9]{10}$/.test(r.id) || r.url !== POLL_URL + r.id) { askFailed(q.sel, q.title, (r && r.error) || 'other'); return; }
  const p = { id: r.id, url: r.url, at: Date.now(), exp: Date.now() + 7 * 864e5, fits: q.sel, title: q.title, res: null };
  S.polls = S.polls.filter(x => x.id !== p.id).concat(p).slice(-20); save();
  renderPolls(); afterChange(); Sound.buy();
  const open = $('sheetbg').classList.contains('open') && $('askGo');
  if (!open) { showNote('Voting link ready', 'Find it under Friend votes on Daily.', FIT_NOTE, 'Daily Fit'); return; }
  openSheet(`<h2>Link ready</h2><p class="dim">Send it to your friends. They tap the fit you should wear, no sign-up, and the votes show up on Daily.</p>
    <div class="linkbox">${esc(p.url.replace('https://', ''))}</div><button class="go fitgo" id="lkSend">${SEND_ICON}Send link</button><button class="ghost" id="lkOk">Done</button>
    <p class="st-foot">The link and its photos delete themselves after 7 days.</p>`, el => { el.querySelector('#lkSend').onclick = () => sendLink(p); el.querySelector('#lkOk').onclick = closeSheet; });
  sendLink(p);
};
function sendLink(p) {
  const text = `${p.title || 'Which fit should I wear?'} ${p.url}`;
  let ok = false;
  try { ok = window.LevelUpAndroid ? LevelUpAndroid.shareText(text) !== false : !!(navigator.share && (navigator.share({ text }).catch(() => {}), 1)); } catch (e) {}
  if (!ok) showNote("Couldn't open sharing", p.url.replace('https://', ''), FIT_NOTE, 'Daily Fit');
}
function askFailed(ids, title, why) {
  Sound.nope();
  openSheet(`<h2>No link this time</h2><p>${esc(POLL_ERR[why] || POLL_ERR.other)}</p><p class="dim">You can still send the photo${ids.length > 1 ? 's in one picture' : ''} and ask in your chat.</p>
    <button class="go fitgo" id="afShare">${SEND_ICON}Share the photo instead</button>${why === 'missing' ? '' : '<button class="ghost" id="afAgain">Try again</button>'}`, el => {
    el.querySelector('#afShare').onclick = async () => { const b = el.querySelector('#afShare'); b.disabled = true; await shareOut(ids.filter(Boolean), title); b.disabled = false; };
    const again = el.querySelector('#afAgain'); if (again) again.onclick = () => askSheet(ids);
  });
}
// the photo (2-3 side by side) through Android's share sheet, or the browser's, or as a download
async function shareOut(ids, title) {
  let blob;
  try { blob = await collage(ids); } catch (e) { Sound.nope(); showNote("Couldn't make the picture", POLL_ERR.missing, FIT_NOTE, 'Daily Fit'); return; }
  try {
    if (window.LevelUpAndroid && typeof LevelUpAndroid.sharePhoto === 'function') {
      if (LevelUpAndroid.sharePhoto(await b64(blob), title) === false) throw new Error('refused');
      return;
    }
    const file = new File([blob], `fit-${today()}.jpg`, { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: title }).catch(() => {}); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (e) { Sound.nope(); showNote("Couldn't open sharing", 'Try again in a moment.', FIT_NOTE, 'Daily Fit'); }
}
function pollRefresh(id, asked) {
  const p = S.polls.find(x => x.id === id);
  if (!p || pollReq[id] || !fitBridge() || p.gone || p.exp <= Date.now()) return;
  pollReq[id] = setTimeout(() => window.levelupFitPollResult(id, '{"ok":false,"error":"timeout"}'), 40000);
  p.asked = !!asked;
  try { LevelUpAndroid.getFitPoll(id); } catch (e) { window.levelupFitPollResult(id, '{"ok":false,"error":"other"}'); return; }
  renderPolls();
}
// native: a poll's votes (or why not)
window.levelupFitPollResult = (id, json) => {
  if (!pollReq[id]) return;
  clearTimeout(pollReq[id]); delete pollReq[id];
  const p = S.polls.find(x => x.id === id); if (!p) return;
  let r; try { r = JSON.parse(json); } catch (e) { r = { ok: false, error: 'other' }; }
  const v = r && r.ok && r.poll, okv = v && Array.isArray(v.choices) && Array.isArray(v.counts) && v.choices.length === v.counts.length && v.choices.length <= 3 && v.counts.every(c => Number.isInteger(c) && c >= 0);
  if (okv) {
    const before = p.res ? p.res.total : 0;
    p.res = { choices: v.choices.map(c => String(c).slice(0, 60)), counts: v.counts, total: v.counts.reduce((a, c) => a + c, 0), at: Date.now() };
    if (v.expires > Date.now()) p.exp = Math.min(v.expires, p.at + 8 * 864e5);
    delete p.err; if (p.res.total > before && p.asked) Sound.check();
  } else if (r && r.error === 'not_found') { p.gone = 1; delete p.err; }
  else p.err = (r && r.error) in POLL_ERR ? r.error : 'other';
  delete p.asked; save(); renderPolls();
};

function afterChange() { checkBoss(); checkAchievements(); renderCoins(); if ($('v-locker').classList.contains('on')) renderLocker(); }

/* ------------------------------------------------------------------ nav + boot */
document.querySelectorAll('.nav button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.nav button').forEach(x => { x.classList.toggle('on', x === b); if (x === b) x.setAttribute('aria-current', 'page'); else x.removeAttribute('aria-current'); });
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.id === 'v-' + b.dataset.v));
  if (b.dataset.v === 'stats') renderStats();
  if (b.dataset.v === 'locker') renderLocker();
  if (b.dataset.v === 'daily') { renderDaily(); S.polls.forEach(p => { if (!p.res || Date.now() - p.res.at > 120e3) pollRefresh(p.id); }); }
  Sound.tap(); scrollTo(0, 0);
});
// Android back button: returns true when it handled the press (so the app stays open)
window.levelupBack = () => {
  if (!$('pu').hidden) { puClose(); return true; }   // the push-up screen sits on top of everything, camera off
  if ($('rankup').classList.contains('open')) { nextMoment(); return true; }
  if ($('sheetbg').classList.contains('open')) { closeSheet(); return true; }
  if (!$('ov').hidden) { ovClose(); return true; }   // the Daily camera, photo or breathing screen; camera off, nothing half-saved
  if (!$('wo').hidden) { $('wo').classList.contains('res') ? claimResults() : hideWorkout(); return true; }   // never discards
  if (!$('v-home').classList.contains('on')) { document.querySelector('.nav button[data-v=home]').click(); return true; }
  return false;   // app to background; a running workout persists
};
function renderAll() { renderCard(); renderScreen(); renderToday(); renderBoss(); renderHabits(); renderGoals(); renderTrain(); renderDaily(); if ($('v-stats').classList.contains('on')) renderStats(); afterChange(); }
renderBody(); renderAll(); save(); woBoot();
setTimeout(() => { scrRefresh(true); scrPush(); renderScreen(); afterChange(); }, 0);
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
// a new day while the app stays open (or comes back from the background): redraw so "today" moves
let lastDay = today();
const rollover = () => { if (today() !== lastDay) { lastDay = today(); scrRefresh(true); scrPush(); renderAll(); scrRepaint(); return true; } return false; };
setInterval(() => { if (!rollover() && $('v-stats').classList.contains('on')) renderQuit(); }, 30000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !rollover() && scrOn() && scrRefresh()) { renderScreen(); scrRepaint(); afterChange(); }
  if (!document.hidden && S.workout) { woTick(); if (S.workout && !$('wo').hidden) renderWorkout(); }
  if (!document.hidden && woAwake) wake(true);   // the browser drops a wake lock while hidden: take it again
});
if ('serviceWorker' in navigator && !window.LevelUpAndroid) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
