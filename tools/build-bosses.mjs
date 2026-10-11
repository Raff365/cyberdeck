// Builds the five weekly boss monsters as flat-shaded low-poly SVGs: node tools/build-bosses.mjs
//
// Same plate as tools/build-crests.mjs, so bosses and rank crests read as one game: every boss is
// MODELLED as meshes, not drawn as shapes, and every triangle gets ONE flat colour from its normal
// against one key light (upper left), a cool rim light (lower right) and a specular term.
// No gradients, no texture: the facet is the mark. Parts are drawn back to front.
//
// Three mesh kinds, all built from a 2D outline lifted into z:
//   part  - the crest bevel: outer edge z=0, mitered inset ring raised, plateau fanned to an apex
//           or cut as a gem table (hard things: crowns, fangs, crystals, eyes, Z's)
//   dome  - the same idea with the rings scaled toward a centre instead of mitered, so soft,
//           lumpy outlines (slime, hoods, heads) stay valid and read as rounded low-poly volumes
//   tube  - a ridged strip along a spine (necks, tentacles, nightcap), one facet per side per step
// Eyes are emissive gems: bright facets in the eye colour over a dark socket, with two flat,
// faceted halo rings at low opacity so they glow on the dark indigo ground. Deterministic.
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = new URL('../bosses/', import.meta.url);
mkdirSync(OUT, { recursive: true });

// ------------------------------------------------------------------ vector maths (y down, z to viewer)
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const KEY = norm([-0.55, -0.75, 0.62]);   // upper left, in front
const RIM = norm([0.7, 0.55, 0.35]);      // lower right, cool
const VIEW = [0, 0, 1];
const HALF = norm([KEY[0] + VIEW[0], KEY[1] + VIEW[1], KEY[2] + VIEW[2]]);

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const toHex = c => '#' + c.map(v => Math.round(255 * Math.min(1, Math.max(0, v))).toString(16).padStart(2, '0')).join('');

