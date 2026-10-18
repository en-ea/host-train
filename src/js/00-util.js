'use strict';
/* ---------- small helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const uid = (p = 'id') => p + Math.random().toString(36).slice(2, 9);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sum = (arr, f = x => x) => arr.reduce((a, x) => a + f(x), 0);
const deepCopy = o => JSON.parse(JSON.stringify(o));

function fmtTime(min) {
  min = Math.floor(min);
  let h = Math.floor(min / 60) % 24;
  const m = ((min % 60) + 60) % 60;
  const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return h + ':' + String(m).padStart(2, '0') + ap;
}
function fmtClock(min) { // with seconds-free compact form "7:05"
  min = Math.floor(min);
  let h = Math.floor(min / 60) % 24;
  const m = ((min % 60) + 60) % 60;
  h = h % 12 || 12;
  return h + ':' + String(m).padStart(2, '0');
}
function fmtDur(m) {
  m = Math.round(m);
  const neg = m < 0; m = Math.abs(m);
  const s = m < 60 ? m + 'm' : Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0');
  return (neg ? '-' : '') + s;
}
function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/* Seeded random so a shift can be replayed */
function makeRng(seed) {
  let a = seed >>> 0;
  const r = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    r,
    range: (a, b) => a + r() * (b - a),
    int: (a, b) => Math.floor(a + r() * (b - a + 1)),
    pick: arr => arr[Math.floor(r() * arr.length)],
    chance: p => r() < p,
    normal(mean, sd) {
      const u = 1 - r(), v = r();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    weighted(pairs) { // [[value, weight], ...]
      const tot = sum(pairs, p => p[1]);
      let x = r() * tot;
      for (const [v, w] of pairs) { if ((x -= w) <= 0) return v; }
      return pairs[pairs.length - 1][0];
    },
    poisson(l) {
      if (l <= 0) return 0;
      const L = Math.exp(-l); let k = 0, p = 1;
      do { k++; p *= r(); } while (p > L);
      return k - 1;
    }
  };
}
let RNG = makeRng(Date.now() & 0xffffffff);

function lerpCurve(points, x) { // points [[x,y]...] sorted
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (x <= points[i][0]) {
      const [x0, y0] = points[i - 1], [x1, y1] = points[i];
      return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
  }
  return points[points.length - 1][1];
}
