const C = require('../public/calc.js');
let pass = 0, fail = 0;
const eq = (name, a, b) => { if (JSON.stringify(a) === JSON.stringify(b)) pass++; else { fail++; console.log('FAIL', name, 'got', a, 'want', b); } };
function mk(start = '2026-01-01') { const S = C.emptyState(); S.settings = C.defaultSettings(start); return S; }
const done = (S, taskId, date, v) => { const id = C.occId(taskId, date); S.occ[id] = { id, taskId, localDate: date, status: 'completed', valuePence: v ?? S.settings.tasks[taskId].valuePence, completedAt: date + 'T08:00:00Z', updatedAt: date + 'T08:00:00Z' }; };
const exc = (S, taskId, date) => { const id = C.occId(taskId, date); S.occ[id] = { id, taskId, localDate: date, status: 'excused', valuePence: 0, updatedAt: date + 'T08:00:00Z' }; };
function college16(S, ym) { const ds = C.monthDates(ym).filter(d => C.weekday(d) <= 5).slice(0, 16); S.months[ym] = { collegeDates: ds }; return ds; }
function fullMonth(S, ym) {
  const cd = college16(S, ym);
  C.monthDates(ym).forEach(d => done(S, 'morning', d));
  cd.forEach(d => done(S, 'college', d));
  const weeks = C.planWeeks(S, ym);
  for (const id of ['room', 'meal', 'bath']) weeks.slice(0, 4).forEach(m => done(S, id, m < C.monthStart(ym) ? C.monthStart(ym) : m));
}
// Dates
eq('london summer', C.todayLondon(new Date('2026-06-30T23:30:00Z')), '2026-07-01');
eq('london winter', C.todayLondon(new Date('2026-12-31T23:30:00Z')), '2026-12-31');
eq('dst day', C.addDays('2026-03-28', 1), '2026-03-29');
eq('dst day2', C.addDays('2026-10-24', 2), '2026-10-26');
// Month lengths: task max
for (const [ym, want] of [['2026-10', 27300], ['2026-11', 27000], ['2028-02', 26700], ['2026-02', 26400]]) {
  const S = mk(); college16(S, ym); eq('max ' + ym, C.monthSummary(S, ym, '2020-01-01').possible, want);
}
// Full 31-day month -> 233 + 50
{ const S = mk(); fullMonth(S, '2026-10'); const s = C.monthSummary(S, '2026-10', '2026-11-05'); eq('full earned', s.earned, 27300); eq('full bonus', s.bonus, 5000); eq('full total', s.total, 32300); eq('full pct', s.ratePct, 100); }
// Missed-days bonus: 6 of 8 so far -> 2 missed -> £30 level, indicative, released on the 1st
{ const S = mk(); const cd = college16(S, '2026-10');
  cd.slice(0, 8).forEach((d, i) => { if (i !== 2 && i !== 5) done(S, 'college', d); });
  const today = C.addDays(cd[7], 1);
  let s = C.monthSummary(S, '2026-10', today); eq('asat counted', s.counted, 8); eq('asat missed', s.missed, 2); eq('asat bonus', s.bonus, 3000); eq('asat allowance', s.allowance, 0); eq('asat lower', s.lower && s.lower.bonusPence, 2000); eq('asat not released', s.released, false);
  eq('bonus not in ledger yet', C.ledger(S, today).bonuses, 0);
  eq('released 1st next month', C.monthSummary(S, '2026-10', '2026-11-01').released, true);
  eq('month end: unattended days are missed', C.monthSummary(S, '2026-10', '2026-11-01').bonus, 0);
}
// Every band in a 16-day month
{ const want = { 0: 5000, 1: 3000, 2: 3000, 3: 2000, 4: 2000, 5: 1000, 6: 1000, 7: 0, 10: 0 };
  for (const [m, b] of Object.entries(want)) { const S = mk(); const cd = college16(S, '2026-10'); cd.slice(Number(m)).forEach(d => done(S, 'college', d)); eq('missed ' + m, C.monthSummary(S, '2026-10', '2026-11-01').bonus, b); }
  eq('levelFor 0', C.levelFor(0).bonusPence, 5000); eq('levelFor 7', C.levelFor(7), null); eq('bonusForMissed 6', C.bonusForMissed(6), 1000);
}
// Excused days are never missed; today's unmarked day isn't missed; other tasks don't matter
{ const S = mk(); const cd = college16(S, '2026-10'); cd.slice(0, 3).forEach(d => done(S, 'college', d)); exc(S, 'college', cd[3]);
  C.monthDates('2026-10').slice(0, 10).forEach(d => done(S, 'morning', d));
  const s = C.monthSummary(S, '2026-10', cd[4]); eq('excused not missed', s.missed, 0); eq('today not missed', s.remainingDays, 12); eq('£50 so far', s.bonus, 5000); eq('allowance at top', s.allowance, 0);
}
// Allowance counts down within a band
{ const S = mk(); const cd = college16(S, '2026-10'); cd.slice(1, 4).forEach(d => done(S, 'college', d)); // 1 missed
  const s = C.monthSummary(S, '2026-10', cd[4]); eq('1 missed £30', s.bonus, 3000); eq('1 more allowed', s.allowance, 1);
  eq('best keeps level', s.best.bonus, 3000); eq('best extra', s.best.extraPence, 12 * 500);
}
// Cost of missing today's college day
{ const cases = [[0, 2500], [1, 500], [2, 1500], [4, 1500], [6, 1500], [7, 500]];
  for (const [m, cost] of cases) { const S = mk(); const cd = college16(S, '2026-10'); cd.slice(m, 8).forEach(d => done(S, 'college', d));
    const k = C.collegeStakeToday(S, cd[8]); eq('stake open ' + m, k.status, 'open'); eq('stake cost missed ' + m, k.totalPence, cost); }
  const S = mk(); const cd = college16(S, '2026-10'); cd.slice(0, 9).forEach(d => done(S, 'college', d));
  const k = C.collegeStakeToday(S, cd[8]); eq('stake attended', k.status, 'attended'); eq('stake attended keeps', k.totalPence, 2500);
  eq('no stake on non-college day', C.collegeStakeToday(S, '2026-10-03'), null);
}
// Earned today, including a bonus drop from missing today's college day
{ const S = mk(); const cd = college16(S, '2026-10'); cd.slice(0, 8).forEach(d => done(S, 'college', d)); const d = cd[8];
  done(S, 'morning', d); let e = C.earnedToday(S, d); eq('today tasks', e.totalPence, 300);
  done(S, 'college', d); e = C.earnedToday(S, d); eq('today tasks + college', e.totalPence, 800); eq('no bonus change when attended', e.bonusDeltaPence, 0);
  S.occ[C.occId('college', d)] = { id: C.occId('college', d), taskId: 'college', localDate: d, status: 'missed', valuePence: 0 };
  e = C.earnedToday(S, d); eq('miss drops platinum->gold', e.bonusDeltaPence, -2000); eq('today net negative', e.totalPence, -1700); eq('from tier', e.fromLevel.tier, 'platinum'); eq('to tier', e.toLevel.tier, 'gold');
}
// No college days planned -> no bonus; planned but none yet -> £50 level
{ const S = mk(); eq('no plan', C.monthSummary(S, '2026-10', '2026-10-01').bonus, 0);
  college16(S, '2026-10'); const s = C.monthSummary(S, '2026-10', '2026-10-01'); eq('none yet counted', s.counted, 0); eq('none yet level', s.bonus, 5000); eq('none next', s.next, null); }
