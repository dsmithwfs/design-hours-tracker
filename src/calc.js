// calc.js — pure, side-effect-free logic shared by the app and the unit tests.
// Loads as a browser global (attached to window) AND as a Node module
// (module.exports) so test/calc.test.js can require it directly.
// Keep this file free of DOM, localStorage, and Firebase references.

(function (root) {
  'use strict';

  // Returns a new Date snapped to the Monday of that date's week, at local midnight.
  function mondayOf(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay(); // 0 = Sun
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    return d;
  }

  // Local YYYY-MM-DD (avoids the UTC shift of Date.toISOString()).
  function localISODate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Sum of `hours` across a day's entries, tolerant of strings/blanks.
  function dayTotalHours(entries) {
    return entries.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);
  }

  // Split a week's entries into regular-time / overtime per job and per
  // job+cost-code row, with OT kicking in after 40 cumulative hours.
  // Special categories (PTO/HOL/…) are tallied separately, never as OT.
  function computeWeekRtOt(weekKeys, allEntries) {
    let running = 0;
    const byJob = {};
    const byRow = {};
    const special = { MTG:[0,0,0,0,0,0,0], TRG:[0,0,0,0,0,0,0],
                      HOL:[0,0,0,0,0,0,0], PTO:[0,0,0,0,0,0,0], BRV:[0,0,0,0,0,0,0] };

    weekKeys.forEach((key, dayIdx) => {
      (allEntries[key] || []).forEach(e => {
        const h = parseFloat(e.hours) || 0;

        if (e.type && special[e.type] !== undefined) {
          special[e.type][dayIdx] += h;
          return;
        }

        const cc  = e.costCode || 'Overhead';
        const rtH = Math.min(h, Math.max(0, 40 - running));
        const otH = h - rtH;
        running  += h;

        if (!byJob[e.job]) byJob[e.job] = { rt:[0,0,0,0,0,0,0], ot:[0,0,0,0,0,0,0] };
        byJob[e.job].rt[dayIdx] += rtH;
        byJob[e.job].ot[dayIdx] += otH;

        const rk = `${e.job}||${cc}`;
        if (!byRow[rk]) byRow[rk] = { jobLabel: e.job, costCode: cc, rt:[0,0,0,0,0,0,0], ot:[0,0,0,0,0,0,0] };
        byRow[rk].rt[dayIdx] += rtH;
        byRow[rk].ot[dayIdx] += otH;
      });
    });

    return { byJob, byRow, special };
  }

  const api = { mondayOf, localISODate, dayTotalHours, computeWeekRtOt };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  // Expose as globals so the (non-module) app scripts can call them directly.
  Object.assign(root, api);
}(typeof window !== 'undefined' ? window : globalThis));
