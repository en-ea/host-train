/* ---------- shift model helpers: capacity, status, turn times, warnings ---------- */
let SH = null; // the live shift (persisted as DB.shift)

const tableById = (lay, id) => lay.tables.find(t => t.id === id);
const sectionById = (lay, id) => lay.sections.find(s => s.id === id);
const P = id => SH && SH.parties[id];
const allParties = () => SH ? SH.order.map(id => SH.parties[id]) : [];
const tName = id => { const t = SH && tableById(SH.layout, id); return t ? t.name : '?'; };
const tNames = ids => (ids || []).map(tName).join('+');

function sizeBucket(n) { return n <= 2 ? 's2' : n <= 4 ? 's4' : n <= 6 ? 's6' : 's8'; }
function expectedTurn(size) {
  const st = SHIFT_TYPES[SH ? SH.type : 'normal'];
  return S().turn[sizeBucket(size)] * (st ? st.turnMul : 1);
}

function combosOf(lay) { return lay.combos || []; }
function sameSet(a, b) { return a.length === b.length && a.every(x => b.includes(x)); }

function capacityOf(lay, tids) {
  if (!tids.length) return { min: 0, max: 0, combo: null };
  if (tids.length === 1) { const t = tableById(lay, tids[0]); return t ? { min: t.min, max: t.max, combo: null } : { min: 0, max: 0 }; }
  const c = combosOf(lay).find(c => sameSet(c.tableIds, tids));
  if (c) return { min: c.min, max: c.max, combo: c };
  const ts = tids.map(id => tableById(lay, id)).filter(Boolean);
  return { min: Math.max(...ts.map(t => t.min)), max: sum(ts, t => t.max), combo: null, adhoc: true };
}

// every seatable unit: each table plus each defined combination
function seatUnits(lay) {
  const u = lay.tables.map(t => ({ ids: [t.id], min: t.min, max: t.max, bar: t.shape === 'bar', label: t.name }));
  for (const c of combosOf(lay)) {
    const ts = c.tableIds.map(id => tableById(lay, id)).filter(Boolean);
    if (ts.length !== c.tableIds.length || ts.length < 2) continue;
    u.push({ ids: c.tableIds.slice(), min: c.min, max: c.max, bar: ts.every(t => t.shape === 'bar'), combo: true, label: ts.map(t => t.name).join('+') });
  }
  return u;
}

function tableSeats(lay) { return sum(lay.tables, t => t.max); }

/* ----- live status ----- */
function tableIsFree(tid) { const s = SH.tables[tid]; return s && s.state === 'free'; }
function tableHold(tid, horizon) {
  // next booked reservation assigned to this table that is not seated yet
  let best = null;
  for (const p of allParties()) {
    if (p.kind !== 'res' || !(p.status === 'booked' || p.status === 'arrived')) continue;
    if (!p.assigned || !p.assigned.includes(tid)) continue;
    if (p.resTime - SH.clock > horizon) continue;
    if (!best || p.resTime < best.resTime) best = p;
  }
  return best;
}
function tableStatus(tid) {
  const s = SH.tables[tid];
  if (!s) return 'available';
  if (s.state === 'occ') { const p = P(s.pid); return p ? p.phase : 'seated'; }
  if (s.state === 'clearing') return 'clearing';
  return tableHold(tid, S().heldWindow) ? 'reserved' : 'available';
}

function phaseDur(p, phase) {
  let d = p.turn * PHASE_SHARE[phase];
  if ((phase === 'ordered' || phase === 'mains') && SH.kitchen && SH.clock < SH.kitchen.until) d *= SH.kitchen.factor;
  if (phase === 'paid' && p.hidden && p.hidden.camp) d += p.hidden.camp;
  return d;
}
function minutesLeft(p) {
  if (p.status !== 'seated') return 0;
  const i = PHASES.indexOf(p.phase);
  let m = Math.max(0, p.phaseEnd - SH.clock);
  for (let j = i + 1; j < PHASES.length; j++) m += p.turn * PHASE_SHARE[PHASES[j]];
  return m;
}
function expectedFreeAt(tid) {
  const s = SH.tables[tid];
  if (!s || s.state === 'free') return SH.clock;
  if (s.state === 'clearing') return SH.clock + Math.max(1, S().autoBus || 3);
  const p = P(s.pid);
  return SH.clock + (p ? minutesLeft(p) : 30) + 3;
}

function occupancy() {
  const tabs = SH.layout.tables;
  if (!tabs.length) return 0;
  const seats = sum(tabs, t => t.max);
  const used = sum(tabs.filter(t => SH.tables[t.id] && SH.tables[t.id].state !== 'free'), t => t.max);
  return seats ? used / seats : 0;
}
function waitingParties() {
  return allParties().filter(p => p.status === 'waiting' || p.status === 'new' || p.status === 'arrived');
}
function isRush() {
  return occupancy() * 100 >= S().rushPct || waitingParties().length >= 3;
}

function sectionLoad() {
  // current covers and total covers seated per section
  const out = {};
  for (const s of SH.layout.sections) out[s.id] = { now: 0, total: 0, tables: 0, seats: 0 };
  for (const t of SH.layout.tables) {
    if (!out[t.sectionId]) continue;
    out[t.sectionId].tables++; out[t.sectionId].seats += t.max;
  }
  for (const p of allParties()) {
    if (!p.seatedAt || !p.sectionId || !out[p.sectionId]) continue;
    out[p.sectionId].total += p.size;
    if (p.status === 'seated') out[p.sectionId].now += p.size;
  }
  return out;
}
function sectionIsBar(lay, secId) {
  const ts = lay.tables.filter(t => t.sectionId === secId);
  return ts.length > 0 && ts.every(t => t.shape === 'bar');
}
function primarySection(tids) {
  const t = tableById(SH.layout, tids[0]);
  return t ? t.sectionId : null;
}
function serverOnBreak(secId) {
  const b = SH.breaks && SH.breaks[secId];
  return b && SH.clock >= b.from && SH.clock < b.until;
}

