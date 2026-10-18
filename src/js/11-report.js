/* ---------- scoring, report and history ---------- */
const avg = a => a.length ? sum(a) / a.length : 0;
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
const lin = (v, a, b) => clamp((v - a) / (b - a) * 100, 0, 100); // a->0, b->100

function buildReport(sh) {
  const ps = sh.order.map(id => sh.parties[id]);
  const seated = ps.filter(p => p.seatedAt != null);
  const covers = sum(seated, p => p.size);
  const res = ps.filter(p => p.kind === 'res' && p.status !== 'cancelled' && (p.resTime <= sh.clock || p.status !== 'booked'));
  const resSeated = res.filter(p => p.seatedAt != null);
  const resWaits = resSeated.map(p => Math.max(0, p.seatedAt - partyWaitStart(p)));
  const onTime = resWaits.filter(w => w <= 10).length;
  const noShows = res.filter(p => p.status === 'noshow').length;
  const walks = ps.filter(p => p.kind === 'walk' && p.status !== 'cancelled');
  const walkSeated = walks.filter(p => p.seatedAt != null);
  const walkWaits = walkSeated.map(p => p.seatedAt - p.addedAt);
  const quoted = walkSeated.filter(p => p.quote != null && p.quotedAt != null);
  const errs = quoted.map(p => (p.seatedAt - p.addedAt) - p.quote);
  const accurate = errs.filter(e => e <= 5 && e >= -10).length;
  const under = errs.filter(e => e > 5), over = errs.filter(e => e < -10);
  const walked = ps.filter(p => p.status === 'walked');
  const ignored = walked.filter(p => p.kind === 'walk' && p.quote == null).length;
  const declined = ps.filter(p => p.status === 'declined');
  const turned = ps.filter(p => p.status === 'turned');
  const arrivedCovers = sum(ps.filter(p => p.seatedAt != null || p.status === 'walked' || p.status === 'declined' || p.status === 'arrived' || p.status === 'waiting' || p.status === 'new'), p => p.size);
  const walkedCovers = sum(walked, p => p.size);
  const eff = sh.stats.capMin ? sh.stats.seatMin / sh.stats.capMin : 1;
  const bigWaste = seated.filter(p => capacityOf(sh.layout, p.tableIds).max - p.size >= 3).map(p => `${p.size} at ${tNames(p.tableIds)}`);
  // server balance: covers per seat in each section
  const secs = sh.layout.sections.map(s => {
    const tabs = sh.layout.tables.filter(t => t.sectionId === s.id);
    return { name: s.name, bar: tabs.length > 0 && tabs.every(t => t.shape === 'bar'), server: s.server || s.name, color: s.color, seats: sum(tabs, t => t.max), covers: sum(seated.filter(p => p.sectionId === s.id), p => p.size) };
  }).filter(s => s.seats > 0 && !s.bar);
  const ratios = secs.map(s => s.covers / s.seats);
  const mean = avg(ratios);
  const cv = mean ? Math.sqrt(avg(ratios.map(r => (r - mean) ** 2))) / mean : 0;
  const curve = sh.stats.curve.map(c => Object.assign({}, c, { result: c.result === 'pending' ? 'poor' : c.result }));
  const cvScore = curve.length ? avg(curve.map(c => ({ good: 100, ok: 60, poor: 15 }[c.result] ?? 0))) : null;
  const ov = {}; sh.stats.overrides.forEach(o => ov[o.type] = (ov[o.type] || 0) + 1);
  const ovTotal = sh.stats.overrides.length;

  const comp = {
    onTime: resSeated.length ? { score: pct(onTime, resSeated.length), w: 18, label: 'Reservations on time' } : null,
    wait: seated.length ? { score: Math.round(clamp(100 - Math.max(0, avg(resWaits) - 3) * 4 - Math.max(0, avg(under) ) * 1.2 * (under.length / Math.max(1, errs.length)), 0, 100)), w: 12, label: 'Guest wait' } : null,
    quote: errs.length ? { score: pct(accurate, errs.length), w: 14, label: 'Quote accuracy' } : null,
    walkouts: arrivedCovers ? { score: Math.round(clamp(100 - (walkedCovers / arrivedCovers) * 400, 0, 100)), w: 16, label: 'Walk-outs' } : null,
    eff: seated.length ? { score: Math.round(lin(eff, 0.55, 0.88)), w: 10, label: 'Seat efficiency' } : null,
    balance: secs.length > 1 && covers > 0 ? { score: Math.round(clamp(100 - cv * 120, 0, 100)), w: 10, label: 'Server balance' } : null,
    curve: cvScore != null ? { score: Math.round(cvScore), w: 10, label: 'Curveballs' } : null,
    discipline: seated.length ? { score: Math.round(clamp(100 - ovTotal * 9, 0, 100)), w: 10, label: 'Floor discipline' } : null,
  };
  const active = Object.entries(comp).filter(([, c]) => c);
  const tw = sum(active, ([, c]) => c.w);
  const score = tw ? Math.round(sum(active, ([, c]) => c.score * c.w) / tw) : 0;
  const grade = gradeFor(score);

  const m = {
    covers, parties: seated.length, resTotal: res.length, resSeated: resSeated.length, onTime, noShows,
    avgResWait: Math.round(avg(resWaits) * 10) / 10, avgWalkWait: Math.round(avg(walkWaits) * 10) / 10,
    quoted: errs.length, accurate, under: under.length, over: over.length, avgUnder: Math.round(avg(under)), avgOver: Math.round(-avg(over)),
    walked: walked.length, walkedCovers, ignored, declined: declined.length, declinedCovers: sum(declined, p => p.size), turned: turned.length,
    eff: Math.round(eff * 100), bigWaste: bigWaste.length, secs, overrides: ov, ovTotal,
    curveTotal: curve.length, curveGood: curve.filter(c => c.result === 'good').length,
  };
  const tips = buildTips(comp, m, curve, bigWaste);
  return { id: sh.id, date: Date.now(), type: sh.type, venue: sh.venue, layoutName: sh.layout.name, score, grade, comp, m, tips, curve, shiftStart: sh.startMin, shiftEnd: sh.endMin };
}
function gradeFor(s) {
  const L = s >= 90 ? 'A' : s >= 80 ? 'B' : s >= 70 ? 'C' : s >= 60 ? 'D' : 'F';
  if (L === 'F') return 'F';
  const r = s % 10;
  return L + (s >= 97 ? '+' : L !== 'A' && r >= 7 ? '+' : r <= 2 ? '−' : '');
}

