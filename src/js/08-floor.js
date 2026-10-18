/* ---------- floor plan rendering (SVG) and touch gestures ---------- */
const FV = {}; // view boxes per floor: { svc: {x,y,w,h}, edit: {...} }
const FIT_DONE = {};

function layoutBounds(lay) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = it => {
    const a = (it.rot || 0) * Math.PI / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
    const pad = it.kind ? 0 : 14; // room for chairs
    const hw = it.w / 2 * c + it.h / 2 * s + pad, hh = it.w / 2 * s + it.h / 2 * c + pad;
    x0 = Math.min(x0, it.x - hw); y0 = Math.min(y0, it.y - hh); x1 = Math.max(x1, it.x + hw); y1 = Math.max(y1, it.y + hh);
  };
  lay.tables.forEach(add); lay.decor.forEach(add);
  if (!isFinite(x0)) return { x: 0, y: 0, w: lay.width || 1200, h: lay.height || 800 };
  const pad = 20;
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}
function fitView(key, lay) { FV[key] = layoutBounds(lay); FIT_DONE[key] = true; applyView(key); }
function fitIfNeeded(key) {
  const svg = $('#floor-' + key); if (!svg) return;
  const lay = key === 'svc' ? (SH && SH.layout) : edLayout();
  if (lay) fitView(key, lay);
}
function applyView(key) {
  const svg = $('#floor-' + key); const v = FV[key];
  if (svg && v) svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
}
function svgPoint(svg, cx, cy) {
  const pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy;
  const m = svg.getScreenCTM(); if (!m) return { x: 0, y: 0 };
  const r = pt.matrixTransform(m.inverse());
  return { x: r.x, y: r.y };
}
function svgScale(svg) { const m = svg.getScreenCTM(); return m ? m.a : 1; }
function zoomAt(key, factor, cx, cy) {
  const svg = $('#floor-' + key); const v = FV[key]; if (!svg || !v) return;
  const p = cx != null ? svgPoint(svg, cx, cy) : { x: v.x + v.w / 2, y: v.y + v.h / 2 };
  const nw = clamp(v.w / factor, 150, 4000); const f = v.w / nw; const nh = v.h / f;
  v.x = p.x - (p.x - v.x) / f; v.y = p.y - (p.y - v.y) / f; v.w = nw; v.h = nh;
  applyView(key);
}

/* chair positions in table-local coordinates */
function chairSpots(t) {
  const n = Math.min(t.max, 14);
  const out = [];
  if (t.shape === 'bar' || t.shape === 'booth') return out;
  if (t.shape === 'round') {
    const rx = t.w / 2 + 9, ry = t.h / 2 + 9;
    for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / n; out.push([Math.cos(a) * rx, Math.sin(a) * ry, a * 180 / Math.PI + 90]); }
    return out;
  }
  const sides = [{ len: t.w, c: 0 }, { len: t.w, c: 0 }, { len: t.h, c: 0 }, { len: t.h, c: 0 }];
  for (let i = 0; i < n; i++) {
    let best = 0, bv = -1;
    sides.forEach((s, j) => { const v = s.len / (s.c + 1); if (v > bv + 0.01) { bv = v; best = j; } });
    sides[best].c++;
  }
  const hw = t.w / 2, hh = t.h / 2, o = 9;
  for (let k = 0; k < sides[0].c; k++) out.push([-hw + t.w * (k + 0.5) / sides[0].c, -hh - o, 0]);
  for (let k = 0; k < sides[1].c; k++) out.push([-hw + t.w * (k + 0.5) / sides[1].c, hh + o, 180]);
  for (let k = 0; k < sides[2].c; k++) out.push([-hw - o, -hh + t.h * (k + 0.5) / sides[2].c, -90]);
  for (let k = 0; k < sides[3].c; k++) out.push([hw + o, -hh + t.h * (k + 0.5) / sides[3].c, 90]);
  return out;
}

