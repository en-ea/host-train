/* ---------- live service screen ---------- */
function setHTML(el, html) { if (el && el._h !== html) { el.innerHTML = html; el._h = html; } }
const DONE_STATES = ['done', 'noshow', 'cancelled', 'walked', 'turned', 'declined'];

function renderService() {
  const root = $('#v-service');
  if (!SH) { setHTML(root, startScreenHTML()); return; }
  if (SH.ended) { setHTML(root, reportHTML(SH.report, true)); return; }
  if (!root.querySelector('.svc') || root.dataset.shift !== SH.id) buildServiceSkeleton(root);
  renderShiftBar();
  renderServiceFloor();
  renderPanel();
  renderSelBar();
}

function buildServiceSkeleton(root) {
  root.dataset.shift = SH.id;
  root._h = null;
  root.innerHTML = `<div class="svc" data-panel="${UI.panelSize}">
    <div class="shiftbar" id="shiftbar"></div>
    <div id="coach"></div>
    <div class="svc-body">
      <div class="floor-wrap">
        <svg id="floor-svc" class="floor" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Floor plan"></svg>
        <div id="selbar"></div>
        ${floorTools('svc')}
        <div class="floor-mode seg sm">
          <button data-act="floor-mode" data-m="status" class="${UI.floorMode === 'status' ? 'on' : ''}">Status</button>
          <button data-act="floor-mode" data-m="sections" class="${UI.floorMode === 'sections' ? 'on' : ''}">Sections</button>
          <button data-act="legend" aria-label="Status colors">Key</button>
        </div>
      </div>
      <aside class="panel" id="panel"></aside>
    </div>
  </div>`;
  FIT_DONE.svc = false;
  const svg = $('#floor-svc');
  attachFloorGestures(svg, 'svc', {
    tap(tgt) {
      const tid = tgt && tgt.closest('[data-tid]') && tgt.closest('[data-tid]').dataset.tid;
      if (!tid) return;
      if (selection) selectionTap(tid); else openTableSheet(tid);
    },
    dragStart(g) {
      if (selection || !g.target) return null;
      const tEl = g.target.closest('[data-tid]'); if (!tEl) return null;
      const s = SH.tables[tEl.dataset.tid];
      if (!s || s.state !== 'occ') return null;
      const p = P(s.pid);
      g.pid = p.id; g.from = tEl.dataset.tid;
      showGhost(`${shortName(p)} (${p.size})`, g.sx, g.sy);
      return 'party';
    },
    dragMove(g, e) { moveGhost(e.clientX, e.clientY); setDropTarget(tableUnder(e.clientX, e.clientY)); },
    dragEnd(g, e, cancelled) {
      hideGhost(); const tid = UI.dropTarget; setDropTarget(null);
      if (cancelled || !tid || tid === g.from) return;
      const p = P(g.pid); if (!p) return;
      if (p.tableIds.includes(tid)) return;
      beginSelection('move', p.id); selectionTap(tid);
    },
  });
  // keep the floor fitted when the container changes size
  if (window.ResizeObserver) { const ro = new ResizeObserver(() => fitIfNeeded('svc')); ro.observe($('.floor-wrap')); }
}