function buildTips(comp, m, curve, bigWaste) {
  const T = {
    onTime: () => `Only ${m.onTime} of ${m.resSeated} reservations sat within 10 minutes of arriving. Look ${S().heldWindow} minutes ahead: keep booked tables clear, bus them the moment they turn, and seat checked-in reservations before new walk-ins.`,
    wait: () => `Reservations waited ${m.avgResWait} min on average${m.under ? ` and ${m.under} walk-in parties waited past their quote` : ''}. Seat from the table sheet as soon as a table turns red (needs clearing); tap Bus table yourself instead of waiting for the busser.`,
    quote: () => m.under >= m.over
      ? `You under-quoted ${m.under} of ${m.quoted} waitlist parties; they waited about ${m.avgUnder} min longer than promised. Count the similar-sized parties ahead of them and add 10 minutes when the room is over ${S().rushPct}% full.`
      : `You over-quoted ${m.over} of ${m.quoted} parties; they sat about ${m.avgOver} min sooner than told.${m.declined ? ` ${m.declined} part${m.declined === 1 ? 'y' : 'ies'} walked away from long quotes.` : ''} Quote what the floor will really deliver: check the Seated tab for tables close to turning.`,
    walkouts: () => `${m.walked} part${m.walked === 1 ? 'y' : 'ies'} (${m.walkedCovers} covers) walked out${m.ignored ? `, ${m.ignored} of them never got a quote` : ''}. Greet and quote every walk-in within two minutes, and check the Waitlist tab for red over-quote timers.`,
    eff: () => `Seat efficiency was ${m.eff}%.${bigWaste.length ? ` Examples: ${bigWaste.slice(0, 3).join(', ')}.` : ''} During a rush, save 6-tops and booths for parties of 4 or more; put 2s on two-tops or the bar.`,
    balance: () => { const s = m.secs.slice().sort((a, b) => b.covers / b.seats - a.covers / a.seats); return `${s[0].server} (${s[0].name}) took ${s[0].covers} covers while ${s[s.length - 1].server} (${s[s.length - 1].name}) had ${s[s.length - 1].covers}. Rotate: the next party goes to the server who was sat longest ago, and watch the cover counts above the tabs.`; },
    curve: () => { const bad = curve.filter(c => c.result === 'poor'); return `${m.curveGood} of ${m.curveTotal} curveballs went well.${bad.length ? ` Weakest: ${bad[0].title}${bad[0].note ? ' (' + bad[0].note.replace(/\.$/, '') + ')' : ''}.` : ''} Follow through after you promise something: move the table, or seat the guest at the table they asked for.`; },
    discipline: () => { const parts = Object.entries(m.overrides).map(([k, n]) => `${n} ${({ small: 'too-small tables', waste: 'wasted big tables', blocked: 'reserved-soon tables', overload: 'server overloads', unbussed: 'dirty tables', pref: 'ignored requests' })[k] || k}`); return `You seated past ${m.ovTotal} warnings (${parts.join(', ')}). Each one is a guest or a server who feels it later. When a warning pops up, try the no-warning options it suggests first.`; },
  };
  const ranked = Object.entries(comp).filter(([, c]) => c && c.score < 92).sort((a, b) => a[1].score - b[1].score);
  const tips = ranked.slice(0, 3).map(([k]) => ({ k, text: T[k]() }));
  const extra = [
    { k: 'x1', text: 'Practice a harder shift: Friday rush or Holiday at 10× speed with curveballs on High.' },
    { k: 'x2', text: 'Use Combine for big parties before you need it: pre-plan which tables you will push together when the 8-top arrives.' },
    { k: 'x3', text: 'Try turning off the turn timers in Settings so you have to read the table colors like on a real floor.' },
  ];
  while (tips.length < 3) tips.push(extra[tips.length]);
  return tips;
}