// Excusals remove from denominator
{ const S = mk(); const cd = college16(S, '2026-10'); const before = C.monthSummary(S, '2026-10', '2026-10-01').possible; exc(S, 'college', cd[0]);
  const s = C.monthSummary(S, '2026-10', '2026-10-01'); eq('excuse college', before - s.possible, 500); eq('excuse earns 0', s.earned, 0);
  exc(S, 'morning', '2026-10-03'); eq('excuse morning', before - C.monthSummary(S, '2026-10', '2026-10-01').possible, 800);
}
// Weekly cap: five Mondays, only four payable
{ const S = mk(); const ym = '2026-11'; // Nov 2026 has 5 Mondays (2,9,16,23,30)
  const weeks = C.planWeeks(S, ym); eq('nov weeks', weeks.length, 6);
  ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23'].forEach(d => done(S, 'room', d));
  eq('cap blocks 5th', C.canComplete(S, 'room', '2026-11-30', '2026-11-30'), false);
  done(S, 'room', '2026-11-30'); const s = C.monthSummary(S, ym, '2026-12-01'); eq('cap paid 4', s.byTask.room.earned, 2000);
  eq('dup week blocked', C.canComplete(S, 'meal', '2026-11-03', '2026-11-03'), true);
  done(S, 'meal', '2026-11-03'); eq('dup week blocked 2', C.canComplete(S, 'meal', '2026-11-05', '2026-11-05'), false);
}
// Duplicate daily completion
{ const S = mk(); done(S, 'morning', '2026-10-01'); eq('dup morning', C.canComplete(S, 'morning', '2026-10-01', '2026-10-01'), false); eq('future blocked', C.canComplete(S, 'morning', '2026-10-05', '2026-10-01'), false); }
// Payments: reduce still-to-pay, not earned; overpayment -> credit; provisional bonus excluded
{ const S = mk(); fullMonth(S, '2026-10'); S.payments.push({ id: 'p1', amountPence: 10000, paidDate: '2026-10-20' });
  let L = C.ledger(S, '2026-10-31'); eq('unpaid (bonus not yet released)', L.unpaid, 17300); eq('earned unchanged', C.monthSummary(S, '2026-10', '2026-10-31').earned, 27300); eq('prov bonus excluded', L.bonuses, 0);
  L = C.ledger(S, '2026-11-01'); eq('bonus released on the 1st', L.unpaid, 22300);
  S.payments.push({ id: 'p2', amountPence: 24000, paidDate: '2026-11-01' }); L = C.ledger(S, '2026-11-01'); eq('credit', L.credit, 1700); eq('credit unpaid 0', L.unpaid, 0);
}
// Correction after payment recalculates
{ const S = mk(); done(S, 'morning', '2026-10-01'); done(S, 'morning', '2026-10-02'); S.payments.push({ id: 'p', amountPence: 600, paidDate: '2026-10-02' });
  S.occ[C.occId('morning', '2026-10-02')].status = 'missed'; const L = C.ledger(S, '2026-10-03'); eq('correction credit', L.credit, 300); }
