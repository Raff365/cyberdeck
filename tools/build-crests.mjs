// Builds the eight rank crests as flat-shaded low-poly SVGs: node tools/build-crests.mjs
//
// Method (anidoodle "low-poly" plate): every crest is MODELLED as meshes, not drawn as shapes.
// A part is a bevelled extrusion of a 2D outline: the outer edge sits at z=0, an inset ring is
// raised to z=depth (the bevel facets), and the plateau is fanned up to an apex (the gem facets).
// Each triangle gets ONE flat colour from its normal against one key light (upper left), a cool
// rim light (lower right) and a specular term for metal. No gradients, no texture: the facet is
// the mark. Parts are drawn back to front (wings, frame, core). Deterministic: no randomness.
//
// Tiers escalate by material and by silhouette: shield, fins, wings, layered wings, crown.
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = new URL('../ranks/', import.meta.url);
mkdirSync(OUT, { recursive: true });

// ------------------------------------------------------------------ vector maths (y down, z to viewer)
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const KEY = norm([-0.55, -0.75, 0.62]);   // upper left, in front
const RIM = norm([0.7, 0.55, 0.35]);      // lower right, cool
const VIEW = [0, 0, 1];
const HALF = norm([KEY[0] + VIEW[0], KEY[1] + VIEW[1], KEY[2] + VIEW[2]]);

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const toHex = c => '#' + c.map(v => Math.round(255 * Math.min(1, Math.max(0, v))).toString(16).padStart(2, '0')).join('');

// A material: base colour, how metallic (specular strength / tightness), rim tint, ambient.
const MAT = {
  iron:     { base: '#6b7280', spec: 0.35, pow: 10, rim: '#9fb4d6', amb: 0.34 },
  ironDark: { base: '#3e434b', spec: 0.25, pow: 8,  rim: '#7d90b0', amb: 0.34 },
  bronze:   { base: '#b9733c', spec: 0.55, pow: 14, rim: '#ffcf9e', amb: 0.30 },
  bronzeDk: { base: '#7a4520', spec: 0.40, pow: 12, rim: '#e0a070', amb: 0.30 },
  silver:   { base: '#bcc6d3', spec: 0.45, pow: 26, rim: '#dbe8ff', amb: 0.28 },
  silverDk: { base: '#7f8a99', spec: 0.60, pow: 18, rim: '#c4d4ff', amb: 0.30 },
  gold:     { base: '#e7b23a', spec: 0.80, pow: 20, rim: '#fff0b8', amb: 0.28 },
  goldDk:   { base: '#a8731a', spec: 0.60, pow: 16, rim: '#ffd27a', amb: 0.28 },
  teal:     { base: '#3fd3c6', spec: 0.70, pow: 26, rim: '#c9fff9', amb: 0.42 },
  tealDk:   { base: '#16857f', spec: 0.50, pow: 18, rim: '#8ff5ea', amb: 0.36 },
  ice:      { base: '#8cc8ff', spec: 0.85, pow: 30, rim: '#e8f6ff', amb: 0.46 },
  iceDk:    { base: '#3c78d8', spec: 0.60, pow: 22, rim: '#b5dcff', amb: 0.38 },
  amethyst: { base: '#a873ff', spec: 0.75, pow: 26, rim: '#f0dcff', amb: 0.40 },
  amethDk:  { base: '#5b2fb8', spec: 0.55, pow: 18, rim: '#cfa8ff', amb: 0.36 },
  ruby:     { base: '#ff3b4e', spec: 0.85, pow: 28, rim: '#ffd0d6', amb: 0.42 },
  rubyDk:   { base: '#9c1027', spec: 0.60, pow: 20, rim: '#ff8a9a', amb: 0.36 },
  ironMid:  { base: '#4d535c', spec: 0.25, pow: 8,  rim: '#8d9fbf', amb: 0.34 },
  bronzeMd: { base: '#93542a', spec: 0.40, pow: 12, rim: '#f0b080', amb: 0.30 },
  gem:      { base: '#e6eefc', spec: 0.90, pow: 30, rim: '#ffffff', amb: 0.42 },
  gemTeal:  { base: '#c4fff8', spec: 0.90, pow: 30, rim: '#ffffff', amb: 0.42 },
  gemIce:   { base: '#d2ecff', spec: 0.90, pow: 30, rim: '#ffffff', amb: 0.42 },
};
const shade = (m, n) => {
  const b = hex(m.base), r = hex(m.rim);
  const d = Math.max(0, dot(n, KEY)), rim = Math.max(0, dot(n, RIM)) ** 2;
  const s = m.spec * Math.max(0, dot(n, HALF)) ** m.pow;
  return toHex(b.map((v, i) => v * (m.amb + 0.95 * d) + r[i] * 0.42 * rim + s));
};

