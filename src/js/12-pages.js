/* ---------- settings and help ---------- */
function setStep(path, v, step, min, max, unit = 'min') {
  return `<div class="stepper" data-name="setting" data-path="${path}" data-step="${step}" data-min="${min}" data-max="${max}"><button data-act="sstep" data-d="-1" aria-label="Less">${icon('minus')}</button><output>${v}${unit ? `<small>${unit}</small>` : ''}</output><button data-act="sstep" data-d="1" aria-label="More">${icon('plus')}</button></div>`;
}
function getPath(o, p) { return p.split('.').reduce((a, k) => a[k], o); }
function setPath(o, p, v) { const ks = p.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; }
ACT.sstep = el => {
  const w = el.closest('.stepper');
  const v = clamp(getPath(S(), w.dataset.path) + +w.dataset.step * +el.dataset.d, +w.dataset.min, +w.dataset.max);
  setPath(S(), w.dataset.path, v); saveDB(); dirty();
};

function renderSettings() {
  const s = S();
  const row = (label, help, ctrl) => `<div class="set-row"><div class="set-l"><b>${label}</b>${help ? `<span class="muted small">${help}</span>` : ''}</div><div class="set-c">${ctrl}</div></div>`;
  const seg = (path, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${getPath(s, path) === v ? 'on' : ''}" data-act="set-seg" data-path="${path}" data-v="${v}">${l}</button>`).join('')}</div>`;
  const tog = (path) => `<label class="toggle"><input type="checkbox" data-change="set-tog" data-path="${path}" ${getPath(s, path) ? 'checked' : ''}><span></span></label>`;
  setHTML($('#v-settings'), `<div class="page settings">
    <h1>Settings</h1>
    <section class="set-group"><h2>Restaurant</h2>
      ${row('Restaurant name', 'Shown on reports.', `<input type="text" value="${esc(s.venue)}" data-change="set-venue" aria-label="Restaurant name">`)}
      ${row('Theme', '', seg('theme', [['system', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]))}
    </section>
    <section class="set-group"><h2>Turn times</h2><p class="muted small">How long a party usually stays, start to finish. Shift types adjust these a little (brunch is faster, holidays slower).</p>
      ${row('Parties of 1–2', '', setStep('turn.s2', s.turn.s2, 5, 30, 180))}
      ${row('Parties of 3–4', '', setStep('turn.s4', s.turn.s4, 5, 30, 200))}
      ${row('Parties of 5–6', '', setStep('turn.s6', s.turn.s6, 5, 30, 220))}
      ${row('Parties of 7+', '', setStep('turn.s8', s.turn.s8, 5, 30, 240))}
      ${row('Busser clears a table after', '0 means you must bus every table yourself.', setStep('autoBus', s.autoBus, 1, 0, 20))}
    </section>
    <section class="set-group"><h2>Warnings</h2>
      ${row('Show "reserved soon"', 'Minutes before a booking that its table is held.', setStep('heldWindow', s.heldWindow, 5, 10, 90))}
      ${row('Flag late reservations after', '', setStep('lateGrace', s.lateGrace, 5, 5, 30))}
      ${row('Rush starts at', 'Room fullness that counts as a rush.', setStep('rushPct', s.rushPct, 5, 40, 95, '%'))}
      ${row('Server overload', 'Covers above the other servers’ average.', setStep('overload', s.overload, 1, 2, 20, 'covers'))}
      ${row('Double-seat window', 'Two seatings in one section within this time.', setStep('doubleSeatMin', s.doubleSeatMin, 1, 0, 30))}
    </section>
    <section class="set-group"><h2>Simulation</h2>
      ${row('Curveballs', 'How often surprises happen.', seg('curveballs', [['low', 'Low'], ['normal', 'Normal'], ['high', 'High']]))}
      ${row('Pause the clock for curveballs', 'Turn off for real-time pressure.', tog('pauseOnAlert'))}
      ${row('Show turn timers on tables', 'Minutes until a table is expected to turn.', tog('showTimers'))}
    </section>
    <section class="set-group"><h2>Your data</h2><p class="muted small">Everything is saved in this browser only. To move layouts and history to another device, copy a backup here and paste it there.</p>
      <div class="row-btns"><button class="btn" data-act="backup">${icon('copy')} Copy backup</button><button class="btn" data-act="restore">${icon('download')} Restore from backup</button><button class="btn danger" data-act="reset-all">${icon('trash')} Reset everything</button></div>
    </section>
    <p class="muted small center">Covers host trainer · works offline once loaded · no account needed</p>
  </div>`);
}
ACT['set-seg'] = el => { setPath(S(), el.dataset.path, el.dataset.v); if (el.dataset.path === 'theme') applyTheme(); saveDB(); dirty(); };
CHANGE['set-tog'] = el => { setPath(S(), el.dataset.path, el.checked); saveDB(); dirty(); };
CHANGE['set-venue'] = el => { S().venue = el.value.trim() || 'Meetbros'; $('#brand-venue').textContent = S().venue; saveSoon(); };

ACT.backup = () => {
  const data = JSON.stringify(Object.assign({}, DB, { shift: null }));
  openSheet(() => sheetHead('Backup', `${Math.round(data.length / 1024)} KB of layouts, settings and history`) + `<div class="sheet-body"><textarea id="bk" class="mono" rows="8" readonly>${esc(data)}</textarea><p class="muted small">Copy this text and keep it in Notes or email it to yourself. Paste it into Restore on another device.</p></div><div class="sheet-foot"><button class="btn primary wide" data-act="bk-copy">${icon('copy')} Copy to clipboard</button></div>`);
};
ACT['bk-copy'] = () => {
  const ta = $('#bk');
  const done = () => toast('Backup copied.');
  try { navigator.clipboard.writeText(ta.value).then(done, () => { ta.select(); toast('Select all and copy the text.'); }); }
  catch (e) { ta.select(); toast('Select all and copy the text.'); }
};
ACT.restore = () => openSheet(() => sheetHead('Restore from backup') + `<div class="sheet-body"><textarea id="rs" class="mono" rows="8" placeholder="Paste backup text here"></textarea><p class="muted small">This replaces your layouts, settings and history on this device.</p></div><div class="sheet-foot"><button class="btn primary wide" data-act="rs-go">Restore</button></div>`);
ACT['rs-go'] = () => {
  try {
    const d = JSON.parse($('#rs').value);
    if (!d || !Array.isArray(d.layouts) || !d.layouts.length) throw new Error('bad');
    DB = Object.assign(defaultDB(), d, { shift: null }); DB.settings = mergeSettings(d.settings);
    SH = null; saveDB(); applyTheme(); closeSheet(); ED.layoutId = null; toast('Backup restored.'); dirty();
  } catch (e) { toast("That text isn't a valid backup. Copy the whole thing and try again.", 'warn'); }
};
ACT['reset-all'] = async () => {
  if (!(await askConfirm({ title: 'Reset everything?', body: 'All layouts, settings and shift history on this device are deleted and the sample layout comes back.', ok: 'Reset', danger: true }))) return;
  DB = defaultDB(); SH = null; ED.layoutId = null; saveDB(); applyTheme(); toast('Reset done.'); dirty();
};

function renderHelp() {
  const st = s => `<span class="sw st-${s}"></span>`;
  setHTML($('#v-help'), `<div class="page help">
    <div class="eyebrow">How to use</div>
    <h1>Working the stand</h1>
    <p class="lede">Covers is a practice host stand. You build your own floor plan, run simulated shifts, and get graded on how you seat, quote and handle surprises.</p>
    <div class="callout">${icon('play')}<div><b>New here?</b> The tutorial shift walks you through every action in about five minutes.</div><button class="btn primary" data-act="start-tutorial">Start tutorial</button></div>
    <div class="help-grid">
      <section><h2>1. Build your floor</h2><p>Open <b>Floor plan</b>. Add tables by shape, drag them into place, use the corner handle to resize and the top handle to rotate. Tap a table to set its number, min and max covers, section and whether it combines.</p><p>Under <b>Sections</b>, name each server's section and pick a color, then tap the paint icon and tap tables to assign them. Under <b>Combos</b>, save table sets you push together, like 12+13 for an 8-top.</p></section>
      <section><h2>2. Start a shift</h2><p>On <b>Service</b>, pick a night and open the doors. The clock starts paused; choose 1×, 5×, 10× or 30×. The book is generated for your room, and walk-ins arrive on their own.</p></section>
      <section><h2>3. Seat guests</h2><p>Tap a guest in Reservations or Waitlist, then tap a table. Tables that fit glow green, ones with a problem show amber. You can also drag a guest by the grip onto a table. Use <b>Combine</b> in the seating bar to put a party across several tables.</p></section>
      <section><h2>4. Quote walk-ins</h2><p>New walk-ins show up at the stand and leave if nobody greets them. Tap them to quote a wait. The waitlist shows how long each party has waited against what you promised. Quote too long and they may leave; too short and they get angry.</p></section>
      <section><h2>5. Manage tables</h2><p>Tap any table to change its status, update the party size, move the party, add or release a table, unseat a mistake, or bus it once guests leave. Drag a seated table onto an empty one to move the party.</p></section>
      <section><h2>6. Curveballs</h2><p>Late guests, no-shows, early arrivals, growing parties, VIP requests, move requests, big walk-ins, campers, server breaks and a slow kitchen. A card pops up and the clock pauses until you choose. Follow through: if you promise a move, make it.</p></section>
    </div>
    <h2>Table colors</h2>
    <div class="legend">${STATUS_ORDER.map(s => `<div class="lg">${st(s)}<b>${STATUS_META[s].label}</b><span>${legendText(s)}</span></div>`).join('')}</div>
    <h2>Warnings you will see</h2>
    <ul class="plain">
      <li><b>Too small:</b> the party is bigger than the table's max covers.</li>
      <li><b>Wasting seats:</b> a small party on a big table while it's busy, or under the table's minimum.</li>
      <li><b>Reserved soon:</b> the table is booked and this party won't be done in time.</li>
      <li><b>Server overload:</b> a double or triple seat, a server on break, or way more covers than the others.</li>
    </ul>
    <p>You can seat anyway, but every override counts against your floor discipline score.</p>
    <h2>Your grade</h2>
    <p>The end-of-shift report scores reservations seated on time, guest wait, quote accuracy, walk-outs, seat efficiency, server balance, curveballs and warnings you overrode, then gives you three things to work on. History tracks every shift so you can see if you're improving.</p>
  </div>`);
}
