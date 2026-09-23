/* Reward calculation engine — pure functions, no UI. All money in integer pence. */
(function (root) {
  const TZ = 'Europe/London';
  const TASK_IDS = ['morning', 'college', 'room', 'meal', 'bath'];
  const WEEKLY_IDS = ['room', 'meal', 'bath'];
  const isWeekly = (id) => WEEKLY_IDS.includes(id);
  const DEFAULT_TASKS = {
    morning: { label: 'Morning routine', subtitle: 'Medication', valuePence: 300, schedule: 'daily' },
    college: { label: 'College attendance', subtitle: '', valuePence: 500, schedule: 'selected_dates' },
    room:    { label: 'Tidy room', subtitle: 'Once a week', valuePence: 500, schedule: 'weekly_capped', monthlyCap: 4 },
    meal:    { label: 'Meal preparation', subtitle: 'Once a week', valuePence: 1000, schedule: 'weekly_capped', monthlyCap: 4 },
    bath:    { label: 'Clean bathroom', subtitle: 'Once a week', valuePence: 1000, schedule: 'weekly_capped', monthlyCap: 4 },
  };
  // Attendance bonus: based on college days MISSED this month (excused days never count as missed).
  const LADDER = [
    { key: 0, maxMissed: 0, label: 'No days missed', bonusPence: 5000, tier: 'platinum', tierLabel: 'Platinum' },
    { key: 2, maxMissed: 2, label: '1–2 days missed', bonusPence: 3000, tier: 'gold', tierLabel: 'Gold' },
    { key: 4, maxMissed: 4, label: '3–4 days missed', bonusPence: 2000, tier: 'silver', tierLabel: 'Silver' },
    { key: 6, maxMissed: 6, label: '5–6 days missed', bonusPence: 1000, tier: 'bronze', tierLabel: 'Bronze' },
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
    return { version: 1, timezone: TZ, currency: 'GBP', startDate, tasks: JSON.parse(JSON.stringify(DEFAULT_TASKS)), roomDay: 6, mealDay: 7, bathDay: 6, childName: 'LieLie' };
  }
  /** Bring settings saved by older versions up to date (new tasks, renamed labels). */
  function migrateSettings(st) {
    if (!st || !st.tasks) return st;
    const out = JSON.parse(JSON.stringify(st));
    for (const id of TASK_IDS) if (!out.tasks[id]) out.tasks[id] = JSON.parse(JSON.stringify(DEFAULT_TASKS[id]));
    if (out.tasks.room.label === 'Room reset') out.tasks.room.label = 'Tidy room';
    if (!out.bathDay) out.bathDay = 6;
    return out;
  }
  const task = (S, id) => (S.settings && S.settings.tasks && S.settings.tasks[id]) || DEFAULT_TASKS[id];
  const value = (S, id) => task(S, id).valuePence;
  const occId = (taskId, date) => isWeekly(taskId) ? `${taskId}_W${mondayOf(date)}` : `${taskId}_${date}`;
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

  function levelFor(missed) { return LADDER.find((l) => missed <= l.maxMissed) || null; }
  function bonusForMissed(missed) { const l = levelFor(missed); return l ? l.bonusPence : 0; }

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
    for (const id of WEEKLY_IDS) {
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

    const cp = collegeProgress(S, ym, today);
    const month = S.months[ym] || {};
    const closed = !!month.closed;
    const bonus = closed && typeof month.finalBonusPence === 'number' ? month.finalBonusPence : cp.bonus;
    return {
      ym, earned, possible, byTask, remaining, closed,
      // Monthly progress and bonus are based on college attendance to date only.
      rate: cp.rate, ratePct: cp.ratePct, attended: cp.attended, counted: cp.counted, remainingDays: cp.remainingDays,
      bonus, released: cp.released, releaseDate: cp.releaseDate, provisional: !cp.released,
      next: cp.next, unlocked: cp.unlocked, best: cp.best, todayOpen: cp.todayOpen, missed: cp.missed, planned: cp.planned, level: cp.level, allowance: cp.allowance, lower: cp.lower, total: earned + bonus,
    };
  }

  /**
   * College attendance as at `today`: attended ÷ college days so far (excused days excluded).
   * Today's college day only counts once it has been marked. The bonus tier is indicative
   * during the month and is released on the first day of the following month.
   */
  function collegeProgress(S, ym, today) {
    // Today's college day counts as missed until it is ticked as attended (or excused).
    let attended = 0, counted = 0, remainingDays = 0, todayOpen = false, todayCounted = false;
    for (const d of collegeDates(S, ym)) {
      const st = dayStatus(S, 'college', d, today);
      if (st === 'excused') continue;
      if (st === 'completed') { attended++; counted++; if (d === today) todayCounted = true; }
      else if (d <= today) { counted++; if (d === today) { todayCounted = true; todayOpen = !S.occ[occId('college', d)] || S.occ[occId('college', d)].status !== 'missed'; } }
      else remainingDays++;
    }
    const rate = counted === 0 ? 0 : attended / counted;
    const planned = counted + remainingDays;
    const missed = counted - attended;
    const level = planned === 0 ? null : levelFor(missed);
    const bonus = level ? level.bonusPence : 0;
    // How many more days can be missed before dropping a level (null when already at £0 or no plan).
    const allowance = level ? level.maxMissed - missed : null;
    const lower = level ? (LADDER[LADDER.indexOf(level) + 1] || null) : null;
    const releaseDate = monthStart(shiftMonth(ym, 1));
    // Best case: every remaining college day this month is attended (misses stay where they are).
    const toGo = remainingDays + (todayOpen ? 1 : 0);
    const bA = attended + toGo, bC = counted + remainingDays;
    const bRate = bC === 0 ? 0 : bA / bC;
    const bLevel = bC === 0 ? null : levelFor(bC - bA);
    const best = { attended: bA, counted: bC, rate: bRate, ratePct: Math.round(bRate * 1000) / 10, bonus: bLevel ? bLevel.bonusPence : 0, level: bLevel, days: toGo, extraPence: toGo * value(S, 'college') };
    const unlocked = level ? [level.key] : [];
    const next = null;
    return { attended, counted, remainingDays, todayOpen, todayCounted, missed, planned, level, allowance, lower, rate, ratePct: Math.round(rate * 1000) / 10, bonus, unlocked, next, best, releaseDate, released: today >= releaseDate };
  }

  /**
   * What today's college day is worth: the day's own value plus any bonus level that would be lost
   * if it were missed. Null when today isn't a college day in the plan.
   */
  function collegeStakeToday(S, today) {
    const ym = monthOf(today);
    if (today < planStart(S) || !collegeDates(S, ym).includes(today)) return null;
    const st = dayStatus(S, 'college', today, today);
    const o = S.occ[occId('college', today)];
    const cp = collegeProgress(S, ym, today);
    const dayPence = st === 'completed' && o ? o.valuePence : value(S, 'college');
    const status = st === 'completed' ? 'attended' : st === 'excused' ? 'excused' : (o && st === 'missed') ? 'missed' : 'open';
    // Misses before today (today's day is counted as missed unless attended).
    const missedBase = cp.missed - (status === 'attended' ? 0 : 1);
    const missedIfMiss = missedBase + 1, missedIfGo = missedBase;
    const levelIfGo = levelFor(missedIfGo), levelIfMiss = levelFor(missedIfMiss);
    const bonusIfGo = levelIfGo ? levelIfGo.bonusPence : 0, bonusIfMiss = levelIfMiss ? levelIfMiss.bonusPence : 0;
    return { status, dayPence, bonusIfGo, bonusIfMiss, bonusDropPence: bonusIfGo - bonusIfMiss, totalPence: dayPence + bonusIfGo - bonusIfMiss, missedNow: cp.missed, missedIfMiss, releaseDate: cp.releaseDate };
  }

  /**
   * Money earned today: completions recorded for today, plus any change to the attendance bonus
   * caused by today's college day (a recorded miss can drop a level, so this can be negative).
   */
  function earnedToday(S, today) {
    const done = Object.values(S.occ).filter((o) => o.localDate === today && o.status === 'completed');
    const tasksPence = done.reduce((s, o) => s + o.valuePence, 0);
    const ym = monthOf(today);
    const cp = collegeProgress(S, ym, today);
    // Change to the bonus caused by today's college day, compared with the start of the day.
    const isCollegeDay = collegeDates(S, ym).includes(today) && today >= planStart(S);
    const st = isCollegeDay ? dayStatus(S, 'college', today, today) : null;
    const counts = isCollegeDay && st !== 'excused';
    const missedBase = counts && st !== 'completed' ? cp.missed - 1 : cp.missed;
    const fromLevel = counts ? levelFor(missedBase) : cp.level, toLevel = cp.level;
    const bonusDeltaPence = counts ? (toLevel ? toLevel.bonusPence : 0) - (fromLevel ? fromLevel.bonusPence : 0) : 0;
    const college = !isCollegeDay ? 'none' : st === 'completed' ? 'attended' : st === 'excused' ? 'excused' : (S.occ[occId('college', today)] ? 'missed' : 'open');
    return { tasksPence, bonusDeltaPence, totalPence: tasksPence + bonusDeltaPence, count: done.length, fromLevel, toLevel, college };
  }

  /** Tasks shown on Home for `today`. */
  function todayTasks(S, today) {
    const ym = monthOf(today);
    const out = [];
    if (today >= planStart(S)) {
      out.push({ taskId: 'morning', occId: occId('morning', today), date: today, status: dayStatus(S, 'morning', today, today), valuePence: value(S, 'morning') });
      if (collegeDates(S, ym).includes(today)) out.push({ taskId: 'college', occId: occId('college', today), date: today, status: dayStatus(S, 'college', today, today), valuePence: value(S, 'college') });
      for (const id of WEEKLY_IDS) {
        const w = weeklyInfo(S, ym, id);
        const o = S.occ[occId(id, today)];
        let status;
        if (o && o.status === 'completed') status = 'completed';
        else if (o && o.status === 'excused') status = 'excused';
        else if (w.paid.length >= w.slots) status = 'capped';
        else status = 'scheduled';
        const preferred = weekday(today) === (S.settings && S.settings[id + 'Day']);
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
    if (isWeekly(taskId)) {
      const w = weeklyInfo(S, monthOf(date), taskId);
      if (w.paid.length >= w.slots) return false;
    }
    if (S.months[monthOf(date)] && S.months[monthOf(date)].closed) return false;
    return true;
  }

  /** Money owed across all time: task earnings (all months) + bonuses released on the 1st of the following month − payments. */
  function ledger(S, today) {
    const months = new Set(Object.values(S.occ).map((o) => monthOf(o.localDate)));
    Object.keys(S.months).forEach((m) => months.add(m));
    let taskEarned = 0, bonuses = 0;
    for (const ym of months) {
      if (ym > monthOf(today)) continue;
      const s = monthSummary(S, ym, today);
      taskEarned += s.earned;
      if (s.released) bonuses += s.bonus;
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
    else for (const id of TASK_IDS.filter((x) => x !== 'bath' || s.tasks.bath)) if (!s.tasks[id] || !isInt(s.tasks[id].valuePence) || !isStr(s.tasks[id].label)) errs.push(`Task "${id}" is missing or has an invalid value.`);
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
    TZ, TASK_IDS, WEEKLY_IDS, isWeekly, migrateSettings, DEFAULT_TASKS, LADDER, todayLondon, addDays, weekday, mondayOf, monthOf, daysInMonth, monthDates, monthStart, monthEnd, shiftMonth,
    emptyState, defaultSettings, occId, planWeeks, weeklyInfo, dayStatus, levelFor, bonusForMissed, collegeStakeToday, earnedToday, monthSummary, todayTasks, canComplete, ledger, nextFriday, activity,
    validateImport, collegeDates, collegeProgress,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Calc = api;
})(typeof window !== 'undefined' ? window : globalThis);
