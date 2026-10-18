/* ---------- persistence (localStorage) ---------- */
const STORE_KEY = 'covers.host.v1';
let DB = null;

function defaultDB() {
  const lay = sampleLayout();
  return { v: 1, layouts: [lay], activeLayoutId: lay.id, settings: ROOT_SETTINGS(), history: [], tutorialDone: false, welcomed: false, shift: null, lastShiftType: 'normal' };
}

function mergeSettings(s) {
  const d = ROOT_SETTINGS();
  const out = Object.assign(d, s || {});
  out.turn = Object.assign(ROOT_SETTINGS().turn, (s && s.turn) || {});
  return out;
}

function loadDB() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && Array.isArray(d.layouts)) {
        DB = Object.assign(defaultDB(), d);
        DB.settings = mergeSettings(d.settings);
        if (!DB.layouts.length) { const l = sampleLayout(); DB.layouts.push(l); DB.activeLayoutId = l.id; }
        if (!DB.layouts.find(l => l.id === DB.activeLayoutId)) DB.activeLayoutId = DB.layouts[0].id;
        return;
      }
    }
  } catch (e) { console.warn('load failed', e); }
  DB = defaultDB();
}

let saveFailedOnce = false;
function saveDB() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(DB));
  } catch (e) {
    if (!saveFailedOnce) { saveFailedOnce = true; toast('This browser is not letting the app save. Your work will be lost when you close the tab.', 'warn'); }
  }
}

function activeLayout() { return DB.layouts.find(l => l.id === DB.activeLayoutId) || DB.layouts[0]; }
const S = () => DB.settings;
