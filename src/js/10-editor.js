/* ---------- floor plan editor ---------- */
const ED = { layoutId: null, sel: null, selKind: null, mode: 'select', paintSec: null, comboPick: [], undo: [], tab: 'add', built: false };
function edLayout() { return DB.layouts.find(l => l.id === ED.layoutId) || activeLayout(); }
function edItem() { const L = edLayout(); return ED.selKind === 'table' ? L.tables.find(t => t.id === ED.sel) : ED.selKind === 'decor' ? L.decor.find(d => d.id === ED.sel) : null; }
function pushUndo() { ED.undo.push(JSON.stringify(edLayout())); if (ED.undo.length > 40) ED.undo.shift(); }
function edChanged() { saveSoon(); dirty(); }

function editorEnter() {
  if (!ED.layoutId || !DB.layouts.find(l => l.id === ED.layoutId)) ED.layoutId = DB.activeLayoutId;
  ED.built = false;
}
function editorLeave() { ED.mode = 'select'; ED.comboPick = []; saveDB(); }

function renderEditor() {
  const root = $('#v-editor');
  if (!ED.built || !root.querySelector('.ed')) buildEditorSkeleton(root);
  renderEditorBar();
  renderEditorFloor();
  renderEditorPanel();
  renderEditorMode();
}

function buildEditorSkeleton(root) {
  ED.built = true;
  root.innerHTML = `<div class="ed svc" data-panel="${UI.panelSize}">
    <div class="shiftbar ed-bar" id="ed-bar"></div>
    <div class="svc-body">
      <div class="floor-wrap ed-floor">
        <svg id="floor-edit" class="floor editing" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Floor plan editor"></svg>
        <div id="ed-mode"></div>
        ${floorTools('edit')}
        <div class="floor-mode"><button class="icon-btn" data-act="ed-undo" aria-label="Undo">${icon('undo')}</button></div>
      </div>
      <aside class="panel ed-panel" id="ed-panel"></aside>
    </div>
  </div>`;
  FIT_DONE.edit = false;
  const svg = $('#floor-edit');
  attachFloorGestures(svg, 'edit', {
    tap(tgt) {
      const L = edLayout();
      const tEl = tgt && tgt.closest('[data-tid]'); const dEl = tgt && tgt.closest('[data-did]');
      if (ED.mode === 'paint') { if (tEl && ED.paintSec) { pushUndo(); L.tables.find(t => t.id === tEl.dataset.tid).sectionId = ED.paintSec; edChanged(); } return; }
      if (ED.mode === 'combo') {
        if (tEl) { const id = tEl.dataset.tid; const i = ED.comboPick.indexOf(id); if (i >= 0) ED.comboPick.splice(i, 1); else ED.comboPick.push(id); dirty(); }
        return;
      }
      if (tEl) { ED.sel = tEl.dataset.tid; ED.selKind = 'table'; }
      else if (dEl) { ED.sel = dEl.dataset.did; ED.selKind = 'decor'; }
      else { ED.sel = null; ED.selKind = null; }
      if (UI.narrow && ED.sel && UI.panelSize === 'min') setPanelSize('half');
      dirty();
    },
    dragStart(g) {
      if (ED.mode !== 'select' || !g.target) return null;
      const tEl = g.target.closest('[data-tid]'); const dEl = g.target.closest('[data-did]');
      if (!tEl && !dEl) return null;
      ED.sel = tEl ? tEl.dataset.tid : dEl.dataset.did; ED.selKind = tEl ? 'table' : 'decor';
      const it = edItem(); if (!it) return null;
      pushUndo();
      g.ox = it.x; g.oy = it.y;
      return 'item';
    },
    handleDown(g) {
      const it = edItem(); if (!it) return;
      pushUndo();
      g.kind = g.target.dataset.handle; // resize | rotate
      // resize keeps the opposite corner where it is
      const r = (it.rot || 0) * Math.PI / 180;
      g.anchor = { x: it.x - (it.w / 2) * Math.cos(r) + (it.h / 2) * Math.sin(r), y: it.y - (it.w / 2) * Math.sin(r) - (it.h / 2) * Math.cos(r) };
    },
    dragMove(g, e) {
      const it = edItem(); if (!it) return;
      const svg = $('#floor-edit');
      if (g.kind === 'item') {
        const s = svgScale(svg);
        it.x = Math.round((g.ox + (e.clientX - g.sx) / s) / 5) * 5;
        it.y = Math.round((g.oy + (e.clientY - g.sy) / s) / 5) * 5;
      } else if (g.kind === 'resize' || g.kind === 'rotate') {
        const p = svgPoint(svg, e.clientX, e.clientY);
        const dx = p.x - it.x, dy = p.y - it.y;
        if (g.kind === 'rotate') {
          let a = Math.atan2(dy, dx) * 180 / Math.PI + 90;
          a = Math.round(a / 15) * 15; it.rot = ((a % 360) + 360) % 360;
        } else {
          const a = (it.rot || 0) * Math.PI / 180;
          const vx = p.x - g.anchor.x, vy = p.y - g.anchor.y;
          const lx = vx * Math.cos(a) + vy * Math.sin(a), ly = -vx * Math.sin(a) + vy * Math.cos(a);
          const minS = ED.selKind === 'table' ? 24 : 8;
          let w = Math.max(minS, Math.round(lx / 5) * 5), h = Math.max(minS, Math.round(ly / 5) * 5);
          if (ED.selKind === 'table' && (it.shape === 'round' || it.shape === 'square' || it.shape === 'bar')) w = h = Math.max(w, h);
          it.w = w; it.h = h;
          it.x = g.anchor.x + (w / 2) * Math.cos(a) - (h / 2) * Math.sin(a);
          it.y = g.anchor.y + (w / 2) * Math.sin(a) + (h / 2) * Math.cos(a);
        }
      }
      renderEditorFloor();
    },
    dragEnd() { const it = edItem(); if (it) { it.x = Math.round(it.x); it.y = Math.round(it.y); } edChanged(); },
  });
  if (window.ResizeObserver) { const ro = new ResizeObserver(() => fitIfNeeded('edit')); ro.observe(root.querySelector('.ed-floor')); }
}

