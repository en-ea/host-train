/* ---------- UI core: render loop, events, sheets, toasts ---------- */
const UI = { view: 'service', narrow: false, panelSize: 'half', panelBefore: null, tab: 'res', showDone: false, floorMode: 'status', reportId: null };
let _dirty = true;
function dirty() { _dirty = true; }
let _saveT = 0;
function saveSoon() { clearTimeout(_saveT); _saveT = setTimeout(() => { if (SH) DB.shift = SH; saveDB(); }, 400); }

const ACT = {};      // click actions: data-act="name"
const CHANGE = {};   // input/change handlers: data-change="name"

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACT[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, e); }
});
['change', 'input'].forEach(type => document.addEventListener(type, e => {
  const el = e.target.closest('[data-change]');
  if (!el) return;
  if (type === 'input' && !el.matches('input[type=text],input[type=search],textarea,input[type=range],input[type=color]')) return;
  const fn = CHANGE[el.dataset.change];
  if (fn) fn(el, e);
}));

/* ----- toasts ----- */
function toast(text, kind = 'info', action) {
  const box = $('#toasts'); if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast t-' + kind;
  el.setAttribute('role', 'status');
  el.innerHTML = `<span>${esc(text)}</span>`;
  if (action) { el.dataset.act = action.act; el.dataset.id = action.id; el.classList.add('has-act'); }
  box.appendChild(el);
  while (box.children.length > (UI.narrow ? 2 : 3)) box.firstChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, kind === 'bad' || kind === 'warn' ? 5200 : 3400);
}

/* ----- sheets (bottom sheet on phones, dialog on larger screens) ----- */
let sheet = null;
function openSheet(render, opts = {}) {
  sheet = { render, live: !!opts.live, cls: opts.cls || '', at: performance.now() };
  drawSheet(true);
}
function drawSheet(first) {
  const layer = $('#sheet-layer');
  if (!sheet) { layer.innerHTML = ''; layer.hidden = true; return; }
  let html;
  try { html = sheet.render(); } catch (e) { console.error(e); html = null; }
  if (html == null) { closeSheet(); return; }
  const body = layer.querySelector('.sheet-body');
  const st = body ? body.scrollTop : 0;
  layer.hidden = false;
  layer.innerHTML = `<div class="scrim" data-act="close-sheet"></div><div class="sheet ${sheet.cls}${first ? ' enter' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  const nb = layer.querySelector('.sheet-body'); if (nb) nb.scrollTop = st;
  if (first) { const f = layer.querySelector('[autofocus]'); if (f && !UI.narrow) f.focus(); }
}
function closeSheet() { sheet = null; drawSheet(); }
ACT['close-sheet'] = el => {
  // a touch tap that opened the sheet also fires a click on the scrim that just appeared under the finger
  if (el && el.classList && el.classList.contains('scrim') && sheet && performance.now() - sheet.at < 450) return;
  closeSheet();
};
function sheetHead(title, sub) {
  return `<div class="sheet-head"><div><h2>${title}</h2>${sub ? `<div class="sub">${sub}</div>` : ''}</div><button class="icon-btn" data-act="close-sheet" aria-label="Close">${icon('x')}</button></div>`;
}

/* ----- in-page confirm (native confirm is not available everywhere) ----- */
function askConfirm({ title, body, ok = 'OK', danger = false, cancel = 'Cancel' }) {
  return new Promise(res => {
    const layer = $('#confirm-layer');
    layer.hidden = false;
    layer.innerHTML = `<div class="scrim"></div><div class="dialog" role="alertdialog" aria-modal="true"><h2>${esc(title)}</h2>${body ? `<p>${esc(body)}</p>` : ''}<div class="row-btns"><button class="btn" data-k="0">${esc(cancel)}</button><button class="btn ${danger ? 'danger' : 'primary'}" data-k="1">${esc(ok)}</button></div></div>`;
    layer.onclick = e => {
      const b = e.target.closest('[data-k]');
      if (!b && !e.target.classList.contains('scrim')) return;
      layer.hidden = true; layer.innerHTML = ''; layer.onclick = null;
      res(!!b && b.dataset.k === '1');
    };
  });
}

/* ----- views ----- */
const VIEWS = ['service', 'editor', 'history', 'settings', 'help'];
function showView(v) {
  if (UI.view === 'editor' && v !== 'editor') editorLeave();
  if (v !== 'service' && SH && !SH.ended && SH.speed > 0) { SH.prevSpeed = SH.speed; SH.speed = 0; toast('Shift clock paused while you are away from Service.'); }
  UI.view = v;
  VIEWS.forEach(x => { const el = $('#v-' + x); el.hidden = x !== v; });
  $$('.nav button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  if (v === 'editor') editorEnter();
  closeSheet();
  dirty();
  renderNow();
}
ACT.view = el => showView(el.dataset.view);

function applyTheme() {
  const t = S().theme;
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  else document.documentElement.removeAttribute('data-theme');
}

function checkNarrow() {
  const n = window.innerWidth < 900;
  if (n !== UI.narrow) { UI.narrow = n; dirty(); }
  document.body.classList.toggle('narrow', n);
}
function setPanelSize(s) {
  UI.panelSize = s;
  const svc = $('.svc');
  if (svc) svc.dataset.panel = s;
  setTimeout(() => { fitIfNeeded('svc'); }, 220);
}

/* ----- main loop ----- */
let lastT = performance.now();
let lastSave = 0;
function frame(t) {
  const dtReal = Math.min(0.5, (t - lastT) / 1000);
  lastT = t;
  if (SH && !SH.ended && SH.speed > 0) {
    let simMin = dtReal * SH.speed / 60;
    while (simMin > 0) { const d = Math.min(0.25, simMin); simStep(d); simMin -= d; if (SH.speed === 0) break; }
    updateClock();
    if (t - lastSave > 4000) { lastSave = t; DB.shift = SH; saveDB(); }
  }
  if (_dirty) renderNow();
  requestAnimationFrame(frame);
}
function renderNow() {
  _dirty = false;
  try {
    if (UI.view === 'service') renderService();
    else if (UI.view === 'editor') renderEditor();
    else if (UI.view === 'history') renderHistory();
    else if (UI.view === 'settings') renderSettings();
    else if (UI.view === 'help') renderHelp();
    if (sheet && sheet.live) {
      const a = document.activeElement;
      if (!(a && $('#sheet-layer').contains(a) && a.matches('input,textarea,select'))) drawSheet();
    }
    renderMsgs();
    renderTutorial();
  } catch (e) { console.error(e); }
}
