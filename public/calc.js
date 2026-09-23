/* Reward calculation engine — pure functions, no UI. All money in integer pence. */
(function (root) {
  const TZ = 'Europe/London';
  const TASK_IDS = ['morning', 'college', 'room', 'meal'];
  const DEFAULT_TASKS = {
    morning: { label: 'Morning routine', subtitle: 'Medication', valuePence: 300, schedule: 'daily' },
    college: { label: 'College attendance', subtitle: '', valuePence: 500, schedule: 'selected_dates' },
    room:    { label: 'Room reset', subtitle: 'Once a week', valuePence: 500, schedule: 'weekly_capped', monthlyCap: 4 },
    meal:    { label: 'Meal preparation', subtitle: 'Once a week', valuePence: 1000, schedule: 'weekly_capped', monthlyCap: 4 },
  };
  const LADDER = [
    { key: 70, num: 7, den: 10, bonusPence: 2000 },
    { key: 80, num: 8, den: 10, bonusPence: 3000 },
    { key: 100, num: 1, den: 1, bonusPence: 5000 },
  ];

  // ---------- dates (household dates are YYYY-MM-DD strings in Europe/London) ----------
  const pad = (n) => String(n).padStart(2, '0');
  function todayLondon(now) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(now || new Date());
    const g = (t) => parts.find((p) => p.type === t).value;
    return `${g('year')}-${g('month')}-${g('day')}`;
  }
  const toUTC = (d) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd)); };
  const fromUTC = (dt) => `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
  const addDays = (d, n) => { const t = toUTC(d); t.setUTCDate(t.getUTCDate() + n); return fromUTC(t); };
  const weekday = (d) => { const w = toUTC(d).getUTCDay(); return w === 0 ? 7 : w; }; // 1=Mon..7=Sun
  const mondayOf = (d) => addDays(d, 1 - weekday(d));
  const monthOf = (d) => d.slice(0, 7);
  const daysInMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
  const monthStart = (ym) => `${ym}-01`;
  const monthEnd = (ym) => `${ym}-${pad(daysInMonth(ym))}`;
  const monthDates = (ym) => Array.from({ length: daysInMonth(ym) }, (_, i) => `${ym}-${pad(i + 1)}`);
  const shiftMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 + n, 1)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`; };
  const maxDate = (a, b) => (a > b ? a : b);

  // ---------- state helpers ----------
  function emptyState() {
    return { settings: null, months: {}, occ: {}, payments: [], audit: [] };
  }
  function defaultSettings(startDate) {
    return { version: 1, timezone: TZ, currency: 'GBP', startDate, tasks: JSON.parse(JSON.stringify(DEFAULT_TASKS)), roomDay: 6, mealDay: 7, childName: 'LieLie' };
  }
  const task = (S, id) => (S.settings && S.settings.tasks && S.settings.tasks[id]) || DEFAULT_TASKS[id];
  const value = (S, id) => task(S, id).valuePence;
  const occId = (taskId, date) => (taskId === 'room' || taskId === 'meal') ? `${taskId}_W${mondayOf(date)}` : `${taskId}_${date}`;
  const planStart = (S) => (S.settings && S.settings.startDate) || '0000-01-01';
  const collegeDates = (S, ym) => ((S.months[ym] && S.months[ym].collegeDates) || []).filter((d) => d >= planStart(S) && monthOf(d) === ym).slice().sort();

  /** Mondays of the Mon–Sun weeks that touch the planned part of the month. */
  function planWeeks(S, ym) {
    const from = maxDate(monthStart(ym), planStart(S));
    const end = monthEnd(ym);
    if (from > end) return [];
    const out = [];
    for (let m = mondayOf(from); m <= end; m = addDays(m, 7)) out.push(m);
    return out;
  }

  function weeklyInfo(S, ym, taskId) {
    const cap = task(S, taskId).monthlyCap || 4;
    const weeks = planWeeks(S, ym);
    const inMonth = Object.values(S.occ).filter((o) => o.taskId === taskId && monthOf(o.localDate) === ym && o.localDate >= planStart(S));
    const excused = inMonth.filter((o) => o.status === 'excused');
    const completed = inMonth.filter((o) => o.status === 'completed').sort((a, b) => a.localDate.localeCompare(b.localDate));
    const slots = Math.max(0, Math.min(cap, weeks.length - excused.length));
    const paid = completed.slice(0, slots);
    return { cap, weeks, slots, excused, completed, paid };
  }

  /** Status of a daily / dated occurrence. */
  function dayStatus(S, taskId, date, today) {
    const o = S.occ[occId(taskId, date)];
    if (o && o.status === 'completed') return 'completed';
    if (o && o.status === 'excused') return 'excused';
    if (o && o.status === 'missed') return 'missed';
    if (date > today) return 'future';
    if (date === today) return 'scheduled';
    return 'missed';
  }

  function bonusFor(earned, possible) {
    if (possible <= 0) return 0;
    let b = 0;
    for (const t of LADDER) if (earned * t.den >= possible * t.num) b = t.bonusPence;
    return b;
  }

  /** Full month summary. `today` = household date string. */
  function monthSummary(S, ym, today) {
    const byTask = {};
    let earned = 0, possible = 0, remaining = 0;
    const start = planStart(S);

    // Morning routine: every planned calendar day
    {
      let e = 0, p = 0, r = 0, done = 0, count = 0;
      for (const d of monthDates(ym)) {
        if (d < start) continue;
        const o = S.occ[occId('morning', d)];
        const st = dayStatus(S, 'morning', d, today);
        if (st === 'excused') continue;
        count++;
        if (st === 'completed') { e += o.valuePence; p += o.valuePence; done++; }
        else { p += value(S, 'morning'); if (d >= today && st !== 'missed') r += value(S, 'morning'); }
      }
      byTask.morning = { earned: e, possible: p, completed: done, total: count };
      earned += e; possible += p; remaining += r;
    }
    // College: parent-selected dates
    {
      let e = 0, p = 0, r = 0, done = 0, count = 0;
      for (const d of collegeDates(S, ym)) {
        const o = S.occ[occId('college', d)];
        const st = dayStatus(S, 'college', d, today);
        if (st === 'excused') continue;
        count++;
        if (st === 'completed') { e += o.valuePence; p += o.valuePence; done++; }
        else { p += value(S, 'college'); if (d >= today && st !== 'missed') r += value(S, 'college'); }
      }
      byTask.college = { earned: e, possible: p, completed: done, total: count };
      earned += e; possible += p; remaining += r;
    }
    // Weekly capped tasks
    for (const id of ['room', 'meal']) {
      const w = weeklyInfo(S, ym, id);
      const e = w.paid.reduce((s, o) => s + o.valuePence, 0);
      const openSlots = w.slots - w.paid.length;
      const p = e + openSlots * value(S, id);
      // weeks still open for completion: current & future weeks in month with no completed/excused occ
      const openWeeks = w.weeks.filter((m) => {
        const o = S.occ[`${id}_W${m}`];
        return addDays(m, 6) >= today && !(o && ['completed', 'excused', 'missed'].includes(o.status));
      }).length;
      const r = Math.min(openSlots, openWeeks) * value(S, id);
      byTask[id] = { earned: e, possible: p, completed: w.paid.length, total: w.slots };
      earned += e; possible += p; remaining += r;
    }

    const rate = possible === 0 ? 0 : earned / possible;
    const month = S.months[ym] || {};
    const closed = !!month.closed;
    const bonus = closed && typeof month.finalBonusPence === 'number' ? month.finalBonusPence : bonusFor(earned, possible);
    const reachable = Math.min(possible, earned + remaining);

    // Next threshold, limited to what is still reachable
    let next = null;
    const unlocked = LADDER.filter((t) => possible > 0 && earned * t.den >= possible * t.num);
    const locked = LADDER.filter((t) => !(possible > 0 && earned * t.den >= possible * t.num));
    const reachableLocked = locked.filter((t) => reachable * t.den >= possible * t.num);
    if (reachableLocked.length) {
      const t = reachableLocked[0];
      next = { key: t.key, bonusPence: t.bonusPence, neededPence: Math.ceil((possible * t.num) / t.den) - earned };
    }
    const highestReachable = [...LADDER].reverse().find((t) => possible > 0 && reachable * t.den >= possible * t.num) || null;

    return {
      ym, earned, possible, rate, ratePct: Math.round(rate * 1000) / 10, bonus, closed, provisional: !closed,
      total: earned + bonus, byTask, reachable, remaining, next, unlocked: unlocked.map((t) => t.key),
      highestReachableKey: highestReachable ? highestReachable.key : null,
    };
  }

  /** Tasks shown on Home for `today`. */
  function todayTasks(S, today) {
    const ym = monthOf(today);
    const out = [];
    if (today >= planStart(S)) {
      out.push({ taskId: 'morning', occId: occId('morning', today), date: today, status: dayStatus(S, 'morning', today, today), valuePence: value(S, 'morning') });
      if (collegeDates(S, ym).includes(today)) out.push({ taskId: 'college', occId: occId('college', today), date: today, status: dayStatus(S, 'college', today, today), valuePence: value(S, 'college') });
      for (const id of ['room', 'meal']) {
        const w = weeklyInfo(S, ym, id);
        const o = S.occ[occId(id, today)];
        let status;
        if (o && o.status === 'completed') status = 'completed';
        else if (o && o.status === 'excused') status = 'excused';
        else if (w.paid.length >= w.slots) status = 'capped';
        else status = 'scheduled';
        const preferred = weekday(today) === (id === 'room' ? S.settings && S.settings.roomDay : S.settings && S.settings.mealDay);
        out.push({ taskId: id, occId: occId(id, today), date: (o && o.localDate) || today, status, valuePence: (o && o.status === 'completed') ? o.valuePence : value(S, id), weekly: true, preferred, doneThisMonth: w.paid.length, slots: w.slots });
      }
    }
    return out;
  }

  /** Can this occurrence be completed now? Guards duplicates, future dates and caps. */
  function canComplete(S, taskId, date, today) {
    if (date > today) return false;
    if (date < planStart(S)) return false;
    const o = S.occ[occId(taskId, date)];
    if (o && (o.status === 'completed' || o.status === 'excused')) return false;
    if (taskId === 'college' && !collegeDates(S, monthOf(date)).includes(date)) return false;
    if (taskId === 'room' || taskId === 'meal') {
      const w = weeklyInfo(S, monthOf(date), taskId);
      if (w.paid.length >= w.slots) return false;
    }
    if (S.months[monthOf(date)] && S.months[monthOf(date)].closed) return false;
    return true;
  }

  /** Money owed across all time: task earnings (all months) + finalised bonuses (closed months) − payments. */
  function ledger(S, today) {
    const months = new Set(Object.values(S.occ).map((o) => monthOf(o.localDate)));
    Object.keys(S.months).forEach((m) => months.add(m));
    let taskEarned = 0, bonuses = 0;
    for (const ym of months) {
      if (ym > monthOf(today)) continue;
      const s = monthSummary(S, ym, today);
      taskEarned += s.earned;
      if (S.months[ym] && S.months[ym].closed) bonuses += s.bonus;
    }
    const paid = S.payments.reduce((s, p) => s + p.amountPence, 0);
    const bal = taskEarned + bonuses - paid;
    const paidThisMonth = S.payments.filter((p) => monthOf(p.paidDate) === monthOf(today)).reduce((s, p) => s + p.amountPence, 0);
    return { taskEarned, bonuses, paid, paidThisMonth, unpaid: Math.max(0, bal), credit: Math.max(0, -bal) };
  }

  function nextFriday(today) {
    const w = weekday(today);
    return addDays(today, (5 - w + 7) % 7);
  }

  /** Activity feed entries, newest first. */
  function activity(S) {
    const items = [];
    for (const o of Object.values(S.occ)) {
      if (o.status === 'completed') items.push({ kind: 'completion', id: 'c_' + o.id, at: o.completedAt || o.updatedAt, date: o.localDate, taskId: o.taskId, amountPence: o.valuePence, occId: o.id });
    }
    for (const p of S.payments) items.push({ kind: 'payment', id: 'p_' + p.id, at: p.paidAt || (p.paidDate + 'T12:00:00Z'), date: p.paidDate, amountPence: p.amountPence, note: p.note || '' });
    for (const a of S.audit) {
      if (a.kind === 'undo') continue;
      items.push({ kind: a.kind, id: 'a_' + a.id, at: a.at, date: a.localDate, taskId: a.taskId, from: a.from, to: a.to, reason: a.reason || '', amountPence: a.valuePence || 0 });
    }
    items.sort((x, y) => (y.at || '').localeCompare(x.at || ''));
    return items;
  }

  // ---------- import validation ----------
  function validateImport(obj) {
    const errs = [];
    const isStr = (v) => typeof v === 'string';
    const isDate = (v) => isStr(v) && /^\d{4}-\d{2}-\d{2}$/.test(v);
    const isInt = (v) => Number.isInteger(v) && v >= 0;
    if (!obj || typeof obj !== 'object') return ['The file is not a JSON object.'];
    if (obj.app !== 'earned-ledger' || obj.version !== 1) errs.push('This file is not a backup from this app (version 1).');
    const s = obj.settings;
    if (!s || typeof s !== 'object' || !isDate(s.startDate) || !s.tasks) errs.push('Settings are missing or incomplete.');
    else for (const id of TASK_IDS) if (!s.tasks[id] || !isInt(s.tasks[id].valuePence) || !isStr(s.tasks[id].label)) errs.push(`Task "${id}" is missing or has an invalid value.`);
    if (!obj.months || typeof obj.months !== 'object') errs.push('Month plans are missing.');
    else for (const [ym, m] of Object.entries(obj.months)) {
      if (!/^\d{4}-\d{2}$/.test(ym)) errs.push(`Month key "${ym}" is invalid.`);
      if (!Array.isArray(m.collegeDates) || !m.collegeDates.every(isDate)) errs.push(`College dates for ${ym} are invalid.`);
    }
    if (!Array.isArray(obj.occurrences)) errs.push('Occurrences are missing.');
    else obj.occurrences.forEach((o, i) => {
      if (!o || !isStr(o.id) || !TASK_IDS.includes(o.taskId) || !isDate(o.localDate) || !['scheduled', 'completed', 'missed', 'excused'].includes(o.status) || !isInt(o.valuePence))
        errs.push(`Occurrence ${i + 1} is invalid.`);
    });
    if (!Array.isArray(obj.payments)) errs.push('Payments are missing.');
    else obj.payments.forEach((p, i) => { if (!p || !isStr(p.id) || !isInt(p.amountPence) || !isDate(p.paidDate)) errs.push(`Payment ${i + 1} is invalid.`); });
    if (!Array.isArray(obj.auditEvents)) errs.push('Audit history is missing.');
    return errs.slice(0, 6);
  }

  const api = {
    TZ, TASK_IDS, DEFAULT_TASKS, LADDER, todayLondon, addDays, weekday, mondayOf, monthOf, daysInMonth, monthDates, monthStart, monthEnd, shiftMonth,
    emptyState, defaultSettings, occId, planWeeks, weeklyInfo, dayStatus, bonusFor, monthSummary, todayTasks, canComplete, ledger, nextFriday, activity,
    validateImport, collegeDates,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Calc = api;
})(typeof window !== 'undefined' ? window : globalThis);