function tableBody(t, extraStyle = '') {
  const hw = t.w / 2, hh = t.h / 2;
  if (t.shape === 'round' || t.shape === 'bar') return `<ellipse class="body" cx="0" cy="0" rx="${hw}" ry="${hh}" ${extraStyle}/>`;
  if (t.shape === 'booth') {
    const bench = Math.min(18, t.h * 0.18);
    return `<rect class="bench" x="${-hw}" y="${-hh}" width="${t.w}" height="${t.h}" rx="10"/>` +
      `<rect class="body" x="${-hw + 6}" y="${-hh + bench}" width="${t.w - 12}" height="${t.h - bench * 2}" rx="5" ${extraStyle}/>`;
  }
  return `<rect class="body" x="${-hw}" y="${-hh}" width="${t.w}" height="${t.h}" rx="${t.shape === 'square' ? 6 : 8}" ${extraStyle}/>`;
}

function decorSVG(d, sel) {
  const hw = d.w / 2, hh = d.h / 2;
  let inner = '';
  if (d.kind === 'wall') inner = `<rect class="wall" x="${-hw}" y="${-hh}" width="${d.w}" height="${d.h}" rx="2"/>`;
  else if (d.kind === 'block') inner = `<rect class="block" x="${-hw}" y="${-hh}" width="${d.w}" height="${d.h}" rx="6"/>`;
  else if (d.kind === 'zone') inner = `<rect class="zone" x="${-hw}" y="${-hh}" width="${d.w}" height="${d.h}" rx="12"/>`;
  else inner = `<rect class="lbl-hit" x="${-hw}" y="${-hh}" width="${d.w}" height="${d.h}" rx="4"/>`;
  let text = '';
  if (d.text) {
    const fs = d.kind === 'label' ? clamp(d.h * 0.62, 11, 30) : d.kind === 'zone' ? 15 : clamp(Math.min(d.h * 0.42, d.w / Math.max(3, d.text.length) * 1.5), 10, 22);
    const ty = d.kind === 'zone' ? -hh + 20 : 0;
    const vertical = d.kind !== 'zone' && d.h > d.w * 1.6;
    text = `<text class="dtext k-${d.kind}" x="0" y="${ty}" font-size="${fs}" ${vertical ? 'transform="rotate(-90)"' : ''}>${esc(d.text)}</text>`;
  }
  return `<g class="decor-it${sel ? ' sel' : ''}" data-did="${d.id}" transform="translate(${d.x} ${d.y}) rotate(${d.rot || 0})">${inner}${text}</g>`;
}