const COMP_ICON = { onTime: 'clock', wait: 'users', quote: 'clock', walkouts: 'walk', eff: 'chair', balance: 'users', curve: 'bell', discipline: 'alert' };
function compDetail(k, m) {
  return {
    onTime: `${m.onTime}/${m.resSeated} sat within 10 min · ${m.noShows} no-shows`,
    wait: `Reservations ${m.avgResWait}m · walk-ins ${m.avgWalkWait}m avg`,
    quote: `${m.accurate}/${m.quoted} accurate · ${m.under} under · ${m.over} over`,
    walkouts: `${m.walked} parties (${m.walkedCovers} covers) left · ${m.declined} declined quote · ${m.turned} turned away`,
    eff: `${m.eff}% of seats at seated tables used · ${m.bigWaste} small parties at big tables`,
    balance: m.secs.map(s => `${esc(s.server)} ${s.covers}`).join(' · '),
    curve: `${m.curveGood}/${m.curveTotal} handled well`,
    discipline: `${m.ovTotal} warnings overridden`,
  }[k];
}

function reportHTML(rep, live) {
  if (!rep) return '';
  const m = rep.m;
  const tut = rep.type === 'tutorial';
  const comps = Object.entries(rep.comp).filter(([, c]) => c);
  return `<div class="page report">
    <div class="rep-head">
      <div class="grade-block g-${rep.grade[0]}"><span class="grade-l">${rep.grade}</span><span class="grade-s">${rep.score}/100</span></div>
      <div class="rep-title"><div class="eyebrow">${esc(rep.venue || S().venue)} · ${esc(SHIFT_TYPES[rep.type] ? SHIFT_TYPES[rep.type].name : rep.type)} · ${fmtDate(rep.date)}</div>
        <h1>${tut ? 'Tutorial complete' : 'Shift report'}</h1>
        <p class="lede">${m.covers} covers across ${m.parties} parties. ${m.resSeated}/${m.resTotal} reservations seated, ${m.walked} walk-outs.</p></div>
    </div>
    <div class="rep-cols">
      <div class="rep-main">
        <h2>What to work on</h2>
        <ol class="tips">${rep.tips.map(t => `<li>${esc(t.text)}</li>`).join('')}</ol>
        <h2>Scorecard</h2>
        <div class="scorecard">${comps.map(([k, c]) => `<div class="sc-row"><span class="sc-ic">${icon(COMP_ICON[k])}</span><div class="sc-main"><div class="sc-top"><b>${c.label}</b><span class="sc-val">${c.score}</span></div><div class="sc-bar"><i class="${c.score >= 80 ? 'ok' : c.score >= 60 ? 'warn' : 'bad'}" style="width:${c.score}%"></i></div><div class="sc-detail">${compDetail(k, m)}</div></div></div>`).join('')}</div>
      </div>
      <div class="rep-side">
        <h2>Numbers</h2>
        <dl class="nums">
          <div><dt>Covers seated</dt><dd>${m.covers}</dd></div>
          <div><dt>Avg reservation wait</dt><dd>${m.avgResWait}m</dd></div>
          <div><dt>Avg walk-in wait</dt><dd>${m.avgWalkWait}m</dd></div>
          <div><dt>Quote accuracy</dt><dd>${m.quoted ? pct(m.accurate, m.quoted) + '%' : 'n/a'}</dd></div>
          <div><dt>Walked out</dt><dd>${m.walked} <small>(${m.walkedCovers} covers)</small></dd></div>
          <div><dt>Seat efficiency</dt><dd>${m.eff}%</dd></div>
          <div><dt>Reservations on time</dt><dd>${m.resSeated ? pct(m.onTime, m.resSeated) + '%' : 'n/a'}</dd></div>
          <div><dt>Curveballs handled well</dt><dd>${m.curveGood}/${m.curveTotal}</dd></div>
        </dl>
        ${m.secs.length ? `<h2>Covers by server</h2><div class="secbars">${(() => { const mx = Math.max(1, ...m.secs.map(s => s.covers)); return m.secs.map(s => `<div class="secbar"><span class="sb-n"><span class="dot" style="background:${s.color}"></span>${esc(s.server)}</span><span class="sb-track"><i style="width:${s.covers / mx * 100}%;background:${s.color}"></i></span><span class="sb-v">${s.covers}</span></div>`).join(''); })()}</div>` : ''}
        ${rep.curve.length ? `<h2>Curveballs</h2><ul class="cblist">${rep.curve.map(c => `<li class="r-${c.result}"><span class="pill ${c.result === 'good' ? 'ok' : c.result === 'ok' ? 'warn' : 'bad'}">${c.result === 'good' ? 'Good' : c.result === 'ok' ? 'Okay' : 'Missed'}</span><span>${esc(c.title)}${c.note ? `<small>${esc(c.note)}</small>` : ''}</span></li>`).join('')}</ul>` : ''}
      </div>
    </div>
    <div class="row-btns center">${live ? `<button class="btn primary lg" data-act="new-shift">${icon('play')} Start another shift</button>` : `<button class="btn" data-act="close-sheet">Close</button>`}${live ? `<button class="btn" data-act="view" data-view="history">${icon('history')} History</button>` : ''}</div>
  </div>`;
}

