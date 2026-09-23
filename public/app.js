(function () {
'use strict';
const C = window.Calc;

// ---------------- helpers ----------------
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (p) => '£' + (Math.abs(p) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const moneyShort = (p) => (p % 100 === 0 ? '£' + p / 100 : money(p));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const nowISO = () => new Date().toISOString();
const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const dUTC = (d) => new Date(d + 'T00:00:00Z');
const fmtD = (d, o) => new Intl.DateTimeFormat('en-GB', Object.assign({ timeZone: 'UTC' }, o)).format(dUTC(d));
const longDate = (d) => fmtD(d, { weekday: 'long', day: 'numeric', month: 'long' });
const shortDate = (d) => fmtD(d, { weekday: 'short', day: 'numeric', month: 'short' });
const dayMonth = (d) => fmtD(d, { day: 'numeric', month: 'short' });
const monthName = (ym) => fmtD(ym + '-01', { month: 'long', year: 'numeric' });
const timeLondon = (iso) => { try { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)); } catch (e) { return ''; } };
const hourLondon = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }).format(new Date()));
const today = () => C.todayLondon();
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const STATUS_LABEL = { completed: 'Completed', missed: 'Not completed', excused: 'Excused and not counted', scheduled: 'Scheduled', future: 'Upcoming', open: 'Open' };
async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Lucide icon paths
const P = (d) => d.map((x) => (x.startsWith('<') ? x : `<path d="${x}"/>`)).join('');
const ICONS = {
  morning: P(['<circle cx="12" cy="12" r="4"/>', 'M12 2v2', 'M12 20v2', 'm4.93 4.93 1.41 1.41', 'm17.66 17.66 1.41 1.41', 'M2 12h2', 'M20 12h2', 'm6.34 17.66-1.41 1.41', 'm19.07 4.93-1.41 1.41']),
  college: P(['M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z', 'M22 10v6', 'M6 12.5V16a6 3 0 0 0 12 0v-3.5']),
  room: P(['M2 4v16', 'M2 8h18a2 2 0 0 1 2 2v10', 'M2 17h20', 'M6 8v9']),
  meal: P(['M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2', 'M7 2v20', 'M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7']),
  check: P(['M20 6 9 17l-5-5']),
  bath: P(['M10 4 8 6', 'M17 19v2', 'M2 12h20', 'M7 19v2', 'M9 5 7.621 3.621A2.121 2.121 0 0 0 4 5v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5']),
  pill: P(['m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z', 'm8.5 8.5 7 7']),
  settings: P(['M20 7h-9', 'M14 17H5', '<circle cx="17" cy="17" r="3"/>', '<circle cx="7" cy="7" r="3"/>']),
  home: P(['M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8', 'M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z']),
  activity: P(['M3 12h.01', 'M3 18h.01', 'M3 6h.01', 'M8 12h13', 'M8 18h13', 'M8 6h13']),
  plan: P(['<rect x="3" y="4" width="18" height="18" rx="2"/>', 'M16 2v4', 'M8 2v4', 'M3 10h18']),
  left: P(['m15 18-6-6 6-6']),
  right: P(['m9 18 6-6-6-6']),
  lock: P(['<rect x="3" y="11" width="18" height="11" rx="2"/>', 'M7 11V7a5 5 0 0 1 10 0v4']),
  unlock: P(['<rect x="3" y="11" width="18" height="11" rx="2"/>', 'M7 11V7a5 5 0 0 1 9.9-1']),
  payment: P(['m16 3 4 4-4 4', 'M20 7H4', 'm8 21-4-4 4-4', 'M4 17h16']),
  correction: P(['M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z']),
  excuse: P(['<circle cx="12" cy="12" r="10"/>', 'M9 15 15 9']),
  shield: P(['M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z']),
  x: P(['M18 6 6 18', 'm6 6 12 12']),
  undo: P(['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11']),
  download: P(['M12 15V3', 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm7 10 5 5 5-5']),
  upload: P(['M12 3v12', 'm17 8-5-5-5 5', 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4']),
  trash: P(['M3 6h18', 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6', 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2']),
  banknote: P(['<rect x="2" y="6" width="20" height="12" rx="2"/>', '<circle cx="12" cy="12" r="2"/>', 'M6 12h.01M18 12h.01']),
  sliders: P(['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M2 14h4', 'M10 8h4', 'M18 16h4']),
  key: P(['m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4', 'm21 2-9.6 9.6', '<circle cx="7.5" cy="15.5" r="5.5"/>']),
  flag: P(['M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528']),
  logout: P(['m16 17 5-5-5-5', 'M21 12H9', 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4']),
};
const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;

// ---------------- app state ----------------
const PAGE = document.body.dataset.role; // viewer | parent | demo
let ROLE = PAGE === 'viewer' ? 'viewer' : 'parent';
const app = {
  mode: 'loading', // loading | login | welcome | notset | offline | live | demo
  S: C.emptyState(),
  loaded: { settings: false },
  tab: 'home', parent: ROLE === 'parent', planMonth: null, actMonth: 'all', actCat: 'all',
  readOnly: ROLE !== 'parent', loginError: '', busy: false,
  pending: new Set(), shownEarned: null, lastDay: today(), homeDate: null,
};
const T = (id) => C.DEFAULT_TASKS[id] && Object.assign({}, C.DEFAULT_TASKS[id], (app.S.settings && app.S.settings.tasks && app.S.settings.tasks[id]) || {});
const isLive = () => app.mode === 'live';
const childName = () => (app.S.settings && app.S.settings.childName) || 'LieLie';

// ---------------- store (Netlify functions) ----------------
async function apiFetch(url, opts) {
  const r = await fetch(url, Object.assign({ credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' } }, opts || {}));
  let body = {};
  try { body = await r.json(); } catch (e) { /* no body */ }
  if (!r.ok) { const err = new Error(body.error || 'Request failed'); err.status = r.status; throw err; }
  return body;
}
function normalise(state) {
  return Object.assign(C.emptyState(), state || {}, { occ: (state && state.occ) || {}, months: (state && state.months) || {}, payments: (state && state.payments) || [], audit: (state && state.audit) || [] });
}
function applyServerState(state) {
  app.S = normalise(state);
  app.S.settings = C.migrateSettings(app.S.settings);
  if (app.mode !== 'demo') app.mode = app.S.settings ? 'live' : (ROLE === 'parent' ? 'welcome' : 'notset');
  render();
}
async function load() {
  try {
    const body = await apiFetch(ROLE === 'parent' ? '/api/state' : '/api/public');
    applyServerState(body.state);
  } catch (e) {
    if (e.status === 401 && ROLE === 'parent') { app.mode = 'login'; render(); return; }
    if (app.mode === 'loading') { app.mode = 'offline'; render(); }
  }
}
// Every change goes to the server as a list of operations; the server returns the new ledger.
let queue = Promise.resolve();
function send(opsList) {
  if (app.mode === 'demo') return Promise.resolve();
  const run = () => apiFetch('/api/state', { method: 'POST', body: JSON.stringify({ ops: opsList }) })
    .then((body) => applyServerState(body.state))
    .catch((e) => {
      if (e.status === 401) { app.mode = 'login'; app.loginError = 'Your session ended. Sign in again.'; render(); }
      else toast(e.status === 400 ? e.message : 'Not saved. Check your connection and try again.');
      load();
      throw e;
    });
  queue = queue.then(run, run);
  return queue;
}
const ops = {
  async setOcc(o) { app.S.occ = Object.assign({}, app.S.occ, { [o.id]: o }); render(); await send([{ type: 'setOcc', occ: o }]); },
  async delOcc(id) { const n = Object.assign({}, app.S.occ); delete n[id]; app.S.occ = n; render(); await send([{ type: 'delOcc', id }]); },
  async addAudit(a) { app.S.audit = app.S.audit.concat([a]); await send([{ type: 'addAudit', audit: a }]); },
  async setMonth(ym, m) { app.S.months = Object.assign({}, app.S.months, { [ym]: m }); render(); await send([{ type: 'setMonth', ym, month: m }]); },
  async setSettings(st) { app.S.settings = st; render(); await send([{ type: 'setSettings', settings: st }]); },
  async addPayment(p) { app.S.payments = app.S.payments.concat([p]); render(); await send([{ type: 'addPayment', payment: p }]); },
  async delPayment(id) { app.S.payments = app.S.payments.filter((p) => p.id !== id); render(); await send([{ type: 'delPayment', id }]); },
  async replaceAll(data) { await send([{ type: 'replaceAll', data }]); },
  async eraseAll() { app.S = C.emptyState(); await send([{ type: 'eraseAll' }]); },
};

async function signIn(password) {
  app.busy = true; app.loginError = ''; render();
  try { await apiFetch('/api/login', { method: 'POST', body: JSON.stringify({ password }) }); app.mode = 'loading'; app.busy = false; await load(); }
  catch (e) { app.busy = false; app.loginError = e.status === 401 ? "That password isn't right." : 'Could not reach the server. Try again.'; render(); const f = document.getElementById('pw'); if (f) f.focus(); }
}
async function signOut() {
  try { await apiFetch('/api/login', { method: 'DELETE' }); } catch (e) { /* ignore */ }
  app.S = C.emptyState(); app.mode = 'login'; app.shownEarned = null; render();
}

function boot() {
  if (PAGE === 'demo') { app.S = buildDemo(); app.mode = 'demo'; render(); return; }
  render();
  load();
  if (ROLE === 'viewer') {
    setInterval(() => { if (document.visibilityState === 'visible' && app.mode !== 'demo') load(); }, 60000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && app.mode !== 'demo') load(); });
  }
}

// ---------------- demo data ----------------
function buildDemo() {
  const t = today();
  const ym = C.monthOf(t), prev = C.shiftMonth(ym, -1);
  const S = C.emptyState();
  S.settings = C.defaultSettings(C.monthStart(prev));
  let seed = 7; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const occ = (taskId, date, status, extra) => { const id = C.occId(taskId, date); const v = S.settings.tasks[taskId].valuePence; S.occ[id] = Object.assign({ id, taskId, localDate: date, status, valuePence: status === 'completed' ? v : 0, completedAt: status === 'completed' ? date + 'T0' + (7 + Math.floor(rnd() * 2)) + ':' + (10 + Math.floor(rnd() * 40)) + ':00Z' : undefined, updatedAt: date + 'T09:00:00Z' }, extra || {}); };
  for (const m of [prev, ym]) {
    const weekdays = C.monthDates(m).filter((d) => C.weekday(d) <= 5);
    const college = weekdays.filter((_, i) => i % 4 !== 3).slice(0, 16);
    S.months[m] = { collegeDates: college };
    for (const d of C.monthDates(m)) {
      if (d >= t) break;
      if (rnd() < 0.86) occ('morning', d, 'completed');
      if (college.includes(d)) { if (m === ym && d === college[2]) occ('college', d, 'excused', { note: 'College closed' }); else if (rnd() < 0.9 && !(m === ym && (d === college[6] || d === college[9]))) occ('college', d, 'completed'); }
    }
    const weeks = C.planWeeks(S, m);
    weeks.forEach((mon, i) => {
      if (i > 3) return;
      const sat = C.addDays(mon, 5), sun = C.addDays(mon, 6);
      const clampDate = (d) => (d < C.monthStart(m) ? C.monthStart(m) : d > C.monthEnd(m) ? C.monthEnd(m) : d);
      if (clampDate(sat) < t && C.monthOf(clampDate(sat)) === m && rnd() < 0.85) occ('room', clampDate(sat), 'completed');
      if (clampDate(sun) < t && C.monthOf(clampDate(sun)) === m && rnd() < 0.8) occ('meal', clampDate(sun), 'completed');
      if (clampDate(sat) < t && C.monthOf(clampDate(sat)) === m && rnd() < 0.75) occ('bath', clampDate(sat), 'completed');
    });
  }
  const s = C.monthSummary(S, prev, t);
  S.months[prev] = Object.assign({}, S.months[prev], { closed: true, closedAt: C.monthStart(ym) + 'T10:00:00Z', finalBonusPence: s.bonus });
  // payments on Fridays before today
  let f = C.nextFriday(C.monthStart(prev)); let total = 0;
  const L = () => C.ledger(S, t);
  while (f < t) { const due = L().unpaid; if (due > 0 && f < C.addDays(t, -2)) { const amt = Math.min(due, 2000 + Math.floor(rnd() * 3) * 500); S.payments.push({ id: 'demo' + f, amountPence: amt, paidDate: f, paidAt: f + 'T17:00:00Z', note: '' }); total += amt; } f = C.addDays(f, 7); }
  const collegeDone = Object.values(S.occ).find((o) => o.taskId === 'college' && o.status === 'completed' && C.monthOf(o.localDate) === ym);
  S.audit.push({ id: 'demoa1', kind: 'excuse', at: C.monthStart(ym) + 'T09:30:00Z', occId: C.occId('college', S.months[ym].collegeDates[2]), taskId: 'college', localDate: S.months[ym].collegeDates[2], from: 'scheduled', to: 'excused', reason: 'College closed', valuePence: 0 });
  void collegeDone;
  return S;
}

// ---------------- actions ----------------
async function complete(taskId, date) {
  if (ROLE !== 'parent') return;
  const t = date && date <= today() ? date : today();
  const id = C.occId(taskId, t);
  if (app.pending.has(id) || !C.canComplete(app.S, taskId, t, today())) return;
  app.pending.add(id);
  const ts = nowISO();
  const v = T(taskId).valuePence;
  const o = { id, taskId, localDate: t, status: 'completed', valuePence: v, completedAt: ts, updatedAt: ts, by: 'parent' };
  try {
    await ops.setOcc(o);
    toast(`${moneyShort(v)} added${t === today() ? '' : ' for ' + shortDate(t)}`, { undo: () => undoCompletion(o) });
  } catch (e) { /* server state reloaded */ }
  finally { app.pending.delete(id); }
}
async function undoCompletion(o) {
  const cur = app.S.occ[o.id];
  if (!cur || cur.completedAt !== o.completedAt) return;
  try { await ops.delOcc(o.id); toast('Undone'); } catch (e) { /* reported */ }
}

// status changes made in Parent mode
async function changeStatus({ taskId, date, to, reason, note, weekMonday }) {
  const S = app.S, t = today();
  const id = weekMonday ? `${taskId}_W${weekMonday}` : C.occId(taskId, date);
  const cur = S.occ[id];
  if (!cur && (to === 'scheduled' || to === 'missed')) return false;
  const from = cur ? cur.status : (date > t ? 'future' : date === t ? 'scheduled' : 'missed');
  if (from === to && (!note || (cur && cur.note === note))) return false;
  const ts = nowISO();
  if (to === 'scheduled') { if (cur) await ops.delOcc(id); }
  else {
    const v = to === 'completed' ? (cur && cur.status === 'completed' ? cur.valuePence : T(taskId).valuePence) : 0;
    const o = Object.assign({}, cur || {}, { id, taskId, localDate: date, status: to, valuePence: v, updatedAt: ts });
    if (to === 'completed') o.completedAt = (cur && cur.completedAt) || ts; else delete o.completedAt;
    if (note) o.note = note; else delete o.note;
    await ops.setOcc(o);
  }
  if (from !== to) await ops.addAudit({ id: uid(), kind: to === 'excused' ? 'excuse' : 'correction', at: ts, occId: id, taskId, localDate: date, from, to, reason: reason || '', valuePence: (cur && cur.valuePence) || T(taskId).valuePence, by: 'parent' });
  return true;
}

// ---------------- toast ----------------
let toastTimer = null;
function toast(msg, opts = {}) {
  const el = $('#toast');
  clearTimeout(toastTimer);
  el.innerHTML = `<div class="toast"><span class="grow">${esc(msg)}</span>${opts.undo ? `<button type="button" id="undo-btn">${icon('undo', 'sm')}Undo</button>` : ''}</div>`;
  if (opts.undo) $('#undo-btn').onclick = () => { el.innerHTML = ''; opts.undo(); };
  toastTimer = setTimeout(() => { el.innerHTML = ''; }, opts.undo ? 10000 : 3200);
}

// ---------------- rendering ----------------
function render() {
  const root = $('#app');
  const focusId = document.activeElement && document.activeElement.id && root.contains(document.activeElement) ? document.activeElement.id : null;
  if (app.mode === 'loading') root.innerHTML = `<div class="shell"><div class="empty" style="padding-top:30vh">Loading…</div></div>`;
  else if (app.mode === 'login') root.innerHTML = renderLogin();
  else if (app.mode === 'welcome' || app.mode === 'notset' || app.mode === 'offline') root.innerHTML = renderWelcome();
  else root.innerHTML = renderApp();
  if (focusId) { const f = document.getElementById(focusId); if (f) f.focus({ preventScroll: true }); }
  animateBalance();
}

function renderLogin() {
  return `<div class="shell"><div class="welcome">
    <div class="mark">${icon('lock', 'lg')}</div>
    <h1>Parent portal</h1>
    <p>Sign in to record tasks, payments and settings for ${esc(childName())}.</p>
    <form class="stack" style="max-width:360px" id="login-form" novalidate>
      ${app.loginError ? `<div class="err" role="alert">${esc(app.loginError)}</div>` : ''}
      <div class="field" style="margin:0"><label for="pw">Password</label><input class="inp" type="password" id="pw" autocomplete="current-password" required></div>
      <button class="btn primary block" type="submit" id="pw-go" ${app.busy ? 'disabled' : ''}>${app.busy ? 'Signing in…' : 'Sign in'}</button>
      <a class="btn block" href="/demo" id="w-demo">Try demo mode</a>
    </form>
    <p class="note" style="margin-top:18px">Demo mode uses sample activity and saves nothing.</p>
  </div></div>`;
}

function renderWelcome() {
  if (app.mode === 'offline') return `<div class="shell"><div class="welcome"><div class="mark">${icon('banknote', 'lg')}</div><h1>Can't load right now</h1><p>The ledger couldn't be reached. Check your connection and try again.</p><button class="btn primary" type="button" data-act="reload" id="w-reload">Try again</button></div></div>`;
  if (app.mode === 'notset') return `<div class="shell"><div class="welcome"><div class="mark">${icon('banknote', 'lg')}</div><h1>Nothing to show yet</h1><p>Progress will appear here once the ledger has been set up.</p></div></div>`;
  return `<div class="shell"><div class="welcome">
    <div class="mark">${icon('banknote', 'lg')}</div>
    <h1>Set up the ledger</h1>
    <p>Completed tasks add to a monthly balance, with a bonus at 70%, 80% and 100% of what's possible. Start fresh to begin from today, then choose this month's college days.</p>
    <div class="stack" style="max-width:360px">
      <button class="btn primary block" type="button" data-act="start" id="w-start">Start fresh</button>
      <a class="btn block" href="/demo" id="w-demo">Try demo mode</a>
      <button class="btn block" type="button" data-act="signout" id="w-signout">Sign out</button>
    </div>
  </div></div>`;
}

function renderApp() {
  const t = today();
  const h = hourLondon();
  const greet = ROLE === 'parent' ? 'Parent portal' : `${h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}, ${childName()}`;
  const view = app.tab === 'home' ? renderHome(t) : app.tab === 'activity' ? renderActivity(t) : renderPlan(t);
  return `<div class="shell">
    <header class="top">
      <div><h1>${greet}</h1><div class="date">${esc(longDate(t))}</div></div>
      ${ROLE === 'parent' && app.mode === 'live' ? `<button class="iconbtn" type="button" data-act="signout" aria-label="Sign out" title="Sign out" id="hdr-signout">${icon('logout')}</button>` : `<button class="iconbtn" type="button" data-act="tab" data-tab="plan" data-scroll="settings" aria-label="Plan" title="Plan" id="hdr-settings">${icon('plan')}</button>`}
    </header>
    ${app.mode === 'demo' ? `<div class="demo demo-bar"><span><b>Demo</b> · sample data, nothing is saved</span>
      <span class="demo-ctl"><span class="seg-sm" role="group" aria-label="View as"><button type="button" data-act="demo-role" data-role="parent" id="dr-parent" aria-pressed="${ROLE === 'parent'}">Parent</button><button type="button" data-act="demo-role" data-role="viewer" id="dr-viewer" aria-pressed="${ROLE === 'viewer'}">${esc(childName())}</button></span>
      <button class="linkbtn" type="button" data-act="demo-reset" id="demo-reset">Reset</button></span></div>` : ''}
    <main id="view" class="stack">${view}</main>
  </div>
  <nav class="tabs" aria-label="Main"><div class="in">
    ${[['home', 'Home'], ['activity', 'Activity'], ['plan', ROLE === 'parent' ? 'Plan' : 'Calendar']].map(([k, l]) => `<button type="button" id="tab-${k}" data-act="tab" data-tab="${k}" ${app.tab === k ? 'aria-current="page"' : ''}>${icon(k === 'home' ? 'home' : k === 'activity' ? 'activity' : 'plan')}${l}</button>`).join('')}
  </div></nav>`;
}

function balanceCard(sum, L) {
  const total = sum.earned + sum.bonus;
  const pounds = Math.floor(total / 100).toLocaleString('en-GB'), pence = String(total % 100).padStart(2, '0');
  const rel = shortDateNoDay(sum.releaseDate);
  return `<section class="balance" aria-label="Indicative payment this month">
    <div class="lbl">Indicative payment · ${esc(fmtD(sum.ym + '-01', { month: 'long' }))}</div>
    <div class="amt num" id="bal-amt" data-v="${total}">£${pounds}<span class="pence">.${pence}</span></div>
    <div class="row">
      <div><span>Tasks earned</span><strong class="num">${money(sum.earned)}</strong></div>
      <div><span>${sum.released ? 'Bonus · released ' + esc(rel) : 'Bonus · released ' + esc(rel)}</span><strong class="num">${money(sum.bonus)}</strong></div>
    </div>
    <div class="row" style="margin-top:12px">
      <div><span>Paid this month</span><strong class="num">${money(L.paidThisMonth)}</strong></div>
      ${L.credit > 0 ? `<div><span>Credit carried forward</span><strong class="num credit">${money(L.credit)}</strong></div>` : `<div><span>Still to pay now</span><strong class="num">${money(L.unpaid)}</strong></div>`}
    </div>
  </section>`;
}
const shortDateNoDay = (d) => fmtD(d, { day: 'numeric', month: 'short' });

function progressCard(sum, compact) {
  const pct = Math.min(100, sum.rate * 100);
  const markers = C.LADDER.map((l) => `<i class="mk ${sum.unlocked.includes(l.key) ? 'on' : ''}" style="left:calc(${l.key}% - 1px)"><span>${l.key}%</span></i>`).join('');
  const rel = shortDateNoDay(sum.releaseDate);
  let note;
  const totalDays = sum.counted + sum.remainingDays;
  if (totalDays === 0) note = `<span class="muted">No college days in this month's plan yet.</span>`;
  else if (sum.counted === 0) note = `<span class="muted">Progress starts after the first college day.</span>`;
  else {
    const parts = [];
    if (sum.bonus > 0) parts.push(`<span class="pill">${icon('unlock', 'sm')}${moneyShort(sum.bonus)} bonus ${sum.released ? 'released ' + esc(rel) : 'on track · paid ' + esc(rel)}</span>`);
    if (!sum.released && sum.next) parts.push(`<span class="muted">Attend the next <strong class="num" style="color:var(--ink)">${sum.next.days}</strong> college day${sum.next.days === 1 ? '' : 's'} to reach ${sum.next.key}% (${moneyShort(sum.next.bonusPence)})</span>`);
    else if (!sum.released && sum.bonus === 5000) parts.push(`<span class="muted">Top bonus. Keep it going.</span>`);
    else if (!sum.released && sum.bonus === 0) parts.push(`<span class="muted">Every day attended still adds ${moneyShort(T('college').valuePence)}.</span>`);
    note = parts.join('') || `<span class="muted">Every day attended still adds ${moneyShort(T('college').valuePence)}.</span>`;
  }
  return `<section class="card" aria-label="Monthly progress">
    <div class="prog-top"><h3>College attendance${sum.bonus && !sum.released ? ' <span class="pill neutral">indicative</span>' : ''}</h3><span class="pct num">${sum.counted ? sum.ratePct.toFixed(1) + '%' : '–'}</span></div>
    <div class="note" style="margin-top:2px">${sum.counted ? `${sum.attended} of ${sum.counted} college days so far` : 'No college days so far'}${sum.remainingDays ? ` · ${sum.remainingDays} to go` : ''}</div>
    <div class="bar" role="img" aria-label="${sum.ratePct.toFixed(1)} percent of college days attended so far. Bonus markers at 70, 80 and 100 percent."><div class="fill" style="width:${pct}%"></div>${markers}</div>
    <div class="prog-note">${note}</div>
    ${compact ? '' : `<div class="note" style="margin-top:8px">Bonus levels use college attendance only. Other tasks add to the balance but don't change the percentage.</div>`}
  </section>`;
}

function taskRow(item, viewDate) {
  const d = T(item.taskId);
  const past = viewDate && viewDate !== today();
  const done = item.status === 'completed';
  const quiet = item.status === 'excused' || item.status === 'capped';
  let sub = d.subtitle || '';
  if (item.weekly) {
    const wk = past && C.mondayOf(viewDate) !== C.mondayOf(today()) ? 'That week' : 'This week';
    const done_ = done && app.S.occ[item.occId] && app.S.occ[item.occId].localDate !== viewDate && viewDate ? `Done ${shortDate(app.S.occ[item.occId].localDate)}` : wk;
    sub = done ? `${done_} · ${item.doneThisMonth} of ${item.slots} this month` : item.status === 'capped' ? `${item.slots} of ${item.slots} done this month` : `Any day ${wk.toLowerCase()} · ${item.doneThisMonth} of ${item.slots} this month`;
  }
  if (item.status === 'excused') sub = 'Excused and not counted';
  let control;
  if (ROLE !== 'parent') control = done ? `<span class="cbtn on" role="img" aria-label="Done">${icon('check')}</span>` : quiet ? `<span class="tag">${item.status === 'capped' ? 'Complete' : 'Excused'}</span>` : `<span class="tag">To do</span>`;
  else if (done) control = `<button class="cbtn on" type="button" disabled aria-label="${esc(d.label)} completed" id="c-${item.taskId}">${icon('check')}</button>`;
  else if (quiet) control = `<span class="tag">${item.status === 'capped' ? 'Complete' : 'Excused'}</span>`;
  else {
    const can = C.canComplete(app.S, item.taskId, item.weekly ? (viewDate || today()) : item.date, today());
    control = `<button class="cbtn" type="button" data-act="complete" data-task="${item.taskId}" data-date="${viewDate || today()}" id="c-${item.taskId}" aria-label="Mark ${esc(d.label)} complete${past ? ' for ' + esc(shortDate(viewDate)) : ''}, ${moneyShort(item.valuePence)}" title="${can ? 'Mark complete' : 'This month is closed'}" ${app.readOnly || app.pending.has(item.occId) || !can ? 'disabled' : ''}>${icon('check')}</button>`;
  }
  return `<div class="task ${done ? 'done' : ''} ${quiet ? 'quiet' : ''}">
    <div class="tico">${icon(item.taskId)}</div>
    <div class="body"><div class="t">${esc(d.label)}</div><div class="s">${done ? (item.weekly ? esc(sub) : 'Completed' + (sub ? ' · ' + esc(sub) : '')) : esc(sub)}</div></div>
    <span class="v num">${done ? '+' : ''}${moneyShort(item.valuePence)}</span>
    ${control}
  </div>`;
}

function nextScheduled(t) {
  for (let i = 1; i <= 60; i++) {
    const d = C.addDays(t, i);
    const items = C.todayTasks(app.S, d).filter((x) => x.status === 'scheduled');
    if (items.length) return d;
  }
  return null;
}

function renderHome(t) {
  const S = app.S, ym = C.monthOf(t);
  const sum = C.monthSummary(S, ym, t);
  const L = C.ledger(S, t);
  const start = (S.settings && S.settings.startDate) || t;
  const hd = ROLE === 'parent' && app.homeDate && app.homeDate < t && app.homeDate >= start ? app.homeDate : t;
  const items = C.todayTasks(S, hd);
  const acts = C.activity(S).slice(0, 3);
  const fri = C.nextFriday(t);
  let todayHtml;
  if (!items.length) {
    const n = nextScheduled(t);
    todayHtml = `<div class="empty"><strong>Nothing scheduled right now</strong>${n ? 'Next task ' + esc(longDate(n)) : ''}</div>`;
  } else todayHtml = `<div class="tasks">${items.map((it) => taskRow(it, hd)).join('')}</div>`;
  const dayLabel = hd === t ? 'Today' : hd === C.addDays(t, -1) ? 'Yesterday' : fmtD(hd, { weekday: 'long', day: 'numeric', month: 'short' });
  const dayNav = ROLE === 'parent'
    ? `<div class="daynav"><button class="iconbtn sm" type="button" data-act="home-day" data-d="-1" id="hd-prev" aria-label="Previous day" ${hd > start ? '' : 'disabled'}>${icon('left', 'sm')}</button>
        <h2 aria-live="polite">${esc(dayLabel)}</h2>
        <button class="iconbtn sm" type="button" data-act="home-day" data-d="1" id="hd-next" aria-label="Next day" ${hd < t ? '' : 'disabled'}>${icon('right', 'sm')}</button></div>
       ${hd !== t ? `<span class="daylinks"><button class="linkbtn" type="button" data-act="home-day" data-d="0" id="hd-today">Today</button><button class="linkbtn" type="button" data-act="edit-day" data-date="${hd}" id="hd-edit">Edit day</button></span>` : ''}`
    : `<h2>Today</h2>`;
  return `
    ${balanceCard(sum, L)}
    ${progressCard(sum, true)}
    <div class="section-h">${dayNav}</div>
    <section class="card" style="padding:0">${todayHtml}</section>
    <section class="card payout" aria-label="Next payment">
      <div class="tico">${icon('banknote')}</div>
      <div class="body"><div class="small muted">${fri === t ? 'Payment day · today' : 'Next payment · ' + esc(fmtD(fri, { weekday: 'long', day: 'numeric', month: 'short' }))}</div>
      <strong class="num">${L.credit > 0 ? money(L.credit) + ' credit' : L.unpaid > 0 ? money(L.unpaid) + ' still to pay' : 'Nothing due'}</strong></div>
    </section>
    <div class="section-h"><h2>Recent activity</h2>${acts.length ? `<button class="linkbtn" type="button" data-act="tab" data-tab="activity" id="see-all">See all</button>` : ''}</div>
    <section class="card" style="padding:0">${acts.length ? `<div class="txs">${acts.map((a) => txRow(a, t)).join('')}</div>` : `<div class="empty">No activity yet</div>`}</section>`;
}

function txRow(a, t, clickable) {
  const d = a.taskId ? T(a.taskId) : null;
  let ico, title, sub, amt;
  const when = a.at && a.kind === 'completion' ? timeLondon(a.at) : '';
  if (a.kind === 'completion') { ico = a.taskId; title = d.label; sub = 'Completed' + (when ? ' · ' + when : '') + (a.date !== (a.at || '').slice(0, 10) && a.date ? '' : ''); amt = `<span class="a pos num">+${money(a.amountPence)}</span>`; }
  else if (a.kind === 'payment') { ico = 'payment'; title = 'Payment recorded'; sub = 'Transferred from still to pay' + (a.note ? ' · ' + a.note : ''); amt = `<span class="a num">${money(a.amountPence)} paid</span>`; }
  else if (a.kind === 'excuse') { ico = 'excuse'; title = d ? d.label : 'Task'; sub = 'Excused and not counted · ' + shortDate(a.date); amt = `<span class="a num muted">£0.00</span>`; }
  else { ico = 'correction'; title = d ? d.label : 'Task'; sub = `Corrected · ${STATUS_LABEL[a.from] || a.from} → ${STATUS_LABEL[a.to] || a.to} · ${shortDate(a.date)}`; amt = a.from === 'completed' ? `<span class="a struck num">${money(a.amountPence)}</span>` : a.to === 'completed' ? `<span class="a pos num">+${money(a.amountPence)}</span>` : `<span class="a num muted">£0.00</span>`; }
  const tag = clickable ? 'button' : 'div';
  const attrs = clickable ? ` type="button" data-act="edit-occ" data-occ="${esc(a.occId)}" id="tx-${esc(a.id)}" aria-label="Correct ${esc(title)} on ${esc(shortDate(a.date))}"` : '';
  return `<${tag} class="tx"${attrs}><div class="tico">${icon(ico, 'sm')}</div><div class="body"><div class="t">${esc(title)}</div><div class="s">${esc(sub)}</div></div>${amt}</${tag}>`;
}

function renderActivity(t) {
  const all = C.activity(app.S);
  const months = Array.from(new Set(all.map((a) => C.monthOf(a.date || (a.at || '').slice(0, 10))))).filter(Boolean).sort().reverse();
  const cats = [['all', 'All'], ['morning', T('morning').label], ['college', 'College'], ['room', 'Tidy room'], ['meal', 'Meal'], ['bath', 'Bathroom'], ['payment', 'Payments']];
  const list = all.filter((a) => (app.actMonth === 'all' || C.monthOf(a.date) === app.actMonth) && (app.actCat === 'all' || (app.actCat === 'payment' ? a.kind === 'payment' : a.taskId === app.actCat)));
  const groups = [];
  for (const a of list) {
    const key = a.kind === 'completion' || a.kind === 'payment' ? a.date : (a.at || '').slice(0, 10) && C.todayLondon(new Date(a.at));
    const g = groups[groups.length - 1];
    if (g && g.key === key) g.items.push(a); else groups.push({ key, items: [a] });
  }
  const label = (d) => (d === t ? 'Today' : d === C.addDays(t, -1) ? 'Yesterday' : shortDate(d));
  const parentClick = ROLE === 'parent';
  return `
    <div class="filters">
      <label class="small muted" for="act-month">Month</label>
      <select class="sel auto" id="act-month" data-act="act-month">
        <option value="all">All months</option>
        ${months.map((m) => `<option value="${m}" ${app.actMonth === m ? 'selected' : ''}>${esc(monthName(m))}</option>`).join('')}
      </select>
    </div>
    <div class="filters" role="group" aria-label="Category">${cats.map(([k, l]) => `<button type="button" class="chip" id="cat-${k}" data-act="act-cat" data-cat="${k}" aria-pressed="${app.actCat === k}">${esc(l)}</button>`).join('')}</div>
    ${parentClick ? `<p class="note">Parent mode: tap a completion to correct it.</p>` : ''}
    ${groups.length ? groups.map((g) => `<div><div class="dategrp">${esc(label(g.key))}</div><section class="card" style="padding:0"><div class="txs">${g.items.map((a) => txRow(a, t, parentClick && a.kind === 'completion')).join('')}</div></section></div>`).join('') : `<section class="card"><div class="empty">No activity for this filter</div></section>`}`;
}

const DAY_LABEL = {
  pill: { completed: 'Taken', missed: 'Not recorded', excused: 'Excused', scheduled: 'Not yet today', future: 'Upcoming' },
  college: { completed: 'Attended', missed: 'Not attended', excused: 'Excused', scheduled: 'Today', future: 'Upcoming' },
};
function badge(ic, status) { return `<i class="bdg ${status}">${icon(ic)}</i>`; }
function sheetViewWeek(mon) {
  const S = app.S, t = today();
  const rows = C.WEEKLY_IDS.map((id) => {
    const o = S.occ[`${id}_W${mon}`];
    const status = o ? o.status : mon > t ? 'future' : C.addDays(mon, 6) < t ? 'missed' : 'scheduled';
    const label = o && o.status === 'completed' ? 'Done ' + shortDate(o.localDate) + (o.completedAt ? ' · ' + timeLondon(o.completedAt) : '') : status === 'scheduled' ? 'Open this week' : status === 'future' ? 'Upcoming' : STATUS_LABEL[status] === 'Not completed' ? 'Not done' : STATUS_LABEL[status];
    return `<div class="task" style="padding:12px 0">${badge(id, status)}<div class="body"><div class="t">${esc(T(id).label)}</div><div class="s">${esc(label)}</div></div>${o && o.status === 'completed' ? `<span class="v num" style="color:var(--green)">+${moneyShort(o.valuePence)}</span>` : `<span class="v num muted">${moneyShort(T(id).valuePence)}</span>`}</div>`;
  }).join('');
  openSheet(`Week of ${dayMonth(mon)}`, rows + `<p class="note">Each weekly task can be done once, any day Monday to Sunday, up to 4 times a month.</p>`);
}
function sheetViewDay(date) {
  const S = app.S, t = today(), ym = C.monthOf(date);
  const ms = C.dayStatus(S, 'morning', date, t);
  const isCollege = C.collegeDates(S, ym).includes(date);
  const cs = isCollege ? C.dayStatus(S, 'college', date, t) : null;
  const mo = S.occ[C.occId('morning', date)], co = S.occ[C.occId('college', date)];
  const row = (ic, title, status, labels, occ, extra) => `<div class="task" style="padding:12px 0">${badge(ic, status)}<div class="body"><div class="t">${esc(title)}</div><div class="s">${esc(labels[status] || STATUS_LABEL[status] || status)}${occ && occ.status === 'completed' && occ.completedAt ? ' · ' + esc(timeLondon(occ.completedAt)) : ''}${extra || ''}</div></div>${occ && occ.status === 'completed' ? `<span class="v num" style="color:var(--green)">+${moneyShort(occ.valuePence)}</span>` : ''}</div>`;
  const weekly = C.WEEKLY_IDS.map((id) => S.occ[`${id}_W${C.mondayOf(date)}`]).filter((o) => o && o.localDate === date && o.status === 'completed');
  openSheet(longDate(date), `
    ${row('pill', 'Medication', date > t ? 'future' : ms, DAY_LABEL.pill, mo)}
    ${isCollege ? row('college', 'College', cs, DAY_LABEL.college, co) : `<div class="task" style="padding:12px 0"><i class="bdg future">${icon('college')}</i><div class="body"><div class="t">College</div><div class="s">No college scheduled</div></div></div>`}
    ${weekly.map((o) => `<div class="task" style="padding:12px 0"><i class="bdg completed">${icon(o.taskId)}</i><div class="body"><div class="t">${esc(T(o.taskId).label)}</div><div class="s">Completed${o.completedAt ? ' · ' + esc(timeLondon(o.completedAt)) : ''}</div></div><span class="v num" style="color:var(--green)">+${moneyShort(o.valuePence)}</span></div>`).join('')}`);
}
function renderPlan(t) {
  const S = app.S;
  const ym = app.planMonth || C.monthOf(t);
  const sum = C.monthSummary(S, ym, t);
  const first = C.monthStart(ym), lead = C.weekday(first) - 1;
  const cd = C.collegeDates(S, ym);
  const start = (S.settings && S.settings.startDate) || first;
  const parent = ROLE === 'parent';
  const weeks = C.planWeeks(S, ym);
  const wstat = (id, mon) => {
    const o = S.occ[`${id}_W${mon}`];
    const sunday = C.addDays(mon, 6);
    if (o && C.monthOf(o.localDate) !== ym) return { s: o.status === 'completed' ? 'completed' : 'future', label: (o.status === 'completed' ? 'Done' : STATUS_LABEL[o.status]) + ', counted in ' + fmtD(o.localDate, { month: 'long' }) };
    if (o) return { s: o.status, label: o.status === 'completed' ? 'Done ' + shortDate(o.localDate) : STATUS_LABEL[o.status] };
    if (mon > t) return { s: 'future', label: 'Upcoming' };
    if (sunday < t) return { s: 'missed', label: 'Not done' };
    return { s: 'scheduled', label: 'Open this week' };
  };
  let cells = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<div class="dow" aria-hidden="true">${d.slice(0, 1)}</div>`).join('') + `<div class="dow" aria-hidden="true" title="Weekly tasks">Wk</div>`;
  for (let mon = C.mondayOf(first); mon <= C.monthEnd(ym); mon = C.addDays(mon, 7)) {
    for (let i = 0; i < 7; i++) {
      const d = C.addDays(mon, i);
      if (C.monthOf(d) !== ym) { cells += `<div></div>`; continue; }
      const inPlan = d >= start;
      const ms = inPlan ? C.dayStatus(S, 'morning', d, t) : null;
      const cs = inPlan && cd.includes(d) ? C.dayStatus(S, 'college', d, t) : null;
      const medBadge = ms && ms !== 'future' ? badge('pill', ms) : '<span class="bdg-gap"></span>';
      const colBadge = cs ? badge('college', cs) : '<span class="bdg-gap"></span>';
      const aria = `${shortDate(d)}${ms && ms !== 'future' ? ': medication ' + (DAY_LABEL.pill[ms] || ms) : ''}${cs ? ', college ' + (DAY_LABEL.college[cs] || cs) : ''}`;
      const cls = `day ${d === t ? 'today' : ''} ${inPlan ? '' : 'out'}`;
      cells += inPlan
        ? `<button type="button" class="${cls}" data-act="${parent ? 'edit-day' : 'view-day'}" data-date="${d}" id="day-${d}" aria-label="${esc(aria)}. ${parent ? 'Edit' : 'Details'}"><span class="dnum">${Number(d.slice(8))}</span><span class="marks">${medBadge}${colBadge}</span></button>`
        : `<div class="${cls}" aria-hidden="true"><span class="dnum">${Number(d.slice(8))}</span></div>`;
    }
    if (weeks.includes(mon)) {
      const st = C.WEEKLY_IDS.map((id) => [id, wstat(id, mon)]);
      const aria = `Week of ${dayMonth(mon)}: ` + st.map(([id, w]) => `${T(id).label} ${w.label}`).join(', ');
      cells += `<button type="button" class="wkcell" data-act="${parent ? 'edit-week' : 'view-week'}" data-mon="${mon}" id="wkc-${mon}" aria-label="${esc(aria)}. ${parent ? 'Edit' : 'Details'}">${st.map(([id, w]) => badge(id, w.s)).join('')}</button>`;
    } else cells += `<div></div>`;
  }
  const medDays = C.monthDates(ym).filter((d) => d >= start && d <= t && C.dayStatus(S, 'morning', d, t) !== 'excused' && !(d === t && C.dayStatus(S, 'morning', d, t) === 'scheduled'));
  const medDone = medDays.filter((d) => C.dayStatus(S, 'morning', d, t) === 'completed').length;
  const wkRow = (mon) => {
    const a = mon < first ? first : mon, b = C.addDays(mon, 6) > C.monthEnd(ym) ? C.monthEnd(ym) : C.addDays(mon, 6);
    const st = C.WEEKLY_IDS.map((id) => [id, wstat(id, mon)]);
    const inner = `<span>${esc(dayMonth(a))} – ${esc(dayMonth(b))}</span><span class="wbadges">${st.map(([id, w]) => `<span title="${esc(T(id).label + ': ' + w.label)}">${badge(id, w.s)}</span>`).join('')}</span>`;
    const aria = `Week of ${dayMonth(a)}: ` + st.map(([id, w]) => `${T(id).label} ${w.label}`).join(', ');
    return `<button type="button" class="wk" data-act="${parent ? 'edit-week' : 'view-week'}" data-mon="${mon}" id="wk-${mon}" aria-label="${esc(aria)}. ${parent ? 'Edit' : 'Details'}">${inner}</button>`;
  };
  const catRows = C.TASK_IDS.map((id) => {
    const b = sum.byTask[id];
    const pct = b.possible ? Math.min(100, (b.earned / b.possible) * 100) : 0;
    const extra = C.isWeekly(id) ? ` · ${b.completed} of ${b.total}` : id === 'college' ? ` · ${b.completed} of ${b.total} days` : '';
    return `<div class="cat"><span class="muted">${icon(id, 'sm')}</span><div><div class="small"><strong>${esc(T(id).label)}</strong></div>${extra ? `<div class="meta">${esc(extra.replace(/^ · /, ''))}</div>` : ''}<div class="mini"><i style="width:${pct}%"></i></div></div><span class="small num">${money(b.earned)} <span class="muted">/ ${money(b.possible)}</span></span></div>`;
  }).join('');
  const rung = (l) => {
    const on = sum.unlocked.includes(l.key);
    const lower = C.LADDER.filter((x) => x.key < l.key);
    const range = l.key === 100 ? '100%' : `${l.key}% to ${C.LADDER[C.LADDER.indexOf(l) + 1].key - 0.01}%`;
    void lower;
    return `<div class="rung ${on ? 'on' : ''}">${icon(on ? 'unlock' : 'lock')}<div class="body"><div><strong>${range}</strong></div><div class="small muted">${on ? (sum.bonus === l.bonusPence ? (sum.released ? 'Released ' + shortDateNoDay(sum.releaseDate) : 'On track · paid ' + shortDateNoDay(sum.releaseDate)) : 'Passed') : 'Locked'}</div></div><strong class="num">${moneyShort(l.bonusPence)}</strong></div>`;
  };
  const ended = t > C.monthEnd(ym);
  const monthResult = ended ? `<p class="small" style="margin:10px 0 0">You earned <strong class="num">${money(sum.total)}</strong> this month.</p>` : `<p class="small muted" style="margin:10px 0 0">Indicative so far: <strong class="num" style="color:var(--ink)">${money(sum.total)}</strong></p>`;
  const canPrev = ym > C.monthOf(start) || Object.keys(S.months).some((m) => m < ym);
  return `
    <section class="card">
      <div class="monthnav">
        <button class="iconbtn" type="button" data-act="month" data-d="-1" id="m-prev" aria-label="Previous month" ${canPrev ? '' : 'disabled'}>${icon('left')}</button>
        <h2>${esc(monthName(ym))}</h2>
        <button class="iconbtn" type="button" data-act="month" data-d="1" id="m-next" aria-label="Next month">${icon('right')}</button>
      </div>
      ${monthResult}
    </section>
    ${parent ? progressCard(sum, false) : ''}
    <section class="card" aria-label="Calendar">
      <div class="prog-top"><h3>Calendar</h3><span class="small muted">${parent ? 'Tap a day to edit' : 'Tap a day for details'}</span></div>
      <div class="cal-sum small"><span>${badge('pill', 'completed')} Medication <strong class="num">${medDone}</strong> of ${medDays.length} days</span><span>${badge('college', 'completed')} College <strong class="num">${sum.attended}</strong> of ${sum.counted} days</span></div>
      <div class="cal">${cells}</div>
      <p class="note" style="margin:8px 0 0">The Wk column shows ${esc(C.WEEKLY_IDS.map((id) => T(id).label.toLowerCase()).join(', ').replace(/, ([^,]*)$/, ' and $1'))} for each week.</p>
      <div class="legend">
        <span>${badge('check', 'completed')}Done</span><span>${badge('check', 'missed')}Not done</span><span>${badge('check', 'excused')}Excused</span><span>${badge('check', 'scheduled')}Today</span><span>${badge('college', 'future')}Upcoming</span>
      </div>
    </section>
    ${parent ? '' : progressCard(sum, false)}
    <section class="card" aria-label="Weekly tasks">
      <div class="prog-top"><h3>Weekly tasks</h3><span class="small muted">Max 4 each per month</span></div>
      <div class="cal-sum small">${C.WEEKLY_IDS.map((id) => `<span>${badge(id, 'completed')} ${esc(T(id).label)} <strong class="num">${sum.byTask[id].completed}</strong> of ${sum.byTask[id].total}</span>`).join('')}</div>
      <div class="weeks">${weeks.map(wkRow).join('') || '<div class="empty">No weeks in plan</div>'}</div>
    </section>
    <section class="card" aria-label="By task"><div class="prog-top" style="margin-bottom:4px"><h3>By task</h3></div>${catRows}</section>
    <section class="card ladder" aria-label="Bonus ladder"><div class="prog-top" style="margin-bottom:4px"><h3>Bonus ladder</h3><span class="small muted">Highest level only</span></div>${C.LADDER.map(rung).join('')}</section>
    ${parent ? `<div class="section-h" id="settings"><h2>Parent tools</h2></div>${renderParentTools(ym, t, sum)}` : `<p class="note" id="settings">Read-only view. Updates every minute.</p>`}`;
}

function renderParentTools(ym, t, sum) {
  const info = app.mode === 'demo'
    ? 'Demo mode keeps sample data in this browser tab only. Nothing is saved.'
    : `Data is stored on this site's server. ${childName()}'s view at the site's home page shows progress without notes or correction reasons.`;
  const ended = t > C.monthEnd(ym);
  const m = app.S.months[ym] || {};
  const cdCount = C.collegeDates(app.S, ym).length;
  return `<section class="card stack">
    <div class="tools">
      <button class="btn" type="button" data-act="sheet-college" id="t-college">${icon('college', 'sm')}College days <span class="muted">(${cdCount})</span></button>
      <button class="btn" type="button" data-act="sheet-payment" id="t-pay">${icon('payment', 'sm')}Record payment</button>
      <button class="btn" type="button" data-act="sheet-tasks" id="t-tasks">${icon('sliders', 'sm')}Tasks and values</button>
      ${m.closed ? `<button class="btn" type="button" data-act="sheet-close" id="t-close">${icon('unlock', 'sm')}Reopen month</button>` : `<button class="btn" type="button" data-act="sheet-close" id="t-close" ${ended ? '' : 'disabled title="Available after the month ends"'}>${icon('flag', 'sm')}Close month</button>`}
      <button class="btn" type="button" data-act="sheet-backup" id="t-backup">${icon('download', 'sm')}Backup and reset</button>
      ${app.mode === 'demo' ? '' : `<a class="btn" href="/demo" id="t-demo">${icon('plan', 'sm')}Demo with sample data</a>`}
      ${app.mode === 'demo' ? `<button class="btn" type="button" data-act="exit-demo" id="t-exit">${icon('logout', 'sm')}Exit demo</button>` : `<button class="btn" type="button" data-act="signout" id="t-signout">${icon('logout', 'sm')}Sign out</button>`}
    </div>
    <p class="note">Tap a calendar day or week above to mark tasks completed, not completed or excused. ${cdCount === 0 ? '<strong>No college days chosen for this month yet.</strong>' : ''}</p>
    <p class="note">${esc(info)}</p>
  </section>`;
}

// balance count-up
function animateBalance() {
  const el = $('#bal-amt'); if (!el) return;
  const to = Number(el.dataset.v);
  const from = app.shownEarned;
  app.shownEarned = to;
  if (from == null || from === to || reduceMotion()) return;
  const t0 = performance.now(), dur = 300;
  const paint = (v) => { const p = Math.round(v); el.innerHTML = `£${Math.floor(p / 100).toLocaleString('en-GB')}<span class="pence">.${String(p % 100).padStart(2, '0')}</span>`; };
  const step = (now) => { const k = Math.min(1, (now - t0) / dur); paint(from + (to - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

// ---------------- sheets ----------------
let sheetReturn = null;
function openSheet(title, html, mount) {
  sheetReturn = document.activeElement;
  const r = $('#sheet-root');
  r.innerHTML = `<div class="scrim" data-sheet-scrim><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><div class="sheet-h"><h2 id="sheet-title">${esc(title)}</h2><button class="iconbtn" type="button" data-sheet-close aria-label="Close" id="sheet-x">${icon('x')}</button></div><div id="sheet-body">${html}</div></div></div>`;
  r.querySelector('[data-sheet-close]').onclick = closeSheet;
  r.querySelector('[data-sheet-scrim]').addEventListener('mousedown', (e) => { if (e.target.hasAttribute('data-sheet-scrim')) closeSheet(); });
  if (mount) mount($('#sheet-body'));
  const f = r.querySelector('#sheet-body input, #sheet-body select, #sheet-body button'); if (f) f.focus();
}
function closeSheet() { $('#sheet-root').innerHTML = ''; if (sheetReturn && document.body.contains(sheetReturn)) sheetReturn.focus(); }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#sheet-root').innerHTML) closeSheet(); });
const sheetErr = (body, msg) => { let el = body.querySelector('.err'); if (!el) { el = document.createElement('div'); el.className = 'err'; body.prepend(el); } el.textContent = msg; };

function statusSeg(name, current, options) {
  return `<div class="seg" role="radiogroup">${options.map((o) => `<label><input type="radio" name="${name}" value="${o}" ${current === o ? 'checked' : ''}>${esc(o === 'scheduled' ? 'Open' : STATUS_LABEL[o].replace(' and not counted', ''))}</label>`).join('')}</div>`;
}

function sheetDay(date) {
  const S = app.S, t = today(), ym = C.monthOf(date);
  const isCollege = C.collegeDates(S, ym).includes(date);
  const future = date > t;
  const opts = future ? ['scheduled', 'excused'] : ['completed', 'missed', 'excused'];
  const curStatus = (id) => { const s = C.dayStatus(S, id, date, t); return s === 'future' ? 'scheduled' : s === 'scheduled' ? (future ? 'scheduled' : 'missed') : s; };
  const mo = S.occ[C.occId('morning', date)], co = S.occ[C.occId('college', date)];
  const closed = S.months[ym] && S.months[ym].closed;
  openSheet(longDate(date), `
    ${closed ? '<div class="err">This month is closed. Reopen it to make changes.</div>' : ''}
    <div class="field"><span class="lab">${esc(T('morning').label)}</span>${statusSeg('morning', curStatus('morning'), opts)}</div>
    <div class="field"><label><input type="checkbox" id="d-college" ${isCollege ? 'checked' : ''}> College day</label>
      <div id="d-college-status" ${isCollege ? '' : 'hidden'}>${statusSeg('college', isCollege ? curStatus('college') : (future ? 'scheduled' : 'missed'), opts)}</div></div>
    <div class="field"><label for="d-reason">Reason for change (optional)</label><input class="inp" id="d-reason" maxlength="120" placeholder="e.g. College closed"></div>
    <div class="field"><label for="d-note">Private note (optional, not shown on Home)</label><input class="inp" id="d-note" maxlength="200" value="${esc((co && co.note) || (mo && mo.note) || '')}"></div>
    <button class="btn primary block" type="button" id="d-save" ${closed ? 'disabled' : ''}>Save changes</button>`, (body) => {
    const cb = body.querySelector('#d-college');
    cb.onchange = () => { body.querySelector('#d-college-status').hidden = !cb.checked; };
    body.querySelector('#d-save').onclick = async () => {
      const reason = body.querySelector('#d-reason').value.trim(), note = body.querySelector('#d-note').value.trim();
      const val = (n) => { const x = body.querySelector(`input[name="${n}"]:checked`); return x && x.value; };
      try {
        await changeStatus({ taskId: 'morning', date, to: val('morning'), reason, note: val('morning') === 'excused' ? note : '' });
        const m = Object.assign({ collegeDates: [] }, S.months[ym]);
        if (cb.checked !== isCollege) {
          m.collegeDates = cb.checked ? m.collegeDates.concat([date]).sort() : m.collegeDates.filter((d) => d !== date);
          await ops.setMonth(ym, m);
        }
        if (cb.checked) await changeStatus({ taskId: 'college', date, to: val('college'), reason, note: val('college') === 'excused' ? note : '' });
        closeSheet(); toast('Saved');
      } catch (e) { sheetErr(body, 'Not saved. Try again.'); }
    };
  });
}

function sheetWeek(mon) {
  const S = app.S, t = today(), ym = app.planMonth || C.monthOf(t);
  const first = C.monthStart(ym), last = C.monthEnd(ym);
  const a = mon < first ? first : mon, bEnd = C.addDays(mon, 6) > last ? last : C.addDays(mon, 6);
  const latest = bEnd < t ? bEnd : t;
  const future = a > t;
  const closed = S.months[ym] && S.months[ym].closed;
  const rows = C.WEEKLY_IDS.map((id) => {
    const o = S.occ[`${id}_W${mon}`];
    const other = o && C.monthOf(o.localDate) !== ym;
    const cur = o ? o.status : future ? 'scheduled' : C.addDays(mon, 6) < t ? 'missed' : 'scheduled';
    const opts = future ? ['scheduled', 'excused'] : ['completed', 'missed', 'excused', 'scheduled'];
    return `<div class="field"><span class="lab">${esc(T(id).label)}</span>${other ? `<p class="note">Counted in ${esc(monthName(C.monthOf(o.localDate)))}. Edit it from that month.</p>` : statusSeg(id, cur, opts)}</div>`;
  }).join('');
  openSheet(`Week of ${dayMonth(a)}`, `
    ${closed ? '<div class="err">This month is closed. Reopen it to make changes.</div>' : ''}
    ${rows}
    ${future ? '' : `<div class="field"><label for="w-date">Date to record completions on</label><input class="inp" type="date" id="w-date" min="${a}" max="${latest}" value="${latest}"></div>`}
    <div class="field"><label for="w-reason">Reason for change (optional)</label><input class="inp" id="w-reason" maxlength="120"></div>
    <button class="btn primary block" type="button" id="w-save" ${closed ? 'disabled' : ''}>Save changes</button>`, (body) => {
    body.querySelector('#w-save').onclick = async () => {
      const reason = body.querySelector('#w-reason').value.trim();
      const dEl = body.querySelector('#w-date');
      const date = dEl && dEl.value >= a && dEl.value <= latest ? dEl.value : a;
      try {
        for (const id of C.WEEKLY_IDS) {
          const x = body.querySelector(`input[name="${id}"]:checked`); if (!x) continue;
          const o = S.occ[`${id}_W${mon}`];
          if (x.value === 'completed' && !(o && o.status === 'completed')) {
            const w = C.weeklyInfo(app.S, ym, id);
            if (w.paid.length >= w.slots) { sheetErr(body, `${T(id).label} already has ${w.slots} paid this month.`); return; }
          }
          await changeStatus({ taskId: id, date: o && o.status === x.value ? o.localDate : date, to: x.value, reason, weekMonday: mon });
        }
        closeSheet(); toast('Saved');
      } catch (e) { sheetErr(body, 'Not saved. Try again.'); }
    };
  });
}

function sheetEditOcc(occId) {
  const o = app.S.occ[occId]; if (!o) return;
  if (C.isWeekly(o.taskId)) { app.planMonth = C.monthOf(o.localDate); return sheetWeek(C.mondayOf(o.localDate)); }
  return sheetDay(o.localDate);
}

function sheetCollege() {
  const t = today(), ym = app.planMonth || C.monthOf(t);
  const start = (app.S.settings && app.S.settings.startDate) || C.monthStart(ym);
  let sel = new Set(C.collegeDates(app.S, ym));
  const lead = C.weekday(C.monthStart(ym)) - 1;
  const grid = () => ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<div class="small muted" style="text-align:center">${d}</div>`).join('') + Array.from({ length: lead }, () => '<div></div>').join('') +
    C.monthDates(ym).map((d) => `<button type="button" data-d="${d}" aria-pressed="${sel.has(d)}" aria-label="${esc(shortDate(d))}" ${d < start ? 'disabled' : ''}>${Number(d.slice(8))}</button>`).join('');
  openSheet(`College days · ${monthName(ym)}`, `
    <p class="note" style="margin-top:0">Choose the days college is scheduled. The agreement is 16 per month.</p>
    <div class="picker" id="cp">${grid()}</div>
    <p class="small" style="margin:12px 0" id="cp-count"></p>
    <div class="btnrow" style="margin-bottom:14px"><button class="btn" type="button" id="cp-weekdays">Select weekdays</button><button class="btn" type="button" id="cp-clear">Clear</button></div>
    <button class="btn primary block" type="button" id="cp-save">Save college days</button>`, (body) => {
    const cp = body.querySelector('#cp');
    const upd = () => { cp.innerHTML = grid(); body.querySelector('#cp-count').innerHTML = `<strong>${sel.size}</strong> selected${sel.size !== 16 ? ' <span class="muted">(agreed: 16)</span>' : ''}`; };
    upd();
    cp.onclick = (e) => { const b = e.target.closest('button[data-d]'); if (!b || b.disabled) return; const d = b.dataset.d; sel.has(d) ? sel.delete(d) : sel.add(d); upd(); cp.querySelector(`[data-d="${d}"]`).focus(); };
    body.querySelector('#cp-weekdays').onclick = () => { C.monthDates(ym).forEach((d) => { if (C.weekday(d) <= 5 && d >= start) sel.add(d); }); upd(); };
    body.querySelector('#cp-clear').onclick = () => { sel = new Set(); upd(); };
    body.querySelector('#cp-save').onclick = async () => {
      try { await ops.setMonth(ym, Object.assign({}, app.S.months[ym] || {}, { collegeDates: Array.from(sel).sort() })); closeSheet(); toast('College days saved'); }
      catch (e) { sheetErr(body, 'Not saved. Try again.'); }
    };
  });
}

function sheetPayment() {
  const t = today(), L = C.ledger(app.S, t);
  const recent = app.S.payments.slice().sort((a, b) => b.paidDate.localeCompare(a.paidDate)).slice(0, 6);
  openSheet('Record payment', `
    <p class="note" style="margin-top:0">Still to pay: <strong class="num">${money(L.unpaid)}</strong>${L.credit ? ` · Credit carried forward: <strong class="num">${money(L.credit)}</strong>` : ''}. Monthly bonuses are added on the 1st of the following month. This records a payment; it doesn't move money.</p>
    <div class="grid2">
      <div class="field"><label for="p-amt">Amount (£)</label><input class="inp num" id="p-amt" inputmode="decimal" value="${(L.unpaid / 100).toFixed(2)}"></div>
      <div class="field"><label for="p-date">Date</label><input class="inp" type="date" id="p-date" value="${t}" max="${t}"></div>
    </div>
    <div class="field"><label for="p-note">Note (optional)</label><input class="inp" id="p-note" maxlength="80"></div>
    <button class="btn primary block" type="button" id="p-save">Record payment</button>
    ${recent.length ? `<div class="hr"></div><div class="lab small muted" style="font-weight:600;margin-bottom:6px">Recent payments</div>${recent.map((p) => `<div class="wk" style="grid-template-columns:1fr auto auto"><span>${esc(shortDate(p.paidDate))}</span><strong class="num">${money(p.amountPence)}</strong><button class="linkbtn" type="button" data-del="${esc(p.id)}" id="pd-${esc(p.id)}">Remove</button></div>`).join('')}` : ''}`, (body) => {
    body.querySelector('#p-save').onclick = async () => {
      const raw = body.querySelector('#p-amt').value.replace(/[£,\s]/g, '');
      const date = body.querySelector('#p-date').value;
      if (!/^\d+(\.\d{1,2})?$/.test(raw) || Number(raw) <= 0) return sheetErr(body, 'Enter an amount in pounds, for example 25 or 25.50.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return sheetErr(body, 'Choose a payment date.');
      const amountPence = Math.round(Number(raw) * 100);
      try { await ops.addPayment({ id: uid(), amountPence, paidDate: date, paidAt: nowISO(), note: body.querySelector('#p-note').value.trim() }); closeSheet(); toast(`${money(amountPence)} payment recorded`); }
      catch (e) { sheetErr(body, 'Not saved. Try again.'); }
    };
    body.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = async () => {
        if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Confirm remove'; return; }
        try { await ops.delPayment(b.dataset.del); closeSheet(); toast('Payment removed'); } catch (e) { sheetErr(body, 'Not removed. Try again.'); }
      };
    });
  });
}

function sheetTasks() {
  const s = app.S.settings;
  const dayOpts = (v) => WEEKDAYS.map((d, i) => `<option value="${i + 1}" ${v === i + 1 ? 'selected' : ''}>${d}</option>`).join('');
  openSheet('Tasks and values', `
    ${C.TASK_IDS.map((id) => `<div class="grid2"><div class="field"><label for="tl-${id}">Label</label><input class="inp" id="tl-${id}" maxlength="40" value="${esc(T(id).label)}"></div><div class="field"><label for="tv-${id}">Value (£)</label><input class="inp num" id="tv-${id}" inputmode="decimal" value="${(T(id).valuePence / 100).toFixed(2)}"></div></div>`).join('')}
    <p class="note" style="margin-top:-4px">New values apply to tasks not yet completed. Agreed defaults: £3, £5, £5, £10, £10.</p>
    <div class="grid2">
      ${C.WEEKLY_IDS.map((id) => `<div class="field"><label for="t-${id}day">Usual day: ${esc(T(id).label.toLowerCase())}</label><select class="sel" id="t-${id}day">${dayOpts(s[id + 'Day'])}</select></div>`).join('')}
    </div>
    <p class="note" style="margin-top:-4px">Weekly tasks can be completed on any day of the Monday to Sunday week.</p>
    <div class="field"><label for="t-name">Name shown on the read-only view</label><input class="inp" id="t-name" maxlength="40" value="${esc(childName())}"></div>
    <div class="field"><label for="t-start">Ledger start date</label><input class="inp" type="date" id="t-start" value="${esc(s.startDate)}"><span class="note">Days before this date aren't counted.</span></div>
    <div class="btnrow"><button class="btn primary" type="button" id="t-save">Save</button><button class="btn" type="button" id="t-defaults">Restore agreed values</button></div>`, (body) => {
    body.querySelector('#t-defaults').onclick = () => { C.TASK_IDS.forEach((id) => { body.querySelector('#tl-' + id).value = C.DEFAULT_TASKS[id].label; body.querySelector('#tv-' + id).value = (C.DEFAULT_TASKS[id].valuePence / 100).toFixed(2); }); };
    body.querySelector('#t-save').onclick = async () => {
      const next = JSON.parse(JSON.stringify(s));
      for (const id of C.TASK_IDS) {
        const label = body.querySelector('#tl-' + id).value.trim();
        const raw = body.querySelector('#tv-' + id).value.replace(/[£,\s]/g, '');
        if (!label) return sheetErr(body, 'Every task needs a label.');
        if (!/^\d+(\.\d{1,2})?$/.test(raw)) return sheetErr(body, `Enter a value in pounds for ${label}.`);
        next.tasks[id] = Object.assign({}, C.DEFAULT_TASKS[id], next.tasks[id], { label, valuePence: Math.round(Number(raw) * 100) });
      }
      C.WEEKLY_IDS.forEach((id) => { next[id + 'Day'] = Number(body.querySelector('#t-' + id + 'day').value); });
      const sd = body.querySelector('#t-start').value; if (!/^\d{4}-\d{2}-\d{2}$/.test(sd)) return sheetErr(body, 'Choose a start date.');
      next.startDate = sd;
      next.childName = body.querySelector('#t-name').value.trim() || 'LieLie';
      try { await ops.setSettings(next); closeSheet(); toast('Settings saved'); } catch (e) { sheetErr(body, 'Not saved. Try again.'); }
    };
  });
}

function sheetClose() {
  const t = today(), ym = app.planMonth || C.monthOf(t);
  const m = app.S.months[ym] || { collegeDates: [] };
  const sum = C.monthSummary(app.S, ym, t);
  if (m.closed) {
    openSheet(`Reopen ${monthName(ym)}`, `
      <p style="margin-top:0">Final result: <strong class="num">${money(sum.total)}</strong> (bonus ${money(sum.bonus)}).</p>
      <p class="note">Reopening lets you change this month's tasks again. If attendance changes, the bonus is recalculated.</p>
      <button class="btn warn block" type="button" id="c-reopen">Reopen month</button>`, (body) => {
      const b = body.querySelector('#c-reopen');
      b.onclick = async () => {
        if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Confirm reopen'; return; }
        const n = Object.assign({}, m, { closed: false }); delete n.finalBonusPence; delete n.closedAt;
        try { await ops.setMonth(ym, n); closeSheet(); toast('Month reopened'); } catch (e) { sheetErr(body, 'Not saved. Try again.'); }
      };
    });
    return;
  }
  openSheet(`Close ${monthName(ym)}`, `
    <p style="margin-top:0">Task earnings <strong class="num">${money(sum.earned)}</strong>.</p>
    <p>College attendance ${sum.ratePct.toFixed(1)}% · bonus <strong class="num">${money(sum.bonus)}</strong> · month total <strong class="num">${money(sum.total)}</strong></p>
    <p class="note">The bonus was released on ${esc(longDate(sum.releaseDate))} whether or not you close the month. Closing locks the month's figures so later edits can't change them.</p>
    <button class="btn primary block" type="button" id="c-close">Close month</button>`, (body) => {
    body.querySelector('#c-close').onclick = async () => {
      try { await ops.setMonth(ym, Object.assign({}, m, { closed: true, closedAt: nowISO(), finalBonusPence: sum.bonus })); closeSheet(); toast(`${monthName(ym)} closed`); }
      catch (e) { sheetErr(body, 'Not saved. Try again.'); }
    };
  });
}

function exportObj() {
  const S = app.S;
  return { app: 'earned-ledger', version: 1, exportedAt: nowISO(), timezone: C.TZ, settings: S.settings, months: S.months, occurrences: Object.values(S.occ), payments: S.payments, auditEvents: S.audit };
}
function sheetBackup() {
  const demo = app.mode === 'demo';
  openSheet('Backup and reset', `
    <div class="field"><span class="lab">Export</span><p class="note" style="margin:0 0 6px">Download everything as a JSON file.</p><button class="btn" type="button" id="b-export">${icon('download', 'sm')}Export data</button></div>
    <div class="field"><span class="lab">Import</span><p class="note" style="margin:0 0 6px">Replace all current data with a backup from this app. Invalid files are rejected without changing anything.</p>
      <label class="btn" for="b-file" style="width:max-content">${icon('upload', 'sm')}Choose backup file</label><input type="file" id="b-file" accept="application/json,.json" hidden>
      <div id="b-import-confirm"></div></div>
    <div class="hr"></div>
    <div class="field"><span class="lab">Erase all data</span><p class="note" style="margin:0 0 6px">${demo ? 'Leaves demo mode.' : 'Permanently deletes every task, payment and setting.'} Type ERASE to confirm.</p>
      <div class="grid2"><input class="inp" id="b-erase-in" autocomplete="off" aria-label="Type ERASE to confirm"><button class="btn warn" type="button" id="b-erase" disabled>${icon('trash', 'sm')}Erase</button></div></div>`, (body) => {
    body.querySelector('#b-export').onclick = async () => {
      const data = JSON.stringify(exportObj(), null, 2);
      const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = `earned-backup-${today()}.json`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast('Backup downloaded');
    };
    body.querySelector('#b-file').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      let obj; try { obj = JSON.parse(await f.text()); } catch (err) { return sheetErr(body, "That file isn't valid JSON. Nothing was changed."); }
      const errs = C.validateImport(obj);
      if (errs.length) return sheetErr(body, 'Backup rejected, nothing was changed: ' + errs.join(' '));
      const box = body.querySelector('#b-import-confirm');
      box.innerHTML = `<p class="small" style="margin:8px 0">Valid backup from ${esc((obj.exportedAt || '').slice(0, 10) || 'unknown date')}: ${obj.occurrences.length} tasks, ${obj.payments.length} payments. This replaces all current data.</p><button class="btn primary" type="button" id="b-import-go">Replace with backup</button>`;
      box.querySelector('#b-import-go').onclick = async () => {
        if (app.mode === 'demo') {
          const S = C.emptyState();
          S.settings = obj.settings; S.months = obj.months; obj.occurrences.forEach((o) => (S.occ[o.id] = o)); S.payments = obj.payments; S.audit = obj.auditEvents;
          app.S = S; closeSheet(); render(); toast('Backup loaded into demo'); return;
        }
        try { await ops.replaceAll(obj); closeSheet(); toast('Backup restored'); }
        catch (err) { sheetErr(body, 'Backup not restored: ' + (err.message || 'try again.')); }
      };
    };
    const ei = body.querySelector('#b-erase-in'), eb = body.querySelector('#b-erase');
    ei.oninput = () => { eb.disabled = ei.value.trim() !== 'ERASE'; };
    eb.onclick = async () => {
      if (demo) { exitDemo(); closeSheet(); return; }
      try { await ops.eraseAll(); closeSheet(); toast('All data erased'); } catch (e) { sheetErr(body, 'Not erased. Try again.'); }
    };
  });
}

function exitDemo() {
  if (PAGE === 'demo') { location.href = '/parent'; return; }
  app.S = C.emptyState(); app.shownEarned = null; app.mode = 'loading'; render(); load();
}

// ---------------- events ----------------
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]'); if (!el || !$('#app').contains(el)) return;
  const act = el.dataset.act;
  if (act === 'complete') return complete(el.dataset.task, el.dataset.date);
  if (act === 'home-day') {
    const t = today(), start = (app.S.settings && app.S.settings.startDate) || t;
    const cur = app.homeDate || t, dlt = Number(el.dataset.d);
    let next = dlt === 0 ? t : C.addDays(cur, dlt);
    if (next > t) next = t; if (next < start) next = start;
    app.homeDate = next === t ? null : next; render();
    const f = document.getElementById(dlt < 0 ? 'hd-prev' : dlt > 0 ? 'hd-next' : 'hd-prev'); if (f && !f.disabled) f.focus({ preventScroll: true });
    return;
  }
  if (act === 'tab') {
    app.tab = el.dataset.tab; if (app.tab === 'plan' && !app.planMonth) app.planMonth = C.monthOf(today());
    render();
    if (el.dataset.scroll) { const s = document.getElementById(el.dataset.scroll); if (s) s.scrollIntoView({ block: 'start' }); } else window.scrollTo(0, 0);
    return;
  }
  if (act === 'month') { app.planMonth = C.shiftMonth(app.planMonth || C.monthOf(today()), Number(el.dataset.d)); return render(); }
  if (act === 'act-cat') { app.actCat = el.dataset.cat; return render(); }
  if (act === 'demo') { app.S = buildDemo(); app.mode = 'demo'; app.tab = 'home'; app.shownEarned = null; return render(); }
  if (act === 'exit-demo') return exitDemo();
  if (act === 'demo-role') { ROLE = el.dataset.role; app.parent = ROLE === 'parent'; app.tab = 'home'; app.shownEarned = null; closeSheet(); render(); window.scrollTo(0, 0); return; }
  if (act === 'demo-reset') { app.S = buildDemo(); app.shownEarned = null; render(); toast('Demo data reset'); return; }
  if (act === 'view-day') return sheetViewDay(el.dataset.date);
  if (act === 'view-week') return sheetViewWeek(el.dataset.mon);
  if (act === 'reload') { app.mode = 'loading'; render(); return load(); }
  if (ROLE !== 'parent') return;
  if (act === 'signout') return signOut();
  if (act === 'start') {
    try { await ops.setSettings(C.defaultSettings(today())); } catch (err) { return; }
    app.tab = 'plan'; app.planMonth = C.monthOf(today()); render();
    return sheetCollege();
  }
  if (act === 'edit-day') return sheetDay(el.dataset.date);
  if (act === 'edit-week') return sheetWeek(el.dataset.mon);
  if (act === 'edit-occ') return sheetEditOcc(el.dataset.occ);
  if (act === 'sheet-college') return sheetCollege();
  if (act === 'sheet-payment') return sheetPayment();
  if (act === 'sheet-tasks') return sheetTasks();
  if (act === 'sheet-close') return sheetClose();
  if (act === 'sheet-backup') return sheetBackup();
});
document.addEventListener('submit', (e) => {
  if (e.target.id === 'login-form') { e.preventDefault(); const v = $('#pw').value; if (!v) { app.loginError = 'Enter the password.'; render(); return; } signIn(v); }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'act-month') { app.actMonth = e.target.value; render(); }
});
// refresh when the household date rolls over
setInterval(() => { const t = today(); if (t !== app.lastDay) { app.lastDay = t; render(); } }, 30000);

boot();
})();