// ------------------------------------------------------------------ geometry helpers
const area = p => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2;
const centroid = p => { const n = p.length; return [p.reduce((s, q) => s + q[0], 0) / n, p.reduce((s, q) => s + q[1], 0) / n]; };
// Mitered inward offset of a simple polygon by d (works for the modest bevels used here).
function inset(p, d) {
  const sgn = area(p) > 0 ? 1 : -1, n = p.length;
  const lines = p.map((a, i) => {
    const b = p[(i + 1) % n], e = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(...e);
    const nrm = [-e[1] / l * sgn, e[0] / l * sgn];          // inward normal
    return { a: [a[0] + nrm[0] * d, a[1] + nrm[1] * d], e };
  });
  return p.map((_, i) => {
    const L1 = lines[(i - 1 + n) % n], L2 = lines[i];
    const den = L1.e[0] * L2.e[1] - L1.e[1] * L2.e[0];
    if (Math.abs(den) < 1e-9) return L2.a;
    const t = ((L2.a[0] - L1.a[0]) * L2.e[1] - (L2.a[1] - L1.a[1]) * L2.e[0]) / den;
    return [L1.a[0] + L1.e[0] * t, L1.a[1] + L1.e[1] * t];
  });
}
const mirrorX = (p, cx = 100) => p.map(([x, y]) => [2 * cx - x, y]).reverse();
const regular = (cx, cy, r, n, rot = -Math.PI / 2, ry = r) => Array.from({ length: n }, (_, i) => { const a = rot + i * 2 * Math.PI / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * ry]; });
const star = (cx, cy, r1, r2, n) => Array.from({ length: n * 2 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / n, r = i % 2 ? r2 : r1; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });

// A bevelled, faceted part. opts: bevel (inset px), depth (bevel rise), apex (plateau peak rise),
// apexAt (2D point for the peak; default centroid), plateau: 'apex' | 'flat'.
function part(outline, mat, { bevel = 5, depth = 6, apex = 10, apexAt, plateau = 'apex', table = 0 } = {}) {
  const m = MAT[mat], tris = [];
  const outer = outline.map(([x, y]) => [x, y, 0]);
  const inner = inset(outline, bevel).map(([x, y]) => [x, y, depth]);
  const n = outline.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    tris.push([outer[i], outer[j], inner[j]], [outer[i], inner[j], inner[i]]);
  }
  if (table) {
    // gem cut: crown facets rise from the bevel ring to a smaller table ring, then a flat table
    const ringT = inset(outline, bevel + table).map(([x, y]) => [x, y, depth + apex]);
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; tris.push([inner[i], inner[j], ringT[j]], [inner[i], ringT[j], ringT[i]]); }
    const c = centroid(ringT); const C = [c[0], c[1], depth + apex];
    for (let i = 0; i < n; i++) tris.push([ringT[i], ringT[(i + 1) % n], C]);
  } else if (plateau === 'flat') {
    const c = centroid(inner); const C = [c[0], c[1], depth];
    for (let i = 0; i < n; i++) tris.push([inner[i], inner[(i + 1) % n], C]);
  } else {
    const c = apexAt || centroid(inner); const A = [c[0], c[1], depth + apex];
    for (let i = 0; i < n; i++) tris.push([inner[i], inner[(i + 1) % n], A]);
  }
  return tris.map(t => {
    let nn = norm(cross(sub(t[1], t[0]), sub(t[2], t[0])));
    if (nn[2] < 0) nn = nn.map(v => -v);
    return { pts: t, fill: shade(m, nn) };
  });
}
const both = (outline, mat, opts) => [...part(outline, mat, opts), ...part(mirrorX(outline), mat, opts)];

