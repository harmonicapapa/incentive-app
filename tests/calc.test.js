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
  for (const id of ['room', 'meal']) weeks.slice(0, 4).forEach(m => done(S, id, m < C.monthStart(ym) ? C.monthStart(ym) : m));
}
// Dates
eq('london summer', C.todayLondon(new Date('2026-06-30T23:30:00Z')), '2026-07-01');
eq('london winter', C.todayLondon(new Date('2026-12-31T23:30:00Z')), '2026-12-31');
eq('dst day', C.addDays('2026-03-28', 1), '2026-03-29');
eq('dst day2', C.addDays('2026-10-24', 2), '2026-10-26');
// Month lengths: task max
for (const [ym, want] of [['2026-10', 23300], ['2026-11', 23000], ['2028-02', 22700], ['2026-02', 22400]]) {
  const S = mk(); college16(S, ym); eq('max ' + ym, C.monthSummary(S, ym, '2020-01-01').possible, want);
}
// Full 31-day month -> 233 + 50
{ const S = mk(); fullMonth(S, '2026-10'); const s = C.monthSummary(S, '2026-10', '2026-11-05'); eq('full earned', s.earned, 23300); eq('full bonus', s.bonus, 5000); eq('full total', s.total, 28300); eq('full pct', s.ratePct, 100); }
// Exactly 70% and 80%
{ const S = mk(); // Nov 2026 no college: possible 9000+2000+4000 = 15000
  C.planWeeks(S, '2026-11').slice(0, 4).forEach(m => { done(S, 'room', m < '2026-11-01' ? '2026-11-01' : m); done(S, 'meal', m < '2026-11-01' ? '2026-11-01' : m); });
  C.monthDates('2026-11').slice(0, 15).forEach(d => done(S, 'morning', d));
  let s = C.monthSummary(S, '2026-11', '2026-12-01'); eq('70 earned', s.earned, 10500); eq('70 possible', s.possible, 15000); eq('70 bonus only 20', s.bonus, 2000);
  C.monthDates('2026-11').slice(15, 20).forEach(d => done(S, 'morning', d)); // +1500 = 12000 = 80%
  s = C.monthSummary(S, '2026-11', '2026-12-01'); eq('80 bonus only 30', s.bonus, 3000); eq('80 pct', s.ratePct, 80);
  S.occ[C.occId('morning', '2026-11-20')].status = 'missed'; s = C.monthSummary(S, '2026-11', '2026-12-01'); eq('79.8 -> 20', s.bonus, 2000); eq('79.8 pct', s.ratePct, 78);
}
eq('bonusFor below', C.bonusFor(6999, 10000), 0);
eq('bonusFor 70', C.bonusFor(7000, 10000), 2000);
eq('bonusFor 99.99', C.bonusFor(9999, 10000), 3000);
eq('bonusFor 100', C.bonusFor(10000, 10000), 5000);
eq('bonusFor 0 possible', C.bonusFor(0, 0), 0);
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
  let L = C.ledger(S, '2026-10-31'); eq('unpaid', L.unpaid, 13300); eq('earned unchanged', C.monthSummary(S, '2026-10', '2026-10-31').earned, 23300); eq('prov bonus excluded', L.bonuses, 0);
  S.months['2026-10'].closed = true; S.months['2026-10'].finalBonusPence = 5000; L = C.ledger(S, '2026-11-01'); eq('closed bonus in ledger', L.unpaid, 18300);
  S.payments.push({ id: 'p2', amountPence: 20000, paidDate: '2026-11-01' }); L = C.ledger(S, '2026-11-01'); eq('credit', L.credit, 1700); eq('credit unpaid 0', L.unpaid, 0);
}
// Correction after payment recalculates
{ const S = mk(); done(S, 'morning', '2026-10-01'); done(S, 'morning', '2026-10-02'); S.payments.push({ id: 'p', amountPence: 600, paidDate: '2026-10-02' });
  S.occ[C.occId('morning', '2026-10-02')].status = 'missed'; const L = C.ledger(S, '2026-10-03'); eq('correction credit', L.credit, 300); }
// Start date excludes earlier days
{ const S = mk('2026-10-15'); const s = C.monthSummary(S, '2026-10', '2026-10-15'); eq('partial morning', s.byTask.morning.possible, 17 * 300); eq('partial weeks', C.planWeeks(S, '2026-10').length, 3); }
// Next threshold & reachability
{ const S = mk(); college16(S, '2026-10'); const s = C.monthSummary(S, '2026-10', '2026-10-01'); eq('next 70', s.next.key, 70); eq('need', s.next.neededPence, Math.ceil(23300 * 0.7));
  const S2 = mk(); college16(S2, '2026-10'); C.monthDates('2026-10').slice(0, 25).forEach(d => {}); const s2 = C.monthSummary(S2, '2026-10', '2026-10-31'); eq('unreachable -> null', s2.next, null); }
// Import validation
eq('reject junk', C.validateImport({ a: 1 }).length > 0, true);
eq('accept valid', C.validateImport({ app: 'earned-ledger', version: 1, settings: C.defaultSettings('2026-09-01'), months: { '2026-09': { collegeDates: ['2026-09-01'] } }, occurrences: [], payments: [], auditEvents: [] }), []);
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
