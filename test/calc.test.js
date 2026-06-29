// Unit tests for the pure logic in src/calc.js.
// Run with:  npm test   (no dependencies — uses node:assert + node:test)

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mondayOf, localISODate, dayTotalHours, computeWeekRtOt } = require('../src/calc.js');

test('mondayOf snaps every weekday to the same Monday', () => {
  // Mon Jun 22 2026 … Sun Jun 28 2026 all belong to the week starting Jun 22.
  const expected = '2026-06-22';
  for (let day = 22; day <= 28; day++) {
    const d = new Date(2026, 5, day, 15, 30); // mid-afternoon, non-midnight
    assert.equal(localISODate(mondayOf(d)), expected, `day ${day}`);
  }
});

test('mondayOf treats Sunday as the end of the prior week, not the start', () => {
  const sunday = new Date(2026, 5, 28); // Sun
  assert.equal(localISODate(mondayOf(sunday)), '2026-06-22');
});

test('mondayOf returns local midnight', () => {
  const m = mondayOf(new Date(2026, 5, 24, 9, 0));
  assert.equal(m.getHours(), 0);
  assert.equal(m.getMinutes(), 0);
  assert.equal(m.getSeconds(), 0);
});

test('localISODate uses local date, not UTC (no midnight rollover)', () => {
  // 11:30pm local on Jun 24 must stay Jun 24 regardless of timezone offset.
  const late = new Date(2026, 5, 24, 23, 30);
  assert.equal(localISODate(late), '2026-06-24');
});

test('localISODate zero-pads month and day', () => {
  assert.equal(localISODate(new Date(2026, 0, 5)), '2026-01-05');
});

test('dayTotalHours sums numbers and numeric strings, ignoring blanks', () => {
  assert.equal(dayTotalHours([{ hours: 2 }, { hours: '3.5' }, { hours: '' }, {}]), 5.5);
  assert.equal(dayTotalHours([]), 0);
});

test('computeWeekRtOt: under 40 hrs is all regular time, no OT', () => {
  const keys = ['k0','k1','k2','k3','k4'];
  const entries = {
    k0: [{ job: 'A', costCode: 'Pump', hours: 8 }],
    k1: [{ job: 'A', costCode: 'Pump', hours: 8 }],
    k2: [{ job: 'A', costCode: 'Pump', hours: 8 }],
    k3: [{ job: 'A', costCode: 'Pump', hours: 8 }],
    k4: [{ job: 'A', costCode: 'Pump', hours: 7 }],
  };
  const { byJob } = computeWeekRtOt(keys, entries);
  assert.equal(byJob.A.rt.reduce((s, v) => s + v, 0), 39);
  assert.equal(byJob.A.ot.reduce((s, v) => s + v, 0), 0);
});

test('computeWeekRtOt: hours past 40 cumulative spill into OT', () => {
  const keys = ['k0','k1','k2','k3','k4'];
  const entries = {
    k0: [{ job: 'A', hours: 10 }],
    k1: [{ job: 'A', hours: 10 }],
    k2: [{ job: 'A', hours: 10 }],
    k3: [{ job: 'A', hours: 10 }], // hits 40 here
    k4: [{ job: 'A', hours: 5 }],  // all OT
  };
  const { byJob } = computeWeekRtOt(keys, entries);
  assert.equal(byJob.A.rt.reduce((s, v) => s + v, 0), 40);
  assert.equal(byJob.A.ot.reduce((s, v) => s + v, 0), 5);
  assert.equal(byJob.A.ot[4], 5); // the OT lands on day 5
});

test('computeWeekRtOt: a single 50h day splits 40 RT / 10 OT', () => {
  const { byJob } = computeWeekRtOt(['d'], { d: [{ job: 'A', hours: 50 }] });
  assert.equal(byJob.A.rt[0], 40);
  assert.equal(byJob.A.ot[0], 10);
});

test('computeWeekRtOt: special categories tally separately and never as OT', () => {
  const keys = ['k0','k1'];
  const entries = {
    k0: [{ type: 'HOL', hours: 8 }],
    k1: [{ job: 'A', hours: 8 }],
  };
  const { byJob, special } = computeWeekRtOt(keys, entries);
  assert.equal(special.HOL[0], 8);
  assert.equal(byJob.A.rt[1], 8);   // the holiday did NOT advance the 40h OT threshold
  assert.equal(byJob.A.ot[1], 0);
});

test('computeWeekRtOt: missing costCode rows default to Overhead', () => {
  const { byRow } = computeWeekRtOt(['d'], { d: [{ job: 'A', hours: 4 }] });
  assert.ok(byRow['A||Overhead'], 'row keyed with Overhead default');
  assert.equal(byRow['A||Overhead'].rt[0], 4);
});
