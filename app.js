'use strict';
/* LEVEL UP: habits score your life like a player card. All data stays in this browser. */

const KEY = 'levelup.v1';
const DAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAME = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CATS = [['Health', 'HLT'], ['Gym', 'GYM'], ['Mind', 'MND'], ['Work', 'WRK'], ['Social', 'SOC']];

// Ranks: 8 tiers x 3 divisions spread over OVR 40-99. Colours match each crest's material.
const TIERS = [
  ['Iron', '#a3abb6'], ['Bronze', '#d08a52'], ['Silver', '#cfd8e4'], ['Gold', '#f0c04a'],
  ['Platinum', '#4fd8cb'], ['Diamond', '#8ccaff'], ['Master', '#b48cff'], ['Champion', '#ff5a64'],
];
const CRESTS = ['iron', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'champion'].map((n, i) => `ranks/rank-${i}-${n}.svg`);
const DIV = ['I', 'II', 'III'], STEPS = TIERS.length * 3, LO = 40, HI = 99, STEP = (HI - LO) / STEPS;

// Muscle levels: ordinal ramp, one hue, validated with the dataviz palette checker against the
// panel (#15181b): monotone lightness, visible step gaps, dimmest step at 2.13:1.
const LEVELS = [
  ['Untrained', '#2f343b'],
  ['Beginner', '#8c2a3a'], ['Intermediate', '#a93344'], ['Experienced', '#c63e4f'],
  ['Advanced', '#e0525d'], ['Elite', '#f47672'], ['Champion', '#ffa595'],
];
// body-data slug -> muscle group (null = not a trainable muscle, drawn as body)
const GROUP = {
  chest: 'Chest', deltoids: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps', forearm: 'Forearms',
  abs: 'Abs', obliques: 'Obliques', trapezius: 'Traps', 'upper-back': 'Upper back', 'lower-back': 'Lower back',
  gluteal: 'Glutes', quadriceps: 'Quads', hamstring: 'Hamstrings', adductors: 'Adductors', calves: 'Calves', tibialis: 'Calves',
};
const MUSCLES = ['Chest', 'Shoulders', 'Biceps', 'Triceps', 'Forearms', 'Abs', 'Obliques', 'Traps', 'Upper back', 'Lower back', 'Glutes', 'Quads', 'Hamstrings', 'Adductors', 'Calves'];
const BODY_FILL = { head: '#5b6169', hair: '#2a2d31', neck: '#4a5058', hands: '#5b6169', feet: '#5b6169', knees: '#454a52', ankles: '#454a52' };
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
    rankIdx: null,
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
function ovrExact() {
  const r = rate(S.habits, 14) || 0;
  const lv = MUSCLES.reduce((a, m) => a + (S.muscles[m] || 0), 0) / (MUSCLES.length * 6);
  return Math.min(HI, LO + r * 50 + lv * 9);
}
function rankOf(x) {
  const idx = Math.min(STEPS - 1, Math.max(0, Math.floor((x - LO) / STEP)));
  const into = Math.min(1, (x - LO - idx * STEP) / STEP);
  return { idx, tier: Math.floor(idx / 3), name: `${TIERS[Math.floor(idx / 3)][0]} ${DIV[idx % 3]}`, into, next: idx + 1 < STEPS ? `${TIERS[Math.floor((idx + 1) / 3)][0]} ${DIV[(idx + 1) % 3]}` : null, need: (idx + 1) * STEP + LO - x };
}

/* ------------------------------------------------------------------ home */
function renderCard() {
  const x = ovrExact(), r = rankOf(x);
  document.documentElement.style.setProperty('--rank', TIERS[r.tier][1]);
  $('ovr').textContent = Math.floor(x);
  $('rankname').textContent = r.name;
  $('rankbar').style.width = (r.into * 100).toFixed(1) + '%';
  $('ranknext').textContent = r.next ? `${Math.max(0.1, r.need).toFixed(1)} OVR to ${r.next}` : 'Top rank';
  $('crest').src = CRESTS[r.tier]; $('crest').alt = `${TIERS[r.tier][0]} crest`;
  $('who').textContent = S.user;
  const cells = CATS.map(([cat, ab]) => {
    const list = S.habits.filter(h => h.cat === cat), v = list.length ? rate(list, 14) : null;
    return `<div class="attr"><b class="${v === null ? 'gap' : ''}">${v === null ? '–' : toRating(v)}</b><span class="label">${ab}</span></div>`;
  });
  cells.push(`<div class="attr"><b class="stk">${dayStreak()}</b><span class="label">Streak</span></div>`);
  $('attrs').innerHTML = cells.join('');
  if (S.rankIdx === null || S.rankIdx === undefined) { S.rankIdx = r.idx; save(); }
  else if (r.idx > S.rankIdx) { S.rankIdx = r.idx; save(); rankUp(r); }
  else if (r.idx < S.rankIdx) { S.rankIdx = r.idx; save(); }
}
function rankUp(r) {
  $('rankupImg').src = CRESTS[r.tier]; $('rankupName').textContent = r.name;
  $('rankup').classList.add('open'); buzz([20, 40, 60]);
}
$('rankupClose').onclick = () => $('rankup').classList.remove('open');