// A material: base colour, specular strength / tightness, rim tint, ambient. Emissive materials
// (eyes) simply run a very high ambient so every facet stays bright and only the hue shifts.
const MAT = {
  gold:      { base: '#e7b23a', spec: 0.80, pow: 20, rim: '#fff0b8', amb: 0.30 },
  goldDk:    { base: '#a8731a', spec: 0.60, pow: 16, rim: '#ffd27a', amb: 0.30 },
  ruby:      { base: '#ff3b4e', spec: 0.85, pow: 28, rim: '#ffd0d6', amb: 0.42 },
  // 0 procrastinator
  slime:     { base: '#9d93c2', spec: 0.55, pow: 16, rim: '#d8d0ff', amb: 0.36 },
  slimeLid:  { base: '#857bae', spec: 0.45, pow: 14, rim: '#cfc4ff', amb: 0.36 },
  slimeDk:   { base: '#62598a', spec: 0.40, pow: 14, rim: '#b3a6ee', amb: 0.36 },
  socketLav: { base: '#1f1934', spec: 0.10, pow: 6,  rim: '#4c4277', amb: 0.50 },
  mouthLav:  { base: '#2a1d3c', spec: 0.10, pow: 6,  rim: '#5a3f78', amb: 0.50 },
  tongue:    { base: '#ff7aa6', spec: 0.60, pow: 16, rim: '#ffd0e0', amb: 0.40 },
  drool:     { base: '#cdeaff', spec: 0.90, pow: 20, rim: '#ffffff', amb: 0.55 },
  eyeYel:    { base: '#ffd23c', spec: 0.50, pow: 6,  rim: '#fff7c8', amb: 0.92 },
  // 1 hydra
  scale:     { base: '#1fb38a', spec: 0.50, pow: 18, rim: '#a8ffe2', amb: 0.36 },
  scaleDk:   { base: '#137258', spec: 0.40, pow: 14, rim: '#86f0cf', amb: 0.36 },
  belly:     { base: '#b9ec7c', spec: 0.45, pow: 16, rim: '#f0ffd0', amb: 0.38 },
  horn:      { base: '#dff3e6', spec: 0.60, pow: 20, rim: '#ffffff', amb: 0.40 },
  fang:      { base: '#f7f4ea', spec: 0.70, pow: 20, rim: '#ffffff', amb: 0.50 },
  mouthRed:  { base: '#3d0c25', spec: 0.10, pow: 6,  rim: '#7a2048', amb: 0.50 },
  tongueRed: { base: '#ff4778', spec: 0.60, pow: 16, rim: '#ffc0d4', amb: 0.40 },
  socketTl:  { base: '#05261f', spec: 0.10, pow: 6,  rim: '#1f5a4c', amb: 0.50 },
  eyeCyan:   { base: '#3cf0ff', spec: 0.50, pow: 6,  rim: '#e6ffff', amb: 0.92 },
  // 2 golem
  candy:     { base: '#ff3fa4', spec: 0.80, pow: 26, rim: '#ffd0ec', amb: 0.38 },
  candyDk:   { base: '#b3136c', spec: 0.60, pow: 20, rim: '#ff9ad2', amb: 0.36 },
  candyWh:   { base: '#fff0f7', spec: 0.70, pow: 22, rim: '#ffffff', amb: 0.50 },
  candyRed:  { base: '#ff2d55', spec: 0.80, pow: 24, rim: '#ffc8d4', amb: 0.40 },
  mouthMag:  { base: '#3a0626', spec: 0.10, pow: 6,  rim: '#7a1a52', amb: 0.50 },
  socketMg:  { base: '#2a0420', spec: 0.10, pow: 6,  rim: '#6a1048', amb: 0.50 },
  eyeOrg:    { base: '#ff9a1f', spec: 0.50, pow: 6,  rim: '#fff0c0', amb: 0.92 },
  // 3 wraith
  robe:      { base: '#3d44a8', spec: 0.30, pow: 12, rim: '#9aa8ff', amb: 0.40 },
  robeDk:    { base: '#282d78', spec: 0.25, pow: 10, rim: '#8090f0', amb: 0.40 },
  hoodLip:   { base: '#5a66d0', spec: 0.40, pow: 14, rim: '#c8d0ff', amb: 0.40 },
  voidInk:   { base: '#07061a', spec: 0.05, pow: 6,  rim: '#1c1a48', amb: 0.50 },
  capPale:   { base: '#c3d0ff', spec: 0.50, pow: 16, rim: '#ffffff', amb: 0.45 },
  pompom:    { base: '#eef3ff', spec: 0.40, pow: 10, rim: '#ffffff', amb: 0.55 },
  zGlow:     { base: '#9cc6ff', spec: 0.60, pow: 10, rim: '#ffffff', amb: 0.70 },
  eyeWht:    { base: '#d4efff', spec: 0.50, pow: 6,  rim: '#ffffff', amb: 0.95 },
  // 4 kraken
  kraken:    { base: '#f2522c', spec: 0.55, pow: 18, rim: '#ffc4a0', amb: 0.36 },
  krakenDk:  { base: '#a82818', spec: 0.45, pow: 14, rim: '#ff9a78', amb: 0.36 },
  krSpot:    { base: '#ff9a52', spec: 0.50, pow: 16, rim: '#ffe0c0', amb: 0.40 },
  sucker:    { base: '#ffc79e', spec: 0.50, pow: 16, rim: '#fff0e0', amb: 0.45 },
  brow:      { base: '#6e1810', spec: 0.30, pow: 10, rim: '#d05a40', amb: 0.40 },
  socketRd:  { base: '#2a0806', spec: 0.10, pow: 6,  rim: '#6a2010', amb: 0.50 },
  eyeGrn:    { base: '#62ff5a', spec: 0.50, pow: 6,  rim: '#eaffe0', amb: 0.92 },
};
const shade = (m, n) => {
  const b = hex(m.base), r = hex(m.rim);
  const d = Math.max(0, dot(n, KEY)), rim = Math.max(0, dot(n, RIM)) ** 2;
  const s = m.spec * Math.max(0, dot(n, HALF)) ** m.pow;
  return toHex(b.map((v, i) => v * (m.amb + 0.95 * d) + r[i] * 0.42 * rim + s));
};
// one lit triangle; the normal always faces the viewer
const lit = (t, mat) => {
  let n = norm(cross(sub(t[1], t[0]), sub(t[2], t[0])));
  if (n[2] < 0) n = n.map(v => -v);
  return { pts: t, fill: shade(MAT[mat], n) };
};

// ------------------------------------------------------------------ 2D helpers
const area = p => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2;
const centroid = p => { const n = p.length; return [p.reduce((s, q) => s + q[0], 0) / n, p.reduce((s, q) => s + q[1], 0) / n]; };
// Mitered inward offset of a simple polygon by d (works for the modest bevels used here).
function inset(p, d) {
  const sgn = area(p) > 0 ? 1 : -1, n = p.length;
  const lines = p.map((a, i) => {
    const b = p[(i + 1) % n], e = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(...e);
    const nrm = [-e[1] / l * sgn, e[0] / l * sgn];
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
const mirrorPt = ([x, y]) => [200 - x, y];
const mirrorX = p => p.map(mirrorPt).reverse();          // mirrored outline, winding kept
// symmetric outline from its right half, listed top-on-axis -> down the right side -> bottom-on-axis
const sym = half => [...half, ...half.slice(1, -1).map(mirrorPt).reverse()];
const ellipse = (cx, cy, rx, ry, n, rot = -Math.PI / 2) => Array.from({ length: n }, (_, i) => { const a = rot + i * 2 * Math.PI / n; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; });
// closed Catmull-Rom resample: few control points in, an evenly rounded low-poly outline out
function smooth(ctrl, per = 2) {
  const n = ctrl.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = ctrl[(i - 1 + n) % n], p1 = ctrl[i], p2 = ctrl[(i + 1) % n], p3 = ctrl[(i + 2) % n];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map(d => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
    }
  }
  return out;
}
// place local art: rotate (deg, clockwise on screen), scale, translate
const place = (pts, [tx, ty], rot = 0, s = 1) => {
  const a = rot * Math.PI / 180, c = Math.cos(a), si = Math.sin(a);
  return pts.map(([x, y]) => [tx + (x * c - y * si) * s, ty + (x * si + y * c) * s]);
};
// keep the part of a convex polygon on the left of the directed line a->b (screen coords)
function clip(poly, a, b) {
  const side = p => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], sp = side(p), sq = side(q);
    if (sp <= 0) out.push(p);
    if ((sp < 0) !== (sq < 0) && sp !== 0 && sq !== 0) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
  }
  return out;
}
const bez = (P, n) => Array.from({ length: n + 1 }, (_, i) => {
  const t = i / n, u = 1 - t;
  if (P.length === 3) return [0, 1].map(d => u * u * P[0][d] + 2 * u * t * P[1][d] + t * t * P[2][d]);
  return [0, 1].map(d => u * u * u * P[0][d] + 3 * u * u * t * P[1][d] + 3 * u * t * t * P[2][d] + t * t * t * P[3][d]);
});

