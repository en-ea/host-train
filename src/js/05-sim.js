/* ---------- shift generation and simulation ---------- */
function partyName(rng) { return rng.pick(LAST) + ', ' + rng.pick(FIRST); }
function shortName(p) { return p.name.split(',')[0]; }

function newParty(o) {
  return Object.assign({
    id: uid('p'), kind: 'walk', name: 'Walk-in', size: 2, origSize: 2, tags: [], note: '',
    resTime: null, assigned: null, status: 'new', arriveTime: null, arrivedAt: null, addedAt: null, quote: null,
    seatedAt: null, tableIds: [], phase: null, phaseEnd: null, turn: 0, leftAt: null, outcome: null, sectionId: null,
    hidden: {}, flags: {}, prefTable: null, manual: false,
  }, o);
}

function addParty(p) { SH.parties[p.id] = p; SH.order.push(p.id); return p; }

function buildBook(lay, st, rng) {
  const out = [];
  const units = seatUnits(lay).filter(u => !u.bar);
  const nonBar = lay.tables.filter(t => t.shape !== 'bar').length || 1;
  const busy = {};
  lay.tables.forEach(t => busy[t.id] = []);
  const free = (ids, a, b) => ids.every(id => busy[id].every(([x, y]) => b <= x || a >= y));
  const lastSeat = st.end - 75;
  for (let t = st.start; t <= lastSeat; t += 15) {
    const k = lerpCurve(st.curve, (t - st.start) / 60);
    const lambda = k * nonBar * 15 / 85 * st.resFrac * 1.25;
    const n = rng.poisson(lambda);
    for (let i = 0; i < n; i++) {
      const size = rng.weighted(st.sizes);
      const turn = S().turn[sizeBucket(size)] * st.turnMul;
      const cands = units.filter(u => u.max >= size && u.min <= size && free(u.ids, t, t + turn + 10));
      if (!cands.length) continue;
      cands.forEach(u => u._s = (u.max - size) * 10 + (u.ids.length - 1) * 8 + rng.r() * 4);
      cands.sort((a, b) => a._s - b._s);
      const u = cands[0];
      u.ids.forEach(id => busy[id].push([t, t + turn + 10]));
      out.push({ size, time: t, ids: u.ids.slice() });
    }
  }
  return out;
}

function makeResParty(b, st, rng, lay) {
  const tags = [];
  if (rng.chance(0.04)) tags.push('vip'); else if (rng.chance(0.09)) tags.push('regular');
  if (rng.chance(0.06)) tags.push('birthday'); else if (rng.chance(0.04)) tags.push('anniv');
  if (rng.chance(0.06)) tags.push('allergy');
  if (b.size >= 3 && rng.chance(SH.type === 'brunch' ? 0.18 : 0.05)) tags.push('highchair');
  const p = newParty({ kind: 'res', name: partyName(rng), size: b.size, origSize: b.size, resTime: b.time, assigned: b.ids, status: 'booked', tags });
  const h = p.hidden;
  h.noShow = rng.chance(st.noShow);
  const r = rng.r();
  if (r < 0.08) h.offset = -rng.range(16, 32);
  else if (r < 0.2) { h.offset = rng.range(17, 36); h.callsLate = rng.chance(0.5); }
  else h.offset = clamp(rng.normal(-2, 5), -12, 12);
  p.arriveTime = p.resTime + h.offset;
  h.patience = rng.range(28, 45);
  if (rng.chance(0.07)) h.sizeDelta = (b.size >= 4 && rng.chance(0.4)) ? -rng.int(1, 2) : rng.int(1, 2);
  if (tags.includes('vip') || tags.includes('regular')) {
    if (rng.chance(0.65)) {
      const cands = lay.tables.filter(t => t.shape !== 'bar' && t.max >= b.size && t.min <= b.size);
      if (cands.length) h.wantsTable = rng.pick(cands).id;
    }
  }
  if (rng.chance(0.05)) h.camp = rng.range(20, 32);
  if (rng.chance(0.08)) h.wantsMove = true;
  if (tags.includes('allergy')) p.note = rng.pick(['Shellfish allergy', 'Nut allergy', 'Gluten free', 'Dairy free']);
  else if (tags.includes('birthday')) p.note = 'Celebrating a birthday. Candle on dessert.';
  else if (tags.includes('anniv')) p.note = 'Anniversary. Quiet table if possible.';
  return p;
}