const CHECK = '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3 9.5l4 4 8-9" fill="none" stroke="#0f1113" stroke-width="2.6" stroke-linecap="square"/></svg>';
let editing = false;
function renderHabits() {
  const k = today(), now = new Date(), list = S.habits.filter(h => due(h, now));
  $('todaycount').textContent = list.length ? `${list.filter(h => h.log[k]).length}/${list.length}` : '';
  const off = S.habits.filter(h => !due(h, now));
  const row = (h, isDue) => {
    const on = !!h.log[k], st = streak(h);
    const sched = h.days.length === 7 ? 'Every day' : h.days.map(d => DAY_NAME[d]).join(' ');
    return `<div class="habit ${on ? 'on' : ''}" data-h="${h.id}" role="checkbox" aria-checked="${on}" tabindex="0" ${isDue ? '' : 'style="opacity:.5"'}>
      <div class="grow"><div class="nm">${esc(h.name)}</div><div class="meta">${esc(h.cat)} · ${isDue ? sched : 'Off today'}</div></div>
      ${st ? `<div class="stk">${st}<small>STREAK</small></div>` : ''}
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
      const h = S.habits.find(x => x.id === r.dataset.h);
      if (h.log[k]) delete h.log[k]; else { h.log[k] = true; buzz(12); }
      save(); renderAll();
    };
    r.onclick = e => { if (!e.target.dataset.rm) toggle(); };
    r.onkeydown = e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } };
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
    const left = g.date ? Math.ceil((new Date(g.date + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 864e5) : null;
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
    if (!g) return `<path d="${d}" fill="${BODY_FILL[slug] || '#4a5058'}"/>`;
    const lv = S.muscles[g] || 0;
    return `<path class="mus" data-m="${g}" d="${d}" fill="${LEVELS[lv][1]}"><title>${g}: ${LEVELS[lv][0]}</title></path>`;
  }).join('');
  return `<svg viewBox="${VIEWBOX[side]}" role="img" aria-label="${side} muscle map">
    <path d="${BODY.outline[side]}" fill="#22262b" stroke="#4a5058" stroke-width="1.2" vector-effect="non-scaling-stroke"/>
    <g stroke="#0f1113" stroke-width="1.4" vector-effect="non-scaling-stroke" stroke-linejoin="round">${paths}</g></svg>`;
}
function renderBody() {
  $('bodies').innerHTML = ['front', 'back'].map(s => `<div class="fig">${bodySVG(s)}<div class="label">${s}</div></div>`).join('');
  $('mkey').innerHTML = LEVELS.map(([n, c]) => `<span><i style="background:${c}"></i>${n}</span>`).join('');
  $('mtable').innerHTML = MUSCLES.map(m => { const lv = S.muscles[m] || 0; return `<tr data-m="${m}" tabindex="0"><td>${m}</td><td><i style="background:${LEVELS[lv][1]}"></i>${LEVELS[lv][0]}</td></tr>`; }).join('');
  document.querySelectorAll('#v-body [data-m]').forEach(el => { el.onclick = () => levelSheet(el.dataset.m); el.onkeydown = e => { if (e.key === 'Enter') levelSheet(el.dataset.m); }; });
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
    const start = addDays(now, -(W * 7 - 1) - (6 - now.getDay()));
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
$('erase').onclick = () => { if (confirm('Erase every habit, goal and level on this phone? This cannot be undone.')) { S = seed(); save(); renderBody(); renderAll(); } };

/* ------------------------------------------------------------------ sheets */
function openSheet(html, bind) {
  $('sheet').innerHTML = html; $('sheetbg').classList.add('open'); bind($('sheet'));
  const first = $('sheet').querySelector('input, select, button'); if (first) setTimeout(() => first.focus(), 50);
}
const closeSheet = () => $('sheetbg').classList.remove('open');
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
    <label class="field"><span class="label">Quit since</span><input id="qSince" type="datetime-local" value="${local}"></label>
    <button class="go" id="qSave">Save</button>`, el => {
    el.querySelector('#qSave').onclick = () => {
      const n = el.querySelector('#qName').value.trim(), t = new Date(el.querySelector('#qSince').value).getTime();
      if (n) q.name = n; if (!isNaN(t) && t <= Date.now()) q.since = t;
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
  document.querySelectorAll('.nav button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.id === 'v-' + b.dataset.v));
  if (b.dataset.v === 'stats') renderStats();
  scrollTo(0, 0);
});
function renderAll() { renderCard(); renderHabits(); renderGoals(); renderStats(); }
renderBody(); renderAll(); save();
setInterval(() => { if ($('v-stats').classList.contains('on')) renderQuit(); }, 30000);
// a new day while the app stays open: redraw so "today" moves
let lastDay = today();
document.addEventListener('visibilitychange', () => { if (!document.hidden && today() !== lastDay) { lastDay = today(); renderAll(); } });
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
