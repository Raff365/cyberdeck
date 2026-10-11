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
  return {
    check() { if (!on()) return; note(660, 0, 0.09, { type: 'square', vol: 0.05 }); note(990, 0.07, 0.16, { vol: 0.1 }); },
    uncheck() { if (!on()) return; note(420, 0, 0.12, { vol: 0.07, to: 300 }); },
    clear() { if (!on()) return; [523, 659, 784, 1047].forEach((f, i) => note(f, i * 0.09, 0.22, { vol: 0.1 })); },
    rankUp() { if (!on()) return; [392, 523, 659, 784].forEach((f, i) => note(f, i * 0.11, 0.2, { type: 'square', vol: 0.05 })); note(1047, 0.46, 0.7, { vol: 0.14 }); note(1568, 0.46, 0.7, { vol: 0.06 }); },
    tap() { if (!on()) return; note(880, 0, 0.05, { type: 'sine', vol: 0.05 }); },
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
  $('card').classList.toggle('placing', placing);
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
  $('rankupImg').src = CRESTS[r.tier]; $('rankupName').textContent = r.name;
  $('rankupFrom').textContent = `${rankName(from)} \u2192 ${r.name}`;
  $('rankup').classList.add('open'); buzz([20, 40, 60]); Sound.rankUp(); burst(TIERS[r.tier][1]);
  setTimeout(() => $('rankupClose').focus(), 30);
}
$('rankupClose').onclick = () => { $('rankup').classList.remove('open'); Sound.tap(); };
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
      const h = S.habits.find(x => x.id === r.dataset.h), key = today(), before = ovrExact(), adding = !h.log[key];
      const dueNow = S.habits.filter(x => due(x, new Date())), wasClear = dueNow.length > 0 && dueNow.every(x => x.log[key]);
      if (adding) { h.log[key] = true; buzz(12); } else { delete h.log[key]; Sound.uncheck(); }
      save(); renderAll();
      const nowClear = dueNow.length > 0 && dueNow.every(x => x.log[key]);
      if (adding) { if (nowClear && !wasClear) { Sound.clear(); buzz([15, 40, 15, 40, 30]); } else Sound.check(); }
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
    if (confirm(`Remove "${h.name}" and its history?`)) { S.habits = S.habits.filter(x => x !== h); save(); renderAll(); }
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
addEventListener('keydown', e => { if (e.key === 'Escape') { closeSheet(); $('rankup').classList.remove('open'); } });

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
      save(); closeSheet(); renderGoals(); if (g.pct >= 100 && was < 100) buzz([20, 30, 20]);
    };
    const del = el.querySelector('#gDel');
    if (del) del.onclick = () => { if (confirm(`Remove "${g.name}"?`)) { S.goals = S.goals.filter(x => x.id !== g.id); save(); closeSheet(); renderGoals(); } };
  });
}
$('addGoal').onclick = () => goalSheet(null);

function levelSheet(m) {
  const cur = S.muscles[m] || 0;
  openSheet(`<h2>${m}</h2><div class="levels">${LEVELS.map(([n, c], i) => `<button data-l="${i}" class="${i === cur ? 'cur' : ''}"><i style="background:${c}"></i>${n}</button>`).join('')}</div>`, el => {
    el.querySelectorAll('[data-l]').forEach(b => b.onclick = () => { S.muscles[m] = +b.dataset.l; save(); closeSheet(); buzz(10); renderBody(); renderCard(); });
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
      save(); closeSheet(); renderQuit();
    };
  });
}
$('who').onclick = () => {
  openSheet(`<h2>Player</h2><label class="field"><span class="label">Name</span><input id="pName" maxlength="16" value="${esc(S.user)}" autocomplete="off"></label><button class="go" id="pSave">Save</button>`, el => {
    el.querySelector('#pSave').onclick = () => { const n = el.querySelector('#pName').value.trim(); if (n) { S.user = n; save(); } closeSheet(); renderCard(); };
  });
};

/* ------------------------------------------------------------------ nav + boot */
document.querySelectorAll('.nav button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.nav button').forEach(x => { x.classList.toggle('on', x === b); if (x === b) x.setAttribute('aria-current', 'page'); else x.removeAttribute('aria-current'); });
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.id === 'v-' + b.dataset.v));
  if (b.dataset.v === 'stats') renderStats();
  Sound.tap(); scrollTo(0, 0);
});
// Android back button: returns true when it handled the press (so the app stays open)
window.levelupBack = () => {
  if ($('rankup').classList.contains('open')) { $('rankup').classList.remove('open'); return true; }
  if ($('sheetbg').classList.contains('open')) { closeSheet(); return true; }
  if (!$('v-home').classList.contains('on')) { document.querySelector('.nav button[data-v=home]').click(); return true; }
  return false;
};
function renderAll() { renderCard(); renderHabits(); renderGoals(); if ($('v-stats').classList.contains('on')) renderStats(); }
renderBody(); renderAll(); save();
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
// a new day while the app stays open (or comes back from the background): redraw so "today" moves
let lastDay = today();
const rollover = () => { if (today() !== lastDay) { lastDay = today(); renderAll(); return true; } return false; };
setInterval(() => { if (!rollover() && $('v-stats').classList.contains('on')) renderQuit(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) rollover(); });
if ('serviceWorker' in navigator && !window.LevelUpAndroid) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
