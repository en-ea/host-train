/* ---------- guided tutorial shift ---------- */
function setupTutorialShift(rng) {
  const lay = SH.layout;
  SH.clock = SH.startMin - 2;
  SH.tutorial = { step: 0, ev: {} };
  const unitFor = size => {
    const u = seatUnits(lay).filter(u => !u.bar && u.min <= size && u.max >= size).sort((a, b) => a.max - b.max || a.ids.length - b.ids.length)[0];
    return u ? u.ids : null;
  };
  const patel = addParty(newParty({ kind: 'res', name: 'Patel, Aisha', size: 2, origSize: 2, resTime: SH.startMin + 5, assigned: unitFor(2), status: 'booked', tags: ['birthday'], note: 'Celebrating a birthday. Candle on dessert.', hidden: { noShow: false, offset: 0, patience: 999, turnOverride: 32 }, flags: { noLeave: true } }));
  patel.arriveTime = 1e9; // arrives when the tutorial asks for it
  SH.tutorial.patel = patel.id;
  const brooks = addParty(newParty({ kind: 'res', name: 'Brooks, Daniel', size: 4, origSize: 4, resTime: SH.startMin + 45, assigned: unitFor(4), status: 'booked', hidden: { noShow: false, offset: -2, patience: 999 }, flags: { noLeave: true } }));
  brooks.arriveTime = SH.startMin + 43;
  addParty(newParty({ kind: 'res', name: 'Rossi, Luca', size: 2, origSize: 2, resTime: SH.startMin + 60, assigned: unitFor(2), status: 'booked', tags: ['regular'], hidden: { noShow: false, offset: 0, patience: 999 }, flags: { noLeave: true } })).arriveTime = SH.startMin + 60;
}

const TUT_STEPS = [
  { text: 'Welcome to your host stand. The floor shows every table, colored by status. The list holds your <b>Reservations</b>, <b>Waitlist</b> and <b>Seated</b> parties. Colored chips above the tabs count covers for each server.', next: 'Show me' },
  { text: 'The clock is paused. Tap <b>5×</b> in the bar at the top to open the doors.', check: () => SH.speed > 0 },
  { text: '<b>Patel (2)</b> just checked in. In <b>Reservations</b>, tap Patel, then tap a table glowing green. You can also drag the grip on the left of their row onto a table.', enter: () => { const p = P(SH.tutorial.patel); if (p.status === 'booked') p.arriveTime = SH.clock; }, check: () => P(SH.tutorial.patel).status === 'seated' || SH.tutorial.ev.seatPatel },
  { text: 'Seated tables show the party name, size, the time they sat, and minutes until they are expected to turn. Filled chairs are guests; empty chairs are seats you are not using.', next: 'Got it' },
  { text: 'A walk-in, <b>Nguyen (4)</b>, is at the stand. Open <b>Waitlist</b>, tap Nguyen and quote them <b>10</b> minutes.', enter: () => { if (!SH.tutorial.nguyen) { const p = addParty(newParty({ kind: 'walk', name: 'Nguyen, Wei', size: 4, origSize: 4, status: 'new', addedAt: SH.clock, hidden: { tolerance: 999, patience: 999 }, flags: { noLeave: true } })); SH.tutorial.nguyen = p.id; } }, check: () => { const p = P(SH.tutorial.nguyen); return p && p.status !== 'new'; } },
  { text: 'A four-top is free, so seat them early and beat the quote. Tap <b>Nguyen</b> again, then tap a table. If you pick one that is wrong for them, you will see a warning first.', check: () => { const p = P(SH.tutorial.nguyen); return p && p.status === 'seated'; } },
  { text: 'Statuses move on their own, but you can set them. Tap a seated table and change its status to <b>Check dropped</b>.', check: () => SH.tutorial.ev.statuscheck },
  { text: 'Curveball! Guests ask for things mid-shift. Read the card and pick a response. The clock waits for you.', enter: () => { const p = allParties().find(q => q.status === 'seated'); if (p) { CB.move.create(p, "It's freezing by the window. Can we move?"); SH.tutorial.cb = true; } }, check: () => SH.tutorial.cb && !SH.msgs.length },
  { text: 'Now watch tables finish. Switch to <b>30×</b>. When a table turns red (<b>Needs clearing</b>), tap it and choose <b>Bus table</b>.', check: () => SH.tutorial.ev.bus },
  { text: "That is the loop: greet, quote, seat, watch turns, bus. Real shifts add a full book, a stream of walk-ins and curveballs, then grade you. Tap <b>End tutorial</b> to see a sample report.", next: 'End tutorial', action: () => endShift() },
];

function tutorialEvent(kind, data) {
  if (!SH || !SH.tutorial) return;
  const ev = SH.tutorial.ev;
  if (kind === 'seat' && data && data.id === SH.tutorial.patel) ev.seatPatel = true;
  if (kind === 'status' && data === 'check') ev.statuscheck = true;
  if (kind === 'bus') ev.bus = true;
  dirty();
}

function renderTutorial() {
  const el = $('#coach'); if (!el) return;
  if (!SH || !SH.tutorial || SH.ended || UI.view !== 'service') { setHTML(el, ''); return; }
  const T = SH.tutorial;
  let s = TUT_STEPS[T.step];
  if (s && s.check && s.check()) { T.step++; s = TUT_STEPS[T.step]; if (s && s.enter) s.enter(); saveSoon(); }
  if (!s) { setHTML(el, ''); return; }
  setHTML(el, `<div class="coach" role="status"><div class="coach-top"><span class="eyebrow">Tutorial · step ${T.step + 1} of ${TUT_STEPS.length}</span><button class="link" data-act="tut-skip">Skip</button></div>
    <p>${s.text}</p>${s.next ? `<button class="btn primary sm" data-act="tut-next">${s.next}</button>` : ''}</div>`);
}
ACT['tut-next'] = () => {
  const T = SH.tutorial; const s = TUT_STEPS[T.step];
  if (s && s.action) { s.action(); return; }
  T.step++; const n = TUT_STEPS[T.step]; if (n && n.enter) n.enter();
  dirty();
};
ACT['tut-skip'] = async () => {
  if (!(await askConfirm({ title: 'Skip the tutorial?', body: 'You can replay it any time from Help or the Service start screen.', ok: 'Skip' }))) return;
  DB.tutorialDone = true; SH = null; DB.shift = null; saveDB(); dirty();
};