/* service floor */
function tableSVGService(t, lay) {
  const st = tableStatus(t.id);
  const s = SH.tables[t.id];
  const p = s && s.pid ? P(s.pid) : null;
  const sec = sectionById(lay, t.sectionId);
  let cls = 'tb st-' + st;
  if (selection) {
    const sp = P(selection.pid);
    if (sp && sp.tableIds.includes(t.id) && (selection.type !== 'seat')) cls += ' sel-self';
    else if (selection.picked.includes(t.id)) cls += ' sel-picked';
    else if (s.state === 'occ') cls += ' sel-no';
    else if (sp) {
      const ids = selection.type === 'add' ? sp.tableIds.concat([t.id]) : [t.id];
      const chk = seatCheck(sp, ids, selection.type === 'seat' ? 'seat' : 'move');
      const real = chk.warns.filter(w => !(selection.combine && w.type === 'small'));
      cls += chk.block ? ' sel-no' : real.length ? ' sel-warn' : ' sel-good';
    }
  }
  if (UI.dropTarget === t.id) cls += ' drop';
  if (UI.floorMode === 'sections') cls += ' secmode';
  const body = tableBody(t, UI.floorMode === 'sections' && sec ? `style="fill:${sec.color}"` : '');
  const filled = p ? Math.min(p.size, t.max) : 0;
  const chairs = chairSpots(t).map(([x, y, r], i) => `<rect class="chair${i < filled ? ' on' : ''}" x="${x - 6}" y="${y - 4.5}" width="12" height="9" rx="3" transform="rotate(${r} ${x} ${y})"/>`).join('');
  const m = Math.min(t.w, t.h);
  const fsName = clamp(m * 0.3, 11, 22);
  let lines = '';
  if (t.shape === 'bar') {
    lines = `<text class="tn" y="1" font-size="${clamp(m * 0.36, 10, 14)}">${esc(t.name)}</text>`;
  } else if (p) {
    const isFirst = p.tableIds[0] === t.id;
    const left = Math.round(minutesLeft(p));
    const over = SH.clock - p.seatedAt > p.turn;
    const timer = S().showTimers ? (over ? `+${Math.round(SH.clock - p.seatedAt - p.turn)}m` : `${left}m`) : '';
    if (!isFirst) {
      lines = `<text class="tn" y="-4" font-size="${fsName}">${esc(t.name)}</text><text class="tl" y="${fsName * 0.75}" font-size="10">with ${esc(tName(p.tableIds[0]))}</text>`;
    } else if (m >= 62) {
      lines = `<text class="tn" y="${-m * 0.2}" font-size="${fsName * 0.85}">${esc(t.name)}</text>` +
        `<text class="tp" y="${m * 0.04}" font-size="${clamp(m * 0.16, 9.5, 13)}">${esc(shortName(p).slice(0, 10))}</text>` +
        `<text class="tl" y="${m * 0.25}" font-size="${clamp(m * 0.15, 9, 12)}">${p.size}p · ${fmtClock(p.seatedAt)}${timer ? ' · ' : ''}<tspan class="${over ? 'over' : ''}">${timer}</tspan></text>`;
    } else {
      lines = `<text class="tn" y="${-m * 0.12}" font-size="${fsName * 0.85}">${esc(t.name)}</text>` +
        `<text class="tl" y="${m * 0.22}" font-size="${clamp(m * 0.2, 9, 12)}">${p.size}p <tspan class="${over ? 'over' : ''}">${timer}</tspan></text>`;
    }
  } else if (st === 'reserved') {
    const h = tableHold(t.id, S().heldWindow);
    lines = `<text class="tn" y="${-m * 0.1}" font-size="${fsName * 0.9}">${esc(t.name)}</text><text class="tl" y="${m * 0.22}" font-size="${clamp(m * 0.17, 9, 12)}">${fmtClock(h.resTime)} ${esc(shortName(h).slice(0, 7))}</text>`;
  } else if (st === 'clearing') {
    lines = `<text class="tn" y="${-m * 0.08}" font-size="${fsName * 0.9}">${esc(t.name)}</text><text class="tl" y="${m * 0.24}" font-size="${clamp(m * 0.17, 9, 12)}">bus</text>`;
  } else {
    lines = `<text class="tn" y="${-m * 0.04}" font-size="${fsName}">${esc(t.name)}</text><text class="tc" y="${m * 0.26}" font-size="${clamp(m * 0.15, 8.5, 11)}">${t.min}–${t.max}</text>`;
  }
  const secDot = sec && t.shape !== 'bar' && UI.floorMode !== 'sections' ? `<circle class="secdot" cx="${-t.w / 2 + 7}" cy="${-t.h / 2 + 7}" r="4" style="fill:${sec.color}"/>` : '';
  const pref = allParties().some(q => q.prefTable === t.id && q.status !== 'seated' && q.status !== 'done' && !['walked', 'noshow', 'cancelled', 'turned', 'declined'].includes(q.status)) ? `<g class="pref-star" transform="translate(${t.w / 2 - 4} ${-t.h / 2 + 4}) scale(.55)"><path d="M0 -10 l2.6 5.3 5.8.8-4.2 4.1 1 5.8L0 3.3 -5.2 6 -4.2 .2 -8.4-3.9 -2.6-4.7z"/></g>` : '';
  return `<g class="${cls}" data-tid="${t.id}" transform="translate(${t.x} ${t.y})"><g transform="rotate(${t.rot || 0})">${chairs}${body}${secDot}</g>${pref}<g class="tt">${lines}</g></g>`;
}

