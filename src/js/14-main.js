/* ---------- boot ---------- */
function boot() {
  loadDB();
  $('#nav').innerHTML = [['service', 'service', 'Service'], ['editor', 'floor', 'Floor plan'], ['history', 'history', 'History'], ['settings', 'settings', 'Settings'], ['help', 'help', 'Help']]
    .map(([v, ic, l]) => `<button data-act="view" data-view="${v}" aria-label="${l}">${icon(ic)}<span>${l}</span></button>`).join('');
  applyTheme();
  $('#brand-venue').textContent = S().venue;
  if (DB.shift && !DB.shift.ended) {
    SH = DB.shift; SH.speed = 0;
    setTimeout(() => toast('Resumed your shift where you left off. The clock is paused.'), 300);
  }
  checkNarrow();
  window.addEventListener('resize', checkNarrow);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && SH && !SH.ended) { if (SH.speed > 0) { SH.prevSpeed = SH.speed; SH.speed = 0; SH.autoPaused = true; } DB.shift = SH; saveDB(); }
    else if (!document.hidden && SH && SH.autoPaused) { SH.autoPaused = false; toast('Clock paused while the app was in the background.'); dirty(); }
  });
  window.addEventListener('pagehide', () => { if (SH && !SH.ended) { DB.shift = SH; } saveDB(); });
  document.addEventListener('keydown', e => {
    if (e.target.matches('input,textarea,select')) return;
    if (e.key === 'Escape') { if (sheet) closeSheet(); else if (selection) clearSelection(); }
    if (e.key === ' ' && SH && !SH.ended && UI.view === 'service') { e.preventDefault(); setSpeed(SH.speed ? 0 : (SH.prevSpeed || 1)); }
    if (e.key === 'Enter' && e.target.matches('[role=button]')) e.target.click();
  });
  showView('service');
  if (!DB.welcomed) {
    DB.welcomed = true; saveDB();
    openSheet(() => sheetHead(`Welcome to Covers`, `Host stand practice for ${esc(S().venue)}`) + `<div class="sheet-body"><p>Practice running the door: seat reservations and walk-ins, quote waits, manage table turns and handle curveballs on a simulated shift.</p><p>A sample floor plan is loaded. You can change it any time in <b>Floor plan</b>.</p></div><div class="sheet-foot"><button class="btn" data-act="close-sheet">Look around first</button><button class="btn primary" data-act="welcome-tut">Start the tutorial</button></div>`);
  }
  requestAnimationFrame(frame);
}
ACT['welcome-tut'] = () => { closeSheet(); ACT['start-tutorial'](); };
// test hook for automated checks
window.__covers = { get SH() { return SH; }, get DB() { return DB; }, simStep, estimateWait, busTable, commitAction, startShift, endShift, seatCheck, suggestUnits, attemptAction, beginSeat, quoteParty, resolveMsg, buildReport, P, allParties, renderNow, UI, ED };
boot();