function buildWalkins(lay, st, rng) {
  const out = [];
  const nonBar = lay.tables.filter(t => t.shape !== 'bar').length || 1;
  const sizes = [[1, 12], [2, 46], [3, 14], [4, 18], [5, 5], [6, 4], [7, 1]];
  for (let t = st.start; t < st.end - 60; t += 5) {
    const k = lerpCurve(st.curve, (t - st.start) / 60);
    const n = rng.poisson(k * nonBar * 5 / 90 * st.walkFrac * 0.85);
    for (let i = 0; i < n; i++) out.push({ t: t + rng.range(0, 5), size: rng.weighted(sizes) });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

function walkinHidden(rng, size, bigQuoteOk) {
  return {
    tolerance: size >= 6 ? rng.range(30, 70) : rng.range(18, 55) + (bigQuoteOk ? 15 : 0),
    patience: rng.range(8, 20),
    camp: rng.chance(0.05) ? rng.range(20, 32) : 0,
    wantsMove: rng.chance(0.06),
  };
}

function startShift(type, layoutId, opts = {}) {
  const lay = deepCopy(DB.layouts.find(l => l.id === layoutId) || activeLayout());
  const st = SHIFT_TYPES[type];
  const seed = opts.seed || (Date.now() & 0x7fffffff);
  const rng = makeRng(seed);
  RNG = makeRng(seed ^ 0x5bd1e995);
  SH = {
    id: uid('sh'), type, seed, layout: lay, startMin: st.start, endMin: st.end, clock: st.start - 10, speed: 0, prevSpeed: 5,
    parties: {}, order: [], tables: {}, walkQueue: [], msgs: [], breaks: {}, kitchen: null, ended: false, startedAt: Date.now(),
    stats: { seatMin: 0, capMin: 0, occMin: 0, warn: {}, overrides: [], curve: [], manualClears: 0, seatings: [], warnShown: 0, goals: [] },
    nextCb: st.start + 20, cbCount: {}, tutorial: null, lastToastMin: 0, venue: S().venue,
  };
  lay.tables.forEach(t => SH.tables[t.id] = { state: 'free', pid: null, since: SH.clock });
  if (type === 'tutorial') { setupTutorialShift(rng); return SH; }
  for (const b of buildBook(lay, st, rng)) addParty(makeResParty(b, st, rng, lay));
  SH.order.sort((a, b) => SH.parties[a].resTime - SH.parties[b].resTime);
  SH.walkQueue = buildWalkins(lay, st, rng);
  // a couple of guests already seated when the shift opens makes the floor feel live on busy shifts
  return SH;
}

/* ----- messages (curveballs) ----- */
function pushMsg(m) {
  m.id = uid('m'); m.at = SH.clock;
  SH.msgs.push(m);
  if (S().pauseOnAlert && SH.speed > 0) { SH.prevSpeed = SH.speed; SH.speed = 0; SH.pausedForMsg = true; }
  dirty('msg');
  return m;
}
function recordCurve(type, title, result, note) {
  const e = { type, title, result, note: note || '', at: SH.clock };
  SH.stats.curve.push(e); return SH.stats.curve.length - 1;
}
function addGoal(kind, pid, idx, deadline, extra = {}) {
  SH.stats.goals.push(Object.assign({ kind, pid, idx, deadline, done: false }, extra));
}

/* ----- the simulation step ----- */
function simStep(dt) {
  const st = SHIFT_TYPES[SH.type];
  const prev = SH.clock;
  SH.clock += dt;
  const now = SH.clock;
  const tut = SH.type === 'tutorial';

  // arrivals of reservations
  for (const p of allParties()) {
    if (p.kind !== 'res') continue;
    if (p.status === 'booked' && !p.hidden.noShow && p.arriveTime != null && now >= p.arriveTime && !p.flags.holdArrival) {
      arrive(p);
    } else if (p.status === 'noshow' && !p.hidden.noShow && !p.flags.cameBack && now >= p.arriveTime) {
      // marked no-show too early: they walk in anyway
      p.flags.cameBack = true; p.status = 'arrived'; p.arrivedAt = now;
      const e = SH.stats.curve[p.flags.noshowIdx];
      if (e) { e.result = 'poor'; e.note = 'They showed up after you marked them a no-show.'; }
      toast(`${shortName(p)} (${p.size}) just arrived. You'd marked them a no-show.`, 'warn');
    }
    // late with no call: prompt
    if (p.status === 'booked' && !p.flags.lateAsked && now >= (p.flags.nextLateAsk || p.resTime + S().lateGrace) && !tut) {
      p.flags.lateAsked = true;
      CB.late.create(p);
    }
    // calls ahead when running late
    if (p.status === 'booked' && p.hidden.callsLate && !p.flags.called && now >= p.resTime - 10) {
      p.flags.called = true; CB.callLate.create(p);
    }
  }

  // walk-ins at the door
  while (SH.walkQueue.length && SH.walkQueue[0].t <= now) {
    const w = SH.walkQueue.shift();
    if (now > SH.endMin - 45) continue;
    const p = addParty(newParty({ kind: 'walk', name: partyName(RNG), size: w.size, origSize: w.size, status: 'new', addedAt: now, hidden: walkinHidden(RNG, w.size, SH.type === 'holiday') }));
    toast(`Walk-in: ${shortName(p)}, party of ${p.size}, is at the stand.`, 'info', { act: 'open-party', id: p.id });
  }

  // patience
  for (const p of allParties()) {
    if (p.status === 'new' && now - p.addedAt > 7 && !p.flags.noLeave) {
      leave(p, 'walked', 'Nobody greeted or quoted them.');
    } else if (p.status === 'waiting') {
      const limit = p.quote + (p.quote === 0 ? 12 : Math.max(p.hidden.patience || 12, p.quote * 0.35));
      const waited = now - p.addedAt;
      if (!p.flags.overQuote && waited > p.quote + 2 && p.quote >= 0) { p.flags.overQuote = true; toast(`${shortName(p)} (${p.size}) has waited past their ${p.quote}-min quote.`, 'warn', { act: 'open-party', id: p.id }); }
      if (waited > limit && !p.flags.noLeave) leave(p, 'walked', `Waited ${Math.round(waited)} min on a ${p.quote}-min quote.`);
    } else if (p.status === 'arrived' && p.kind === 'res') {
      const w = now - partyWaitStart(p);
      if (!p.flags.warned && w > 15) { p.flags.warned = true; toast(`${shortName(p)} (${p.size}, ${fmtTime(p.resTime)}) has been waiting ${Math.round(w)} min.`, 'warn', { act: 'open-party', id: p.id }); }
      if (w > (p.hidden.patience || 40) && !p.flags.noLeave) leave(p, 'walked', `Reservation waited ${Math.round(w)} min without a table.`);
    }
  }

  // seated parties progress through courses
  for (const p of allParties()) {
    if (p.status !== 'seated') continue;
    let guard = 0;
    while (p.status === 'seated' && now >= p.phaseEnd && guard++ < 8) {
      const i = PHASES.indexOf(p.phase);
      if (i >= PHASES.length - 1) { depart(p); break; }
      p.phase = PHASES[i + 1];
      p.phaseEnd = p.phaseEnd + phaseDur(p, p.phase);
      if (p.phase === 'paid' && p.hidden.camp && !tut) p.flags.campFrom = now;
    }
    if (p.status === 'seated' && p.phase === 'paid' && p.flags.campFrom && !p.flags.campAsked && now - p.flags.campFrom > 14) {
      p.flags.campAsked = true;
      if (waitingParties().length) CB.camp.create(p); else p.hidden.camp = 0, p.phaseEnd = Math.min(p.phaseEnd, now + 4);
    }
  }

  // bussers
  const ab = S().autoBus;
  if (ab > 0 && !tut) for (const t of SH.layout.tables) {
    const s = SH.tables[t.id];
    if (s.state === 'clearing' && now - s.since >= ab) { s.state = 'free'; s.pid = null; s.since = now; }
  }

  // goals that resolve a curveball result later
  for (const g of SH.stats.goals) {
    if (g.done) continue;
    const p = P(g.pid); const e = SH.stats.curve[g.idx];
    if (!p || !e) { g.done = true; continue; }
    let ok = false;
    if (g.kind === 'moved') ok = p.tableIds.join() !== g.from;
    if (g.kind === 'pref') ok = p.status === 'seated' && p.tableIds.includes(g.tid);
    if (ok) { g.done = true; e.result = 'good'; continue; }
    if (now > g.deadline || ['walked', 'done', 'noshow', 'cancelled'].includes(p.status)) {
      g.done = true;
      if (g.kind === 'pref' && p.status === 'seated') { e.result = 'ok'; e.note = 'Seated, but not at the table they asked for.'; }
      else if (e.result === 'pending') { e.result = 'poor'; e.note = g.kind === 'moved' ? "They asked to move and weren't moved." : (e.note || 'Not followed through.'); }
    }
  }

  // stats: seat efficiency
  for (const p of allParties()) {
    if (p.status !== 'seated') continue;
    const cap = capacityOf(SH.layout, p.tableIds);
    SH.stats.seatMin += Math.min(p.size, cap.max) * dt;
    SH.stats.capMin += Math.max(cap.max, p.size) * dt;
  }
  SH.stats.occMin += occupancy() * dt;

  // random curveballs
  if (!tut && now >= SH.nextCb && now < SH.endMin - 30) {
    const freq = { low: 0.55, normal: 1, high: 1.7 }[S().curveballs] || 1;
    const gap = 40 / (st.cbRate * freq);
    SH.nextCb = now + RNG.range(gap * 0.5, gap * 1.4);
    fireRandomCurveball();
  }

  // shift over prompt
  if (prev < SH.endMin && now >= SH.endMin) toast('Last seating window has passed. End the shift whenever the room winds down.', 'info');
  if (Math.floor(prev) !== Math.floor(now)) dirty('min');
}

function arrive(p) {
  p.status = 'arrived'; p.arrivedAt = SH.clock;
  const early = p.resTime - SH.clock;
  if (p.hidden.sizeDelta && !p.flags.sizeDone && SH.type !== 'tutorial') { p.flags.sizeDone = true; CB.size.create(p, p.hidden.sizeDelta); }
  else if (p.hidden.wantsTable && !p.flags.prefAsked && SH.type !== 'tutorial') { p.flags.prefAsked = true; CB.pref.create(p); }
  else if (early >= 15 && SH.type !== 'tutorial') CB.early.create(p, early);
  else toast(`${shortName(p)} (${p.size}, ${fmtTime(p.resTime)}) checked in.`, 'info', { act: 'open-party', id: p.id });
  dirty('arrive');
}

function leave(p, status, why) {
  p.status = status; p.leftAt = SH.clock; p.outcome = why;
  toast(`${shortName(p)} (${p.size}) left. ${why}`, 'bad');
  if (selection && selection.pid === p.id) clearSelection();
  dirty('leave');
}

function depart(p) {
  p.status = 'done'; p.leftAt = SH.clock; p.phase = 'paid';
  for (const id of p.tableIds) { const s = SH.tables[id]; if (s && s.pid === p.id) { s.state = 'clearing'; s.pid = null; s.since = SH.clock; } }
  dirty('depart');
}

/* ----- curveball catalogue ----- */
const CB = {
  late: {
    create(p) {
      pushMsg({ type: 'late', pid: p.id, icon: 'clock', title: `${shortName(p)} is ${Math.round(SH.clock - p.resTime)} minutes late`,
        body: `Party of ${p.size} booked for ${fmtTime(p.resTime)} on ${tNames(p.assigned) || 'no table'}. They haven't called.`,
        options: [{ k: 'call', label: 'Call the guest', primary: true }, { k: 'noshow', label: 'Mark no-show, release table' }, { k: 'hold', label: 'Hold 10 more minutes' }] });
    },
    resolve(m, k) {
      const p = P(m.pid); if (!p) return;
      if (p.status !== 'booked') { toast(`${shortName(p)} already ${p.status === 'arrived' ? 'arrived' : 'handled'}.`); return; }
      if (k === 'call') {
        if (p.hidden.noShow) {
          pushMsg({ type: 'late2', pid: p.id, icon: 'phone', title: `No answer from ${shortName(p)}`, body: 'Straight to voicemail. Their table is still being held.',
            options: [{ k: 'noshow', label: 'Mark no-show, release table', primary: true }, { k: 'hold', label: 'Hold 10 more minutes' }] });
        } else {
          const mins = Math.max(3, Math.round(p.arriveTime - SH.clock));
          recordCurve('late', `Late: ${shortName(p)}`, 'good', `Called. They were ${mins} min away.`);
          toast(`${shortName(p)}: "So sorry, we're about ${mins} minutes away!"`, 'info');
        }
      } else if (k === 'noshow') {
        p.flags.noshowIdx = recordCurve('late', `Late: ${shortName(p)}`, p.hidden.noShow ? 'good' : 'ok', p.hidden.noShow ? 'Released a true no-show.' : '');
        markNoShow(p, true);
      } else {
        recordCurve('late', `Late: ${shortName(p)}`, p.hidden.noShow ? 'ok' : 'good', 'Held the table.');
        p.flags.lateAsked = false; p.flags.nextLateAsk = SH.clock + 10;
      }
    },
  },
  late2: { resolve(m, k) { return CB.late.resolve(Object.assign({}, m, { _second: true }), k); } },
  callLate: {
    create(p) {
      const mins = Math.round(p.arriveTime - p.resTime);
      pushMsg({ type: 'callLate', pid: p.id, icon: 'phone', title: `${shortName(p)} called: running ${mins} min late`,
        body: `Party of ${p.size}, booked for ${fmtTime(p.resTime)} on ${tNames(p.assigned) || 'no table'}. They expect to arrive around ${fmtTime(p.arriveTime)}.`,
        options: [{ k: 'hold', label: 'Hold their table', primary: true }, { k: 'release', label: 'Release table, seat them when they arrive' }] });
    },
    resolve(m, k) {
      const p = P(m.pid); if (!p) return;
      p.flags.lateAsked = true; // they called, so no no-show prompt
      const busy = isRush();
      if (k === 'hold') {
        recordCurve('callLate', `Late call: ${shortName(p)}`, busy ? 'ok' : 'good', busy ? 'Holding a table empty during a rush costs covers.' : 'Held the table on a quiet night.');
      } else {
        const was = tNames(p.assigned || []);
        p.assigned = null;
        recordCurve('callLate', `Late call: ${shortName(p)}`, busy ? 'good' : 'ok', busy ? 'Freed the table for walk-ins during the rush.' : '');
        toast(`Released the hold on ${was || 'their table'} for ${shortName(p)}.`);
      }
    },
  },
  early: {
    create(p, early) {
      pushMsg({ type: 'early', pid: p.id, icon: 'clock', title: `${shortName(p)} is ${Math.round(early)} minutes early`,
        body: `Party of ${p.size} for ${fmtTime(p.resTime)}. Their booked table is ${tNames(p.assigned) || 'not set'}.`,
        options: [{ k: 'seat', label: 'Seat them now', primary: true }, { k: 'wait', label: 'Offer a drink at the bar until their time' }] });
    },
    resolve(m, k) {
      const p = P(m.pid); if (!p) return;
      const fits = suggestUnits(p, 3).filter(u => u.warns === 0).length > 0;
      if (k === 'seat') {
        recordCurve('early', `Early: ${shortName(p)}`, fits ? 'good' : 'ok', fits ? '' : 'Nothing clean was free. Seating early here meant bending a rule.');
        beginSeat(p.id);
      } else {
        recordCurve('early', `Early: ${shortName(p)}`, fits ? 'ok' : 'good', fits ? 'A good table was free. You could have sat them.' : '');
        p.flags.atBar = true;
      }
    },
  },
  size: {
    create(p, delta) {
      const old = p.size; const n = Math.max(1, old + delta);
      p.flags.newSize = n;
      const seated = p.status === 'seated';
      const cap = seated ? capacityOf(SH.layout, p.tableIds) : (p.assigned ? capacityOf(SH.layout, p.assigned) : null);
      const opts = seated
        ? [{ k: 'chairs', label: n > old ? 'Pull up chairs, keep the table' : 'Update the size', primary: !cap || n <= cap.max }, { k: 'move', label: 'Move them to a better table', primary: cap && n > cap.max }, { k: 'combine', label: 'Add a table next to them' }]
        : [{ k: 'seat', label: 'Update size and pick a table', primary: true }, { k: 'update', label: 'Just update the size' }];
      pushMsg({ type: 'size', pid: p.id, icon: 'users', title: `${shortName(p)} is now ${n} (was ${old})`,
        body: seated ? `They're at ${tNames(p.tableIds)}, which seats up to ${cap.max}.` : (n > old ? `${n - old} more guest${n - old > 1 ? 's' : ''} just showed up.` : `${old - n} guest${old - n > 1 ? 's' : ''} couldn't make it.`) + (cap && !seated ? ` Booked table ${tNames(p.assigned)} seats ${cap.min}–${cap.max}.` : ''),
        options: opts });
    },
    resolve(m, k) {
      const p = P(m.pid); if (!p) return;
      const n = p.flags.newSize; p.size = n;
      const seated = p.status === 'seated';
      if (seated) {
        const cap = capacityOf(SH.layout, p.tableIds);
        if (k === 'chairs') recordCurve('size', `Size change: ${shortName(p)}`, n <= cap.max ? 'good' : 'poor', n <= cap.max ? '' : `Squeezed ${n} at a table for ${cap.max}.`);
        else { const i = recordCurve('size', `Size change: ${shortName(p)}`, n > cap.max ? 'pending' : 'ok', n > cap.max ? '' : 'They fit already. Moving was extra work.'); if (n > cap.max) addGoal('moved', p.id, i, SH.clock + 15, { from: p.tableIds.join() }); if (k === 'move') beginMove(p.id); else beginAddTable(p.id); }
      } else {
        const cap = p.assigned ? capacityOf(SH.layout, p.assigned) : null;
        const fitsBooked = cap && n <= cap.max && n >= cap.min;
        recordCurve('size', `Size change: ${shortName(p)}`, (k === 'seat' || fitsBooked) ? 'good' : 'ok', fitsBooked || k === 'seat' ? '' : `Their booked table ${tNames(p.assigned)} no longer fits.`);
        if (k === 'seat') beginSeat(p.id);
      }
      dirty('size');
    },
  },
  pref: {
    create(p) {
      const tid = p.hidden.wantsTable; const t = tableById(SH.layout, tid);
      const tag = p.tags.includes('vip') ? 'VIP' : 'regular';
      const busy = SH.tables[tid] && SH.tables[tid].state !== 'free';
      pushMsg({ type: 'pref', pid: p.id, icon: 'star', title: `${shortName(p)} (${tag}) asks for table ${t.name}`,
        body: `Party of ${p.size}. "We always sit at ${t.name}." Table ${t.name} is ${busy ? 'occupied right now, about ' + Math.round(expectedFreeAt(tid) - SH.clock) + ' min until it frees up' : 'open'}.`,
        options: [{ k: 'yes', label: busy ? `Promise ${t.name} when it opens` : `Seat them at ${t.name}`, primary: true }, { k: 'no', label: 'Offer the best open table instead' }] });
    },
    resolve(m, k) {
      const p = P(m.pid); if (!p) return;
      const tid = p.hidden.wantsTable;
      if (k === 'yes') {
        p.prefTable = tid;
        const i = recordCurve('pref', `Request: ${shortName(p)}`, 'pending', '');
        addGoal('pref', p.id, i, SH.clock + 30, { tid });
        if (tableIsFree(tid)) beginSeat(p.id, [tid]);
      } else {
        recordCurve('pref', `Request: ${shortName(p)}`, p.tags.includes('vip') ? 'poor' : 'ok', 'Turned down a regular/VIP table request.');
        beginSeat(p.id);
      }
    },
  },
  move: {
    create(p, reason) {
      pushMsg({ type: 'move', pid: p.id, icon: 'move', title: `Table ${tNames(p.tableIds)} wants to move`,
        body: `${shortName(p)} (${p.size}): "${reason || RNG.pick(['It is really drafty by the door.', "We're right under the speaker, can't hear each other.", 'Could we get a booth? My back is killing me.', 'The table next to us is very loud.'])}"`,
        options: [{ k: 'move', label: 'Move them', primary: true }, { k: 'comp', label: 'Apologize and send a round, keep them' }, { k: 'no', label: "Sorry, we're full" }] });
    },
    resolve(m, k) {
      const p = P(m.pid); if (!p || p.status !== 'seated') return;
      if (k === 'move') { const i = recordCurve('move', `Move request: ${shortName(p)}`, 'pending'); addGoal('moved', p.id, i, SH.clock + 10, { from: p.tableIds.join() }); beginMove(p.id); }
      else if (k === 'comp') recordCurve('move', `Move request: ${shortName(p)}`, suggestUnits(p, 2).length ? 'ok' : 'good', suggestUnits(p, 2).length ? 'A table was open. Moving them was possible.' : '');
      else recordCurve('move', `Move request: ${shortName(p)}`, 'poor', 'Flat refusal.');
    },
  },
  big: {
    create() {
      const n = RNG.int(8, 12);
      const p = addParty(newParty({ kind: 'walk', name: partyName(RNG), size: n, origSize: n, status: 'new', addedAt: SH.clock, hidden: walkinHidden(RNG, n), flags: { noLeave: false } }));
      p.flags.bigIdx = true;
      const biggest = Math.max(0, ...seatUnits(SH.layout).map(u => u.max));
      pushMsg({ type: 'big', pid: p.id, icon: 'users', title: `Walk-in party of ${n}`, body: `${shortName(p)} just walked in with ${n} people and no reservation. Your biggest table setup seats ${biggest}.`,
        options: [{ k: 'quote', label: 'Quote them a wait', primary: true }, { k: 'seat', label: 'Combine tables and seat now' }, { k: 'turn', label: 'Politely turn them away' }] });
    },
    resolve(m, k) {
      const p = P(m.pid); if (!p) return;
      const biggest = Math.max(0, ...seatUnits(SH.layout).map(u => u.max));
      const possible = biggest >= p.size;
      if (k === 'turn') { recordCurve('big', `Large walk-in: ${shortName(p)}`, possible ? (isRush() ? 'ok' : 'poor') : 'good', possible ? 'You had the tables to fit them.' : "You couldn't fit them anyway."); turnAway(p); }
      else { recordCurve('big', `Large walk-in: ${shortName(p)}`, possible ? 'good' : 'poor', possible ? '' : `No setup in the room seats ${p.size}.`); if (k === 'quote') openQuoteSheet(p.id); else beginSeat(p.id, null, true); }
    },
  },
  camp: {
    create(p) {
      const w = waitingParties().length;
      pushMsg({ type: 'camp', pid: p.id, icon: 'clock', title: `Table ${tNames(p.tableIds)} paid ${Math.round(SH.clock - p.flags.campFrom)} min ago and is still chatting`,
        body: `${shortName(p)} (${p.size}) is lingering. You have ${w} part${w === 1 ? 'y' : 'ies'} waiting.`,
        options: [{ k: 'bar', label: 'Offer them a drink at the bar', primary: true }, { k: 'stay', label: 'Let them linger' }] });
    },
    resolve(m, k) {
      const p = P(m.pid); if (!p || p.status !== 'seated') return;
      if (k === 'bar') { p.hidden.camp = 0; p.phaseEnd = SH.clock + 3; recordCurve('camp', `Campers: ${shortName(p)}`, 'good'); toast(`${shortName(p)} is heading to the bar. Table frees in a few minutes.`); }
      else recordCurve('camp', `Campers: ${shortName(p)}`, waitingParties().length >= 2 ? 'poor' : 'ok', 'Guests were waiting for that table.');
    },
  },
  brk: {
    create(sec) {
      pushMsg({ type: 'brk', sec: sec.id, icon: 'coffee', title: `${sec.server || sec.name} needs a 20-minute break`,
        body: `${sec.name} section has ${sectionLoad()[sec.id].now} covers on the floor right now.`,
        options: [{ k: 'now', label: 'Approve now, skip their section', primary: true }, { k: 'later', label: 'Ask them to wait 15 minutes' }] });
    },
    resolve(m, k) {
      const sec = sectionById(SH.layout, m.sec); if (!sec) return;
      const from = k === 'now' ? SH.clock : SH.clock + 15;
      SH.breaks[m.sec] = { from, until: from + 20 };
      recordCurve('brk', `Break: ${sec.server || sec.name}`, k === 'now' ? 'good' : 'ok', k === 'now' ? '' : 'Delaying breaks wears out servers.');
      toast(`${sec.server || sec.name} on break ${k === 'now' ? 'now' : 'at ' + fmtTime(from)} until ${fmtTime(from + 20)}. Avoid seating ${sec.name}.`);
    },
  },
  kitchen: {
    create() {
      pushMsg({ type: 'kitchen', icon: 'fire', title: 'Kitchen is backed up', body: 'Chef says tickets are running about 15 minutes behind for the next half hour. Tables will turn slower.',
        options: [{ k: 'pad', label: 'Pad my quotes and pace seating', primary: true }, { k: 'keep', label: 'Keep seating as normal' }] });
    },
    resolve(m, k) {
      SH.kitchen = { from: SH.clock, until: SH.clock + 35, factor: 1.4 };
      recordCurve('kitchen', 'Kitchen backed up', k === 'pad' ? 'good' : 'poor', k === 'pad' ? '' : 'Seating hard into a slow kitchen buries servers.');
      if (k === 'pad') SH.kitchen.padded = true;
    },
  },
};

function fireRandomCurveball() {
  const seated = allParties().filter(p => p.status === 'seated');
  const opts = [];
  const cnt = k => SH.cbCount[k] || 0;
  const freshSeated = seated.filter(p => SH.clock - p.seatedAt < 30 && SH.clock - p.seatedAt > 3 && !p.flags.moveAsked);
  if (freshSeated.length) opts.push(['move', 3]);
  if (seated.length && cnt('sizeSeated') < 2) opts.push(['sizeSeated', 1.5]);
  if (cnt('big') < (SH.type === 'friday' || SH.type === 'holiday' ? 2 : 1) && SH.clock > SH.startMin + 45) opts.push(['big', 1.5]);
  if (cnt('brk') < 2 && SH.clock > SH.startMin + 60) opts.push(['brk', 1.5]);
  if (cnt('kitchen') < 1 && occupancy() > 0.5) opts.push(['kitchen', 2]);
  if (!opts.length) return;
  const k = RNG.weighted(opts);
  SH.cbCount[k] = cnt(k) + 1;
  if (k === 'move') { const p = RNG.pick(freshSeated); p.flags.moveAsked = true; CB.move.create(p); }
  else if (k === 'sizeSeated') { const p = RNG.pick(seated); CB.size.create(p, p.size >= 4 && RNG.chance(0.3) ? -1 : RNG.int(1, 2)); }
  else if (k === 'big') CB.big.create();
  else if (k === 'brk') {
    const secs = SH.layout.sections.filter(s => SH.layout.tables.some(t => t.sectionId === s.id) && !SH.breaks[s.id]);
    if (secs.length) CB.brk.create(RNG.pick(secs));
  } else if (k === 'kitchen') CB.kitchen.create();
}

function resolveMsg(id, k) {
  const i = SH.msgs.findIndex(m => m.id === id);
  if (i < 0) return;
  const m = SH.msgs.splice(i, 1)[0];
  try { (CB[m.type] && CB[m.type].resolve) && CB[m.type].resolve(m, k); } catch (e) { console.error(e); }
  if (!SH.msgs.length && SH.pausedForMsg) { SH.pausedForMsg = false; if (!selection) SH.speed = SH.prevSpeed || 1; else SH.resumeAfterSelect = true; }
  tutorialEvent('msg');
  dirty('msg');
}