/* ----- seating checks (the host's guard rails) ----- */
function seatCheck(p, tids, mode = 'seat') {
  const lay = SH.layout;
  const out = { block: null, warns: [] };
  if (!tids.length) { out.block = 'Pick a table.'; return out; }
  for (const id of tids) {
    const st = SH.tables[id];
    if (st && st.state === 'occ' && st.pid !== p.id) { out.block = `Table ${tName(id)} already has a party.`; return out; }
  }
  if (tids.length > 1) {
    const ts = tids.map(id => tableById(lay, id));
    const c = capacityOf(lay, tids);
    if (!c.combo && ts.some(t => !t.combinable)) { out.block = `Table ${ts.find(t => !t.combinable).name} is not set as combinable.`; return out; }
  }
  const cap = capacityOf(lay, tids);
  const size = p.size;
  const unbussed = tids.filter(id => SH.tables[id] && SH.tables[id].state === 'clearing');
  if (unbussed.length) out.warns.push({ type: 'unbussed', text: `Table ${tNames(unbussed)} hasn't been bussed yet. Seating it now means guests sit at a dirty table (it will be cleared as you seat).` });
  if (size > cap.max) out.warns.push({ type: 'small', text: `Too small: ${tNames(tids)} seats up to ${cap.max}, this party is ${size}.` });
  else if (size < cap.min) out.warns.push({ type: 'waste', text: `${tNames(tids)} is set for ${cap.min}–${cap.max}. A party of ${size} is under the minimum.` });
  else if (isRush() && cap.max - size >= 3) out.warns.push({ type: 'waste', text: `It's busy and ${tNames(tids)} seats ${cap.max}. Putting ${size} here leaves ${cap.max - size} empty seats a bigger party could use.` });
  // reservation hold
  const turn = expectedTurn(size);
  for (const id of tids) {
    const h = tableHold(id, Math.max(S().heldWindow, turn - 5));
    if (h && h.id !== p.id) {
      const freeBy = SH.clock + turn;
      out.warns.push({ type: 'blocked', text: `Table ${tName(id)} is held for ${h.name} (${h.size}) at ${fmtTime(h.resTime)}. This party will likely be there until about ${fmtTime(freeBy)}.` });
    }
  }
  // server balance
  const sec = primarySection(tids);
  if (sec) {
    const s = sectionById(lay, sec);
    if (serverOnBreak(sec)) out.warns.push({ type: 'overload', text: `${s.server || s.name} is on break. Nobody will greet this table for a while.` });
    // double seats are normal in a rush; triple seats never are
    const recent = (SH.stats.seatings || []).filter(x => x.sec === sec && SH.clock - x.t <= S().doubleSeatMin && x.pid !== p.id);
    if (mode !== 'move' && (recent.length >= 2 || (recent.length === 1 && !isRush())))
      out.warns.push({ type: 'overload', text: `${s.server || s.name} (${s.name}) was just sat ${Math.round(SH.clock - recent[recent.length - 1].t)} min ago. Seating now is a ${recent.length >= 2 ? 'triple' : 'double'} seat${recent.length === 1 ? ' on a quiet floor; another server is free' : ''}.` });
    // compare this server's covers with their fair share of what is on the floor right now
    const load = sectionLoad();
    const live = lay.sections.filter(x => load[x.id] && load[x.id].seats > 0 && !serverOnBreak(x.id) && !sectionIsBar(lay, x.id));
    if (live.length > 1 && live.some(x => x.id === sec)) {
      const add = mode === 'move' ? 0 : size;
      const totNow = sum(live, x => load[x.id].now) + add;
      const totSeats = sum(live, x => load[x.id].seats);
      const fair = totNow * load[sec].seats / totSeats;
      const mine = load[sec].now + add;
      if (mine - fair > S().overload) out.warns.push({ type: 'overload', text: `${s.server || s.name} would have ${mine} covers on the floor. Their fair share right now is about ${Math.round(fair)}.` });
    }
  }
  if (p.prefTable && !tids.includes(p.prefTable)) out.warns.push({ type: 'pref', text: `${p.name} asked for table ${tName(p.prefTable)}.` });
  return out;
}

// best options for a party, used for suggestion chips and highlight
function suggestUnits(p, limit = 4) {
  const lay = SH.layout;
  const res = [];
  for (const u of seatUnits(lay)) {
    if (u.max < p.size) continue;
    if (!u.ids.every(id => SH.tables[id] && SH.tables[id].state === 'free')) continue;
    if (u.bar && p.size > 2) continue;
    const chk = seatCheck(p, u.ids);
    if (chk.block) continue;
    let score = (u.max - p.size) * 3 + (u.ids.length - 1) * 2 + chk.warns.length * 6;
    if (p.size < u.min) score += 5;
    if (p.assigned && sameSet(p.assigned, u.ids)) score -= 8;
    if (p.prefTable && u.ids.includes(p.prefTable)) score -= 10;
    if (u.bar) score += 4;
    res.push({ ids: u.ids, label: u.label, score, warns: chk.warns.length, max: u.max });
  }
  res.sort((a, b) => a.score - b.score);
  return res.slice(0, limit);
}

function partyWaitStart(p) {
  if (p.kind === 'res') return Math.max(p.resTime, p.arrivedAt != null ? p.arrivedAt : p.resTime);
  return p.addedAt;
}
function partyWaited(p) {
  const end = p.seatedAt != null ? p.seatedAt : SH.clock;
  return Math.max(0, end - partyWaitStart(p));
}