function renderEditorBar() {
  const L = edLayout();
  setHTML($('#ed-bar'), `
    <label class="field inline grow"><span class="hide-sm">Layout</span><select data-change="ed-layout" aria-label="Layout">${DB.layouts.map(l => `<option value="${l.id}" ${l.id === L.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
    <button class="btn sm" data-act="ed-rename">${icon('edit')}<span class="hide-sm"> Rename</span></button>
    <button class="btn sm" data-act="ed-newlay">${icon('plus')}<span class="hide-sm"> New</span></button>
    <button class="btn sm" data-act="ed-duplay">${icon('copy')}<span class="hide-sm"> Copy</span></button>
    <button class="btn sm" data-act="ed-dellay" aria-label="Delete layout">${icon('trash')}</button>
    ${L.id === DB.activeLayoutId ? `<span class="pill ok">${icon('check')}<span class="hide-sm"> Used for service</span></span>` : `<button class="btn sm primary" data-act="ed-use">Use for service</button>`}
  `);
}
CHANGE['ed-layout'] = el => { ED.layoutId = el.value; ED.sel = null; ED.undo = []; FIT_DONE.edit = false; fitIfNeeded('edit'); dirty(); };
ACT['ed-use'] = () => { DB.activeLayoutId = edLayout().id; saveDB(); toast(`"${edLayout().name}" will be used for your next shift.`); dirty(); };
ACT['ed-rename'] = () => {
  const L = edLayout();
  openSheet(() => sheetHead('Rename layout') + `<div class="sheet-body"><div class="field"><label for="lay-name">Name</label><input id="lay-name" type="text" value="${esc(L.name)}" autofocus></div></div><div class="sheet-foot"><button class="btn primary wide" data-act="ed-rename-save">Save</button></div>`);
};
ACT['ed-rename-save'] = () => { const v = $('#lay-name').value.trim(); if (v) { edLayout().name = v; edChanged(); } closeSheet(); };
ACT['ed-newlay'] = () => {
  openSheet(() => sheetHead('New layout') + `<div class="sheet-body"><button class="pick" data-act="ed-newlay-go" data-k="blank"><b>Blank room</b><span>An empty dining room with one section.</span></button><button class="pick" data-act="ed-newlay-go" data-k="sample"><b>Sample Meetbros room</b><span>A fresh copy of the starter layout: bar, window two-tops, main floor, booths and patio.</span></button></div>`);
};
ACT['ed-newlay-go'] = el => {
  const L = el.dataset.k === 'blank' ? blankLayout('New layout ' + (DB.layouts.length + 1)) : sampleLayout();
  DB.layouts.push(L); ED.layoutId = L.id; ED.sel = null; ED.undo = []; closeSheet(); FIT_DONE.edit = false; fitIfNeeded('edit'); edChanged();
};
ACT['ed-duplay'] = () => {
  const L = deepCopy(edLayout());
  const map = {};
  L.id = uid('lay'); L.name = L.name + ' copy';
  L.sections.forEach(s => { const n = uid('sec'); map[s.id] = n; s.id = n; });
  L.tables.forEach(t => { const n = uid('t'); map[t.id] = n; t.id = n; t.sectionId = map[t.sectionId] || t.sectionId; });
  L.decor.forEach(d => d.id = uid('d'));
  L.combos.forEach(c => { c.id = uid('cmb'); c.tableIds = c.tableIds.map(id => map[id] || id); });
  DB.layouts.push(L); ED.layoutId = L.id; ED.sel = null; ED.undo = []; edChanged(); toast('Layout copied.');
};
ACT['ed-dellay'] = async () => {
  if (DB.layouts.length < 2) { toast('Keep at least one layout. Make a new one first.', 'warn'); return; }
  const L = edLayout();
  if (!(await askConfirm({ title: `Delete "${L.name}"?`, body: 'Its tables, sections and combinations are removed. Shift history is kept.', ok: 'Delete', danger: true }))) return;
  DB.layouts = DB.layouts.filter(l => l.id !== L.id);
  if (DB.activeLayoutId === L.id) DB.activeLayoutId = DB.layouts[0].id;
  ED.layoutId = DB.layouts[0].id; ED.sel = null; ED.undo = []; FIT_DONE.edit = false; fitIfNeeded('edit'); edChanged();
};
ACT['ed-undo'] = () => {
  const s = ED.undo.pop(); if (!s) { toast('Nothing to undo.'); return; }
  const L = JSON.parse(s); const i = DB.layouts.findIndex(l => l.id === L.id);
  if (i >= 0) DB.layouts[i] = L;
  if (!edItem()) ED.sel = null;
  edChanged();
};

function renderEditorFloor() {
  const svg = $('#floor-edit'); if (!svg) return;
  const L = edLayout();
  if (!FIT_DONE.edit) fitView('edit', L);
  const scale = svgScale(svg) || 1;
  const tablesHTML = L.tables.map(t => {
    const sec = sectionById(L, t.sectionId);
    const sel = ED.selKind === 'table' && ED.sel === t.id;
    const picked = ED.comboPick.includes(t.id);
    const inCombo = ED.mode === 'combo' && L.combos.some(c => c.tableIds.includes(t.id));
    const chairs = chairSpots(t).map(([x, y, r]) => `<rect class="chair" x="${x - 6}" y="${y - 4.5}" width="12" height="9" rx="3" transform="rotate(${r} ${x} ${y})"/>`).join('');
    const m = Math.min(t.w, t.h);
    const fs = clamp(m * 0.3, 10, 22);
    return `<g class="tb ed-t${sel ? ' sel' : ''}${picked ? ' sel-picked' : ''}${inCombo ? ' in-combo' : ''}${!t.combinable ? ' nocomb' : ''}" data-tid="${t.id}" transform="translate(${t.x} ${t.y})">
      <g transform="rotate(${t.rot || 0})">${chairs}${tableBody(t, sec ? `style="fill:${sec.color}"` : '')}</g>
      <g class="tt"><text class="tn" y="${t.shape === 'bar' ? 1 : -m * 0.05}" font-size="${t.shape === 'bar' ? 11 : fs}">${esc(t.name)}</text>${t.shape !== 'bar' ? `<text class="tc" y="${m * 0.27}" font-size="${clamp(m * 0.15, 8.5, 11)}">${t.min}–${t.max}</text>` : ''}</g></g>`;
  }).join('');
  let handles = '';
  const it = edItem();
  if (it && ED.mode === 'select') {
    const r = (it.rot || 0) * Math.PI / 180;
    const rotp = (x, y) => [it.x + x * Math.cos(r) - y * Math.sin(r), it.y + x * Math.sin(r) + y * Math.cos(r)];
    const hr = 12 / scale;
    const [rx, ry] = rotp(it.w / 2, it.h / 2);
    const [ox, oy] = rotp(0, -it.h / 2 - 34 / scale);
    const [tx, ty] = rotp(0, -it.h / 2);
    handles = `<g class="handles"><line x1="${tx}" y1="${ty}" x2="${ox}" y2="${oy}" stroke-width="${1.5 / scale}"/>
      <circle data-handle="resize" class="h-resize" cx="${rx}" cy="${ry}" r="${hr}" stroke-width="${2 / scale}"/>
      <circle data-handle="rotate" class="h-rotate" cx="${ox}" cy="${oy}" r="${hr}" stroke-width="${2 / scale}"/></g>`;
  }
  svg.innerHTML = `<g class="decor">${L.decor.map(d => decorSVG(d, ED.selKind === 'decor' && ED.sel === d.id)).join('')}</g><g class="tables">${tablesHTML}</g>${handles}`;
}

function renderEditorMode() {
  const el = $('#ed-mode'); if (!el) return;
  const L = edLayout();
  if (ED.mode === 'paint') {
    const s = sectionById(L, ED.paintSec);
    setHTML(el, `<div class="selbar"><div class="sb-text">${icon('paint')}<div><b>Assign tables to ${esc(s ? s.name : '')}</b><span class="muted"> Tap tables to put them in this section.</span></div></div>
      <div class="sb-sugg">${L.sections.map(x => `<button class="chip${x.id === ED.paintSec ? ' on' : ''}" data-act="paint-sec" data-id="${x.id}"><span class="dot" style="background:${x.color}"></span>${esc(x.name)}</button>`).join('')}</div>
      <div class="sb-btns"><button class="btn sm primary" data-act="mode-done">Done</button></div></div>`);
  } else if (ED.mode === 'combo') {
    const cap = ED.comboPick.length ? sum(ED.comboPick.map(id => L.tables.find(t => t.id === id)).filter(Boolean), t => t.max) : 0;
    setHTML(el, `<div class="selbar"><div class="sb-text">${icon('combine')}<div><b>New combination</b><span class="muted"> Tap two or more tables that push together. ${ED.comboPick.length ? `Picked ${esc(ED.comboPick.map(id => (L.tables.find(t => t.id === id) || {}).name).join('+'))}, seats up to ${cap}.` : ''}</span></div></div>
      <div class="sb-btns"><button class="btn sm primary" data-act="combo-save" ${ED.comboPick.length < 2 ? 'disabled' : ''}>Save combination</button><button class="btn sm" data-act="mode-done">Cancel</button></div></div>`);
  } else setHTML(el, '');
}
ACT['paint-sec'] = el => { ED.paintSec = el.dataset.id; dirty(); };
ACT['mode-done'] = () => { ED.mode = 'select'; ED.comboPick = []; dirty(); };
ACT['combo-save'] = () => {
  const L = edLayout();
  const ts = ED.comboPick.map(id => L.tables.find(t => t.id === id)).filter(Boolean);
  if (ts.length < 2) return;
  if (L.combos.some(c => sameSet(c.tableIds, ED.comboPick))) { toast('That combination already exists.', 'warn'); return; }
  pushUndo();
  ts.forEach(t => t.combinable = true);
  L.combos.push({ id: uid('cmb'), tableIds: ED.comboPick.slice(), min: Math.max(...ts.map(t => t.max)) + 1, max: sum(ts, t => t.max) });
  ED.mode = 'select'; ED.comboPick = []; ED.tab = 'combos';
  toast(`Saved ${ts.map(t => t.name).join('+')}.`);
  edChanged();
};

/* ----- editor panel ----- */
function renderEditorPanel() {
  const el = $('#ed-panel'); if (!el) return;
  const a = document.activeElement;
  if (a && el.contains(a) && a.matches('input,select,textarea')) return; // don't rebuild while typing
  const it = edItem();
  let body;
  if (it && ED.selKind === 'table') body = tablePropsHTML(it);
  else if (it) body = decorPropsHTML(it);
  else {
    const tab = (k, l) => `<button role="tab" aria-selected="${ED.tab === k}" class="${ED.tab === k ? 'on' : ''}" data-act="ed-tab" data-tab="${k}">${l}</button>`;
    body = `<div class="tabs" role="tablist">${tab('add', 'Add')}${tab('sections', 'Sections')}${tab('combos', 'Combos')}</div><div class="plist">${ED.tab === 'add' ? addHTML() : ED.tab === 'sections' ? sectionsHTML() : combosHTML()}</div>`;
  }
  setHTML(el, `<button class="panel-handle" data-act="panel-toggle" aria-label="Resize panel"><span></span></button>${body}`);
}
ACT['ed-tab'] = el => { ED.tab = el.dataset.tab; if (UI.narrow && UI.panelSize === 'min') setPanelSize('half'); dirty(); };

function addHTML() {
  const L = edLayout();
  return `<div class="ed-sec"><div class="ghead">Tables</div><div class="addgrid">
    ${Object.entries(SHAPES).map(([k, s]) => `<button class="addbtn" data-act="ed-add-table" data-shape="${k}">${shapeIcon(k)}<span>${s.label}</span></button>`).join('')}</div>
    <div class="ghead">Room features</div><div class="addgrid">
    ${[['wall', '', 'Wall'], ['block', 'Bar', 'Bar counter'], ['block', 'Kitchen', 'Kitchen'], ['zone', 'Patio', 'Patio area'], ['label', 'Door', 'Door'], ['label', 'Host stand', 'Host stand'], ['block', 'Restrooms', 'Restrooms'], ['label', 'Label', 'Text label']].map(([k, t, l]) => `<button class="addbtn" data-act="ed-add-decor" data-kind="${k}" data-text="${t}">${icon(k === 'wall' ? 'wall' : k === 'label' ? (t === 'Door' ? 'door' : 'label') : k === 'zone' ? 'leaf' : 'utensils')}<span>${l}</span></button>`).join('')}</div>
    <p class="muted small">Tap an item on the floor to edit it. Drag to move. Use the corner handle to resize and the top handle to rotate. Pinch or use the zoom buttons to get close. ${L.tables.length} tables, ${tableSeats(L)} seats.</p></div>`;
}
function shapeIcon(k) {
  const m = { round: '<circle cx="12" cy="12" r="7"/>', square: '<rect x="5" y="5" width="14" height="14" rx="2"/>', rect: '<rect x="2.5" y="7" width="19" height="10" rx="2"/>', booth: '<path d="M4 5h16v14H4z"/><rect x="7" y="8.5" width="10" height="7" rx="1"/>', bar: '<circle cx="12" cy="9" r="4"/><path d="M12 13v7M8.5 20h7"/>' }[k];
  return `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">${m}</svg>`;
}
function viewCenter() { const v = FV.edit; return v ? { x: Math.round((v.x + v.w / 2) / 5) * 5, y: Math.round((v.y + v.h / 2) / 5) * 5 } : { x: 600, y: 400 }; }
function nextTableName(L, shape) {
  const names = new Set(L.tables.map(t => t.name));
  if (shape === 'bar') { let i = 1; while (names.has('B' + i)) i++; return 'B' + i; }
  const nums = L.tables.map(t => parseInt(t.name, 10)).filter(n => !isNaN(n));
  let n = nums.length ? Math.max(...nums) + 1 : 1; while (names.has(String(n))) n++;
  return String(n);
}
ACT['ed-add-table'] = el => {
  const L = edLayout(); pushUndo();
  const shape = el.dataset.shape; const c = viewCenter();
  const defaults = { round: [2, 4], square: [2, 4], rect: [4, 6], booth: [3, 5], bar: [1, 1] }[shape];
  const t = { id: uid('t'), name: nextTableName(L, shape), shape, x: c.x, y: c.y, w: SHAPES[shape].w, h: SHAPES[shape].h, rot: 0, min: defaults[0], max: defaults[1], sectionId: L.sections[0] ? L.sections[0].id : null, combinable: shape !== 'booth' };
  L.tables.push(t); ED.sel = t.id; ED.selKind = 'table';
  edChanged();
};
ACT['ed-add-decor'] = el => {
  const L = edLayout(); pushUndo();
  const kind = el.dataset.kind; const c = viewCenter();
  const d = { id: uid('d'), kind, text: el.dataset.text || '', x: c.x, y: c.y, w: DECOR_KINDS[kind].w, h: DECOR_KINDS[kind].h, rot: 0 };
  if (el.dataset.text === 'Kitchen') { d.w = 240; d.h = 120; }
  L.decor.push(d); ED.sel = d.id; ED.selKind = 'decor';
  edChanged();
};

function numStep(name, v, step, min = 0) { return `<div class="stepper" data-name="${name}" data-step="${step}" data-min="${min}"><button data-act="nstep" data-d="-1" aria-label="Less">${icon('minus')}</button><output>${v}</output><button data-act="nstep" data-d="1" aria-label="More">${icon('plus')}</button></div>`; }
ACT.nstep = el => {
  const w = el.closest('.stepper'); const it = edItem(); if (!it) return;
  const step = +w.dataset.step; const key = w.dataset.name;
  pushUndo();
  let v = (it[key] || 0) + step * +el.dataset.d;
  v = Math.max(+w.dataset.min, v);
  if (key === 'rot') v = ((v % 360) + 360) % 360;
  it[key] = v;
  if (ED.selKind === 'table') {
    if (key === 'min' && it.max < it.min) it.max = it.min;
    if (key === 'max' && it.min > it.max) it.min = it.max;
    if ((key === 'w' || key === 'h') && ['round', 'square', 'bar'].includes(it.shape)) it.w = it.h = v;
  }
  edChanged();
};

function tablePropsHTML(t) {
  const L = edLayout();
  const combos = L.combos.filter(c => c.tableIds.includes(t.id));
  return `<div class="props"><div class="props-head"><h3>Table ${esc(t.name)}</h3><button class="btn sm" data-act="ed-deselect">Done</button></div>
    <div class="field"><label for="p-name">Name or number</label><input id="p-name" type="text" value="${esc(t.name)}" data-change="ed-name" autocomplete="off"></div>
    <div class="field"><label>Shape</label><div class="seg wrap">${Object.entries(SHAPES).map(([k, s]) => `<button class="${t.shape === k ? 'on' : ''}" data-act="ed-shape" data-shape="${k}">${s.label}</button>`).join('')}</div></div>
    <div class="two"><div class="field"><label>Min covers</label>${numStep('min', t.min, 1, 1)}</div><div class="field"><label>Max covers</label>${numStep('max', t.max, 1, 1)}</div></div>
    <div class="field"><label for="p-sec">Section</label><select id="p-sec" data-change="ed-sec">${L.sections.map(s => `<option value="${s.id}" ${s.id === t.sectionId ? 'selected' : ''}>${esc(s.name)}${s.server ? ' (' + esc(s.server) + ')' : ''}</option>`).join('')}<option value="" ${!t.sectionId ? 'selected' : ''}>No section</option></select></div>
    <label class="toggle"><input type="checkbox" data-change="ed-comb" ${t.combinable ? 'checked' : ''}><span></span>Can combine with other tables</label>
    ${combos.length ? `<div class="muted small">In combinations: ${combos.map(c => esc(c.tableIds.map(id => (L.tables.find(x => x.id === id) || {}).name).join('+')) + ` (${c.min}–${c.max})`).join(', ')}</div>` : ''}
    <div class="two"><div class="field"><label>Width</label>${numStep('w', t.w, 5, 20)}</div><div class="field"><label>Height</label>${numStep('h', t.h, 5, 20)}</div></div>
    <div class="field"><label>Rotation</label>${numStep('rot', t.rot || 0, 15, -360)}</div>
    <div class="actgrid"><button class="btn" data-act="ed-dup">${icon('copy')} Duplicate</button><button class="btn danger" data-act="ed-del">${icon('trash')} Delete</button></div></div>`;
}
function decorPropsHTML(d) {
  return `<div class="props"><div class="props-head"><h3>${DECOR_KINDS[d.kind].label}</h3><button class="btn sm" data-act="ed-deselect">Done</button></div>
    <div class="field"><label>Type</label><div class="seg wrap">${Object.entries(DECOR_KINDS).map(([k, s]) => `<button class="${d.kind === k ? 'on' : ''}" data-act="ed-dkind" data-kind="${k}">${s.label}</button>`).join('')}</div></div>
    <div class="field"><label for="p-text">Text</label><input id="p-text" type="text" value="${esc(d.text)}" data-change="ed-text" autocomplete="off" placeholder="Bar, Kitchen, Door, Patio"></div>
    <div class="two"><div class="field"><label>Width</label>${numStep('w', d.w, 10, 6)}</div><div class="field"><label>Height</label>${numStep('h', d.h, 10, 6)}</div></div>
    <div class="field"><label>Rotation</label>${numStep('rot', d.rot || 0, 15, -360)}</div>
    <div class="actgrid"><button class="btn" data-act="ed-dup">${icon('copy')} Duplicate</button><button class="btn danger" data-act="ed-del">${icon('trash')} Delete</button></div></div>`;
}
ACT['ed-deselect'] = () => { ED.sel = null; ED.selKind = null; dirty(); };
CHANGE['ed-name'] = el => { const t = edItem(); if (t) { t.name = el.value.trim() || t.name; renderEditorFloor(); saveSoon(); } };
CHANGE['ed-text'] = el => { const d = edItem(); if (d) { d.text = el.value; renderEditorFloor(); saveSoon(); } };
CHANGE['ed-sec'] = el => { const t = edItem(); if (t) { pushUndo(); t.sectionId = el.value || null; edChanged(); } };
CHANGE['ed-comb'] = el => {
  const t = edItem(); if (!t) return; pushUndo(); t.combinable = el.checked;
  if (!el.checked) { const L = edLayout(); const n = L.combos.length; L.combos = L.combos.filter(c => !c.tableIds.includes(t.id)); if (L.combos.length < n) toast(`Removed ${n - L.combos.length} combination${n - L.combos.length > 1 ? 's' : ''} that used ${t.name}.`); }
  edChanged();
};
ACT['ed-shape'] = el => {
  const t = edItem(); if (!t) return; pushUndo();
  t.shape = el.dataset.shape; t.w = SHAPES[t.shape].w; t.h = SHAPES[t.shape].h;
  if (t.shape === 'bar') { t.min = 1; t.max = 1; }
  edChanged();
};
ACT['ed-dkind'] = el => { const d = edItem(); if (!d) return; pushUndo(); d.kind = el.dataset.kind; edChanged(); };
ACT['ed-dup'] = () => {
  const it = edItem(); if (!it) return; const L = edLayout(); pushUndo();
  const c = deepCopy(it); c.x += 30; c.y += 30;
  if (ED.selKind === 'table') { c.id = uid('t'); c.name = nextTableName(L, c.shape); L.tables.push(c); }
  else { c.id = uid('d'); L.decor.push(c); }
  ED.sel = c.id; edChanged();
};
ACT['ed-del'] = () => {
  const it = edItem(); if (!it) return; const L = edLayout(); pushUndo();
  if (ED.selKind === 'table') { L.tables = L.tables.filter(t => t.id !== it.id); L.combos = L.combos.filter(c => !c.tableIds.includes(it.id)); }
  else L.decor = L.decor.filter(d => d.id !== it.id);
  ED.sel = null; ED.selKind = null; edChanged();
  toast('Deleted. Undo is in the corner of the floor.');
};

function sectionsHTML() {
  const L = edLayout();
  return `<div class="ed-sec">${L.sections.map(s => {
    const n = L.tables.filter(t => t.sectionId === s.id);
    return `<div class="secrow"><input type="color" value="${s.color}" data-change="sec-color" data-id="${s.id}" aria-label="Section color">
      <div class="secfields"><input type="text" value="${esc(s.name)}" data-change="sec-name" data-id="${s.id}" aria-label="Section name" placeholder="Section name"><input type="text" value="${esc(s.server || '')}" data-change="sec-server" data-id="${s.id}" aria-label="Server name" placeholder="Server"></div>
      <span class="muted small">${n.length} tables · ${sum(n, t => t.max)} seats</span>
      <button class="icon-btn" data-act="sec-paint" data-id="${s.id}" aria-label="Assign tables">${icon('paint')}</button>
      <button class="icon-btn" data-act="sec-del" data-id="${s.id}" aria-label="Delete section">${icon('trash')}</button></div>`;
  }).join('')}
  <div class="row-btns"><button class="btn" data-act="sec-add">${icon('plus')} Add section</button></div>
  <p class="muted small">Tap the paint icon, then tap tables on the floor to move them into that section.</p></div>`;
}
CHANGE['sec-color'] = el => { const s = sectionById(edLayout(), el.dataset.id); if (s) { s.color = el.value; renderEditorFloor(); saveSoon(); } };
CHANGE['sec-name'] = el => { const s = sectionById(edLayout(), el.dataset.id); if (s) { s.name = el.value; saveSoon(); } };
CHANGE['sec-server'] = el => { const s = sectionById(edLayout(), el.dataset.id); if (s) { s.server = el.value; saveSoon(); } };
ACT['sec-add'] = () => { const L = edLayout(); pushUndo(); L.sections.push({ id: uid('sec'), name: 'Section ' + (L.sections.length + 1), server: '', color: SECTION_COLORS[L.sections.length % SECTION_COLORS.length] }); edChanged(); };
ACT['sec-del'] = async el => {
  const L = edLayout(); const s = sectionById(L, el.dataset.id);
  if (!(await askConfirm({ title: `Delete ${s.name}?`, body: 'Its tables stay on the floor with no section.', ok: 'Delete', danger: true }))) return;
  pushUndo(); L.sections = L.sections.filter(x => x.id !== s.id); L.tables.forEach(t => { if (t.sectionId === s.id) t.sectionId = null; }); edChanged();
};
ACT['sec-paint'] = el => { ED.mode = 'paint'; ED.paintSec = el.dataset.id; ED.sel = null; if (UI.narrow) setPanelSize('min'); dirty(); };

function combosHTML() {
  const L = edLayout();
  const nm = id => (L.tables.find(t => t.id === id) || {}).name || '?';
  return `<div class="ed-sec">${L.combos.length ? '' : '<div class="empty">No combinations yet.</div>'}${L.combos.map(c => `<div class="combrow"><b>${esc(c.tableIds.map(nm).join(' + '))}</b>
    <div class="cmb-steps"><span class="muted small">Min</span>${cStep(c, 'min')}<span class="muted small">Max</span>${cStep(c, 'max')}</div>
    <button class="icon-btn" data-act="cmb-del" data-id="${c.id}" aria-label="Delete combination">${icon('trash')}</button></div>`).join('')}
  <div class="row-btns"><button class="btn" data-act="cmb-new">${icon('combine')} New combination</button></div>
  <p class="muted small">Combinations are table sets you push together for bigger parties, like 12+13 for an 8-top. During service you can also combine any tables marked combinable on the spot.</p></div>`;
}
function cStep(c, k) { return `<div class="stepper sm" data-cmb="${c.id}" data-k="${k}"><button data-act="cstep" data-d="-1" aria-label="Less">${icon('minus')}</button><output>${c[k]}</output><button data-act="cstep" data-d="1" aria-label="More">${icon('plus')}</button></div>`; }
ACT.cstep = el => {
  const w = el.closest('.stepper'); const c = edLayout().combos.find(x => x.id === w.dataset.cmb); if (!c) return;
  pushUndo(); c[w.dataset.k] = Math.max(1, c[w.dataset.k] + +el.dataset.d);
  if (c.min > c.max) { if (w.dataset.k === 'min') c.max = c.min; else c.min = c.max; }
  edChanged();
};
ACT['cmb-del'] = el => { const L = edLayout(); pushUndo(); L.combos = L.combos.filter(c => c.id !== el.dataset.id); edChanged(); };
ACT['cmb-new'] = () => { ED.mode = 'combo'; ED.comboPick = []; ED.sel = null; if (UI.narrow) setPanelSize('min'); dirty(); };