// ------------------------------------------------------------------ crest pieces
const SHIELD = [[100, 22], [150, 44], [150, 104], [100, 168], [50, 104], [50, 44]];
const shieldScaled = s => SHIELD.map(([x, y]) => [100 + (x - 100) * s, 96 + (y - 96) * s]);
const chevron = (y, w = 34, t = 12, drop = 16) => [[100 - w, y], [100, y + drop], [100 + w, y], [100 + w, y + t], [100, y + drop + t], [100 - w, y + t]];
const chevronArms = (y, w, t, drop) => { const c = chevron(y, w, t, drop); return [[c[0], c[1], c[4], c[5]], [c[1], c[2], c[3], c[4]]]; };
const RHOMB = (cx, cy, rx, ry) => [[cx, cy - ry], [cx + rx, cy], [cx, cy + ry], [cx - rx, cy]];
// A wing blade: a long tapered feather from a root behind the crest, angled (deg, up = positive),
// curling slightly upward at the tip. Blades fan so each one stays readable at 64px.
function blade([rx, ry], deg, len, w) {
  const a = deg * Math.PI / 180, d = [Math.cos(a), -Math.sin(a)], p = [-d[1], d[0]];
  const at = (t, o) => [rx + d[0] * len * t + p[0] * o, ry + d[1] * len * t + p[1] * o];
  return [at(0, -w * 0.5), at(0.5, -w * 0.62), at(1, -w * 1.05), at(0.78, -w * 0.05), at(0.42, w * 0.5), at(0, w * 0.5)];
}
const wingSet = (count, mat, matDk, { root = [138, 96], len = 64, w = 20, top = 34, bottom = 0 } = {}) => {
  const out = [];
  for (let k = 0; k < count; k++) {   // top feather first; each lower one overlaps it
    const t = count === 1 ? 0.5 : k / (count - 1), deg = top + (bottom - top) * t;
    const L = len * (1 - 0.42 * t), b = blade([root[0] - 6 * t, root[1] + 16 * t], deg, L, w * (1 - 0.2 * t));
    const ax = b[0][0] + (b[2][0] - b[0][0]) * 0.4, ay = b[0][1] + (b[2][1] - b[0][1]) * 0.4;
    out.push(...both(b, k % 2 ? matDk : mat, { bevel: 3, depth: 3.5, apex: 5, apexAt: [ax, ay] }));
  }
  return out;
};
const fins = (mat, y = 96) => both([[140, y - 14], [172, y], [140, y + 14], [148, y]], mat, { bevel: 3, depth: 4, apex: 4 });