// ------------------------------------------------------------------ meshes
const band = (A, B, out) => { for (let i = 0; i < A.length; i++) { const j = (i + 1) % A.length; out.push([A[i], A[j], B[j]], [A[i], B[j], B[i]]); } };
const fanTo = (R, P, out) => { for (let i = 0; i < R.length; i++) out.push([R[i], R[(i + 1) % R.length], P]); };
const z = (p, h) => p.map(([x, y]) => [x, y, h]);

// The crest bevel. opts: bevel (inset px), depth (bevel rise), apex (plateau peak rise),
// apexAt (2D peak; default centroid), plateau 'apex' | 'flat', table (gem cut width).
function part(outline, mat, { bevel = 5, depth = 6, apex = 10, apexAt, plateau = 'apex', table = 0 } = {}) {
  const tris = [], outer = z(outline, 0), inner = z(inset(outline, bevel), depth);
  band(outer, inner, tris);
  if (table) {
    const ringT = z(inset(outline, bevel + table), depth + apex);
    band(inner, ringT, tris);
    const c = centroid(ringT); fanTo(ringT, [c[0], c[1], depth + apex], tris);
  } else if (plateau === 'flat') {
    const c = centroid(inner); fanTo(inner, [c[0], c[1], depth], tris);
  } else {
    const c = apexAt || centroid(inner); fanTo(inner, [c[0], c[1], depth + apex], tris);
  }
  return tris.map(t => lit(t, mat));
}
// Rounded volume: rings scale toward a centre (and may drift, so the crown of the dome sits
// where the form is fullest); stays valid for any outline that is star-shaped about the centre.
// rings: [[scale, height, dx, dy], ...] outer to inner; then a fan to the apex.
function dome(outline, mat, { c, rings = [[0.78, 10], [0.45, 17]], apex = 20, apexAt } = {}) {
  c = c || centroid(outline);
  const tris = [], R = [z(outline, 0)];
  for (const [s, h, dx = 0, dy = 0] of rings) R.push(outline.map(([x, y]) => [c[0] + (x - c[0]) * s + dx, c[1] + (y - c[1]) * s + dy, h]));
  for (let k = 0; k < R.length - 1; k++) band(R[k], R[k + 1], tris);
  const last = rings.length ? rings[rings.length - 1] : [1, 0, 0, 0];
  const A = apexAt || [c[0] + (last[2] || 0), c[1] + (last[3] || 0)];
  fanTo(R[R.length - 1], [A[0], A[1], apex], tris);
  return tris.map(t => lit(t, mat));
}
// Ridged strip along a spine: edges at z=0, a raised crown line, width per sample.
// cross-section 'ridge' = edge|ridge|edge, 'flat' = edge|shoulder|shoulder|edge.
// mats: per-segment material list (cycled) for stripes.
function tube(spine, widths, mat, { lift = 0.9, shape = 'flat', shoulder = 0.45, mats } = {}) {
  const n = spine.length, tris = [];
  const secs = spine.map((p, i) => {
    const a = spine[Math.max(0, i - 1)], b = spine[Math.min(n - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, d = [(b[0] - a[0]) / l, (b[1] - a[1]) / l], q = [-d[1], d[0]];
    const w = widths[i], h = w * lift, at = (o, zz) => [p[0] + q[0] * o, p[1] + q[1] * o, zz];
    return shape === 'ridge' ? [at(w, 0), at(0, h), at(-w, 0)] : [at(w, 0), at(w * shoulder, h), at(-w * shoulder, h), at(-w, 0)];
  });
  const out = [];
  for (let i = 0; i < n - 1; i++) {
    const m = mats ? mats[i % mats.length] : mat, A = secs[i], B = secs[i + 1];
    for (let k = 0; k < A.length - 1; k++) {
      out.push(lit([A[k], B[k], B[k + 1]], m), lit([A[k], B[k + 1], A[k + 1]], m));
    }
  }
  return out;
}
// flat faceted halo (low opacity polygon, no shading) for glows
const halo = (outline, col, op, s, c = centroid(outline)) => ({ pts: outline.map(([x, y]) => [c[0] + (x - c[0]) * s, c[1] + (y - c[1]) * s]), fill: col, op });
// An emissive eye: two soft halo rings, a dark socket, then a gem-cut glowing eye.
function eye(outline, mat, { socket, sock = 1.35, glow = [2.1, 1.55], ops = [0.13, 0.2], table = 2, bevel = 1.6, depth = 2, apex = 2.5 } = {}) {
  const col = MAT[mat].base, c = centroid(outline), out = [];
  glow.forEach((s, i) => out.push(halo(outline, col, ops[i], s, c)));
  if (socket) out.push(...part(outline.map(([x, y]) => [c[0] + (x - c[0]) * sock, c[1] + (y - c[1]) * sock]), socket, { bevel: 1.5, depth: 1, plateau: 'flat' }));
  out.push(...part(outline, mat, { bevel, depth, apex, table }));
  return out;
}

// ------------------------------------------------------------------ 0 THE PROCRASTINATOR
function procrastinator() {
  const out = [];
  // puddle it is melting into
  const pud = ellipse(100, 172, 90, 13, 18).map(([x, y], i) => i % 2 ? [x, y + 1.5] : [x, y]);
  out.push(...dome(pud, 'slimeDk', { rings: [[0.7, 3]], apex: 4 }));
  // the blob: narrow lazy head, belly sagging out over the puddle
  const body = smooth(sym([[100, 44], [126, 48], [145, 61], [157, 82], [162, 106], [167, 128], [176, 148], [186, 164], [166, 174], [130, 176], [100, 177]]), 1);
  out.push(...dome(body, 'slime', { c: [100, 118], rings: [[0.84, 16, 0, -2], [0.56, 30, 0, -9], [0.26, 37, 0, -14]], apex: 39 }));
  // drips running down over the lower edge into the puddle
  const drip = (x, y0, y1, w) => [[x, y0 - w], [x + w * 0.8, y0], [x + w * 0.85, y0 + (y1 - y0) * 0.5], [x + w * 1.2, y1 - w * 1.2], [x + w * 0.85, y1 - w * 0.2], [x, y1], [x - w * 0.85, y1 - w * 0.2], [x - w * 1.2, y1 - w * 1.2], [x - w * 0.85, y0 + (y1 - y0) * 0.5], [x - w * 0.8, y0]];
  for (const [x, y0, y1, w] of [[54, 146, 184, 6.5], [146, 150, 190, 7.5], [168, 156, 180, 5]]) {
    out.push(...part(drip(x, y0, y1, w), 'slime', { bevel: 2.4, depth: 3, apex: 3, apexAt: [x - w * 0.2, y1 - w * 1.4] }));
  }
  // heavy-lidded eyes: glowing slit under a drooping lid (lid line slopes down to the outside)
  for (const side of [1, -1]) {
    const cx = 100 + side * 25, cy = 98;
    const lidA = [cx - side * 20, cy - 3], lidB = [cx + side * 20, cy + 4];
    const [a, b] = side > 0 ? [lidB, lidA] : [lidA, lidB];       // keep the side below the lid line
    const sock = ellipse(cx, cy, 18, 15, 12);
    out.push(...part(sock, 'socketLav', { bevel: 2, depth: 1.5, plateau: 'flat' }));
    const iris = clip(ellipse(cx, cy, 14.5, 12, 14), [a[0], a[1] - 0.5], [b[0], b[1] - 0.5]);
    const col = MAT.eyeYel.base;
    out.push(halo(iris, col, 0.14, 2.0, [cx, cy + 4]), halo(iris, col, 0.22, 1.5, [cx, cy + 4]));
    out.push(...part(iris, 'eyeYel', { bevel: 1.6, depth: 2, apex: 2.5, table: 2 }));
    const lid = clip(ellipse(cx, cy - 0.5, 19.5, 16.5, 14), b, a);
    out.push(...part(lid, 'slimeLid', { bevel: 3, depth: 4, apex: 5, apexAt: [cx - side * 2, cy - 9] }));
  }
  // lazy open mouth, tongue lolling, drool
  const mouth = [[74, 130], [88, 132], [100, 133], [112, 132], [126, 129], [122, 138], [111, 143], [100, 144], [89, 143], [79, 139]];
  out.push(...part(mouth, 'mouthLav', { bevel: 1.8, depth: 1, plateau: 'flat' }));
  out.push(...dome(ellipse(110, 143, 10, 6.5, 10), 'tongue', { rings: [[0.6, 3]], apex: 4.5 }));
  out.push(...part([[77, 136], [81, 137], [80, 148], [82.5, 154], [78.5, 158], [74.5, 154], [76.5, 148]], 'drool', { bevel: 1, depth: 1.5, apex: 1.5, apexAt: [78, 153] }));
  // tiny crown sliding off to one side
  const at = p => place(p, [83, 48], -22);
  for (const [x, h] of [[-10, 17], [0, 21], [10, 17]]) out.push(...part(at([[x - 5, -5], [x, -h], [x + 5, -5]]), 'gold', { bevel: 1.4, depth: 2, apex: 2 }));
  out.push(...part(at([[-14, 0], [14, 0], [14, -7.5], [-14, -7.5]]), 'goldDk', { bevel: 1.6, depth: 2, plateau: 'flat' }));
  for (const [x, y] of [[-10, -17], [0, -21], [10, -17]]) out.push(...part(at(ellipse(x, y, 2.6, 2.6, 4)), 'ruby', { bevel: 0.9, depth: 1, apex: 1.2 }));
  out.push(...part(at(ellipse(0, -3.7, 3, 2.4, 6)), 'ruby', { bevel: 0.9, depth: 1, apex: 1.4 }));
  return out;
}

// ------------------------------------------------------------------ 1 DOOMSCROLL HYDRA
// one serpent head in local units (origin between the eyes, +y down), placed by place()
function serpentHead(at, { tongue = false } = {}) {
  const out = [], P = p => at(p);
  // swept-back horns
  for (const s of [1, -1]) {
    const h = ([x, y]) => [s * x, y];
    out.push(...part(P([[14, -22], [33, -46], [24, -16]].map(h)), 'horn', { bevel: 1.6, depth: 2.5, apex: 3 }));
    out.push(...part(P([[24, -10], [44, -24], [28, -2]].map(h)), 'scaleDk', { bevel: 1.6, depth: 2.5, apex: 3 }));
  }
  // lower jaw, mouth, tongue, fangs
  out.push(...part(P(sym([[0, 8], [14, 9], [19, 18], [12, 32], [0, 37]].map(([x, y]) => [x + 100, y])).map(([x, y]) => [x - 100, y])), 'scaleDk', { bevel: 3, depth: 3, apex: 4, apexAt: P([[0, 30]])[0] }));
  out.push(...part(P([[-13, 12], [13, 12], [11, 22], [6, 28], [0, 30], [-6, 28], [-11, 22]]), 'mouthRed', { bevel: 1.5, depth: 1, plateau: 'flat' }));
  if (tongue) {
    out.push(...part(P([[-2.4, 18], [2.4, 18], [2.6, 38], [7, 47], [1.2, 41.5], [0, 44], [-1.2, 41.5], [-7, 47], [-2.6, 38]]), 'tongueRed', { bevel: 0.9, depth: 1.2, apex: 1, apexAt: P([[0, 30]])[0] }));
  }
  for (const s of [1, -1]) out.push(...part(P([[s * 5, 10], [s * 12, 10], [s * 8.2, 25]]), 'fang', { bevel: 1, depth: 1.5, apex: 2 }));
  // upper head: broad crown narrowing to the snout
  const head = sym([[0, -30], [15, -28], [26, -18], [30, -6], [26, 5], [17, 13], [7, 15.5], [0, 16]].map(([x, y]) => [x + 100, y])).map(([x, y]) => [x - 100, y]);
  out.push(...dome(P(head), 'scale', { c: P([[0, -4]])[0], rings: [[0.66, 9]], apex: 13 }));
  // nostrils
  for (const s of [1, -1]) out.push(...part(P([[s * 3, 9], [s * 7, 7.5], [s * 6, 10.5]]), 'socketTl', { bevel: 0.5, depth: 0.5, plateau: 'flat' }));
  // slanted eyes under hard brows
  for (const s of [1, -1]) {
    const e = P([[5, -4], [12, -6], [21, -11], [20, -4], [14, 1], [7, 0.5]].map(([x, y]) => [s * x, y]));
    out.push(...eye(s > 0 ? e : e.reverse(), 'eyeCyan', { socket: 'socketTl', sock: 1.3, glow: [2.2, 1.6], ops: [0.14, 0.22], table: 1.6, bevel: 1.2, depth: 1.5, apex: 2 }));
    const br = P([[3, -9], [22, -17], [25, -13], [5, -5.5]].map(([x, y]) => [s * x, y]));
    out.push(...part(br, 'scaleDk', { bevel: 1.4, depth: 2.5, apex: 2.5 }));
  }
  return out;
}
function hydra() {
  const out = [];
  // coiled body the necks rise from
  out.push(...dome(smooth(sym([[100, 146], [128, 148], [152, 158], [168, 174], [162, 188], [134, 194], [100, 196]]), 1), 'scaleDk', { rings: [[0.75, 10, 0, -2], [0.4, 17, 0, -4]], apex: 19 }));
  const neck = (spine, w0, w1) => {
    const ws = spine.map((_, i) => w0 + (w1 - w0) * i / (spine.length - 1));
    const o = [...tube(spine, ws, 'scale', { lift: 0.75 })];
    // belly plates up the throat, like chevron scales
    for (let i = 1; i < spine.length - 1; i++) {
      const p = spine[i], q = spine[i + 1], l = Math.hypot(q[0] - p[0], q[1] - p[1]), d = [(q[0] - p[0]) / l, (q[1] - p[1]) / l], n = [-d[1], d[0]];
      const w = ws[i] * 0.55, L = l * 0.42, at = (a, b) => [p[0] + n[0] * a + d[0] * b, p[1] + n[1] * a + d[1] * b];
      o.push(...part([at(-w, -L), at(0, -L + 3), at(w, -L), at(w, L), at(0, L + 3), at(-w, L)], 'belly', { bevel: 1.2, depth: 1.5, apex: 1.5 }));
    }
    return o;
  };
  const side = bez([[116, 180], [150, 156], [158, 112]], 7);
  out.push(...neck(side, 14, 10), ...neck(side.map(mirrorPt), 14, 10));
  out.push(...serpentHead(p => place(p, [158, 96], 16, 0.8)), ...serpentHead(p => place(p, [42, 96], -16, 0.8)));
  out.push(...neck(bez([[100, 186], [100, 140], [100, 92]], 7), 17, 12.5));
  out.push(...serpentHead(p => place(p, [100, 66], 0, 1.1), { tongue: true }));
  return out;
}

// ------------------------------------------------------------------ 2 SUGAR GOLEM
// rock-candy crystal: hex prism with a pointed tip, leaning by deg
const crystal = (x, y, deg, h, w, mat) => part(place([[-w, 2], [-w, -h * 0.72], [0, -h], [w, -h * 0.72], [w, 2]], [x, y], deg), mat, { bevel: Math.min(2.6, w * 0.35), depth: 3, apex: 4, apexAt: place([[0, -h * 0.62]], [x, y], deg)[0] });
// peppermint: alternating wedges, inner rings twisted so it swirls
function peppermint(cx, cy, r) {
  const n = 8, out = [];
  const ring = (s, tw, h) => Array.from({ length: n }, (_, i) => { const a = (i / n + tw) * 2 * Math.PI - Math.PI / 2; return [cx + Math.cos(a) * r * s, cy + Math.sin(a) * r * s, h]; });
  const R = [ring(1, 0, 0), ring(0.72, 0.04, 2.5), ring(0.38, 0.09, 4)], A = [cx, cy, 5];
  for (let k = 0; k < 2; k++) for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, m = i % 2 ? 'candyWh' : 'candyRed';
    out.push(lit([R[k][i], R[k][j], R[k + 1][j]], m), lit([R[k][i], R[k + 1][j], R[k + 1][i]], m));
  }
  for (let i = 0; i < n; i++) out.push(lit([R[2][i], R[2][(i + 1) % n], A], i % 2 ? 'candyWh' : 'candyRed'));
  return out;
}
function golem() {
  const out = [];
  // shards on the crown, behind the head block
  for (const [x, deg, h, w, m] of [[70, -34, 34, 7, 'candyWh'], [84, -14, 44, 8, 'candy'], [100, 0, 54, 9, 'candyWh'], [116, 14, 44, 8, 'candy'], [130, 34, 34, 7, 'candyWh']]) out.push(...crystal(x, 54, deg, h, w, m));
  // chest
  out.push(...part([[62, 118], [138, 118], [152, 186], [48, 186]], 'candyDk', { bevel: 6, depth: 6, plateau: 'flat' }));
  // shoulders with crystal growths and peppermint studs
  for (const s of [1, -1]) {
    const S = pts => s > 0 ? pts : mirrorX(pts);
    out.push(...crystal(100 + s * 52, 112, s * 22, 30, 6.5, 'candyWh'), ...crystal(100 + s * 76, 124, s * 50, 24, 6, 'candy'));
    out.push(...part(S([[126, 114], [158, 102], [184, 116], [194, 142], [186, 170], [156, 184], [132, 176], [122, 146]]), 'candy', { bevel: 7, depth: 8, apex: 10, apexAt: [100 + s * 60, 136] }));
    out.push(...peppermint(100 + s * 60, 144, 15));
  }
  // head: brow block, boxy jaw
  out.push(...part(sym([[100, 46], [128, 46], [142, 58], [146, 82], [140, 102], [100, 102]]), 'candy', { bevel: 7, depth: 8, plateau: 'flat' }));
  out.push(...part(sym([[100, 98], [140, 98], [154, 114], [152, 146], [136, 162], [100, 162]]), 'candy', { bevel: 7, depth: 9, apex: 4, apexAt: [100, 150] }));
  // mouth: grimace with square candy teeth and two tusks
  out.push(...part(sym([[100, 116], [130, 116], [134, 132], [128, 142], [100, 142]]), 'mouthMag', { bevel: 2, depth: 1, plateau: 'flat' }));
  for (const [x0, x1] of [[73, 86], [88, 99], [101, 112], [114, 127]]) out.push(...part([[x0, 115], [x1, 115], [x1 - 0.5, 124], [x0 + 0.5, 124]], 'candyWh', { bevel: 1.5, depth: 2, plateau: 'flat' }));
  for (const s of [1, -1]) out.push(...part(s > 0 ? [[116, 143], [130, 143], [126, 125]] : [[70, 143], [84, 143], [74, 125]], 'candyWh', { bevel: 1.6, depth: 2, apex: 3 }));
  // eyes deep under an angry V brow
  for (const s of [1, -1]) {
    const e = [[106, 84], [130, 78], [134, 86], [126, 94], [108, 93]];
    out.push(...eye(s > 0 ? e : mirrorX(e), 'eyeOrg', { socket: 'socketMg', sock: 1.3, table: 2.4, bevel: 1.8, depth: 2, apex: 2.5 }));
  }
  const arm = [[100, 72], [146, 58], [148, 70], [100, 86]];
  out.push(...part(arm, 'candyDk', { bevel: 2.5, depth: 4, apex: 4 }), ...part(mirrorX(arm), 'candyDk', { bevel: 2.5, depth: 4, apex: 4 }));
  return out;
}

// ------------------------------------------------------------------ 3 SNOOZE WRAITH
function zee(cx, cy, s, deg) {
  const h = s / 2, t = s * 0.27, P = p => place(p, [cx, cy], deg);
  const o = { bevel: Math.max(0.9, t * 0.28), depth: 2, apex: 2 };
  return [
    ...part(P([[h - t * 1.3, -h + t * 0.6], [h, -h + t * 0.6], [-h + t * 1.3, h - t * 0.6], [-h, h - t * 0.6]]), 'zGlow', o),
    ...part(P([[-h, -h], [h, -h], [h, -h + t], [-h, -h + t]]), 'zGlow', o),
    ...part(P([[-h, h - t], [h, h - t], [h, h], [-h, h]]), 'zGlow', o),
  ];
}
function wraith() {
  const out = [];
  // floating Z's, drifting up and away
  out.push(...zee(186, 8, 13, -14), ...zee(170, 30, 18, -10));
  // robe: hood over shoulders falling to a tattered hem
  const robe = sym([[100, 30], [130, 40], [150, 66], [156, 98], [166, 124], [176, 150], [186, 178], [166, 168], [158, 194], [140, 174], [124, 198], [112, 176], [100, 192]]);
  out.push(...dome(robe, 'robeDk', { c: [100, 110], rings: [[0.82, 12, 0, -3], [0.5, 22, 0, -12]], apex: 26 }));
  // drooping sleeves
  for (const s of [1, -1]) {
    const sp = bez([[100 + s * 46, 102], [100 + s * 70, 116], [100 + s * 82, 146]], 6);
    out.push(...tube(sp, [7, 8, 9, 10, 11, 12, 13], 'robe', { lift: 0.7 }));
  }
  // hood
  const hood = sym([[100, 20], [126, 26], [146, 44], [156, 70], [154, 98], [142, 118], [122, 130], [100, 133]]);
  out.push(...dome(hood, 'robe', { c: [100, 80], rings: [[0.8, 12, 0, -3], [0.55, 20, 0, -6]], apex: 24 }));
  // floppy nightcap flopping over to one side, stripes, pompom
  const capSp = bez([[100, 34], [104, 2], [62, -6], [38, 30]], 9);
  out.push(...tube(capSp, [22, 20, 17.5, 15, 12.5, 10, 8, 6.5, 5, 4], 'robe', { lift: 0.55, mats: ['capPale', 'robe'] }));
  out.push(...part(sym([[100, 26], [122, 30], [130, 40], [100, 34]]), 'capPale', { bevel: 2, depth: 3, apex: 3 }));
  out.push(...dome(ellipse(36, 36, 10, 10, 9), 'pompom', { rings: [[0.65, 6, -1, -1]], apex: 9 }));
  // hood opening: lit lip, then the void
  const open = sym([[100, 46], [116, 52], [128, 68], [128, 92], [116, 110], [100, 116]]);
  out.push(...part(open.map(([x, y]) => [100 + (x - 100) * 1.16, 81 + (y - 81) * 1.12]), 'hoodLip', { bevel: 4, depth: 4, plateau: 'flat' }));
  out.push(...part(open, 'voidInk', { bevel: 3, depth: 1, plateau: 'flat' }));
  // two glowing eyes in the dark, sleepy but cross
  for (const s of [1, -1]) {
    const e = [[104, 82], [113, 80], [123, 77], [122, 85], [115, 90], [107, 88]];
    out.push(...eye(s > 0 ? e : mirrorX(e), 'eyeWht', { glow: [2.3, 1.6], ops: [0.12, 0.2], table: 1.8, bevel: 1.4, depth: 2, apex: 2.5 }));
  }
  // and one big Z right next to it
  out.push(...zee(152, 50, 24, -8));
  return out;
}

// ------------------------------------------------------------------ 4 COUCH KRAKEN
// tentacle spine: starts at p0 heading a0 (deg, 0 = right, 90 = up), turns `turn` degrees,
// tightening toward the tip so it ends in a curl
function curl(p0, a0, len, turn, n = 12, ease = 1.7) {
  const pts = [p0]; let [x, y] = p0;
  for (let i = 1; i <= n; i++) {
    const t = (i - 0.5) / n, a = (a0 + turn * t ** ease) * Math.PI / 180, ds = len / n * (1.3 - 0.75 * t);
    x += Math.cos(a) * ds; y -= Math.sin(a) * ds; pts.push([x, y]);
  }
  return pts;
}
function tentacle(sp, w0, mat = 'kraken') {
  const n = sp.length, ws = sp.map((_, i) => 1.2 + w0 * (1 - i / (n - 1)) ** 0.85);
  const out = tube(sp, ws, mat, { lift: 0.8, shape: 'ridge' });
  // suckers along the inside of the curl
  for (const i of [3, 5, 7, 9]) {
    if (i >= n - 1) continue;
    const p = sp[i], a = sp[i - 1], b = sp[i + 1], m = [(a[0] + b[0]) / 2 - p[0], (a[1] + b[1]) / 2 - p[1]], l = Math.hypot(...m) || 1;
    const c = [p[0] + m[0] / l * ws[i] * 0.45, p[1] + m[1] / l * ws[i] * 0.45], r = ws[i] * 0.36;
    out.push(...dome(ellipse(c[0], c[1], r, r, 5), 'sucker', { rings: [], apex: r * 0.8 }));
  }
  return out;
}
function kraken() {
  const out = [];
  const T = [
    [[134, 100], 4, 92, 285, 13],      // outer: sweeps out and curls up over
    [[124, 110], -40, 92, 250, 13],    // middle: down-right, curls up
    [[110, 116], -78, 74, 210, 12],    // inner: down, curls outward
  ];
  for (const [p0, a0, len, turn, w] of T) {
    const sp = curl(p0, a0, len, turn);
    out.push(...tentacle(sp.map(mirrorPt), w), ...tentacle(sp, w));
  }
  // big dome mantle
  const head = smooth(sym([[100, 14], [128, 18], [148, 32], [159, 54], [160, 80], [152, 102], [134, 116], [100, 124]]), 1);
  out.push(...dome(head, 'kraken', { c: [100, 74], rings: [[0.84, 14, 0, -4], [0.56, 27, 0, -12], [0.26, 33, 0, -17]], apex: 35 }));
  for (const [x, y, r] of [[78, 34, 6], [122, 34, 6], [60, 60, 4.5], [140, 60, 4.5], [100, 24, 4]]) out.push(...dome(ellipse(x, y, r, r * 0.85, 6), 'krSpot', { rings: [], apex: 2 }));
  // big angry eyes
  for (const s of [1, -1]) {
    const e = [[106, 72], [120, 74], [134, 66], [138, 76], [132, 88], [118, 92], [108, 86]];
    out.push(...eye(s > 0 ? e : mirrorX(e), 'eyeGrn', { socket: 'socketRd', sock: 1.25, table: 2.6, bevel: 2, depth: 2.5, apex: 3 }));
    const br = [[102, 66], [136, 52], [142, 60], [106, 76]];
    out.push(...part(s > 0 ? br : mirrorX(br), 'brow', { bevel: 2.4, depth: 3.5, apex: 4 }));
  }
  // grumpy little mouth
  out.push(...part([[90, 104], [100, 99], [110, 104], [108, 107.5], [100, 104], [92, 107.5]], 'socketRd', { bevel: 0.8, depth: 1, plateau: 'flat' }));
  return out;
}

const BOSSES = [
  { id: 'procrastinator', build: procrastinator },
  { id: 'hydra', build: hydra },
  { id: 'golem', build: golem },
  { id: 'wraith', build: wraith },
  { id: 'kraken', build: kraken },
];

// ------------------------------------------------------------------ emit
const f = v => +v.toFixed(1);
const d = pts => 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
function svg(items) {
  // fit the art: bounds of the solid facets (halos may bleed), square, padded
  const solid = items.filter(t => !t.op);
  const xs = solid.flatMap(t => t.pts.map(p => p[0])), ys = solid.flatMap(t => t.pts.map(p => p[1]));
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const side = Math.max(maxX - minX, maxY - minY) + 10, cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const vb = `${f(cx - side / 2)} ${f(cy - side / 2)} ${f(side)} ${f(side)}`;
  // consecutive facets of one colour share a path; a same-colour hairline closes antialias seams
  let body = '', run = null;
  const flush = () => { if (!run) return; body += run.op ? `<path d="${run.d}" fill="${run.fill}" fill-opacity="${run.op}" stroke="none"/>` : `<path d="${run.d}" fill="${run.fill}" stroke="${run.fill}"/>`; run = null; };
  for (const t of items) {
    if (run && run.fill === t.fill && run.op === t.op) { run.d += d(t.pts); continue; }
    flush(); run = { d: d(t.pts), fill: t.fill, op: t.op };
  }
  flush();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"><g stroke-width=".35" stroke-linejoin="round">${body}</g></svg>\n`;
}
for (const [i, b] of BOSSES.entries()) {
  const out = new URL(`boss-${i}-${b.id}.svg`, OUT);
  const s = svg(b.build());
  writeFileSync(out, s);
  console.log(out.pathname.split('/').slice(-2).join('/'), (s.length / 1024).toFixed(1) + 'KB');
}
