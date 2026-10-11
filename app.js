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
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
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
  const lv = MUSCLES.reduce((a, m) => a + (S.muscles[m] || 0), 0) / (MUSCLES.length * 6);
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
    const [col, icon] = CAT_STYLE[h.cat] || CAT_STYLE.Health;
    return `<div class="habit ${on ? 'on' : ''} ${isDue ? '' : 'offday'}" data-h="${h.id}" ${ctl} style="--cat:${col}">
      <div class="tile"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icon}" fill="currentColor"/></svg></div>
      <div class="grow"><div class="nm">${esc(h.name)}</div><div class="meta">${esc(h.cat)} · ${isDue ? sched : 'Off today'}</div></div>
      ${st ? `<div class="stk" title="${st} in a row">${FLAME}${st}</div>` : ''}
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
    r.onclick = e => { if (!e.target.dataset.rm) toggle(); };
    r.onkeydown = e => { if (e.target !== r) return; if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } };
  });
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
function bodySVG(side) {
  const paths = BODY[side].map(([slug, d]) => {
    const g = GROUP[slug];
    if (!g) return `<path d="${d}" fill="${BODY_FILL[slug] || '#25224a'}"/>`;
    const lv = S.muscles[g] || 0;
    return `<path class="mus l${lv}" data-m="${g}" d="${d}" fill="${LEVELS[lv][1]}"><title>${g}: ${LEVELS[lv][0]}</title></path>`;
  }).join('');
  return `<svg viewBox="${VIEWBOX[side]}" role="img" aria-label="${side} muscle map">
    <path d="${BODY.outline[side]}" fill="#1a1738" stroke="#4b4680" stroke-width="1.2" vector-effect="non-scaling-stroke"/>
    <g stroke="#0c0a1d" stroke-width="1.4" vector-effect="non-scaling-stroke" stroke-linejoin="round">${paths}</g></svg>`;
}
function renderBody() {
  $('bodies').innerHTML = ['front', 'back'].map(s => `<div class="fig">${bodySVG(s)}<div class="label">${s}</div></div>`).join('');
  $('mkey').innerHTML = LEVELS.map(([n, c]) => `<span><i style="background:${c}"></i>${n}</span>`).join('');
  $('mtable').innerHTML = MUSCLES.map(m => { const lv = S.muscles[m] || 0; return `<tr data-m="${m}" tabindex="0"><td>${m}</td><td><i style="background:${LEVELS[lv][1]}"></i>${LEVELS[lv][0]}</td></tr>`; }).join('');
  document.querySelectorAll('#v-body [data-m]').forEach(el => { el.onclick = () => levelSheet(el.dataset.m); el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); levelSheet(el.dataset.m); } }; });
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
$('erase').onclick = () => { if (confirm('Erase every habit, goal and level on this phone? This cannot be undone.')) { S = seed(); save(); renderBody(); renderAll(); } };

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
addEventListener('keydown', e => { if (e.key === 'Escape') { closeSheet(); if ($('rankup').classList.contains('open')) nextMoment(); } });

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

function levelSheet(m) {
  const cur = S.muscles[m] || 0;
  openSheet(`<h2>${m}</h2><div class="levels">${LEVELS.map(([n, c], i) => `<button data-l="${i}" class="${i === cur ? 'cur' : ''}"><i style="background:${c}"></i>${n}</button>`).join('')}</div>`, el => {
    el.querySelectorAll('[data-l]').forEach(b => b.onclick = () => { S.muscles[m] = +b.dataset.l; save(); closeSheet(); buzz(10); renderBody(); renderCard(); afterChange(); });
  });
}

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
  let slots = 0, dmg = 0, hits = 0, crits = 0;
  for (let i = 0; i < 7; i++) {
    const day = addDays(ws, i), k = ymd(day);
    for (const h of S.habits) {
      if (due(h, day)) slots++;
      if (h.log[k]) { const v = hitOf(h, k); dmg += v; hits++; if (v > HIT) crits++; }
    }
  }
  const maxHp = Math.max(0, Math.round((slots * HIT * 0.8) / 50) * 50);
  return { key, idx, boss: BOSSES[idx], maxHp, hp: Math.max(0, maxHp - dmg), dmg, hits, crits, end: addDays(ws, 7) };
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
function checkBoss() {
  const b = bossState();
  if (b.maxHp && b.hp === 0 && !S.bossWins[b.key]) {
    S.bossWins[b.key] = { boss: b.idx, at: Date.now() }; save();
    celebrate({ hd: 'Boss defeated!', from: `+${BOSS_COINS} coins`, img: b.boss.art, name: b.boss.name, color: b.boss.color, sound: 'bossDown' });
  }
}
$('boss').onclick = () => {
  const b = bossState(); if (!b.maxHp) return;
  const wins = Object.keys(S.bossWins).length;
  openSheet(`<h2>${b.boss.name}</h2>
    <div style="display:grid;grid-template-columns:120px 1fr;gap:14px;align-items:center">
      <img src="${b.boss.art}" alt="" style="width:120px;height:120px;filter:drop-shadow(0 0 16px ${b.boss.color})">
      <div><div class="label">This week</div>
        <p style="margin-top:8px;line-height:1.5">${b.hits} hits · ${b.crits} crits · ${b.dmg} damage<br>${b.hp ? `${b.hp} HP left` : 'Defeated'} · reward ${BOSS_COINS} coins</p></div>
    </div>
    <p style="margin:14px 0 6px;color:var(--dim);line-height:1.5">Every quest you finish hits the boss for 100. Some hits are crits for 200. Finish about 4 out of 5 of this week's quests to beat it before Sunday night. A new boss shows up every Monday.</p>
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
  { id: 'shredded', name: 'Shredded', desc: 'Get a muscle to Elite', coins: 100, test: () => Object.values(S.muscles).some(v => v >= 5) },
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
  + ACH.reduce((a, x) => a + (S.ach[x.id] ? x.coins : 0), 0) + S.bank - S.spent;
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
function showNote(title, sub) { showToast({ note: true, name: title, desc: sub }); }
function nextToast() {
  const a = toasts.shift(), el = $('toast');
  if (!a) { toastBusy = false; return; }
  toastBusy = true;
  el.innerHTML = a.note
    ? `<div class="medal">${UP_ICON}</div><div><span class="label">LEVEL UP</span><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></div>`
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
  const u = $('update'), wasHidden = u.hidden;
  $('checkUpdate').textContent = 'Check for updates';
  u.hidden = false; u.classList.remove('busy'); u.style.removeProperty('--p');
  u.innerHTML = `<span class="ic">${UP_ICON}</span><span><b>Update ready</b><small>${esc(name)} · tap to install</small></span>`;
  u.onclick = () => {
    if (u.classList.contains('busy') || !window.LevelUpAndroid) return;
    u.classList.add('busy'); u.querySelector('small').textContent = 'Downloading...';
    LevelUpAndroid.installUpdate();
  };
  if (wasHidden && !$('v-home').classList.contains('on')) showNote('Update ready', 'Go to Home and tap the banner to install');
};
window.levelupUpdateProgress = pct => {
  const u = $('update'); if (u.hidden) return;
  u.style.setProperty('--p', `${pct}%`);
  u.querySelector('small').textContent = pct >= 100 ? 'Opening the installer... tap Update' : `Downloading ${pct}%`;
  if (pct >= 100) setTimeout(() => u.classList.remove('busy'), 4000);
};
window.levelupUpdateFailed = msg => {
  const u = $('update'); u.classList.remove('busy'); u.style.removeProperty('--p');
  if (!u.hidden) u.querySelector('small').textContent = `${msg} · tap to retry`;
};
window.levelupUpdateNone = err => {
  $('checkUpdate').textContent = 'Check for updates';
  showNote(err ? 'No connection' : "You're up to date", err || `Version ${window.LevelUpAndroid ? LevelUpAndroid.version() : ''}`);
};
if (window.LevelUpAndroid) {
  $('checkUpdate').hidden = false;
  $('checkUpdate').onclick = () => { $('checkUpdate').textContent = 'Checking...'; LevelUpAndroid.checkForUpdate(); Sound.tap(); };
  try { $('appVersion').textContent = `Version ${LevelUpAndroid.version()}.`; } catch (e) {}
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
  if (!$('v-home').classList.contains('on')) { document.querySelector('.nav button[data-v=home]').click(); return true; }
  return false;
};
function renderAll() { renderCard(); renderBoss(); renderHabits(); renderGoals(); if ($('v-stats').classList.contains('on')) renderStats(); afterChange(); }
renderBody(); renderAll(); save();
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
// a new day while the app stays open (or comes back from the background): redraw so "today" moves
let lastDay = today();
const rollover = () => { if (today() !== lastDay) { lastDay = today(); renderAll(); return true; } return false; };
setInterval(() => { if (!rollover() && $('v-stats').classList.contains('on')) renderQuit(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) rollover(); });
if ('serviceWorker' in navigator && !window.LevelUpAndroid) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