// Start date excludes earlier days
{ const S = mk('2026-10-15'); const s = C.monthSummary(S, '2026-10', '2026-10-15'); eq('partial morning', s.byTask.morning.possible, 17 * 300); eq('partial weeks', C.planWeeks(S, '2026-10').length, 3); }
// New bathroom task, rename and migration of older settings
{ const old = C.defaultSettings('2026-09-01'); delete old.tasks.bath; delete old.bathDay; old.tasks.room.label = 'Room reset';
  const m = C.migrateSettings(old); eq('bath added', m.tasks.bath.valuePence, 1000); eq('bath cap', m.tasks.bath.monthlyCap, 4); eq('room renamed', m.tasks.room.label, 'Tidy room');
  const S = mk(); ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23'].forEach(d => done(S, 'bath', d));
  eq('bath cap blocks 5th', C.canComplete(S, 'bath', '2026-11-30', '2026-11-30'), false); eq('bath earned', C.monthSummary(S, '2026-11', '2026-12-01').byTask.bath.earned, 4000);
  eq('bath weekly id', C.occId('bath', '2026-11-05'), 'bath_W2026-11-02');
}
// Import validation
eq('reject junk', C.validateImport({ a: 1 }).length > 0, true);
eq('accept valid', C.validateImport({ app: 'earned-ledger', version: 1, settings: C.defaultSettings('2026-09-01'), months: { '2026-09': { collegeDates: ['2026-09-01'] } }, occurrences: [], payments: [], auditEvents: [] }), []);
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