const TIERS = [
  { id: 'iron', name: 'Iron', build: () => [
    ...part(shieldScaled(0.82), 'ironDark', { bevel: 7, depth: 8, plateau: 'flat' }),
    ...part(inset(shieldScaled(0.82), 9), 'ironMid', { bevel: 5, depth: 5, plateau: 'flat' }),
    ...chevronArms(94, 26, 12, 14).flatMap(a => part(a, 'iron', { bevel: 3, depth: 4, apex: 5 })),
  ] },
  { id: 'bronze', name: 'Bronze', build: () => [
    ...part(shieldScaled(0.9), 'bronzeDk', { bevel: 7, depth: 8, plateau: 'flat' }),
    ...part(inset(shieldScaled(0.9), 9), 'bronzeMd', { bevel: 5, depth: 5, plateau: 'flat' }),
    ...[76, 102].flatMap(y => chevronArms(y, 28, 12, 15).flatMap(a => part(a, 'bronze', { bevel: 3, depth: 4, apex: 5 }))),
  ] },
  { id: 'silver', name: 'Silver', build: () => [
    ...fins('silverDk'),
    ...part(RHOMB(100, 96, 56, 70), 'silverDk', { bevel: 8, depth: 9, plateau: 'flat' }),
    ...part(RHOMB(100, 96, 40, 52), 'silver', { bevel: 6, depth: 6, apex: 14 }),
  ] },
  { id: 'gold', name: 'Gold', build: () => [
    ...wingSet(2, 'gold', 'goldDk', { root: [134, 88], len: 46, w: 18, top: 26, bottom: 8 }),
    ...part(RHOMB(100, 96, 54, 70), 'goldDk', { bevel: 8, depth: 9, plateau: 'flat' }),
    ...part(RHOMB(100, 96, 40, 54), 'gold', { bevel: 6, depth: 6, plateau: 'flat' }),
    ...part(regular(100, 96, 21, 8, -Math.PI / 2, 25), 'gem', { bevel: 4, depth: 3, apex: 6, table: 7 }),
  ] },
  { id: 'platinum', name: 'Platinum', build: () => [
    ...wingSet(3, 'teal', 'tealDk', { root: [132, 86], len: 60, w: 20, top: 32, bottom: 4 }),
    ...part(RHOMB(100, 96, 56, 74), 'tealDk', { bevel: 8, depth: 9, plateau: 'flat' }),
    ...part(RHOMB(100, 96, 44, 60), 'teal', { bevel: 7, depth: 6, plateau: 'flat' }),
    ...part(RHOMB(100, 96, 25, 35), 'gemTeal', { bevel: 5, depth: 3, apex: 7, table: 8 }),
  ] },
  { id: 'diamond', name: 'Diamond', build: () => [
    ...wingSet(3, 'ice', 'iceDk', { root: [132, 84], len: 70, w: 22, top: 36, bottom: 4 }),
    ...part([[100, 6], [111, 30], [89, 30]], 'ice', { bevel: 2.5, depth: 3, apex: 4 }),
    ...part(RHOMB(100, 98, 58, 76), 'iceDk', { bevel: 8, depth: 9, plateau: 'flat' }),
    ...part(regular(100, 98, 44, 8, -Math.PI / 2, 60), 'ice', { bevel: 7, depth: 6, plateau: 'flat' }),
    ...part(regular(100, 98, 27, 8, -Math.PI / 2, 37), 'gemIce', { bevel: 5, depth: 3, apex: 7, table: 9 }),
  ] },
  { id: 'master', name: 'Master', build: () => [
    ...wingSet(4, 'amethyst', 'amethDk', { root: [130, 80], len: 78, w: 22, top: 40, bottom: 2 }),
    ...[[-28, 30], [0, 34], [28, 30]].flatMap(([dx, h]) => part([[100 + dx, 30 - h], [100 + dx + 9, 32], [100 + dx - 9, 32]], 'silver', { bevel: 2.5, depth: 3, apex: 4 })),
    ...part(RHOMB(100, 98, 58, 78), 'silverDk', { bevel: 8, depth: 9, plateau: 'flat' }),
    ...part(RHOMB(100, 98, 47, 64), 'amethDk', { bevel: 6, depth: 6, plateau: 'flat' }),
    ...part(star(100, 98, 40, 17, 4), 'amethyst', { bevel: 4, depth: 5, apex: 12 }),
    ...part(regular(100, 98, 9, 4, 0), 'gem', { bevel: 2.5, depth: 2, apex: 3, table: 3 }),
  ] },
  { id: 'champion', name: 'Champion', build: () => [
    ...wingSet(4, 'gold', 'goldDk', { root: [130, 82], len: 86, w: 24, top: 42, bottom: 2 }),
    // crown: three spikes on a band, small ruby tips
    ...part([[62, 34], [70, 6], [82, 26], [100, -2], [118, 26], [130, 6], [138, 34]], 'gold', { bevel: 4, depth: 5, apex: 6, apexAt: [100, 24] }),
    ...[[70, 9], [100, 2], [130, 9]].flatMap(([x, y]) => part(regular(x, y + 2, 6, 4, 0), 'ruby', { bevel: 2, depth: 2, apex: 3 })),
    ...part(RHOMB(100, 100, 60, 78), 'goldDk', { bevel: 8, depth: 10, plateau: 'flat' }),
    ...part(RHOMB(100, 100, 48, 64), 'gold', { bevel: 6, depth: 6, plateau: 'flat' }),
    ...part(regular(100, 100, 34, 6, -Math.PI / 2, 46), 'rubyDk', { bevel: 5, depth: 5, plateau: 'flat' }),
    ...part(regular(100, 100, 25, 6, -Math.PI / 2, 35), 'ruby', { bevel: 4, depth: 3, apex: 7, table: 9 }),
  ] },
];

// ------------------------------------------------------------------ emit
const f = v => +v.toFixed(2);
function svg(tris) {
  // fit the art: compute bounds and pad, so every crest fills its square the same way
  const xs = tris.flatMap(t => t.pts.map(p => p[0])), ys = tris.flatMap(t => t.pts.map(p => p[1]));
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const side = Math.max(maxX - minX, maxY - minY) + 8, cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const vb = `${f(cx - side / 2)} ${f(cy - side / 2)} ${f(side)} ${f(side)}`;
  // same-colour hairline closes antialias seams between facets
  const polys = tris.map(t => `<path d="M${t.pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L')}Z" fill="${t.fill}" stroke="${t.fill}" stroke-width=".35" stroke-linejoin="round"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${polys}</svg>\n`;
}
for (const [i, t] of TIERS.entries()) {
  const out = new URL(`rank-${i}-${t.id}.svg`, OUT);
  const s = svg(t.build());
  writeFileSync(out, s);
  console.log(out.pathname.split('/').slice(-2).join('/'), (s.length / 1024).toFixed(1) + 'KB');
}