/* ----- history page ----- */
function renderHistory() {
  const root = $('#v-history');
  const H = DB.history.filter(h => h.type !== 'tutorial');
  if (!H.length) { setHTML(root, `<div class="page"><h1>Shift history</h1><div class="empty big">${icon('history')}<p>No shifts yet. Finish a shift and your grade shows up here so you can track progress.</p><button class="btn primary" data-act="view" data-view="service">Go to Service</button></div></div>`); return; }
  const recent = H.slice(-20);
  const best = H.reduce((a, b) => b.score > a.score ? b : a, H[0]);
  const last5 = avg(H.slice(-5).map(h => h.score)), prev5 = H.length > 5 ? avg(H.slice(-10, -5).map(h => h.score)) : null;
  setHTML(root, `<div class="page history">
    <h1>Shift history</h1>
    <div class="hist-sum">
      <div><span class="muted small">Shifts</span><b>${H.length}</b></div>
      <div><span class="muted small">Last 5 average</span><b>${Math.round(last5)}</b>${prev5 != null ? `<span class="small ${last5 >= prev5 ? 'ok-t' : 'bad-t'}">${last5 >= prev5 ? '+' : ''}${Math.round(last5 - prev5)} vs the 5 before</span>` : ''}</div>
      <div><span class="muted small">Best</span><b>${best.grade} <small>${best.score}</small></b></div>
    </div>
    <div class="chart-card"><div class="chart-title">Score by shift <span class="muted small">last ${recent.length}</span></div>${scoreChart(recent)}</div>
    <div class="hist-list">${H.slice().reverse().map(h => `<button class="hist-row" data-act="hist-open" data-id="${h.id}"><b class="grade g-${h.grade[0]}">${h.grade}</b><span class="hr-main"><b>${esc(SHIFT_TYPES[h.type] ? SHIFT_TYPES[h.type].name : h.type)}</b><span class="muted small">${fmtDate(h.date)} · ${esc(h.layoutName || '')}</span></span><span class="hr-num"><b>${h.m.covers}</b><span class="muted small">covers</span></span><span class="hr-num"><b>${h.score}</b><span class="muted small">score</span></span></button>`).join('')}</div>
    <div class="row-btns"><button class="btn ghost" data-act="hist-clear">${icon('trash')} Clear history</button></div>
  </div>`);
}
function scoreChart(H) {
  const W = 640, Ht = 200, pl = 34, pr = 16, pt = 14, pb = 26;
  const n = H.length;
  const x = i => n === 1 ? pl + (W - pl - pr) / 2 : pl + i * (W - pl - pr) / (n - 1);
  const y = v => pt + (100 - v) / 100 * (Ht - pt - pb);
  const grid = [0, 25, 50, 75, 100].map(v => `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${pl - 6}" y="${y(v) + 3.5}" text-anchor="end">${v}</text>`).join('');
  const pts = H.map((h, i) => [x(i), y(h.score)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = n > 1 ? `<path class="area" d="${line} L${pts[n - 1][0]} ${y(0)} L${pts[0][0]} ${y(0)} Z"/>` : '';
  const dots = H.map((h, i) => `<g class="pt" tabindex="0" data-act="hist-open" data-id="${h.id}"><circle class="hit" cx="${pts[i][0]}" cy="${pts[i][1]}" r="14"/><circle class="dot${i === n - 1 ? ' end' : ''}" cx="${pts[i][0]}" cy="${pts[i][1]}" r="${i === n - 1 ? 5 : 4}"/><title>${esc((SHIFT_TYPES[h.type] || {}).name || h.type)} · ${fmtDate(h.date)} · ${h.grade} (${h.score})</title></g>`).join('');
  const lastLbl = `<text class="lbl" x="${pts[n - 1][0]}" y="${pts[n - 1][1] - 10}" text-anchor="${n > 1 ? 'end' : 'middle'}">${H[n - 1].score}</text>`;
  return `<div class="chart-wrap"><svg class="chart" viewBox="0 0 ${W} ${Ht}" role="img" aria-label="Score per shift, oldest to newest">${grid}${area}<path class="line" d="${line}"/>${dots}${lastLbl}<text class="ax" x="${pl}" y="${Ht - 6}">oldest</text><text class="ax" x="${W - pr}" y="${Ht - 6}" text-anchor="end">newest</text></svg></div>`;
}
ACT['hist-open'] = el => { const h = DB.history.find(x => x.id === el.dataset.id); if (h) openSheet(() => reportHTML(h, false), { cls: 'wide' }); };
ACT['hist-clear'] = async () => { if (await askConfirm({ title: 'Clear all shift history?', body: 'Your grades and reports are deleted. Layouts and settings stay.', ok: 'Clear', danger: true })) { DB.history = []; saveDB(); dirty(); } };