ACT['floor-mode'] = el => { UI.floorMode = el.dataset.m; $$('.floor-mode [data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === UI.floorMode)); dirty(); };
ACT.legend = () => openSheet(() => sheetHead('Table status colors') + `<div class="sheet-body"><div class="legend">${STATUS_ORDER.map(s => `<div class="lg"><span class="sw st-${s}"></span><b>${STATUS_META[s].label}</b><span>${legendText(s)}</span></div>`).join('')}</div><p class="muted small">Filled chairs show how many guests are at a table. Empty chairs at a seated table are wasted seats. The colored dot in the corner is the server section.</p></div>`);
function legendText(s) {
  return { available: 'Clean and free.', reserved: `A booking is due within ${S().heldWindow} min.`, seated: 'Guests just sat down.', ordered: 'Order is in.', mains: 'Entrées on the table.', dessert: 'Dessert or coffee.', check: 'Check is on the table.', paid: 'Paid, about to leave.', clearing: 'Guests left. Needs bussing.' }[s];
}

/* ----- shift bar ----- */
function renderShiftBar() {
  const el = $('#shiftbar'); if (!el) return;
  const speeds = [0, 1, 5, 10, 30];
  const waiting = allParties().filter(p => p.status === 'waiting' || p.status === 'new').length;
  const arrived = allParties().filter(p => p.status === 'arrived').length;
  const covers = sum(allParties().filter(p => p.seatedAt != null), p => p.size);
  setHTML(el, `
    <div class="clock" aria-live="off"><span id="ck">${fmtClock(SH.clock)}</span><span class="ap" id="ck-ap">${SH.clock % 1440 >= 720 ? 'pm' : 'am'}</span></div>
    <div class="seg speed" role="group" aria-label="Clock speed">${speeds.map(v => `<button data-act="speed" data-v="${v}" class="${SH.speed === v ? 'on' : ''}" aria-label="${v ? v + ' times speed' : 'Pause'}">${v === 0 ? icon('pause') : v + '×'}</button>`).join('')}</div>
    <div class="kpis">
      <span class="kpi" title="Seats in use"><b>${Math.round(occupancy() * 100)}%</b> full</span>
      <span class="kpi" title="Guests waiting"><b>${waiting + arrived}</b> waiting</span>
      <span class="kpi hide-sm" title="Covers seated this shift"><b>${covers}</b> covers</span>
      ${SH.kitchen && SH.clock < SH.kitchen.until ? `<span class="kpi warn">${icon('fire')} Kitchen slow</span>` : ''}
    </div>
    <div class="sb-right">
      <span class="shift-name hide-sm">${esc(SHIFT_TYPES[SH.type].name)}</span>
      <button class="btn sm" data-act="end-shift">End shift</button>
    </div>`);
}
function updateClock() {
  const ck = $('#ck'); if (ck) ck.textContent = fmtClock(SH.clock);
  const ap = $('#ck-ap'); if (ap) ap.textContent = SH.clock % 1440 >= 720 ? 'pm' : 'am';
}
ACT.speed = el => setSpeed(+el.dataset.v);

/* ----- side / bottom panel ----- */
function panelCounts() {
  const ps = allParties();
  return {
    res: ps.filter(p => p.kind === 'res' && (p.status === 'booked' || p.status === 'arrived')).length,
    arrived: ps.filter(p => p.kind === 'res' && p.status === 'arrived').length,
    wait: ps.filter(p => p.kind === 'walk' && (p.status === 'waiting' || p.status === 'new')).length,
    newW: ps.filter(p => p.kind === 'walk' && p.status === 'new').length,
    seated: ps.filter(p => p.status === 'seated').length,
  };
}
function renderPanel() {
  const el = $('#panel'); if (!el) return;
  const c = panelCounts();
  const load = sectionLoad();
  const secs = SH.layout.sections.filter(s => load[s.id] && load[s.id].tables > 0);
  const strip = secs.map(s => `<div class="secchip${serverOnBreak(s.id) ? ' onbreak' : ''}" title="${esc(s.name)}"><span class="dot" style="background:${s.color}"></span><span class="sv">${esc(s.server || s.name)}</span><span class="cv"><b>${load[s.id].now}</b>/${load[s.id].total}</span>${serverOnBreak(s.id) ? icon('coffee') : ''}</div>`).join('');
  const tab = (k, label, n, badge) => `<button role="tab" aria-selected="${UI.tab === k}" class="${UI.tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${label}<span class="cnt">${n}</span>${badge ? `<span class="badge">${badge}</span>` : ''}</button>`;
  setHTML(el, `
    <button class="panel-handle" data-act="panel-toggle" aria-label="Resize list"><span></span></button>
    <div class="secstrip" aria-label="Covers per server (on floor / total)">${strip}</div>
    <div class="tabs" role="tablist">
      ${tab('res', 'Reservations', c.res, c.arrived ? c.arrived + ' here' : '')}
      ${tab('wait', 'Waitlist', c.wait, c.newW ? c.newW + ' new' : '')}
      ${tab('seated', 'Seated', c.seated)}
    </div>
    <div class="plist" id="plist">${UI.tab === 'res' ? resListHTML() : UI.tab === 'wait' ? waitListHTML() : seatedListHTML()}</div>
    <div class="panel-foot">
      <button class="btn" data-act="add-walkin">${icon('plus')} Walk-in</button>
      <button class="btn" data-act="add-res">${icon('plus')} Reservation</button>
    </div>`);
}
ACT.tab = el => { UI.tab = el.dataset.tab; if (UI.narrow && UI.panelSize === 'min') setPanelSize('half'); dirty(); tutorialEvent('tab'); };
ACT['panel-toggle'] = () => { setPanelSize(UI.panelSize === 'min' ? 'half' : UI.panelSize === 'half' ? 'full' : 'min'); };

function tagIcons(p) { return p.tags.map(t => TAGS[t] ? `<span class="tag tag-${t}" title="${TAGS[t].label}">${icon(TAGS[t].icon)}</span>` : '').join(''); }
function rowHTML(p, { time, sub, right, cls = '' }) {
  const sel = selection && selection.pid === p.id ? ' selected' : '';
  const grip = ['arrived', 'waiting', 'new', 'booked'].includes(p.status) ? `<span class="grip" data-grip="${p.id}" aria-hidden="true">${icon('grip')}</span>` : '<span class="grip off"></span>';
  return `<div class="prow ${cls}${sel}" data-act="party-tap" data-id="${p.id}" role="button" tabindex="0">
    ${grip}
    <div class="ptime">${time || ''}</div>
    <div class="pmain"><div class="pname">${esc(p.name)} ${tagIcons(p)}</div><div class="psub">${sub || ''}</div></div>
    <div class="psize">${p.size}</div>
    <div class="pright">${right || ''}</div>
    <button class="icon-btn pmore" data-act="party-more" data-id="${p.id}" aria-label="Details">${icon('more')}</button>
  </div>`;
}

function resListHTML() {
  const ps = allParties().filter(p => p.kind === 'res');
  const arrived = ps.filter(p => p.status === 'arrived').sort((a, b) => partyWaitStart(a) - partyWaitStart(b));
  const upcoming = ps.filter(p => p.status === 'booked').sort((a, b) => a.resTime - b.resTime);
  const done = ps.filter(p => p.status === 'seated' || DONE_STATES.includes(p.status)).sort((a, b) => a.resTime - b.resTime);
  let h = '';
  if (arrived.length) {
    h += `<div class="ghead">Checked in, need a table</div>`;
    h += arrived.map(p => {
      const w = Math.round(SH.clock - partyWaitStart(p));
      return rowHTML(p, { time: fmtClock(p.resTime), cls: 'is-here', sub: `${p.assigned ? 'Booked ' + tNames(p.assigned) : 'No table set'}${p.flags.atBar ? ' · at the bar' : ''}${p.prefTable ? ' · wants ' + tName(p.prefTable) : ''}`, right: `<span class="pill ${w > 10 ? 'bad' : w > 5 ? 'warn' : 'ok'}">${w > 0 ? w + 'm wait' : 'Here'}</span>` });
    }).join('');
  }
  h += `<div class="ghead">Upcoming</div>`;
  if (!upcoming.length) h += `<div class="empty">No more reservations on the book.</div>`;
  h += upcoming.map(p => {
    const late = SH.clock - p.resTime;
    const pill = late > 0 ? `<span class="pill ${late >= S().lateGrace ? 'bad' : 'warn'}">${Math.round(late)}m late</span>` : (p.resTime - SH.clock <= 15 ? `<span class="pill">in ${Math.round(p.resTime - SH.clock)}m</span>` : '');
    return rowHTML(p, { time: fmtClock(p.resTime), sub: `${p.assigned ? tNames(p.assigned) : 'No table set'}${p.note ? ' · ' + esc(p.note) : ''}`, right: pill });
  }).join('');
  if (done.length) {
    h += `<button class="ghead tgl" data-act="toggle-done">${UI.showDone ? icon('chevup') : icon('chevdown')} Seated and finished (${done.length})</button>`;
    if (UI.showDone) h += done.map(p => rowHTML(p, { time: fmtClock(p.resTime), cls: 'is-done', sub: p.status === 'seated' ? 'At ' + tNames(p.tableIds) : statusWord(p), right: `<span class="pill">${statusWord(p)}</span>` })).join('');
  }
  return h;
}
ACT['toggle-done'] = () => { UI.showDone = !UI.showDone; dirty(); };
function statusWord(p) {
  return { seated: 'Seated', done: 'Finished', noshow: 'No-show', cancelled: 'Cancelled', walked: 'Walked out', turned: 'Turned away', declined: 'Declined wait', arrived: 'Here', booked: 'Booked', waiting: 'Waiting', new: 'New' }[p.status] || p.status;
}

function waitListHTML() {
  const ps = allParties().filter(p => p.kind === 'walk');
  const fresh = ps.filter(p => p.status === 'new').sort((a, b) => a.addedAt - b.addedAt);
  const waiting = ps.filter(p => p.status === 'waiting').sort((a, b) => a.addedAt - b.addedAt);
  const done = ps.filter(p => p.status === 'seated' || DONE_STATES.includes(p.status));
  let h = '';
  if (fresh.length) {
    h += `<div class="ghead">At the stand, need a quote</div>`;
    h += fresh.map(p => rowHTML(p, { time: fmtClock(p.addedAt), cls: 'is-new', sub: `Arrived ${Math.round(SH.clock - p.addedAt)}m ago. Tap to quote or seat.`, right: `<span class="pill warn">Quote</span>` })).join('');
  }
  h += `<div class="ghead">Waiting</div>`;
  if (!waiting.length) h += `<div class="empty">Nobody on the waitlist.</div>`;
  h += waiting.map((p, i) => {
    const w = SH.clock - p.addedAt;
    const pct = p.quote ? clamp(w / p.quote, 0, 1.5) : (w > 0 ? 1.5 : 0);
    const over = w > p.quote;
    return rowHTML(p, { time: '#' + (i + 1), sub: `<span class="qbar${over ? ' over' : ''}"><span style="width:${Math.min(100, pct / 1.5 * 100)}%"></span><i style="left:${100 / 1.5}%"></i></span><span class="qtxt">${p.quote ? `${Math.round(w)}m of ${p.quote}m quoted` : `Seat now · waited ${Math.round(w)}m`}</span>`, right: `<span class="pill ${over ? 'bad' : w > p.quote - 3 ? 'warn' : 'ok'}">${over ? '+' + Math.round(w - p.quote) + 'm' : Math.round(p.quote - w) + 'm left'}</span>` });
  }).join('');
  if (done.length) {
    h += `<button class="ghead tgl" data-act="toggle-done">${UI.showDone ? icon('chevup') : icon('chevdown')} Seated and gone (${done.length})</button>`;
    if (UI.showDone) h += done.map(p => rowHTML(p, { time: fmtClock(p.addedAt), cls: 'is-done', sub: p.status === 'seated' ? 'At ' + tNames(p.tableIds) : esc(p.outcome || statusWord(p)), right: `<span class="pill">${statusWord(p)}</span>` })).join('');
  }
  return h;
}

function seatedListHTML() {
  const ps = allParties().filter(p => p.status === 'seated').sort((a, b) => minutesLeft(a) - minutesLeft(b));
  if (!ps.length) return `<div class="empty">No one is seated yet.</div>`;
  return ps.map(p => {
    const left = Math.round(minutesLeft(p));
    const over = SH.clock - p.seatedAt > p.turn;
    return rowHTML(p, { time: tNames(p.tableIds), sub: `<span class="stchip st-${p.phase}"></span>${STATUS_META[p.phase].label} · sat ${fmtClock(p.seatedAt)}`, right: `<span class="pill ${over ? 'bad' : left < 10 ? 'warn' : ''}">${over ? '+' + Math.round(SH.clock - p.seatedAt - p.turn) + 'm' : left + 'm left'}</span>` });
  }).join('');
}

ACT['party-tap'] = (el, e) => {
  if (e.target.closest('.pmore')) return;
  const p = P(el.dataset.id); if (!p) return;
  if (selection && selection.pid === p.id) { clearSelection(); return; }
  if (p.status === 'arrived' || p.status === 'waiting') beginSeat(p.id);
  else if (p.status === 'new') openQuoteSheet(p.id);
  else if (p.status === 'seated') openTableSheet(p.tableIds[0]);
  else openPartySheet(p.id);
};
ACT['party-more'] = el => openPartySheet(el.dataset.id);
ACT['open-party'] = el => {
  const p = P(el.dataset.id); if (!p) return;
  UI.tab = p.kind === 'res' ? 'res' : 'wait';
  if (p.status === 'new') openQuoteSheet(p.id); else openPartySheet(p.id);
  dirty();
};

/* ----- selection banner ----- */
function renderSelBar() {
  const el = $('#selbar'); if (!el) return;
  if (!selection) { setHTML(el, ''); return; }
  const p = P(selection.pid); if (!p) { clearSelection(); return; }
  const verb = { seat: 'Seat', move: 'Move', add: 'Add a table for', assign: 'Book a table for' }[selection.type];
  let sugg = '';
  if (selection.type === 'seat' || selection.type === 'move') {
    const us = suggestUnits(p, UI.narrow ? 3 : 4).filter(u => !(selection.type === 'move' && sameSet(u.ids, p.tableIds)));
    sugg = us.length ? `<div class="sb-sugg"><span class="muted small">Best fits</span>${us.map(u => `<button class="chip${u.warns ? ' warnish' : ''}" data-act="sel-pick" data-ids="${u.ids.join(',')}">${esc(u.label)} <small>${u.max}</small></button>`).join('')}</div>` : `<div class="sb-sugg"><span class="muted small">No free table fits ${p.size}. Combine tables, or wait for one to turn.</span></div>`;
  }
  let combo = '';
  if (selection.type === 'seat' || selection.type === 'move') {
    combo = `<button class="btn sm ${selection.combine ? 'on' : ''}" data-act="sel-combine">${icon('combine')} ${selection.combine ? 'Combining' : 'Combine'}</button>`;
    if (selection.combine && selection.picked.length) {
      const cap = capacityOf(SH.layout, selection.picked);
      combo += `<button class="btn sm primary" data-act="sel-commit">${verb.split(' ')[0]} at ${esc(tNames(selection.picked))} (${cap.max})</button>`;
    }
  }
  setHTML(el, `<div class="selbar">
    <div class="sb-text">${icon(selection.type === 'move' ? 'move' : 'chair')}<div><b>${verb} ${esc(shortName(p))} (${p.size})</b><span class="muted"> ${selection.combine ? 'Tap tables to combine, then confirm.' : 'Tap a table, or drag the guest onto one.'}</span></div></div>
    ${sugg}
    <div class="sb-btns">${combo}<button class="btn sm" data-act="sel-cancel">Cancel</button></div>
  </div>`);
}
ACT['sel-cancel'] = () => clearSelection();
ACT['sel-combine'] = () => { selection.combine = !selection.combine; selection.picked = []; dirty(); };
ACT['sel-commit'] = () => { if (selection && selection.picked.length) attemptAction(selection.picked.slice()); };
ACT['sel-pick'] = el => attemptAction(el.dataset.ids.split(','));

/* ----- drag a guest from the list onto a table ----- */
function showGhost(text, x, y) { const g = $('#drag-ghost'); g.textContent = text; g.hidden = false; moveGhost(x, y); }
function moveGhost(x, y) { const g = $('#drag-ghost'); g.style.transform = `translate(${x + 12}px, ${y - 30}px)`; }
function hideGhost() { $('#drag-ghost').hidden = true; }
function tableUnder(x, y) {
  const el = document.elementFromPoint(x, y);
  const t = el && el.closest && el.closest('#floor-svc [data-tid]');
  return t ? t.dataset.tid : null;
}
function setDropTarget(tid) { if (UI.dropTarget !== tid) { UI.dropTarget = tid; renderServiceFloor(); } }

(function guestDrag() {
  let d = null;
  document.addEventListener('pointerdown', e => {
    const g = e.target.closest('[data-grip]'); if (!g || !SH) return;
    e.preventDefault();
    d = { pid: g.dataset.grip, sx: e.clientX, sy: e.clientY, on: false, id: e.pointerId };
  });
  document.addEventListener('pointermove', e => {
    if (!d || e.pointerId !== d.id) return;
    if (!d.on && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 6) {
      const p = P(d.pid); if (!p) { d = null; return; }
      d.on = true; showGhost(`${shortName(p)} (${p.size})`, e.clientX, e.clientY);
      if (UI.narrow && UI.panelSize === 'full') setPanelSize('half');
    }
    if (d.on) { moveGhost(e.clientX, e.clientY); setDropTarget(tableUnder(e.clientX, e.clientY)); }
  });
  const end = e => {
    if (!d || e.pointerId !== d.id) return;
    const dd = d; d = null;
    if (!dd.on) return; // a plain tap is handled by the row's click
    hideGhost(); const tid = UI.dropTarget; setDropTarget(null);
    if (!tid || e.type === 'pointercancel') return;
    const p = P(dd.pid); if (!p) return;
    if (p.status === 'booked') { if (!p.manual) { toast(`${shortName(p)} hasn't arrived yet.`, 'warn'); return; } checkIn(p, true); }
    beginSelection('seat', p.id); selectionTap(tid);
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
})();

/* ----- warning confirm ----- */
const WARN_TITLES = { small: 'Table too small', waste: 'Wasting seats', blocked: 'Reserved soon', overload: 'Server overload', unbussed: 'Not bussed', pref: 'Guest request' };
function openWarnSheet(p, tids, warns, type) {
  const verb = type === 'seat' ? 'Seat' : type === 'add' ? 'Add table' : 'Move';
  const alt = suggestUnits(p, 3).filter(u => u.warns === 0 && !sameSet(u.ids, tids));
  openSheet(() => sheetHead(`${verb} ${esc(shortName(p))} (${p.size}) at ${esc(tNames(tids))}?`, 'Check these first') +
    `<div class="sheet-body"><ul class="warns">${warns.map(w => `<li>${icon('alert')}<div><b>${WARN_TITLES[w.type] || 'Heads up'}</b><span>${esc(w.text)}</span></div></li>`).join('')}</ul>
    ${alt.length ? `<div class="alt"><span class="muted small">No-warning options:</span> ${alt.map(u => `<button class="chip" data-act="warn-alt" data-ids="${u.ids.join(',')}">${esc(u.label)} <small>${u.max}</small></button>`).join('')}</div>` : ''}
    </div><div class="sheet-foot"><button class="btn" data-act="close-sheet">Pick another table</button><button class="btn danger" data-act="warn-go">${verb} anyway</button></div>`);
  UI.pendingWarn = { pid: p.id, tids, warns, type };
}
ACT['warn-go'] = () => { const w = UI.pendingWarn; closeSheet(); if (!w || !selection) return; const p = P(w.pid); commitAction(w.type === 'seat' ? 'seat' : 'move', p, w.tids, w.warns); };
ACT['warn-alt'] = el => { closeSheet(); if (selection) attemptAction(el.dataset.ids.split(',')); };

/* ----- table sheet ----- */
function openTableSheet(tid) {
  openSheet(() => {
    if (!SH || SH.ended) return null;
    const t = tableById(SH.layout, tid); if (!t) return null;
    const s = SH.tables[tid];
    const sec = sectionById(SH.layout, t.sectionId);
    const st = tableStatus(tid);
    const head = sheetHead(`Table ${esc(t.name)}`, `${SHAPES[t.shape].label} · seats ${t.min}–${t.max}${sec ? ` · ${esc(sec.name)} (${esc(sec.server || '')})` : ''} · <span class="stchip st-${st}"></span>${STATUS_META[st].label}`);
    if (s.state === 'occ') {
      const p = P(s.pid);
      const left = Math.round(minutesLeft(p));
      const over = SH.clock - p.seatedAt - p.turn;
      return head + `<div class="sheet-body">
        <div class="pcard"><div class="pc-name">${esc(p.name)} ${tagIcons(p)}</div>
          <div class="pc-meta">${p.kind === 'res' ? 'Reservation ' + fmtTime(p.resTime) : 'Walk-in'} · sat ${fmtTime(p.seatedAt)} at ${esc(tNames(p.tableIds))}</div>
          <div class="pc-meta">${over > 0 ? `<b class="bad-t">${Math.round(over)} min past expected turn</b>` : `Expected to turn in <b>${left} min</b> (about ${fmtTime(SH.clock + left)})`}</div>
          ${p.note ? `<div class="note">${esc(p.note)}</div>` : ''}</div>
        <div class="field"><label>Party size</label>${stepper('tsize', p.size, `data-id="${p.id}"`)}</div>
        <div class="field"><label>Status</label><div class="stgrid">${PHASES.map(ph => `<button class="stbtn st-${ph}${p.phase === ph ? ' on' : ''}" data-act="set-phase" data-id="${p.id}" data-ph="${ph}"><span class="stchip st-${ph}"></span>${STATUS_META[ph].label}</button>`).join('')}
          <button class="stbtn st-clearing" data-act="set-phase" data-id="${p.id}" data-ph="clearing"><span class="stchip st-clearing"></span>Left, needs clearing</button></div></div>
        <div class="actgrid">
          <button class="btn" data-act="t-move" data-id="${p.id}">${icon('move')} Move party</button>
          <button class="btn" data-act="t-add" data-id="${p.id}">${icon('combine')} Add a table</button>
          ${p.tableIds.length > 1 ? p.tableIds.filter(x => x !== p.tableIds[0] || p.tableIds.length > 1).map(x => `<button class="btn" data-act="t-split" data-id="${p.id}" data-tid="${x}">${icon('split')} Release ${esc(tName(x))}</button>`).join('') : ''}
          <button class="btn ghost" data-act="t-unseat" data-id="${p.id}">${icon('undo')} Unseat (mistake)</button>
        </div></div>`;
    }
    if (s.state === 'clearing') {
      return head + `<div class="sheet-body"><p>Guests have left. Bus and reset it so it can be seated.</p>${holdNote(tid)}</div>
        <div class="sheet-foot"><button class="btn primary wide" data-act="t-bus" data-tid="${tid}">${icon('broom')} Bus table, mark available</button></div>`;
    }
    const fits = allParties().filter(p => (p.status === 'arrived' || p.status === 'waiting' || p.status === 'new') && p.size <= t.max).sort((a, b) => partyWaitStart(a) - partyWaitStart(b));
    return head + `<div class="sheet-body">${holdNote(tid)}
      <div class="ghead">Seat someone here</div>
      ${fits.length ? fits.map(p => `<button class="pick" data-act="t-seat" data-id="${p.id}" data-tid="${tid}"><b>${esc(p.name)}</b> <span>${p.size} · ${p.kind === 'res' ? 'res ' + fmtClock(p.resTime) : p.status === 'new' ? 'new walk-in' : 'waiting ' + Math.round(SH.clock - p.addedAt) + 'm'}</span></button>`).join('') : '<div class="empty">No one waiting fits this table.</div>'}
      <div class="ghead">Quick walk-in</div>
      <div class="quickrow">${[1, 2, 3, 4, 5, 6].filter(n => n <= t.max + 1).map(n => `<button class="chip" data-act="t-quick" data-n="${n}" data-tid="${tid}">${n}</button>`).join('')}</div>
      </div><div class="sheet-foot"><button class="btn ghost" data-act="t-dirty" data-tid="${tid}">Mark as needs clearing</button></div>`;
  }, { live: true });
}
function holdNote(tid) {
  const h = tableHold(tid, 120);
  return h ? `<div class="hold">${icon('clock')} Booked for <b>${esc(h.name)}</b> (${h.size}) at ${fmtTime(h.resTime)}${h.status === 'arrived' ? ', checked in' : ''}.</div>` : '';
}
function stepper(name, v, attrs = '') {
  return `<div class="stepper" ${attrs} data-name="${name}"><button data-act="step" data-d="-1" aria-label="Fewer">${icon('minus')}</button><output>${v}</output><button data-act="step" data-d="1" aria-label="More">${icon('plus')}</button></div>`;
}
ACT.step = el => {
  const w = el.closest('.stepper'); const out = w.querySelector('output');
  const v = Math.max(+w.dataset.min || 1, +out.textContent + +el.dataset.d);
  out.textContent = v;
  const fn = STEP[w.dataset.name]; if (fn) fn(w, v);
};
const STEP = {
  tsize: (w, v) => { const p = P(w.dataset.id); if (p) changeSize(p, v); },
  psize: (w, v) => { const p = P(w.dataset.id); if (p) changeSize(p, v); },
};
ACT['set-phase'] = el => { const p = P(el.dataset.id); if (!p) return; setPhase(p, el.dataset.ph); if (el.dataset.ph === 'clearing') closeSheet(); };
ACT['t-move'] = el => beginMove(el.dataset.id);
ACT['t-add'] = el => beginAddTable(el.dataset.id);
ACT['t-split'] = el => { const p = P(el.dataset.id); releaseTable(p, el.dataset.tid); };
ACT['t-unseat'] = el => { const p = P(el.dataset.id); unseat(p); closeSheet(); };
ACT['t-bus'] = el => { busTable(el.dataset.tid); closeSheet(); };
ACT['t-dirty'] = el => { markTableDirty(el.dataset.tid); closeSheet(); };
ACT['t-seat'] = el => { const p = P(el.dataset.id); beginSeat(p.id); selectionTap(el.dataset.tid); };
ACT['t-quick'] = el => { const p = addWalkin({ name: 'Walk-in', size: +el.dataset.n }); p.quote = 0; p.status = 'waiting'; beginSeat(p.id); selectionTap(el.dataset.tid); };

/* ----- party sheet ----- */
function openPartySheet(pid) {
  openSheet(() => {
    const p = P(pid); if (!p || !SH || SH.ended) return null;
    const active = !DONE_STATES.includes(p.status);
    const lines = [];
    if (p.kind === 'res') lines.push(`Reservation ${fmtTime(p.resTime)}${p.assigned ? ' · booked on ' + esc(tNames(p.assigned)) : ''}`);
    else lines.push(`Walk-in · arrived ${fmtTime(p.addedAt)}${p.quote != null ? ' · quoted ' + p.quote + ' min' : ''}`);
    if (p.arrivedAt != null && p.kind === 'res') lines.push(`Checked in ${fmtTime(p.arrivedAt)}`);
    if (p.seatedAt != null) lines.push(`Seated ${fmtTime(p.seatedAt)} at ${esc(tNames(p.tableIds))} (waited ${Math.round(partyWaited(p))} min)`);
    if (p.outcome) lines.push(esc(p.outcome));
    if (p.prefTable) lines.push(`Wants table ${esc(tName(p.prefTable))}`);
    const btn = [];
    if (p.status === 'booked') {
      btn.push(p.manual ? `<button class="btn primary" data-act="p-checkin" data-id="${p.id}">${icon('check')} Check in</button>` : `<button class="btn" disabled>Not here yet</button>`);
      btn.push(`<button class="btn" data-act="p-assign" data-id="${p.id}">${icon('chair')} Change table</button>`);
      if (SH.clock >= p.resTime) btn.push(`<button class="btn" data-act="p-noshow" data-id="${p.id}">${icon('flag')} Mark no-show</button>`);
      btn.push(`<button class="btn ghost" data-act="p-cancel" data-id="${p.id}">${icon('x')} Cancel booking</button>`);
    } else if (p.status === 'arrived' || p.status === 'waiting') {
      btn.push(`<button class="btn primary" data-act="p-seat" data-id="${p.id}">${icon('chair')} Seat</button>`);
      if (p.kind === 'walk') btn.push(`<button class="btn" data-act="p-requote" data-id="${p.id}">${icon('clock')} Change quote</button>`);
      if (p.kind === 'res') btn.push(`<button class="btn" data-act="p-assign" data-id="${p.id}">${icon('chair')} Change booked table</button>`);
      btn.push(`<button class="btn ghost" data-act="p-cancel" data-id="${p.id}">${icon('x')} ${p.kind === 'walk' ? 'Remove from waitlist' : 'Cancel'}</button>`);
    } else if (p.status === 'new') {
      btn.push(`<button class="btn primary" data-act="p-requote" data-id="${p.id}">${icon('clock')} Quote a wait</button>`);
      btn.push(`<button class="btn" data-act="p-seat" data-id="${p.id}">${icon('chair')} Seat now</button>`);
      btn.push(`<button class="btn ghost" data-act="p-turn" data-id="${p.id}">Turn away</button>`);
    } else if (p.status === 'seated') {
      btn.push(`<button class="btn primary" data-act="p-table" data-id="${p.id}">Open table ${esc(tNames(p.tableIds))}</button>`);
    }
    return sheetHead(esc(p.name), `${p.kind === 'res' ? 'Reservation' : 'Walk-in'} · <b>${statusWord(p)}</b>`) + `<div class="sheet-body">
      <div class="pcard">${lines.map(l => `<div class="pc-meta">${l}</div>`).join('')}${p.note ? `<div class="note">${esc(p.note)}</div>` : ''}
      ${p.tags.length ? `<div class="tagrow">${p.tags.map(t => `<span class="tagpill">${icon(TAGS[t].icon)} ${TAGS[t].label}</span>`).join('')}</div>` : ''}</div>
      ${active && p.status !== 'seated' ? `<div class="field"><label>Party size</label>${stepper('psize', p.size, `data-id="${p.id}"`)}</div>` : ''}
      </div><div class="sheet-foot wrap">${btn.join('')}</div>`;
  }, { live: true });
}
ACT['p-checkin'] = el => { checkIn(P(el.dataset.id)); };
ACT['p-seat'] = el => beginSeat(el.dataset.id);
ACT['p-assign'] = el => beginAssign(el.dataset.id);
ACT['p-noshow'] = el => { markNoShow(P(el.dataset.id)); closeSheet(); };
ACT['p-cancel'] = async el => { const p = P(el.dataset.id); if (await askConfirm({ title: `Remove ${p.name}?`, body: p.kind === 'res' ? 'The booking is cancelled and its table is released.' : 'They come off the waitlist.', ok: 'Remove', danger: true })) { cancelParty(p); closeSheet(); } };
ACT['p-turn'] = el => { turnAway(P(el.dataset.id)); closeSheet(); };
ACT['p-requote'] = el => openQuoteSheet(el.dataset.id);
ACT['p-table'] = el => openTableSheet(P(el.dataset.id).tableIds[0]);

/* ----- quote sheet ----- */
function estimateWait(p) {
  const units = seatUnits(SH.layout).filter(u => u.max >= p.size && u.min <= p.size + 1 && !(u.bar && p.size > 2));
  if (!units.length) return null;
  const turn = expectedTurn(p.size);
  const freeFor = id => {
    // a table that is free now but booked before this party would finish opens up after that booking instead
    let t = expectedFreeAt(id);
    const h = tableHold(id, Math.max(0, t - SH.clock) + turn - 5);
    if (h && h.id !== p.id) t = Math.max(t, h.resTime + expectedTurn(h.size));
    return t;
  };
  const times = units.map(u => Math.max(...u.ids.map(freeFor))).sort((a, b) => a - b);
  const ahead = allParties().filter(q => q.id !== p.id && (q.status === 'waiting' || q.status === 'arrived') && Math.abs(q.size - p.size) <= 2 && partyWaitStart(q) <= (p.addedAt || SH.clock)).length;
  const t = times[Math.min(ahead, times.length - 1)] + (ahead >= times.length ? 20 : 0);
  return { mins: Math.max(0, Math.round(t - SH.clock)), ahead };
}
function openQuoteSheet(pid) {
  openSheet(() => {
    const p = P(pid); if (!p || !SH) return null;
    if (p.status !== 'new' && p.status !== 'waiting') return null;
    const est = estimateWait(p);
    const opts = [0, 5, 10, 15, 20, 25, 30, 40, 45, 60, 75, 90];
    return sheetHead(`Quote ${esc(shortName(p))} (${p.size})`, `Walk-in at the stand since ${fmtTime(p.addedAt)}`) + `<div class="sheet-body">
      <div class="field"><label>Party size</label>${stepper('psize', p.size, `data-id="${p.id}"`)}</div>
      <div class="hint">${icon('clock')} ${est ? `First table that fits should open in about <b>${est.mins} min</b>${est.ahead ? `, with ${est.ahead} similar part${est.ahead === 1 ? 'y' : 'ies'} ahead` : ''}. Your call: quote what you can deliver.` : `No table setup in this room seats ${p.size}.`}</div>
      <div class="field"><label>Quoted wait (minutes)</label><div class="quotes">${opts.map(q => `<button class="chip lg${p.quote === q ? ' on' : ''}" data-act="quote" data-id="${p.id}" data-q="${q}">${q === 0 ? 'Now' : q}</button>`).join('')}</div></div>
      </div><div class="sheet-foot"><button class="btn ghost" data-act="p-turn" data-id="${p.id}">Turn away</button><button class="btn primary" data-act="p-seat" data-id="${p.id}">${icon('chair')} Seat now</button></div>`;
  }, { live: true });
}
ACT.quote = el => { const p = P(el.dataset.id); quoteParty(p, +el.dataset.q); closeSheet(); };

/* ----- add walk-in / reservation ----- */
const FORM = {};
function tagPicker(name) {
  return `<div class="tagrow">${Object.entries(TAGS).map(([k, t]) => `<button type="button" class="tagpill tgl${FORM[name] && FORM[name].includes(k) ? ' on' : ''}" data-act="form-tag" data-f="${name}" data-k="${k}">${icon(t.icon)} ${t.label}</button>`).join('')}</div>`;
}
ACT['form-tag'] = el => { const a = FORM[el.dataset.f] = FORM[el.dataset.f] || []; const i = a.indexOf(el.dataset.k); if (i >= 0) a.splice(i, 1); else a.push(el.dataset.k); el.classList.toggle('on'); };
ACT['add-walkin'] = () => {
  FORM.wtags = []; FORM.wq = 15;
  openSheet(() => sheetHead('Add a walk-in') + `<form class="sheet-body" id="f-walk" onsubmit="return false">
    <div class="field"><label for="w-name">Name</label><input id="w-name" type="text" placeholder="Last name" autocomplete="off" autofocus></div>
    <div class="field"><label>Party size</label>${stepper('wsize', 2, 'id="w-size"')}</div>
    <div class="field"><label>Quoted wait (minutes)</label><div class="quotes">${[0, 5, 10, 15, 20, 25, 30, 45, 60].map(q => `<button type="button" class="chip lg${FORM.wq === q ? ' on' : ''}" data-act="wq" data-q="${q}">${q === 0 ? 'Now' : q}</button>`).join('')}</div></div>
    <div class="field"><label>Notes</label>${tagPicker('wtags')}</div>
    </form><div class="sheet-foot"><button class="btn" data-act="walk-save" data-seat="1">${icon('chair')} Seat now</button><button class="btn primary" data-act="walk-save">Add to waitlist</button></div>`);
};
ACT.wq = el => { FORM.wq = +el.dataset.q; $$('#f-walk [data-act=wq]').forEach(b => b.classList.toggle('on', b === el)); };
ACT['walk-save'] = el => {
  const name = $('#w-name').value.trim() || 'Walk-in';
  const size = +$('#w-size output').textContent;
  const p = addWalkin({ name, size, quote: el.dataset.seat ? 0 : FORM.wq, tags: FORM.wtags.slice() });
  closeSheet(); UI.tab = 'wait';
  if (el.dataset.seat) beginSeat(p.id);
  dirty();
};
ACT['add-res'] = () => {
  FORM.rtags = [];
  const t0 = Math.ceil(SH.clock / 15) * 15;
  const times = []; for (let t = t0; t <= SH.endMin; t += 15) times.push(t);
  openSheet(() => sheetHead('Add a reservation') + `<form class="sheet-body" id="f-res" onsubmit="return false">
    <div class="field"><label for="r-name">Name</label><input id="r-name" type="text" placeholder="Last, First" autocomplete="off" autofocus></div>
    <div class="field"><label>Party size</label>${stepper('rsize', 2, 'id="r-size"')}</div>
    <div class="field"><label for="r-time">Time</label><select id="r-time">${times.map(t => `<option value="${t}">${fmtTime(t)}</option>`).join('')}</select></div>
    <div class="field"><label for="r-note">Note</label><input id="r-note" type="text" placeholder="Allergy, occasion, seating request" autocomplete="off"></div>
    <div class="field"><label>Tags</label>${tagPicker('rtags')}</div>
    </form><div class="sheet-foot"><button class="btn primary wide" data-act="res-save">Book it</button></div>`);
};
ACT['res-save'] = () => {
  addReservation({ name: $('#r-name').value.trim() || 'Guest', size: +$('#r-size output').textContent, time: +$('#r-time').value, note: $('#r-note').value.trim(), tags: FORM.rtags.slice() });
  closeSheet(); UI.tab = 'res'; dirty();
};

/* ----- curveball messages ----- */
function renderMsgs() {
  const layer = $('#msg-layer');
  const m = SH && !SH.ended && UI.view === 'service' ? SH.msgs[0] : null;
  if (!m) { setHTML(layer, ''); layer.hidden = true; return; }
  layer.hidden = false;
  const more = SH.msgs.length - 1;
  setHTML(layer, `${S().pauseOnAlert ? '<div class="scrim soft"></div>' : ''}<div class="msg" role="alertdialog" aria-live="assertive">
    <div class="msg-top"><span class="msg-ic">${icon(m.icon || 'bell')}</span><span class="msg-kicker">${fmtTime(m.at)} · Curveball${more ? ` · ${more} more waiting` : ''}</span></div>
    <h3>${esc(m.title)}</h3><p>${esc(m.body)}</p>
    <div class="msg-opts">${m.options.map(o => `<button class="btn ${o.primary ? 'primary' : ''}" data-act="msg" data-id="${m.id}" data-k="${o.k}">${esc(o.label)}</button>`).join('')}</div>
  </div>`);
}
ACT.msg = el => resolveMsg(el.dataset.id, el.dataset.k);

/* ----- start screen ----- */
function startScreenHTML() {
  const types = ['slow', 'normal', 'friday', 'brunch', 'holiday'];
  const sel = DB.lastShiftType || 'normal';
  const last = DB.history[DB.history.length - 1];
  return `<div class="page start">
    <div class="start-hero">
      <div class="eyebrow">${esc(S().venue)} · host stand trainer</div>
      <h1>Run a shift</h1>
      <p class="lede">Pick a night, open the doors and work the book. The room fills on its own; you seat, quote, and handle what comes up.</p>
      ${!DB.tutorialDone ? `<div class="callout">${icon('help')}<div><b>First time here?</b> The tutorial shift walks you through seating, quoting, statuses and curveballs in about five minutes.</div><button class="btn primary" data-act="start-tutorial">Start tutorial</button></div>` : ''}
    </div>
    <div class="shift-grid" role="radiogroup" aria-label="Shift type">
      ${types.map(k => `<button class="shift-card${sel === k ? ' on' : ''}" role="radio" aria-checked="${sel === k}" data-act="pick-shift" data-k="${k}">
        <span class="sc-name">${SHIFT_TYPES[k].name}</span>
        <span class="sc-time">${fmtTime(SHIFT_TYPES[k].start)} to ${fmtTime(SHIFT_TYPES[k].end)}</span>
        <span class="sc-blurb">${SHIFT_TYPES[k].blurb}</span>
        <span class="sc-meter" aria-label="Busy level"><i style="width:${Math.round((SHIFT_TYPES[k].resFrac + SHIFT_TYPES[k].walkFrac) / 1.6 * 100)}%"></i></span>
      </button>`).join('')}
    </div>
    <div class="start-row">
      <label class="field inline"><span>Floor plan</span><select id="start-layout">${DB.layouts.map(l => `<option value="${l.id}" ${l.id === DB.activeLayoutId ? 'selected' : ''}>${esc(l.name)} (${l.tables.length} tables)</option>`).join('')}</select></label>
      <button class="btn primary lg" data-act="start-shift">${icon('play')} Open the doors</button>
    </div>
    <div class="start-foot">
      ${last ? `<button class="last-card" data-act="view" data-view="history"><span>Last shift</span><b class="grade g-${last.grade[0]}">${last.grade}</b><span>${esc(SHIFT_TYPES[last.type] ? SHIFT_TYPES[last.type].name : last.type)} · ${last.covers} covers · ${fmtDate(last.date)}</span></button>` : ''}
      <button class="btn ghost" data-act="start-tutorial">${DB.tutorialDone ? 'Replay tutorial' : 'Tutorial'}</button>
      <button class="btn ghost" data-act="view" data-view="help">How it works</button>
    </div>
  </div>`;
}
ACT['pick-shift'] = el => { DB.lastShiftType = el.dataset.k; saveDB(); dirty(); };
ACT['start-shift'] = () => {
  const lay = $('#start-layout') ? $('#start-layout').value : DB.activeLayoutId;
  const l = DB.layouts.find(x => x.id === lay);
  if (!l || !l.tables.length) { toast('That floor plan has no tables yet. Add some in the Floor plan editor.', 'warn'); return; }
  DB.activeLayoutId = lay;
  startShift(DB.lastShiftType || 'normal', lay);
  DB.shift = SH; saveDB();
  UI.tab = 'res'; selection = null;
  toast('Doors open soon. Press 1× or faster to start the clock.', 'info');
  dirty();
};
ACT['start-tutorial'] = () => {
  const l = activeLayout();
  if (!l.tables.length) { toast('Your active floor plan has no tables.', 'warn'); return; }
  startShift('tutorial', l.id);
  DB.shift = SH; saveDB(); UI.tab = 'res'; selection = null;
  if (UI.view !== 'service') showView('service');
  dirty();
};
ACT['end-shift'] = async () => {
  const active = allParties().filter(p => p.status === 'seated').length;
  if (!SH.tutorial && !(await askConfirm({ title: 'End this shift?', body: `${active ? active + ' tables are still dining. ' : ''}You'll get your report and grade.`, ok: 'End shift' }))) return;
  endShift();
};
function endShift() {
  selection = null; closeSheet();
  SH.speed = 0;
  const rep = buildReport(SH);
  SH.ended = true; SH.report = rep;
  if (SH.type !== 'tutorial') { DB.history.push(rep); if (DB.history.length > 200) DB.history.shift(); }
  else DB.tutorialDone = true;
  tutorialEvent('end');
  DB.shift = null; saveDB();
  dirty();
}
ACT['new-shift'] = () => { SH = null; DB.shift = null; saveDB(); dirty(); };
