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
  $('ranknext').textContent = placing ? 'Check off a habit to start placement' : r.next ? `${Math.max(0.1, r.need).toFixed(1)} OVR to ${r.next}` : 'Top rank';
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
    : '<p class="empty">No habits yet. Add the first thing you want to do every day.</p>';
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

function renderGoals() {
  const el = $('goals');
  el.innerHTML = S.goals.length ? S.goals.map(g => {
    const left = g.date ? Math.round((new Date(g.date + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 864e5) : null;
    const when = g.date ? `${fmtDate(g.date, { day: 'numeric', month: 'long', year: 'numeric' })}${left !== null ? ` · ${left > 0 ? left + ' days left' : left === 0 ? 'due today' : Math.abs(left) + ' days over'}` : ''}` : 'No date';
    return `<div class="goal ${g.pct >= 100 ? 'done' : ''}" data-g="${g.id}" role="button" tabindex="0">
      <div><div class="nm">${esc(g.name)}</div><div class="d">${when}</div></div>
      <div class="pc">${g.pct}%</div>
      <div class="bar"><i style="width:${g.pct}%"></i></div></div>`;
  }).join('') : '<p class="empty">No goals yet.</p>';
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
const paintSound = () => { $('soundToggle').textContent = `Sound: ${S.sound === false ? 'Off' : 'On'}`; };
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
    localStorage.setItem(KEY, JSON.stringify(x)); location.reload();
  } catch (err) { alert(`Could not import: ${err.message}`); }
};
$('erase').onclick = () => {
  if (!confirm('Erase every habit, goal and level on this phone? This cannot be undone.')) return;
  $('wo').hidden = true; $('wo').classList.remove('res'); woRes = null; stopTick(); keepOn(false); woRev++;
  S = seed(); save(); renderBody(); renderAll();
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
addEventListener('keydown', e => { if (e.key === 'Escape' && ($('rankup').classList.contains('open') || $('sheetbg').classList.contains('open') || !$('wo').hidden)) levelupBack(); });

function habitSheet() {
  let pick = ALL.slice();
  openSheet(`<h2>New habit</h2>
    <label class="field"><span class="label">Name</span><input id="hName" maxlength="40" placeholder="Drink 2L water" autocomplete="off"></label>
    <label class="field"><span class="label">Attribute</span><select id="hCat">${CATS.map(([c, a]) => `<option value="${c}">${c} (${a})</option>`).join('')}</select></label>
    <div class="field"><span class="label">Days</span><div class="days" id="hDays"></div></div>
    <button class="go" id="hSave" disabled>Add habit</button>`, el => {
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
];
function unlock(id) {
  if (S.ach[id]) return;
  const a = ACH.find(x => x.id === id); if (!a) return;
  S.ach[id] = today(); save(); showToast(a); renderCoins();
}
function checkAchievements() { for (const a of ACH) if (!S.ach[a.id] && a.test && a.test()) unlock(a.id); }

// coins are earned from what you did (so un-ticking a quest takes its coins back) minus what you spent
const coins = () => checkins() * 10 + clearDays() * 50 + Object.keys(S.bossWins).length * BOSS_COINS
  + ACH.reduce((a, x) => a + (S.ach[x.id] ? x.coins : 0), 0) + woLedger().coins + S.bank - S.spent;
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
// icon: the workout notes pass the dumbbell, so they never look like the app-update notice
function showNote(title, sub, icon = null) { showToast({ note: true, name: title, desc: sub, icon }); }
function nextToast() {
  const a = toasts.shift(), el = $('toast');
  if (!a) { toastBusy = false; return; }
  toastBusy = true;
  el.innerHTML = a.note
    ? `<div class="medal">${a.icon || UP_ICON}</div><div><span class="label">${a.icon ? 'Workout' : 'LEVEL UP'}</span><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></div>`
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
  const got = ACH.filter(a => S.ach[a.id]).length;
  $('trophyCount').textContent = `${got}/${ACH.length}`;
  $('trophies').innerHTML = ACH.map(a => `<div class="trophy${S.ach[a.id] ? '' : ' locked'}"><div class="medal">${TROPHY}</div><b>${esc(a.name)}</b><small>${esc(a.desc)}<br>+${a.coins} coins</small></div>`).join('');
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
  const WHATS_NEW = 'New: Start Workout, the gold bar on Home';
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

function afterChange() { checkBoss(); checkAchievements(); renderCoins(); if ($('v-locker').classList.contains('on')) renderLocker(); }

/* ------------------------------------------------------------------ nav + boot */
document.querySelectorAll('.nav button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.nav button').forEach(x => { x.classList.toggle('on', x === b); if (x === b) x.setAttribute('aria-current', 'page'); else x.removeAttribute('aria-current'); });
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.id === 'v-' + b.dataset.v));
  if (b.dataset.v === 'stats') renderStats();
  if (b.dataset.v === 'locker') renderLocker();
  Sound.tap(); scrollTo(0, 0);
});
// Android back button: returns true when it handled the press (so the app stays open)
window.levelupBack = () => {
  if ($('rankup').classList.contains('open')) { nextMoment(); return true; }
  if ($('sheetbg').classList.contains('open')) { closeSheet(); return true; }
  if (!$('wo').hidden) { $('wo').classList.contains('res') ? claimResults() : hideWorkout(); return true; }   // never discards
  if (!$('v-home').classList.contains('on')) { document.querySelector('.nav button[data-v=home]').click(); return true; }
  return false;   // app to background; a running workout persists
};
function renderAll() { renderCard(); renderBoss(); renderHabits(); renderGoals(); renderTrain(); if ($('v-stats').classList.contains('on')) renderStats(); afterChange(); }
renderBody(); renderAll(); save(); woBoot();
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
// a new day while the app stays open (or comes back from the background): redraw so "today" moves
let lastDay = today();
const rollover = () => { if (today() !== lastDay) { lastDay = today(); renderAll(); return true; } return false; };
setInterval(() => { if (!rollover() && $('v-stats').classList.contains('on')) renderQuit(); }, 30000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) rollover();
  if (!document.hidden && S.workout) { woTick(); if (S.workout && !$('wo').hidden) renderWorkout(); }
  if (!document.hidden && woAwake) wake(true);   // the browser drops a wake lock while hidden: take it again
});
if ('serviceWorker' in navigator && !window.LevelUpAndroid) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
