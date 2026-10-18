/* ---------- host actions ---------- */
let selection = null; // {type:'seat'|'move'|'add'|'assign', pid, combine, picked:[]}

function beginSelection(type, pid, preset, combine) {
  const p = P(pid); if (!p) return;
  selection = { type, pid, combine: !!combine, picked: [] };
  closeSheet();
  if (UI.narrow && UI.panelSize !== 'min') { UI.panelBefore = UI.panelSize; setPanelSize('min'); }
  dirty('sel');
  if (preset && preset.length) attemptAction(preset);
}
const beginSeat = (pid, preset, combine) => {
  const p = P(pid);
  if (p && p.kind === 'res' && p.status === 'booked') { checkIn(p, true); }
  beginSelection('seat', pid, preset, combine);
};
const beginMove = pid => beginSelection('move', pid);
const beginAddTable = pid => beginSelection('add', pid);
const beginAssign = pid => beginSelection('assign', pid);

function clearSelection() {
  selection = null;
  if (UI.panelBefore) { setPanelSize(UI.panelBefore); UI.panelBefore = null; }
  if (SH && SH.resumeAfterSelect && !SH.msgs.length) { SH.resumeAfterSelect = false; SH.speed = SH.prevSpeed || 1; }
  dirty('sel');
}

function selectionTap(tid) {
  if (!selection) return;
  const p = P(selection.pid);
  if (!p) { clearSelection(); return; }
  if (selection.combine) {
    const i = selection.picked.indexOf(tid);
    if (i >= 0) selection.picked.splice(i, 1); else selection.picked.push(tid);
    dirty('sel');
    return;
  }
  if (selection.type === 'add') { attemptAction(p.tableIds.concat([tid])); return; }
  attemptAction([tid]);
}

function attemptAction(tids) {
  const p = P(selection.pid);
  const type = selection.type;
  if (type === 'assign') {
    p.assigned = tids.slice();
    const c = capacityOf(SH.layout, tids);
    toast(`${shortName(p)} is now booked on ${tNames(tids)}${p.size > c.max ? ' (too small for ' + p.size + ')' : ''}.`, p.size > c.max ? 'warn' : 'info');
    clearSelection(); return;
  }
  const chk = seatCheck(p, tids, type === 'seat' ? 'seat' : 'move');
  if (chk.block) { toast(chk.block, 'warn'); return; }
  if (type === 'add' || type === 'move') chk.warns = chk.warns.filter(w => w.type !== 'overload' || /break/.test(w.text));
  if (chk.warns.length) { openWarnSheet(p, tids, chk.warns, type); return; }
  commitAction(type, p, tids, []);
}

function commitAction(type, p, tids, warns) {
  SH.stats.warnShown += warns.length;
  for (const w of warns) { SH.stats.overrides.push({ type: w.type, text: w.text, t: SH.clock, party: shortName(p) }); SH.stats.warn[w.type] = (SH.stats.warn[w.type] || 0) + 1; }
  if (type === 'seat') doSeat(p, tids);
  else doMove(p, tids);
  clearSelection();
  saveSoon();
}

function doSeat(p, tids) {
  const now = SH.clock;
  for (const id of tids) { const s = SH.tables[id]; if (s.state === 'clearing') { s.state = 'free'; } }
  const wasSeatedBefore = p.seatedAt != null;
  p.status = 'seated'; p.seatedAt = now; p.tableIds = tids.slice(); p.sectionId = primarySection(tids);
  p.phase = 'seated';
  p.turn = p.hidden.turnOverride || expectedTurn(p.size) * RNG.range(0.88, 1.14);
  p.phaseEnd = now + phaseDur(p, 'seated');
  for (const id of tids) SH.tables[id] = { state: 'occ', pid: p.id, since: now };
  if (!wasSeatedBefore || !SH.stats.seatings.find(x => x.pid === p.id)) SH.stats.seatings.push({ t: now, sec: p.sectionId, pid: p.id });
  toast(`Seated ${shortName(p)} (${p.size}) at ${tNames(tids)}.`, 'good');
  tutorialEvent('seat', p);
  dirty('seat');
}

function doMove(p, tids) {
  const now = SH.clock;
  const old = p.tableIds.slice();
  for (const id of old) if (!tids.includes(id)) SH.tables[id] = { state: now - p.seatedAt > 5 ? 'clearing' : 'free', pid: null, since: now };
  for (const id of tids) { SH.tables[id] = { state: 'occ', pid: p.id, since: SH.tables[id].state === 'occ' ? SH.tables[id].since : now }; }
  p.tableIds = tids.slice(); p.sectionId = primarySection(tids);
  toast(`${shortName(p)} now at ${tNames(tids)}.`, 'good');
  dirty('move');
}

function releaseTable(p, tid) {
  if (p.tableIds.length < 2) return;
  p.tableIds = p.tableIds.filter(x => x !== tid);
  SH.tables[tid] = { state: 'clearing', pid: null, since: SH.clock };
  p.sectionId = primarySection(p.tableIds);
  toast(`Split ${tName(tid)} off from ${shortName(p)}'s party.`);
  dirty('split');
}

function setPhase(p, phase) {
  if (phase === 'clearing') { depart(p); toast(`${shortName(p)} has left. ${tNames(p.tableIds)} needs clearing.`); tutorialEvent('status', phase); return; }
  p.phase = phase; p.phaseEnd = SH.clock + phaseDur(p, phase);
  if (phase !== 'paid') p.flags.campFrom = null;
  tutorialEvent('status', phase);
  dirty('status');
}