function renderServiceFloor() {
  const svg = $('#floor-svc'); if (!svg || !SH) return;
  const lay = SH.layout;
  if (!FIT_DONE.svc || FV.svcLayout !== lay.id) { FV.svcLayout = lay.id; fitView('svc', lay); }
  svg.innerHTML = `<defs><pattern id="hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="9" height="9" style="fill:var(--st-clearing)"/><rect width="3.5" height="9" style="fill:rgba(0,0,0,.25)"/></pattern></defs><g class="decor">${lay.decor.map(d => decorSVG(d)).join('')}</g><g class="tables">${lay.tables.map(t => tableSVGService(t, lay)).join('')}</g>`;
}

/* ----- gestures shared by both floors ----- */
function attachFloorGestures(svg, key, handlers) {
  const ptrs = new Map();
  let g = null;
  svg.addEventListener('pointerdown', e => {
    if (e.button && e.button !== 0) return;
    try { svg.setPointerCapture(e.pointerId); } catch (_) { }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      if (g && g.kind !== 'pan' && g.kind !== 'pending' && handlers.cancel) handlers.cancel(g);
      g = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), v0: Object.assign({}, FV[key]), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      return;
    }
    if (ptrs.size > 2) return;
    const tgt = e.target.closest('[data-tid],[data-did],[data-handle]');
    g = { kind: 'pending', sx: e.clientX, sy: e.clientY, v0: Object.assign({}, FV[key]), target: tgt, id: e.pointerId, t0: performance.now() };
    if (tgt && tgt.dataset.handle && handlers.handleDown) { g.kind = 'handle'; handlers.handleDown(g, e); }
  });
  svg.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!g) return;
    if (g.kind === 'pinch') {
      if (ptrs.size < 2) return;
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const f = d / (g.d0 || 1);
      FV[key] = Object.assign({}, g.v0); applyView(key);
      zoomAt(key, f, g.mid.x, g.mid.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const s = svgScale(svg);
      FV[key].x -= (mid.x - g.mid.x) / s; FV[key].y -= (mid.y - g.mid.y) / s; applyView(key);
      return;
    }
    if (e.pointerId !== g.id) return;
    const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
    if (g.kind === 'pending' && Math.hypot(dx, dy) > 8) {
      g.kind = (handlers.dragStart && handlers.dragStart(g, e)) || 'pan';
    }
    if (g.kind === 'pan') {
      const s = svgScale(svg);
      FV[key].x = g.v0.x - dx / s; FV[key].y = g.v0.y - dy / s; applyView(key);
    } else if (g.kind !== 'pending' && handlers.dragMove) handlers.dragMove(g, e);
  });
  const end = e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (!g) return;
    if (g.kind === 'pinch') { if (ptrs.size === 0) g = null; else g = { kind: 'done' }; return; }
    if (e.pointerId !== g.id) return;
    if (g.kind === 'pending' && e.type === 'pointerup') handlers.tap && handlers.tap(g.target, e);
    else if (g.kind !== 'pan' && g.kind !== 'done' && handlers.dragEnd) handlers.dragEnd(g, e, e.type === 'pointercancel');
    g = null;
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('wheel', e => { e.preventDefault(); zoomAt(key, e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY); }, { passive: false });
}

ACT.zoom = el => { const k = el.dataset.key; if (el.dataset.dir === 'fit') fitIfNeeded(k); else zoomAt(k, el.dataset.dir === 'in' ? 1.25 : 0.8); };

function floorTools(key) {
  return `<div class="floor-tools">
    <button class="icon-btn" data-act="zoom" data-key="${key}" data-dir="in" aria-label="Zoom in">${icon('zoomin')}</button>
    <button class="icon-btn" data-act="zoom" data-key="${key}" data-dir="out" aria-label="Zoom out">${icon('zoomout')}</button>
    <button class="icon-btn" data-act="zoom" data-key="${key}" data-dir="fit" aria-label="Fit floor">${icon('fit')}</button>
  </div>`;
}
