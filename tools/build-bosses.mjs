// Builds the five weekly boss monsters as flat-shaded low-poly SVGs: node tools/build-bosses.mjs
//
// Same plate as tools/build-crests.mjs, so bosses and rank crests read as one game: every boss is
// MODELLED as meshes, not drawn as shapes, and every triangle gets ONE flat colour from its normal
// against one key light (upper left), a cool rim light (lower right) and a specular term.
// No gradients, no texture: the facet is the mark. Parts are drawn back to front.
//
// Three mesh kinds, all built from a 2D outline lifted into z:
//   part  - the crest bevel: outer edge z=0, mitered inset ring raised, plateau fanned to an apex
//           or cut as a gem table (hard things: crowns, fangs, crystals, eyes, Z's, props)
//   dome  - a crest-style mitered edge ring, then two rings scaled toward a centre instead of
//           mitered, so soft, lumpy outlines (slime, hoods, heads) read as a few big rounded planes
//   tube  - a ridged strip along a spine (necks, coils, tentacles, sleeves), one facet per side
//           per step; each side strip can take its own material (tentacle undersides)
// Eyes are the shared signature: emissive gems in the eye colour with a white-hot core over a
// dark socket, ringed by two flat, faceted halos at low opacity so they glow on dark indigo.
// Each boss carries one big gag prop for its bad habit. Deterministic: no randomness.
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
// (eyes, screens) simply run a very high ambient so every facet stays bright and only the hue shifts.
const MAT = {
  gold:      { base: '#e7b23a', spec: 0.80, pow: 20, rim: '#fff0b8', amb: 0.30 },
  goldDk:    { base: '#a8731a', spec: 0.60, pow: 16, rim: '#ffd27a', amb: 0.30 },
  ruby:      { base: '#ff3b4e', spec: 0.85, pow: 28, rim: '#ffd0d6', amb: 0.42 },
  iron:      { base: '#8a92a6', spec: 0.55, pow: 16, rim: '#d0dcff', amb: 0.36 },
  gloss:     { base: '#f6f1ff', spec: 0.20, pow: 8,  rim: '#ffffff', amb: 0.95 },
  // 0 procrastinator: wet grape goo
  goo:       { base: '#7c4dff', spec: 0.90, pow: 30, rim: '#d2c2ff', amb: 0.38 },
  gooLt:     { base: '#b39dff', spec: 0.90, pow: 30, rim: '#efe8ff', amb: 0.40 },
  gooPd:     { base: '#4a2a9e', spec: 0.90, pow: 30, rim: '#c9b8ff', amb: 0.40 },
  gooLid:    { base: '#5a33cc', spec: 0.70, pow: 24, rim: '#c4b0ff', amb: 0.38 },
  gooSock:   { base: '#1e0b4a', spec: 0.10, pow: 6,  rim: '#4c2c9a', amb: 0.50 },
  gooMouth:  { base: '#26093e', spec: 0.10, pow: 6,  rim: '#5a2a80', amb: 0.50 },
  tongue:    { base: '#ff6fa8', spec: 0.60, pow: 24, rim: '#ffd0e0', amb: 0.42 },
  tongueDk:  { base: '#c23a78', spec: 0.00, pow: 6,  rim: '#c23a78', amb: 0.45 },
  wood:      { base: '#e3a55c', spec: 0.25, pow: 10, rim: '#ffe0b0', amb: 0.42 },
  woodDk:    { base: '#9a5a26', spec: 0.20, pow: 10, rim: '#e0a070', amb: 0.40 },
  ink:       { base: '#2b0f52', spec: 0.00, pow: 6,  rim: '#2b0f52', amb: 0.45 },
  eyeYel:    { base: '#ffd23c', spec: 0.50, pow: 6,  rim: '#fff7c8', amb: 0.92 },
  // 1 hydra: night emerald, lit from below by phone screens
  scale:     { base: '#0f6b55', spec: 0.55, pow: 18, rim: '#7dffd8', amb: 0.40 },
  scaleDk:   { base: '#083d33', spec: 0.40, pow: 14, rim: '#5fe8c4', amb: 0.40 },
  coil:      { base: '#0d5c49', spec: 0.55, pow: 18, rim: '#7dffd8', amb: 0.40 },
  jaw:       { base: '#0b5444', spec: 0.40, pow: 14, rim: '#3cf0ff', amb: 0.40 },
  belly:     { base: '#4fae7f', spec: 0.45, pow: 16, rim: '#c8ffe0', amb: 0.38 },
  spike:     { base: '#5fc79a', spec: 0.55, pow: 18, rim: '#d8fff0', amb: 0.40 },
  horn:      { base: '#dff3e6', spec: 0.60, pow: 20, rim: '#ffffff', amb: 0.40 },
  fang:      { base: '#f7f4ea', spec: 0.70, pow: 20, rim: '#ffffff', amb: 0.52 },
  mouthRed:  { base: '#3d0c25', spec: 0.10, pow: 6,  rim: '#7a2048', amb: 0.50 },
  tongueRed: { base: '#ff4778', spec: 0.60, pow: 16, rim: '#ffc0d4', amb: 0.42 },
  socketTl:  { base: '#03201a', spec: 0.10, pow: 6,  rim: '#1f5a4c', amb: 0.50 },
  phone:     { base: '#232a3c', spec: 0.60, pow: 20, rim: '#7ad8ff', amb: 0.45 },
  screen:    { base: '#b4fcff', spec: 0.00, pow: 6,  rim: '#ffffff', amb: 0.95 },
  screenDk:  { base: '#1fb6d8', spec: 0.00, pow: 6,  rim: '#ffffff', amb: 0.95 },
  eyeCyan:   { base: '#3cf0ff', spec: 0.50, pow: 6,  rim: '#e6ffff', amb: 0.92 },
  // 2 golem: hot-pink candy face in front of a deep raspberry body
  candy:     { base: '#ff3fa4', spec: 0.80, pow: 26, rim: '#ffd0ec', amb: 0.40 },
  candyLt:   { base: '#ff8fcf', spec: 0.85, pow: 28, rim: '#ffe6f6', amb: 0.42 },
  rasp:      { base: '#8e0d55', spec: 0.70, pow: 22, rim: '#ff7ac0', amb: 0.40 },
  raspDk:    { base: '#5e0638', spec: 0.60, pow: 20, rim: '#e0569e', amb: 0.40 },
  candyWh:   { base: '#fff2f8', spec: 0.95, pow: 30, rim: '#bff6ff', amb: 0.50 },
  candyRed:  { base: '#ff2d55', spec: 0.80, pow: 24, rim: '#ffc8d4', amb: 0.42 },
  cornY:     { base: '#ffcf1f', spec: 0.60, pow: 20, rim: '#fff4c0', amb: 0.50 },
  cornO:     { base: '#ff7a14', spec: 0.60, pow: 20, rim: '#ffd0a0', amb: 0.50 },
  mouthMag:  { base: '#3a0626', spec: 0.10, pow: 6,  rim: '#7a1a52', amb: 0.50 },
  socketMg:  { base: '#26021b', spec: 0.10, pow: 6,  rim: '#6a1048', amb: 0.50 },
  eyeHot:    { base: '#ffc21a', spec: 0.50, pow: 6,  rim: '#fff8d8', amb: 0.92 },
  // 3 wraith
  robe:      { base: '#5a66e0', spec: 0.35, pow: 12, rim: '#c9b8ff', amb: 0.42 },
  robeDk:    { base: '#3d47b0', spec: 0.30, pow: 12, rim: '#c9b8ff', amb: 0.42 },
  hoodLip:   { base: '#7d88f0', spec: 0.45, pow: 14, rim: '#dcd8ff', amb: 0.42 },
  voidInk:   { base: '#07061a', spec: 0.05, pow: 6,  rim: '#1c1a48', amb: 0.50 },
  capPale:   { base: '#c3d0ff', spec: 0.50, pow: 16, rim: '#ffffff', amb: 0.45 },
  pompom:    { base: '#eef3ff', spec: 0.40, pow: 10, rim: '#ffffff', amb: 0.55 },
  ghost:     { base: '#dfe6ff', spec: 0.50, pow: 14, rim: '#ffffff', amb: 0.50 },
  zGlow:     { base: '#9cc6ff', spec: 0.60, pow: 10, rim: '#ffffff', amb: 0.70 },
  clockRed:  { base: '#ff4a5e', spec: 0.80, pow: 24, rim: '#ffd0d6', amb: 0.40 },
  clockFace: { base: '#fff4dc', spec: 0.30, pow: 10, rim: '#ffffff', amb: 0.55 },
  crack:     { base: '#2a1330', spec: 0.00, pow: 6,  rim: '#2a1330', amb: 0.50 },
  eyeWht:    { base: '#d4efff', spec: 0.50, pow: 6,  rim: '#ffffff', amb: 0.95 },
  // 4 kraken
  kraken:    { base: '#f2522c', spec: 0.55, pow: 18, rim: '#ffc4a0', amb: 0.38 },
  tent:      { base: '#c93a1e', spec: 0.50, pow: 16, rim: '#ffa080', amb: 0.38 },
  tentLt:    { base: '#ffb894', spec: 0.30, pow: 10, rim: '#ffe6d6', amb: 0.45 },
  krSpot:    { base: '#c2381a', spec: 0.30, pow: 10, rim: '#ff9a78', amb: 0.40 },
  sucker:    { base: '#ffcfb4', spec: 0.15, pow: 8,  rim: '#fff0e6', amb: 0.48 },
  brow:      { base: '#6e1810', spec: 0.30, pow: 10, rim: '#d05a40', amb: 0.40 },
  socketRd:  { base: '#1e0603', spec: 0.10, pow: 6,  rim: '#5a1a0c', amb: 0.50 },
  sofa:      { base: '#5b3cc4', spec: 0.30, pow: 12, rim: '#b8a4ff', amb: 0.42 },
  sofaLt:    { base: '#7d5ff0', spec: 0.35, pow: 12, rim: '#d8ccff', amb: 0.42 },
  sofaDk:    { base: '#3c2690', spec: 0.25, pow: 10, rim: '#9a86f0', amb: 0.42 },
  remote:    { base: '#3b3f52', spec: 0.60, pow: 20, rim: '#9aa4d0', amb: 0.42 },
  button:    { base: '#c9cede', spec: 0.50, pow: 16, rim: '#ffffff', amb: 0.50 },
  popRed:    { base: '#ff3048', spec: 0.60, pow: 18, rim: '#ffd0d6', amb: 0.42 },
  popWh:     { base: '#fff6ea', spec: 0.50, pow: 16, rim: '#ffffff', amb: 0.50 },
  popcorn:   { base: '#fff0b0', spec: 0.40, pow: 12, rim: '#ffffff', amb: 0.52 },
  eyeGrn:    { base: '#62ff5a', spec: 0.50, pow: 6,  rim: '#eaffe0', amb: 0.92 },
};
// every glowing eye gets a white-hot core in its own tint
for (const k of Object.keys(MAT)) if (k.startsWith('eye')) MAT[k + 'Core'] = { base: MAT[k].rim, spec: 0.3, pow: 6, rim: '#ffffff', amb: 0.95 };
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
// every mesh gets a group id: facets inside one mesh never overlap, so the emitter may reorder them
let MESH = 0;
const group = items => { const g = ++MESH; return items.map(t => ({ ...t, g })); };

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
const symL = half => sym(half.map(([x, y]) => [x + 100, y])).map(([x, y]) => [x - 100, y]);   // about x=0
const ellipse = (cx, cy, rx, ry, n, rot = -Math.PI / 2) => Array.from({ length: n }, (_, i) => { const a = rot + i * 2 * Math.PI / n; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; });
const scaleAbout = (p, c, s) => p.map(([x, y]) => [c[0] + (x - c[0]) * s, c[1] + (y - c[1]) * s]);
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
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
// spine that starts at p0 heading a0 (deg, 0 = right, 90 = up), turns `turn` degrees,
// tightening toward the tip so it ends in a curl
function curl(p0, a0, len, turn, n = 12, ease = 1.7) {
  const pts = [p0]; let [x, y] = p0;
  for (let i = 1; i <= n; i++) {
    const t = (i - 0.5) / n, a = (a0 + turn * t ** ease) * Math.PI / 180, ds = len / n * (1.3 - 0.75 * t);
    x += Math.cos(a) * ds; y -= Math.sin(a) * ds; pts.push([x, y]);
  }
  return pts;
}
// heading (deg, 0 = right, 90 = up) of the last step of a spine, to chain a curl onto a curve
const heading = sp => { const a = sp[sp.length - 2], b = sp[sp.length - 1]; return Math.atan2(a[1] - b[1], b[0] - a[0]) * 180 / Math.PI; };
// which side of the spine the curve bends toward: 2 = the -normal strip, 0 = the +normal strip
const insideStrip = sp => { let s = 0; for (let i = 1; i < sp.length - 1; i++) { const a = sp[i - 1], b = sp[i], c = sp[i + 1]; s += (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]); } return s < 0 ? 2 : 0; };

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
  return group(tris.map(t => lit(t, mat)));
}
// Rounded volume: a crest-style mitered edge ring (edge: [inset, rise], sized from the area when
// left 'auto'), then rings scaled toward a centre (and drifting, so the crown of the dome sits
// where the form is fullest), then a fan to the apex. Two rings keep the planes as big as the
// crest planes. core: a calmer outline with the same vertex count that the inner rings scale from,
// so drips and lobes don't streak spokes across the whole dome.
function dome(outline, mat, { c, rings = [[0.7, 12], [0.36, 19]], apex = 22, apexAt, edge = 'auto', core } = {}) {
  c = c || centroid(outline);
  if (edge === 'auto') { const e = Math.min(5, Math.max(0.5, Math.sqrt(Math.abs(area(outline))) * 0.055)); edge = [e, e * 1.7]; }
  const tris = [], R = [z(outline, 0)], src = core || outline;
  if (edge) R.push(z(inset(outline, edge[0]), edge[1]));
  for (const [s, h, dx = 0, dy = 0] of rings) R.push(src.map(([x, y]) => [c[0] + (x - c[0]) * s + dx, c[1] + (y - c[1]) * s + dy, h]));
  for (let k = 0; k < R.length - 1; k++) band(R[k], R[k + 1], tris);
  const last = rings.length ? rings[rings.length - 1] : [1, 0, 0, 0];
  const A = apexAt || [c[0] + (last[2] || 0), c[1] + (last[3] || 0)];
  fanTo(R[R.length - 1], [A[0], A[1], apex], tris);
  return group(tris.map(t => lit(t, mat)));
}
// Ridged strip along a spine: edges at z=0, a raised crown line, width per sample.
// cross-section 'ridge' = edge|ridge|edge, 'flat' = edge|shoulder|shoulder|edge.
// mats: per-segment material list (cycled) for stripes; sideMats: per-strip materials.
// Returns one triangle list per segment so callers can order front and back segments.
function tubeSegs(spine, widths, mat, { lift = 0.9, shape = 'flat', shoulder = 0.45, mats, sideMats } = {}) {
  const n = spine.length;
  const secs = spine.map((p, i) => {
    const a = spine[Math.max(0, i - 1)], b = spine[Math.min(n - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, d = [(b[0] - a[0]) / l, (b[1] - a[1]) / l], q = [-d[1], d[0]];
    const w = widths[i], h = w * lift, at = (o, zz) => [p[0] + q[0] * o, p[1] + q[1] * o, zz];
    return shape === 'ridge' ? [at(w, 0), at(0, h), at(-w, 0)] : [at(w, 0), at(w * shoulder, h), at(-w * shoulder, h), at(-w, 0)];
  });
  const segs = [];
  for (let i = 0; i < n - 1; i++) {
    const m = mats ? mats[i % mats.length] : mat, A = secs[i], B = secs[i + 1], o = [];
    for (let k = 0; k < A.length - 1; k++) {
      const mk = (sideMats && sideMats[k]) || m;
      o.push(lit([A[k], B[k], B[k + 1]], mk), lit([A[k], B[k + 1], A[k + 1]], mk));
    }
    segs.push(group(o));
  }
  return segs;
}
const tube = (...a) => tubeSegs(...a).flat();
const taper = (n, w0, w1, pow = 1) => Array.from({ length: n }, (_, i) => w1 + (w0 - w1) * (1 - i / (n - 1)) ** pow);
// a recess or a painted mark seen straight on is one flat colour: emit the polygon whole
const flat = (outline, mat) => group([{ pts: outline, fill: shade(MAT[mat], [0, 0, 1]) }]);
// flat faceted halo (low opacity polygon, no shading) for glows
const halo = (outline, col, op, s, c = centroid(outline)) => ({ pts: scaleAbout(outline, c, s), fill: col, op, g: ++MESH });
// An emissive eye: two soft halo rings, a dark socket, a gem-cut glowing eye, a white-hot core.
function eye(outline, mat, { socket, sock = 1.35, glow = [2.0, 1.5], ops = [0.3, 0.45], haloCol, table = 2, bevel = 1.6, depth = 2, apex = 2.5, core = 0.45 } = {}) {
  const col = haloCol || MAT[mat].base, c = centroid(outline), out = [];
  glow.forEach((s, i) => out.push(halo(outline, col, ops[i], s, c)));
  if (socket) out.push(...flat(scaleAbout(outline, c, sock), socket));
  out.push(...part(outline, mat, { bevel, depth, apex, table }));
  if (core) out.push(...flat(scaleAbout(outline, c, core), mat + 'Core'));
  return out;
}

// ------------------------------------------------------------------ 0 THE PROCRASTINATOR
// blocky 3x5 sign-painter letters, as cell rectangles
const GLYPH = {
  L: [[0, 0, 1, 5], [1, 4, 3, 5]],
  A: [[0, 0, 3, 1], [0, 1, 1, 5], [2, 1, 3, 5], [1, 2, 2, 3]],
  T: [[0, 0, 3, 1], [1, 1, 2, 5]],
  E: [[0, 0, 1, 5], [1, 0, 3, 1], [1, 2, 2.6, 3], [1, 4, 3, 5]],
  R: [[0, 0, 1, 5], [1, 0, 2, 1], [2, 1, 3, 2], [1, 2, 2, 3], [2, 3, 3, 5]],
};
function word(text, at, cw, ch, gap, mat) {
  const W = text.length * 3 * cw + (text.length - 1) * gap, out = [];
  [...text].forEach((k, i) => {
    const x0 = -W / 2 + i * (3 * cw + gap), y0 = -2.5 * ch;
    for (const [a, b, c, d] of GLYPH[k]) out.push(...flat(at(rect(x0 + a * cw, y0 + b * ch, x0 + c * cw, y0 + d * ch)), mat));
  });
  return out;
}
function procrastinator() {
  const out = [];
  // the puddle it is melting into: wide, flat, lumpy, spreading past the body on both sides
  const puddle = [[100, 165], [130, 164], [156, 166], [176, 170], [189, 176], [194, 185], [187, 193], [168, 196], [148, 194], [128, 198], [104, 196], [80, 198], [58, 195], [36, 197], [16, 193], [6, 185], [11, 176], [26, 169], [50, 165], [74, 164]];
  out.push(...dome(puddle, 'gooPd', { c: [100, 181], edge: [3.5, 5], rings: [[0.7, 8, 0, -3], [0.36, 10, 0, -4]], apex: 11 }));
  // the blob, slumped: its head sags to the left, the right shoulder has slid down, and two fat
  // drips run off the hem into the puddle
  const drip = (x, w, L, yh) => [[x + w, yh], [x + w * 0.8, yh + L * 0.5], [x + w * 0.95, yh + L * 0.85], [x + w * 0.55, yh + L * 1.05], [x, yh + L * 1.12], [x - w * 0.55, yh + L * 1.05], [x - w * 0.95, yh + L * 0.85], [x - w * 0.8, yh + L * 0.5], [x - w, yh]];
  const body = [[86, 60], [106, 61], [126, 68], [144, 82], [156, 100], [163, 120], [168, 140], [174, 158], [178, 172], [166, 179], ...drip(134, 15, 18, 180), [104, 181], [86, 180], ...drip(60, 14, 15, 179), [30, 177], [21, 166], [19, 150], [23, 132], [31, 112], [43, 93], [57, 76], [71, 65]];
  const core = body.map(([x, y]) => [x, Math.min(y, 180)]);
  out.push(...dome(body, 'goo', { c: [94, 130], edge: [5, 10], core, rings: [[0.7, 24, -4, -8], [0.36, 36, -9, -14]], apex: 40, apexAt: [78, 104] }));
  // wet gloss: near-white facets on the lit upper left
  out.push(...flat([[36, 126], [41, 106], [50, 94], [45, 114]], 'gloss'), ...flat([[39, 134], [43, 128], [42, 140]], 'gloss'));
  out.push(...flat([[96, 66], [114, 66], [104, 71]], 'gooLt'));
  // face, tilted with the slump
  const F = p => place(p, [94, 116], -7);
  for (const side of [1, -1]) {
    const cx = side * 24, cy = -6, drop = side > 0 ? 0 : 5;            // the left lid hangs lower
    const lidA = [cx - side * 20, cy - 3 + drop], lidB = [cx + side * 20, cy + 4 + drop];
    const [a, b] = side > 0 ? [lidB, lidA] : [lidA, lidB];            // keep the side below the lid line
    out.push(...part(F(ellipse(cx, cy, 18, 15, 12)), 'gooSock', { bevel: 2, depth: 1.5, plateau: 'flat' }));
    const iris = clip(ellipse(cx, cy, 14.5, 12, 14), [a[0], a[1] - 0.5], [b[0], b[1] - 0.5]);
    out.push(halo(F(iris), MAT.eyeYel.base, 0.45, 1.3, F([[cx, cy + 4]])[0]));
    out.push(...part(F(iris), 'eyeYel', { bevel: 1.6, depth: 2, apex: 2.5, table: 2 }));
    out.push(...flat(F(clip(ellipse(cx, cy + 3, 6.5, 5, 8), a, b)), 'eyeYelCore'));
    const lid = clip(ellipse(cx, cy - 0.5, 19.5, 16.5, 14), b, a);
    out.push(...part(F(lid), 'gooLid', { bevel: 3, depth: 4, apex: 5, apexAt: F([[cx - side * 2, cy - 9]])[0] }));
  }
  // lazy open mouth, a big tongue lolling out of one corner (two halves, so it has a crease)
  out.push(...part(F([[-24, 22], [-10, 25], [4, 26], [18, 24], [28, 19], [26, 30], [16, 37], [2, 39], [-12, 37], [-21, 31]]), 'gooMouth', { bevel: 1.8, depth: 1, plateau: 'flat' }));
  out.push(...dome(F([[2, 30], [30, 27], [34, 38], [32, 50], [25, 58], [16, 61], [8, 57], [3, 49], [1, 39]]), 'tongue', { edge: [2.2, 3], rings: [[0.55, 6, -1, -3]], apex: 7 }));
  out.push(...flat(F([[15.4, 31], [17.6, 31], [18.4, 49], [16.8, 50]]), 'tongueDk'));
  // crown sliding off the slumped side of its head
  const C = p => place(p, [60, 72], -35, 1.8);
  for (const [x, h] of [[-10, 17], [0, 21], [10, 17]]) out.push(...part(C([[x - 5, -5], [x, -h], [x + 5, -5]]), 'gold', { bevel: 2, depth: 3, apex: 3 }));
  out.push(...part(C(rect(-14, -7.5, 14, 0)), 'goldDk', { bevel: 2.2, depth: 3, plateau: 'flat' }));
  for (const [x, y] of [[-10, -17], [0, -21], [10, -17]]) out.push(...part(C(ellipse(x, y, 2.6, 2.6, 6)), 'ruby', { bevel: 1.4, depth: 1.5, apex: 2 }));
  out.push(...part(C(ellipse(0, -3.7, 3.2, 2.6, 6)), 'ruby', { bevel: 1.4, depth: 1.5, apex: 2 }));
  // the gag: a "LATER" sign stuck in the goo, held up by one lazy goo arm
  out.push(...part([[159, 84], [166, 84], [177, 190], [169, 190]], 'woodDk', { bevel: 1.8, depth: 2.5, apex: 2 }));
  const S = p => place(p, [166, 70], -6);
  out.push(...part(S(rect(-36, -15, 36, 15)), 'wood', { bevel: 3, depth: 3.5, plateau: 'flat' }));
  out.push(...word('LATER', S, 3.4, 3.6, 2.6, 'ink'));
  out.push(...dome(ellipse(173, 189, 13, 5.5, 10), 'goo', { rings: [[0.5, 4, -1, -1]], apex: 5 }));
  out.push(...tube(bez([[146, 152], [160, 142], [170, 134]], 4), [10, 9, 8, 7.5, 8], 'goo', { lift: 0.9 }));
  out.push(...dome(ellipse(170, 132, 9, 8, 10), 'goo', { rings: [[0.5, 5, -1.5, -1.5]], apex: 7 }));
  return out;
}

// ------------------------------------------------------------------ 1 DOOMSCROLL HYDRA
// one serpent head in local units (origin between the eyes, +y down), placed by place().
// The centre head snarls at the player; the side heads are hypnotised by their phones.
function headBack(at) {
  const out = [], P = p => at(p);
  for (const s of [1, -1]) {
    const h = ([x, y]) => [s * x, y];
    out.push(...part(P([[24, -10], [38, -21], [28, -1]].map(h)), 'scaleDk', { bevel: 1.6, depth: 2.5, apex: 3 }));
    out.push(...part(P([[13, -22], [32, -47], [23, -15]].map(h)), 'horn', { bevel: 1.6, depth: 2.5, apex: 3 }));
  }
  return out;
}
function serpentHead(at, { zombie = false } = {}) {
  const out = [], P = p => at(p);
  // wide-open lower jaw, rim-lit cyan from below by the screens
  out.push(...part(P(symL([[0, 8], [16, 9], [22, 22], [16, 40], [0, 47]])), 'jaw', { bevel: 3, depth: 3, apex: 4, apexAt: P([[0, 38]])[0] }));
  out.push(...part(P([[-14, 12], [14, 12], [13, 24], [8, 34], [0, 38], [-8, 34], [-13, 24]]), 'mouthRed', { bevel: 1.5, depth: 1, plateau: 'flat' }));
  out.push(...part(P([[-2.6, 20], [2.6, 20], [2.8, 44], [8, 56], [1.3, 49], [0, 52], [-1.3, 49], [-8, 56], [-2.8, 44]]), 'tongueRed', { bevel: 1, depth: 1.2, apex: 1, apexAt: P([[0, 34]])[0] }));
  for (const s of [1, -1]) {
    out.push(...part(P([[s * 4.5, 10], [s * 12.5, 10], [s * 8.4, 34]]), 'fang', { bevel: 1.2, depth: 1.5, apex: 2 }));
    out.push(...part(P([[s * 4, 36.5], [s * 10.5, 32.5], [s * 8, 25]]), 'fang', { bevel: 1, depth: 1.5, apex: 2 }));
  }
  // upper head: broad crown narrowing to the snout
  const head = symL([[0, -30], [19, -26], [30, -8], [25, 6], [11, 15], [0, 16]]);
  out.push(...dome(P(head), 'scale', { c: P([[0, -4]])[0], rings: [[0.7, 8], [0.36, 12]], apex: 14 }));
  for (const s of [1, -1]) out.push(...flat(P([[s * 3, 9], [s * 7, 7.5], [s * 6, 10.5]]), 'socketTl'));
  for (const s of [1, -1]) {
    if (zombie) {
      // glazed, half-lidded eyes gazing down at the screen: flat-topped half moons under a heavy lid
      const lid = s > 0 ? [[s * 26, -6], [s * 2, -5]] : [[s * 2, -5], [s * 26, -6]];
      const iris = clip(ellipse(s * 14, -5, 9.5, 8, 12), lid[0], lid[1]);
      out.push(halo(P(iris), MAT.eyeCyan.base, 0.32, 2.4), halo(P(iris), MAT.eyeCyan.base, 0.5, 1.6));
      out.push(...flat(P(scaleAbout(iris, centroid(iris), 1.25)), 'socketTl'));
      out.push(...part(P(iris), 'eyeCyan', { bevel: 1.3, depth: 1.5, apex: 2, table: 1.4 }));
      out.push(...flat(P(scaleAbout(iris, centroid(iris), 0.42)), 'eyeCyanCore'));
      out.push(...part(P([[s * 2, -9], [s * 26, -10.5], [s * 27, -5.5], [s * 3, -4.2]]), 'scaleDk', { bevel: 1.4, depth: 2.5, apex: 2 }));
    } else {
      const e = P([[7, -2.5], [13, -6], [20, -9.5], [24, -10.5], [22.5, -4.5], [16, 0], [10, 0.5]].map(([x, y]) => [s * x, y]));
      out.push(...eye(s > 0 ? e : e.reverse(), 'eyeCyan', { socket: 'socketTl', sock: 1.2, glow: [2.6, 1.6], ops: [0.32, 0.5], table: 1.6, bevel: 1.2, depth: 1.5, apex: 2 }));
      out.push(...part(P([[6.5, -8], [24, -16.5], [27, -12.5], [8.5, -5]].map(([x, y]) => [s * x, y])), 'scaleDk', { bevel: 1.4, depth: 2.5, apex: 2.5 }));
    }
  }
  return out;
}
// a phone with a lit feed, glowing cyan
function phone(cx, cy, rot, s = 1) {
  const P = p => place(p, [cx, cy], rot, s), out = [];
  const body = [[-8, -17], [8, -17], [10, -15], [10, 15], [8, 17], [-8, 17], [-10, 15], [-10, -15]];
  out.push(halo(P(body), '#3cf0ff', 0.14, 1.55, [cx, cy]), halo(P(body), '#3cf0ff', 0.28, 1.22, [cx, cy]));
  out.push(...part(P(body), 'phone', { bevel: 1.8, depth: 2, plateau: 'flat' }));
  out.push(...flat(P(rect(-7.2, -13.5, 7.2, 13.5)), 'screen'));
  out.push(...flat(P(rect(-5.4, -11.5, 5.4, -2.5)), 'screenDk'));
  for (const [x1, y] of [[5.4, 1], [2, 5], [4, 9]]) out.push(...flat(P(rect(-5.4, y, x1, y + 2)), 'screenDk'));
  return out;
}
function hydra() {
  const out = [];
  // coiled body: a tapering helix seen from the front; back halves first, front halves last
  const N = 30, T = 3.25 * Math.PI, sp = [], ws = [], ang = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, a = -Math.PI / 2 + u * T;
    sp.push([100 + (30 + 36 * u) * Math.cos(a), 150 + 30 * u + (11 + 7 * u) * Math.sin(a)]);
    ws.push(16 - 3 * u); ang.push(a);
  }
  // the tail flicks out to the left and curls up
  const tailSp = [sp[N], ...curl(sp[N], heading(sp), 50, -150, 7).slice(1)];
  const segs = tubeSegs(sp, ws, 'coil', { lift: 0.9, shoulder: 0.4, sideMats: [null, null, 'belly'] });
  const isBack = i => Math.sin((ang[i] + ang[i + 1]) / 2) < 0;
  segs.forEach((s, i) => { if (isBack(i)) out.push(...s); });
  // necks
  const neck = (spine, w0, w1, { plates = 0, spikes = 0, spikeSide = 1 } = {}) => {
    const ws = taper(spine.length, w0, w1), o = [];
    // dorsal spikes on the back edge, drawn first so their roots hide behind the neck
    for (let k = 0; k < spikes; k++) {
      const i = 1 + k, p = spine[i], q = spine[i + 1], l = Math.hypot(q[0] - p[0], q[1] - p[1]), d = [(q[0] - p[0]) / l, (q[1] - p[1]) / l];
      const n = [-d[1] * spikeSide, d[0] * spikeSide], w = ws[i], at = (a, b) => [p[0] + n[0] * a + d[0] * b, p[1] + n[1] * a + d[1] * b];
      o.push(...part([at(w * 0.5, -6), at(w + 10, 6), at(w * 0.5, 6)], 'spike', { bevel: 1.4, depth: 2, apex: 2.5 }));
    }
    o.push(...tube(spine, ws, 'scale', { lift: 0.75 }));
    // a few mid-tone belly plates up the throat
    for (let i = 1; i <= plates; i++) {
      const p = spine[i], q = spine[i + 1], l = Math.hypot(q[0] - p[0], q[1] - p[1]), d = [(q[0] - p[0]) / l, (q[1] - p[1]) / l], n = [-d[1], d[0]];
      const w = ws[i] * 0.55, L = l * 0.4, at = (a, b) => [p[0] + n[0] * a + d[0] * b, p[1] + n[1] * a + d[1] * b];
      o.push(...part([at(-w, -L), at(0, -L + 3), at(w, -L), at(w, L), at(0, L + 3), at(-w, L)], 'belly', { bevel: 1.5, depth: 2, apex: 1.5 }));
    }
    return o;
  };
  const R = p => place(p, [167, 106], 17, 1.05), L = p => place(p, [33, 106], -17, 1.05), C = p => place(p, [100, 62], 0, 1.45);
  out.push(...headBack(C));
  const side = bez([[114, 172], [150, 160], [158, 122]], 5);
  out.push(...neck(side, 15, 12, { spikes: 3, spikeSide: -1 }), ...neck(side.map(mirrorPt), 15, 12, { spikes: 3, spikeSide: 1 }));
  out.push(...headBack(R), ...serpentHead(R, { zombie: true }), ...headBack(L), ...serpentHead(L, { zombie: true }));
  out.push(...neck(bez([[100, 174], [96, 138], [100, 104]], 5), 19, 15, { plates: 2 }));
  out.push(...serpentHead(C));
  segs.forEach((s, i) => { if (!isBack(i)) out.push(...s); });
  out.push(...tube(tailSp, taper(tailSp.length, ws[N], 1.5, 0.9), 'coil', { lift: 0.9, shoulder: 0.4, sideMats: [null, null, 'belly'] }));
  // the side heads can't look away from their phones, propped in the coils
  out.push(...phone(140, 158, 16), ...phone(60, 158, -16));
  return out;
}

// ------------------------------------------------------------------ 2 SUGAR GOLEM
// rock-candy crystal: hex prism with a pointed tip, leaning by deg
const crystal = (x, y, deg, h, w, mat) => part(place([[-w, 2], [-w, -h * 0.72], [0, -h], [w, -h * 0.72], [w, 2]], [x, y], deg), mat, { bevel: Math.min(2.6, w * 0.35), depth: 3, apex: 4, apexAt: place([[0, -h * 0.62]], [x, y], deg)[0] });
// swirl candy: alternating wedges, inner rings twisted so it spirals
function swirl(cx, cy, r, mats = ['candyRed', 'candyWh'], n = 8, tw = [0.04, 0.09]) {
  const out = [];
  const ring = (s, t, h) => Array.from({ length: n }, (_, i) => { const a = (i / n + t) * 2 * Math.PI - Math.PI / 2; return [cx + Math.cos(a) * r * s, cy + Math.sin(a) * r * s, h]; });
  const R = [ring(1, 0, 0), ring(0.9, 0.012, r * 0.1), ring(0.62, tw[0], r * 0.24), ring(0.3, tw[1], r * 0.34)], A = [cx, cy, r * 0.38];
  for (let k = 0; k < 3; k++) for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, m = mats[i % mats.length];
    out.push(lit([R[k][i], R[k][j], R[k + 1][j]], m), lit([R[k][i], R[k + 1][j], R[k + 1][i]], m));
  }
  for (let i = 0; i < n; i++) out.push(lit([R[3][i], R[3][(i + 1) % n], A], mats[i % mats.length]));
  return group(out);
}
// a blocky candy fist, seen knuckles-on: back block, four curled fingers, thumb across
function fist(cx, cy, s = 1) {
  const P = p => place(p, [cx, cy], 0, s), out = [];
  out.push(...part(P([[-21, -14], [21, -14], [23, 0], [20, 18], [-20, 18], [-23, 2]]), 'rasp', { bevel: 4, depth: 5, apex: 4 }));
  for (let k = 0; k < 4; k++) { const x = -20 + k * 10; out.push(...part(P([[x, -21], [x + 10, -21], [x + 10, 4], [x, 4]]), 'candy', { bevel: 2.4, depth: 3, apex: 3.5, apexAt: P([[x + 5, -14]])[0] })); }
  out.push(...part(P([[-23, 2], [6, 0], [11, 6], [6, 13], [-21, 14]]), 'candyLt', { bevel: 2.6, depth: 3, apex: 3 }));
  return out;
}
// candy-corn tooth pointing down: yellow root, orange band, white tip
function cornTooth(x0, x1, y, L) {
  const m = (x0 + x1) / 2, at = t => { const w = (x1 - x0) / 2 * (1 - t * 0.92); return [[m - w, y + L * t], [m + w, y + L * t]]; };
  const [a0, b0] = at(0), [a1, b1] = at(0.42), [a2, b2] = at(0.72);
  return [
    ...part([a0, b0, b1, a1], 'cornY', { bevel: 1.2, depth: 1.5, plateau: 'flat' }),
    ...part([a1, b1, b2, a2], 'cornO', { bevel: 1.1, depth: 1.5, plateau: 'flat' }),
    ...part([a2, b2, [m, y + L]], 'candyWh', { bevel: 0.9, depth: 1.5, apex: 1.5 }),
  ];
}
function golem() {
  const out = [];
  // lollipop club raised overhead (stick behind the fist)
  out.push(...part([[179, 100], [185, 100], [189, 30], [183, 30]], 'candyWh', { bevel: 1.6, depth: 2.5, apex: 2 }));
  out.push(...swirl(186, 18, 29, ['candy', 'candyWh', 'candyLt', 'candyWh'], 12, [0.07, 0.16]));
  // sugar shards on the crown, behind the head block
  for (const [x, deg, h, w, m] of [[70, -34, 34, 7, 'candyWh'], [84, -14, 46, 8, 'candyLt'], [100, 0, 64, 9.5, 'candyWh'], [116, 14, 46, 8, 'candyLt'], [130, 34, 34, 7, 'candyWh']]) out.push(...crystal(x, 54, deg, h, w, m));
  // arms: one planted, one raised
  out.push(...tube(bez([[40, 124], [18, 138], [32, 160]], 5), [15, 15, 14, 14, 14, 14], 'rasp', { lift: 0.7 }));
  out.push(...tube(bez([[142, 124], [188, 124], [182, 82]], 5), [15, 15, 14, 14, 14, 14], 'rasp', { lift: 0.7 }));
  // chest of deep raspberry, breaking into rock-candy chunks at the bottom
  out.push(...part([[62, 112], [138, 112], [156, 146], [148, 172], [134, 188], [120, 176], [106, 192], [92, 178], [78, 188], [62, 172], [46, 146]], 'raspDk', { bevel: 6, depth: 6, apex: 6, apexAt: [100, 140] }));
  // shoulders: a peppermint pad on the left, sugar shards on the right
  out.push(...crystal(152, 112, 24, 26, 6.5, 'candyWh'), ...crystal(138, 110, 6, 20, 5.5, 'candyLt'));
  out.push(...part([[62, 104], [82, 110], [76, 140], [52, 150], [24, 142], [18, 120], [34, 106]], 'rasp', { bevel: 6, depth: 7, apex: 8, apexAt: [42, 122] }));
  out.push(...part([[142, 106], [114, 110], [112, 140], [132, 152], [158, 146], [164, 124]], 'rasp', { bevel: 6, depth: 7, apex: 8, apexAt: [142, 126] }));
  out.push(...swirl(36, 124, 16));
  // fists: planted bottom-left, raised top-right gripping the lollipop
  out.push(...fist(36, 168), ...fist(183, 82, 0.95));
  // head: brow block, boxy jaw
  out.push(...part(sym([[100, 46], [128, 46], [142, 58], [146, 82], [140, 102], [100, 102]]), 'candy', { bevel: 7, depth: 8, plateau: 'flat' }));
  out.push(...part(sym([[100, 98], [140, 98], [154, 114], [152, 146], [136, 162], [100, 162]]), 'candy', { bevel: 7, depth: 9, apex: 4, apexAt: [100, 150] }));
  // mouth: grimace with square candy teeth, candy-corn fangs and two tusks
  out.push(...part(sym([[100, 116], [130, 116], [134, 132], [128, 142], [100, 142]]), 'mouthMag', { bevel: 2, depth: 1, plateau: 'flat' }));
  for (const [x0, x1] of [[88, 99], [101, 112]]) out.push(...part([[x0, 115], [x1, 115], [x1 - 0.5, 124], [x0 + 0.5, 124]], 'candyWh', { bevel: 1.5, depth: 2, plateau: 'flat' }));
  out.push(...cornTooth(72, 86, 115, 19), ...cornTooth(114, 128, 115, 19));
  for (const s of [1, -1]) out.push(...part(s > 0 ? [[116, 143], [130, 143], [126, 125]] : [[70, 143], [84, 143], [74, 125]], 'candyWh', { bevel: 1.6, depth: 2, apex: 3 }));
  // yellow-hot eyes deep under a heavy V brow ridge
  for (const s of [1, -1]) {
    const e = [[106, 88], [130, 82], [134, 90], [126, 98], [108, 97]];
    out.push(...eye(s > 0 ? e : mirrorX(e), 'eyeHot', { socket: 'socketMg', sock: 1.35, glow: [2.0, 1.5], ops: [0.3, 0.45], table: 2.4, bevel: 1.8, depth: 2, apex: 2.5 }));
  }
  const brow = [[100, 78], [146, 58], [150, 71], [103, 93]];
  out.push(...part(brow, 'raspDk', { bevel: 3, depth: 5, apex: 4 }), ...part(mirrorX(brow), 'raspDk', { bevel: 3, depth: 5, apex: 4 }));
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
// a pale ghost hand: three long hooked claws fanning from a small palm, pointing along deg
// (0 = right, 90 = up)
function claw(cx, cy, deg, s = 1) {
  const P = p => place(p, [cx, cy], -deg, s), out = [];
  for (const [a, L] of [[-34, 18], [0, 21], [34, 17]]) {
    const r = a * Math.PI / 180, d = [Math.cos(r), Math.sin(r)], n = [-d[1], d[0]];
    const sp = [0.2, 0.5, 0.78, 1].map(t => [d[0] * L * t + n[0] * 7 * t * t, d[1] * L * t + n[1] * 7 * t * t]);
    out.push(...tube(P(sp), [3.6, 3, 2, 0.5].map(w => w * s), 'ghost', { lift: 0.8, shape: 'ridge' }));
  }
  out.push(...dome(P(ellipse(-1, 0, 7, 7.5, 8)), 'ghost', { rings: [[0.5, 4, -1, -1]], apex: 6 }));
  return out;
}
// smashed alarm clock: red case, cracked face, two bells (one knocked askew)
function alarmClock(cx, cy, r) {
  const out = [];
  out.push(...part([[cx - r * 0.6, cy + r * 0.7], [cx - r * 0.85, cy + r * 1.2], [cx - r * 0.55, cy + r * 1.15]], 'clockRed', { bevel: 1, depth: 1.5, apex: 1.5 }));
  out.push(...part([[cx + r * 0.6, cy + r * 0.7], [cx + r * 0.55, cy + r * 1.15], [cx + r * 0.85, cy + r * 1.2]], 'clockRed', { bevel: 1, depth: 1.5, apex: 1.5 }));
  for (const [dx, dy, deg] of [[-0.62, -0.78, -30], [0.7, -0.86, 50]]) {
    const bx = cx + dx * r, by = cy + dy * r;
    out.push(...dome(place(ellipse(0, 0, r * 0.42, r * 0.34, 8, Math.PI), [bx, by], deg).map(([x, y]) => [x, y]), 'gold', { rings: [[0.5, 3, -0.5, -1]], apex: 5 }));
  }
  out.push(...part(ellipse(cx, cy, r, r, 12), 'clockRed', { bevel: r * 0.18, depth: 4, plateau: 'flat' }));
  out.push(...part(ellipse(cx, cy, r * 0.74, r * 0.74, 12), 'clockFace', { bevel: 1.5, depth: 1, plateau: 'flat' }));
  // hands (stopped) and a crack across the glass
  out.push(...flat([[cx - 1, cy + 1], [cx - r * 0.5, cy - r * 0.26], [cx - r * 0.48, cy - r * 0.36], [cx + 1, cy - 1]], 'crack'));
  out.push(...flat([[cx - 1, cy], [cx + 0.5, cy - r * 0.6], [cx + 1.6, cy - r * 0.58], [cx + 1, cy]], 'crack'));
  out.push(...flat([[cx + r * 0.72, cy - r * 0.2], [cx + r * 0.2, cy + r * 0.06], [cx + r * 0.26, cy + r * 0.36], [cx - r * 0.12, cy + r * 0.66], [cx + r * 0.32, cy + r * 0.44], [cx + r * 0.26, cy + r * 0.12]], 'crack'));
  return out;
}
function wraith() {
  const out = [];
  // floating Z's, drifting up and away
  out.push(...zee(196, 6, 12, -14), ...zee(182, 30, 17, -10));
  // a long trailing tail and a couple of scraps drifting off it: it floats
  const tailSp = bez([[140, 146], [166, 196], [200, 196], [206, 160]], 9);
  out.push(...tube(tailSp, taper(tailSp.length, 18, 1, 0.9), 'robeDk', { lift: 0.6, shape: 'ridge' }));
  out.push(...part([[196, 136], [205, 128], [204, 142]], 'robe', { bevel: 1.2, depth: 2, apex: 2 }));
  out.push(...part([[208, 140], [216, 134], [214, 146]], 'robe', { bevel: 1.2, depth: 2, apex: 2 }));
  // big ragged tatters of different lengths, hanging from the hem
  // a torn rag: wide at the hem, a split, ragged end
  const rag = (x, y, w, L, lean) => [[x - w / 2, y], [x + w / 2, y], [x + w * 0.46 + lean * 0.6, y + L * 0.72], [x + w * 0.24 + lean, y + L], [x + lean * 0.8, y + L * 0.8], [x - w * 0.22 + lean * 0.9, y + L * 0.94], [x - w * 0.46 + lean * 0.5, y + L * 0.6]];
  for (const [x, w, L, lean, m] of [[44, 34, 36, -8, 'robeDk'], [126, 34, 46, 5, 'robeDk'], [72, 34, 54, -3, 'robe'], [100, 32, 34, 2, 'robeDk']]) {
    out.push(...part(rag(x, 142, w, L, lean), m, { bevel: 3.4, depth: 4, apex: 5, apexAt: [x + lean * 0.4, 142 + L * 0.35] }));
  }
  // robe: hood over shoulders, ending in a wavy hem
  const robe = sym([[100, 30], [130, 40], [150, 66], [158, 98], [166, 124], [170, 150], [150, 158], [128, 152], [112, 160], [100, 156]]);
  out.push(...dome(robe, 'robeDk', { c: [100, 104], rings: [[0.7, 14, 0, -6], [0.36, 22, 0, -14]], apex: 26 }));
  // ghostly arms: the left drags a smashed alarm clock on a chain, the right reaches for you
  out.push(...tube(bez([[66, 98], [42, 108], [28, 132]], 5), [9, 10, 11.5, 13, 15, 17], 'hoodLip', { lift: 0.7 }));
  out.push(...tube(bez([[134, 98], [160, 102], [176, 114]], 5), [9, 10, 11.5, 13, 15, 17], 'hoodLip', { lift: 0.7 }));
  for (let k = 0; k < 3; k++) {
    const y = 148 + k * 8.5, x = 26 - k * 0.6;
    out.push(...part(k % 2 ? rect(x - 1.6, y - 4.5, x + 1.6, y + 4.5) : ellipse(x, y, 3.6, 4.8, 8), 'iron', { bevel: 1.2, depth: 1.5, plateau: k % 2 ? 'apex' : 'flat', apex: 1.5 }));
  }
  out.push(...claw(27, 140, -80, 1.1));
  out.push(...alarmClock(26, 187, 19));
  out.push(...claw(186, 120, 0, 1.45));
  // hood
  const hood = sym([[100, 20], [126, 26], [146, 44], [156, 70], [154, 98], [142, 118], [122, 130], [100, 133]]);
  out.push(...dome(hood, 'robe', { c: [100, 80], rings: [[0.7, 13, 0, -4], [0.36, 21, 0, -8]], apex: 24 }));
  // floppy nightcap flopping over to one side, stripes, a fat pompom
  const capSp = bez([[100, 34], [104, 2], [62, -6], [38, 30]], 9);
  out.push(...tube(capSp, [22, 20, 17.5, 15, 12.5, 10, 8, 6.5, 5, 4], 'robe', { lift: 0.55, mats: ['capPale', 'robe'] }));
  out.push(...part(sym([[100, 26], [122, 30], [130, 40], [100, 34]]), 'capPale', { bevel: 2, depth: 3, apex: 3 }));
  out.push(...dome(ellipse(36, 36, 13, 13, 9), 'pompom', { rings: [[0.62, 7, -1.5, -1.5]], apex: 11 }));
  // hood opening: lit lip, then the void
  const open = sym([[100, 46], [116, 52], [128, 68], [128, 92], [116, 110], [100, 116]]);
  out.push(...part(scaleAbout(open, [100, 81], 1.15), 'hoodLip', { bevel: 4, depth: 4, plateau: 'flat' }));
  out.push(...part(open, 'voidInk', { bevel: 3, depth: 1, plateau: 'flat' }));
  // two big, half-lidded, cross white eyes glowing blue in the dark
  for (const s of [1, -1]) {
    const e = [[103, 80], [126, 72], [127, 80], [122, 89], [112, 92], [104, 88]];
    out.push(...eye(s > 0 ? e : mirrorX(e), 'eyeWht', { glow: [1.75, 1.35], ops: [0.3, 0.45], haloCol: '#6fb8ff', table: 2, bevel: 1.6, depth: 2, apex: 2.5, core: 0.4 }));
  }
  // and one big Z hooked over the hood's edge
  out.push(...zee(154, 56, 26.5, -8));
  return out;
}

// ------------------------------------------------------------------ 4 COUCH KRAKEN
// tentacle: darker than the mantle, a pale peach underside strip along the inside of the curl and
// three fat suckers on it
function tentacle(sp, w0, { suckers = [0.3, 0.5, 0.7] } = {}) {
  const n = sp.length, ws = sp.map((_, i) => 1.5 + w0 * (1 - i / (n - 1)) ** 0.85), inside = insideStrip(sp);
  const sideMats = inside === 2 ? [null, null, 'tentLt'] : ['tentLt', null, null];
  const out = tube(sp, ws, 'tent', { lift: 0.8, shoulder: 0.3, sideMats });
  for (const f of suckers) {
    const i = Math.round(f * (n - 1));
    if (i < 1 || i >= n - 1) continue;
    const p = sp[i], a = sp[i - 1], b = sp[i + 1], d = norm([b[0] - a[0], b[1] - a[1], 0]), q = [-d[1], d[0]], sgn = inside === 2 ? -1 : 1;
    const c = [p[0] + q[0] * sgn * ws[i] * 0.55, p[1] + q[1] * sgn * ws[i] * 0.55], r = ws[i] * 0.5;
    // a sucker is a cup seen straight on: a flat rim and a flat, darker hollow
    out.push(...flat(ellipse(c[0], c[1], r, r, 7), 'sucker'), ...flat(ellipse(c[0] + r * 0.12, c[1] + r * 0.12, r * 0.5, r * 0.5, 6), 'tent'));
  }
  return out;
}
// a curve that ends in a curl
const curve = (P, n, turn, len, k = 9) => { const b = bez(P, n); return [...b, ...curl(b[b.length - 1], heading(b), len, turn, k).slice(1)]; };
function remote(cx, cy, deg, s) {
  const R = p => place(p, [cx, cy], deg, s), out = [];
  out.push(...part(R([[-6, -16], [6, -16], [7, -14], [7, 16], [-7, 16], [-7, -14]]), 'remote', { bevel: 1.4, depth: 2.5, plateau: 'flat' }));
  const btn = R([[0, -10.5]])[0];
  out.push(halo(R(ellipse(0, -10.5, 3, 3, 8)), '#ff3b4e', 0.3, 2.4, btn), halo(R(ellipse(0, -10.5, 3, 3, 8)), '#ff3b4e', 0.45, 1.6, btn));
  out.push(...part(R(ellipse(0, -10.5, 3, 3, 8)), 'ruby', { bevel: 0.8, depth: 1, apex: 1.5 }));
  for (const [x, y] of [[-2.6, -3], [2.6, -3], [-2.6, 2], [2.6, 2], [-2.6, 7], [2.6, 7]]) out.push(...part(R(rect(x - 1.7, y - 1.5, x + 1.7, y + 1.5)), 'button', { bevel: 0.5, depth: 0.8, plateau: 'flat' }));
  return out;
}
function popcorn(cx, cy) {
  const out = [], top = cy - 15, bot = cy + 15, wt = 17, wb = 12.5, n = 6;
  // puffs heaped over the rim
  for (const [x, y, r] of [[-12, -2, 6], [12, -2, 6], [-5, -7, 6.5], [6, -8, 6.5], [0, -1, 6], [-1, -13, 5.5]]) out.push(...dome(ellipse(cx + x, top + y, r, r * 0.9, 7), 'popcorn', { rings: [[0.5, 3, -1, -1]], apex: 4.5 }));
  for (let i = 0; i < n; i++) {
    const x0 = -wt + 2 * wt * i / n, x1 = -wt + 2 * wt * (i + 1) / n, b0 = -wb + 2 * wb * i / n, b1 = -wb + 2 * wb * (i + 1) / n;
    out.push(...part([[cx + x0, top], [cx + x1, top], [cx + b1, bot], [cx + b0, bot]], i % 2 ? 'popWh' : 'popRed', { bevel: 1.2, depth: 2, apex: 2, apexAt: [cx + (x0 + x1 + b0 + b1) / 4 * 0.9, cy - 2] }));
  }
  return out;
}
function kraken() {
  const out = [];
  // the couch it will not get off: back, seat, skirt, armrests, feet
  out.push(...part([[22, 92], [178, 92], [188, 102], [188, 150], [12, 150], [12, 102]], 'sofa', { bevel: 8, depth: 9, apex: 6, apexAt: [100, 108] }));
  out.push(...part([[28, 144], [172, 144], [176, 168], [24, 168]], 'sofaLt', { bevel: 6, depth: 7, apex: 4, apexAt: [100, 152] }));
  out.push(...part([[18, 164], [182, 164], [180, 190], [20, 190]], 'sofaDk', { bevel: 5, depth: 6, plateau: 'flat' }));
  for (const s of [1, -1]) {
    const arm = [[4, 124], [10, 112], [32, 110], [40, 120], [40, 190], [4, 190]];
    out.push(...part(s > 0 ? arm : mirrorX(arm), 'sofa', { bevel: 6, depth: 8, apex: 5, apexAt: s > 0 ? [20, 122] : [180, 122] }));
    out.push(...part(s > 0 ? rect(14, 190, 26, 198) : rect(174, 190, 186, 198), 'sofaDk', { bevel: 2, depth: 2, plateau: 'flat' }));
  }
  // tentacles behind the mantle: one raised with the remote, one round the popcorn, two draped
  // over the armrests
  out.push(...tentacle(bez([[146, 100], [174, 94], [178, 58]], 6), 12, { suckers: [0.35, 0.65] }));
  out.push(...tentacle(curve([[148, 112], [176, 98], [194, 118], [191, 150]], 5, -200, 38, 7), 11));
  out.push(...tentacle(curve([[52, 112], [24, 98], [6, 118], [9, 150]], 5, 195, 36, 7), 11));
  out.push(...popcorn(22, 92));
  out.push(...tentacle(curve([[56, 104], [34, 106], [20, 104]], 3, 230, 44, 7), 10, { suckers: [0.3, 0.55] }));
  // big dome mantle
  const head = smooth(sym([[100, 14], [130, 18], [150, 34], [160, 58], [158, 86], [146, 108], [124, 122], [100, 126]]), 1);
  out.push(...dome(head, 'kraken', { c: [100, 74], edge: [5, 9], rings: [[0.72, 22, 0, -6], [0.36, 32, -4, -14]], apex: 35 }));
  // two lazy tentacles lounging across the seat, tips curling up
  out.push(...tentacle(curve([[84, 116], [74, 150], [46, 154]], 4, -220, 40, 7), 12));
  out.push(...tentacle(curve([[116, 116], [126, 150], [154, 154]], 4, 220, 40, 7), 12));
  // angry eyes, glowing inside dark sockets (a green halo over orange turns olive)
  for (const s of [1, -1]) {
    const e = [[106, 72], [120, 74], [134, 66], [138, 76], [132, 88], [118, 92], [108, 86]], o = s > 0 ? e : mirrorX(e), c = centroid(o);
    out.push(...flat(scaleAbout(o, c, 1.45), 'socketRd'));
    out.push(halo(o, MAT.eyeGrn.base, 0.3, 1.4, c), halo(o, MAT.eyeGrn.base, 0.45, 1.2, c));
    out.push(...eye(o, 'eyeGrn', { glow: [], table: 2.6, bevel: 2, depth: 2.5, apex: 3 }));
    const br = [[100, 66], [137, 50], [143, 59], [104, 77]];
    out.push(...part(s > 0 ? br : mirrorX(br), 'brow', { bevel: 2.6, depth: 4, apex: 4 }));
  }
  // smug lopsided snarl with little teeth
  const mouth = [[80, 101], [96, 104], [112, 102], [126, 94], [124, 104], [112, 112], [96, 113], [84, 108]];
  out.push(...part(mouth, 'socketRd', { bevel: 1, depth: 1, plateau: 'flat' }));
  for (const [x, y] of [[88, 104.6], [97, 105], [106, 104.4], [115, 101]]) out.push(...part([[x - 3.6, y - 0.6], [x + 3.6, y - 0.9], [x + 0.3, y + 5.5]], 'fang', { bevel: 0.8, depth: 1, apex: 1.2 }));
  // the remote, held up high, the tentacle tip wrapped round it
  out.push(...remote(184, 32, 18, 1.75));
  const W = p => place(p, [184, 32], 18, 1.75);
  out.push(...tentacle([...W([[-10, 9.5], [-3, 12], [4, 12], [10, 9.5]]), ...W([[13, 13], [12, 18]])], 4, { suckers: [] }));
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
// coordinates are written on a x10 integer grid (0.1 unit precision), relative after the first point
const f = v => Math.round(v * 10);
const nums = a => a.map((v, i) => (i && v >= 0 ? ' ' : '') + v).join('');
function pathD(polys) {
  let s = '', prev = null;
  for (const pts of polys) {
    const P = pts.map(p => [f(p[0]), f(p[1])]), rel = [];
    for (let i = 1; i < P.length; i++) rel.push(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    s += (prev ? 'm' + nums([P[0][0] - prev[0], P[0][1] - prev[1]]) : 'M' + nums(P[0])) + 'l' + nums(rel) + 'z';
    prev = P[0];
  }
  return s;
}
// Facets that end up wholly behind later opaque facets are dropped: walk the list from the front
// (last drawn) to the back over a 4-samples-per-unit grid, keep a facet only if it still owns
// at least one uncovered sample, then mark its samples covered (halos are see-through: tested,
// never covering).
function cull(items, [minX, minY, maxX, maxY], R = 4) {
  const W = Math.ceil((maxX - minX) * R) + 2, H = Math.ceil((maxY - minY) * R) + 2, cov = new Uint8Array(W * H), keep = [];
  for (let k = items.length - 1; k >= 0; k--) {
    const t = items[k], pts = t.pts.map(([x, y]) => [(x - minX) * R, (y - minY) * R]);
    const ys = pts.map(p => p[1]), y0 = Math.max(0, Math.ceil(Math.min(...ys) - 0.5)), y1 = Math.min(H - 1, Math.floor(Math.max(...ys) - 0.5));
    let vis = false; const cells = [];
    for (let j = y0; j <= y1; j++) {
      const yc = j + 0.5, xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= yc) !== (b[1] <= yc)) xs.push(a[0] + (yc - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
      }
      xs.sort((a, b) => a - b);
      for (let q = 0; q + 1 < xs.length; q += 2) {
        for (let i = Math.max(0, Math.ceil(xs[q] - 0.5)), e = Math.min(W - 1, Math.floor(xs[q + 1] - 0.5)); i <= e; i++) {
          const c = j * W + i; if (!cov[c]) vis = true; cells.push(c);
        }
      }
    }
    if (vis) { keep.push(t); if (!t.op) for (const c of cells) cov[c] = 1; }
  }
  return keep.reverse();
}
function svg(items) {
  // fit the art: bounds of the solid facets (halos may bleed), square, padded
  const solid = items.filter(t => !t.op);
  const xs = solid.flatMap(t => t.pts.map(p => p[0])), ys = solid.flatMap(t => t.pts.map(p => p[1]));
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const side = Math.max(maxX - minX, maxY - minY) + 10, cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const vb = `${f(cx - side / 2)} ${f(cy - side / 2)} ${f(side)} ${f(side)}`;
  const vis = cull(items, [cx - side / 2, cy - side / 2, cx + side / 2, cy + side / 2]);
  // inside one mesh the order is free: sort its facets by colour so equal colours share a path
  for (let a = 0; a < vis.length;) {
    let b = a; while (b < vis.length && vis[b].g === vis[a].g) b++;
    const run = vis.slice(a, b).sort((p, q) => p.fill < q.fill ? -1 : p.fill > q.fill ? 1 : 0);
    vis.splice(a, b - a, ...run); a = b;
  }
  // consecutive facets of one colour share a path; a same-colour hairline closes antialias seams
  let body = '', run = null;
  const flush = () => { if (!run) return; const dd = pathD(run.polys); body += run.op ? `<path d="${dd}" fill="${run.fill}" fill-opacity="${run.op}" stroke="none"/>` : `<path d="${dd}" fill="${run.fill}" stroke="${run.fill}"/>`; run = null; };
  for (const t of vis) {
    if (run && run.fill === t.fill && run.op === t.op) { run.polys.push(t.pts); continue; }
    flush(); run = { polys: [t.pts], fill: t.fill, op: t.op };
  }
  flush();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"><g stroke-width="3.5" stroke-linejoin="round">${body}</g></svg>\n`;
}
for (const [i, b] of BOSSES.entries()) {
  const out = new URL(`boss-${i}-${b.id}.svg`, OUT);
  const s = svg(b.build());
  writeFileSync(out, s);
  console.log(out.pathname.split('/').slice(-2).join('/'), (s.length / 1024).toFixed(1) + 'KB');
}