function busTable(tid) {
  const s = SH.tables[tid];
  if (!s) return;
  s.state = 'free'; s.pid = null; s.since = SH.clock;
  SH.stats.manualClears++;
  tutorialEvent('bus');
  dirty('bus');
}
function markTableDirty(tid) {
  const s = SH.tables[tid];
  if (s && s.state === 'free') { s.state = 'clearing'; s.since = SH.clock; dirty('bus'); }
}

function unseat(p) {
  for (const id of p.tableIds) SH.tables[id] = { state: 'free', pid: null, since: SH.clock };
  SH.stats.seatings = SH.stats.seatings.filter(x => x.pid !== p.id);
  p.status = p.kind === 'res' ? 'arrived' : 'waiting'; p.seatedAt = null; p.tableIds = []; p.phase = null; p.sectionId = null;
  if (p.kind === 'walk' && p.quote == null) p.quote = 0;
  toast(`${shortName(p)} is back on the ${p.kind === 'res' ? 'reservation' : 'wait'} list.`);
  dirty('unseat');
}

function markNoShow(p, fromMsg) {
  p.status = 'noshow'; p.leftAt = SH.clock;
  if (!fromMsg) {
    p.flags.noshowIdx = recordCurve('late', `No-show: ${shortName(p)}`, p.hidden.noShow ? 'good' : (SH.clock < p.resTime + 10 ? 'poor' : 'ok'), p.hidden.noShow ? '' : 'Marked before they had a chance to show.');
    SH.msgs = SH.msgs.filter(m => m.pid !== p.id);
  }
  toast(`${shortName(p)} marked no-show. ${tNames(p.assigned) || 'Their table'} is released.`);
  dirty('noshow');
}
function cancelParty(p) {
  p.status = 'cancelled'; p.leftAt = SH.clock;
  SH.msgs = SH.msgs.filter(m => m.pid !== p.id);
  toast(`${shortName(p)} removed.`);
  dirty('cancel');
}
function turnAway(p) {
  p.status = 'turned'; p.leftAt = SH.clock;
  toast(`Turned away ${shortName(p)} (${p.size}).`);
  dirty('turn');
}
function checkIn(p, quiet) {
  if (p.status !== 'booked') return;
  p.status = 'arrived'; p.arrivedAt = SH.clock;
  if (!quiet) toast(`${shortName(p)} checked in.`);
  dirty('checkin');
}
function changeSize(p, n) {
  n = clamp(n, 1, 30);
  if (n === p.size) return;
  p.size = n;
  dirty('size');
}

function quoteParty(p, q) {
  p.quote = q; p.quotedAt = SH.clock;
  if (!p.manual && p.hidden.tolerance != null && q > p.hidden.tolerance) {
    p.status = 'declined'; p.leftAt = SH.clock; p.outcome = `Didn't want to wait ${q} min.`;
    toast(`${shortName(p)} (${p.size}) decided not to wait ${q} minutes and left.`, 'bad');
  } else {
    p.status = 'waiting';
    toast(`${shortName(p)} is on the waitlist, quoted ${q} min.`);
  }
  tutorialEvent('quote', p);
  dirty('quote');
}

function addWalkin(o) {
  const p = addParty(newParty({ kind: 'walk', name: o.name || 'Walk-in', size: o.size, origSize: o.size, tags: o.tags || [], note: o.note || '', status: 'new', addedAt: SH.clock, manual: true, hidden: { tolerance: 999, patience: 25 } }));
  if (o.quote != null) quoteParty(p, o.quote);
  dirty('add');
  return p;
}

function autoAssign(size, time) {
  const turn = expectedTurn(size);
  const busy = id => allParties().some(q => q.kind === 'res' && (q.status === 'booked' || q.status === 'arrived') && q.assigned && q.assigned.includes(id) && Math.abs(q.resTime - time) < turn);
  const units = seatUnits(SH.layout).filter(u => !u.bar && u.max >= size && u.min <= size && u.ids.every(id => !busy(id)));
  units.sort((a, b) => (a.max - size) - (b.max - size) || a.ids.length - b.ids.length);
  return units.length ? units[0].ids : null;
}
function addReservation(o) {
  const p = addParty(newParty({ kind: 'res', name: o.name || 'Guest', size: o.size, origSize: o.size, tags: o.tags || [], note: o.note || '', resTime: o.time, status: 'booked', manual: true, assigned: autoAssign(o.size, o.time), hidden: { offset: -2, patience: 40 } }));
  p.arriveTime = o.time - 2;
  SH.order.sort((a, b) => (SH.parties[a].resTime || 9e9) - (SH.parties[b].resTime || 9e9));
  toast(`Booked ${shortName(p)} (${p.size}) at ${fmtTime(o.time)}${p.assigned ? ' on ' + tNames(p.assigned) : ''}.`);
  dirty('add');
  return p;
}

function setSpeed(v) {
  if (!SH) return;
  if (v > 0 && SH.msgs.length && S().pauseOnAlert) { toast('Answer the message first.', 'warn'); return; }
  SH.speed = v; if (v > 0) SH.prevSpeed = v;
  SH.pausedForMsg = false;
  tutorialEvent('speed');
  dirty('speed');
}
