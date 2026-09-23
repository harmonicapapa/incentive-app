// Shared server logic: storage, auth, validation and the operations the parent portal can apply.
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import Calc from '../../public/calc.js';

// ---- configuration ----
// The parent password. Set PARENT_PASSWORD in Netlify to override the built-in one.
const DEFAULT_PASSWORD = 'Vermont2527';
export const parentPassword = () => process.env.PARENT_PASSWORD || DEFAULT_PASSWORD;
const sessionSecret = () => process.env.SESSION_SECRET || createHash('sha256').update('earned-ledger-session:' + parentPassword()).digest('hex');
export const SESSION_COOKIE = 'ledger_session';
const SESSION_DAYS = 30;
const STATE_KEY = 'state';

// ---- storage (Netlify Blobs; an in-memory store can be injected for local dev and tests) ----
export async function getLedgerStore() {
  if (globalThis.__LEDGER_STORE__) return globalThis.__LEDGER_STORE__;
  const { getStore } = await import('@netlify/blobs');
  return getStore({ name: 'earned-ledger', consistency: 'strong' });
}
const empty = () => ({ settings: null, months: {}, occ: {}, payments: [], audit: [] });

export async function readState(store) {
  const res = await store.getWithMetadata(STATE_KEY, { type: 'json' });
  if (!res || !res.data) return { state: empty(), etag: null };
  return { state: Object.assign(empty(), res.data), etag: res.etag || null };
}

/** Read-modify-write with an etag check, retried if another write landed in between. */
export async function updateState(store, mutate) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { state, etag } = await readState(store);
    const next = mutate(structuredClone(state));
    const opts = etag ? { onlyIfMatch: etag } : { onlyIfNew: true };
    const res = await store.setJSON(STATE_KEY, next, opts);
    if (!res || res.modified !== false) return next;
  }
  throw new HttpError(409, 'The ledger changed while saving. Reload and try again.');
}

// ---- auth ----
export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const b64 = (s) => Buffer.from(s).toString('base64url');
const sign = (payload) => createHmac('sha256', sessionSecret()).update(payload).digest('base64url');

export function checkPassword(given) {
  const a = createHash('sha256').update(String(given || '')).digest();
  const b = createHash('sha256').update(parentPassword()).digest();
  return timingSafeEqual(a, b);
}
export function makeSessionCookie(req) {
  const exp = Date.now() + SESSION_DAYS * 864e5;
  const payload = b64(JSON.stringify({ role: 'parent', exp }));
  const token = `${payload}.${sign(payload)}`;
  return cookie(req, token, SESSION_DAYS * 86400);
}
export const clearSessionCookie = (req) => cookie(req, '', 0);
function cookie(req, value, maxAge) {
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}
export function isParent(req) {
  const raw = (req.headers.get('cookie') || '').split(/;\s*/).find((c) => c.startsWith(SESSION_COOKIE + '='));
  if (!raw) return false;
  const [payload, sig] = raw.slice(SESSION_COOKIE.length + 1).split('.');
  if (!payload || !sig) return false;
  const expected = sign(payload);
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return false;
  try { const p = JSON.parse(Buffer.from(payload, 'base64url').toString()); return p.role === 'parent' && p.exp > Date.now(); } catch { return false; }
}
export function requireParent(req) { if (!isParent(req)) throw new HttpError(401, 'Sign in to the parent portal.'); }

// ---- responses ----
export const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: Object.assign({ 'content-type': 'application/json', 'cache-control': 'no-store' }, headers),
});
export async function handle(fn) {
  try { return await fn(); }
  catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Something went wrong on the server.' }, 500);
  }
}

// ---- validation ----
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isInt = (v) => Number.isInteger(v) && v >= 0 && v <= 10_000_000;
const isStr = (v, max = 500) => typeof v === 'string' && v.length <= max;
const TASKS = Calc.TASK_IDS;
const STATUSES = ['scheduled', 'completed', 'missed', 'excused'];
const bad = (msg) => { throw new HttpError(400, msg); };

function cleanOcc(o) {
  if (!o || !TASKS.includes(o.taskId) || !isDate(o.localDate) || !STATUSES.includes(o.status) || !isInt(o.valuePence)) bad('Invalid task entry.');
  if (o.id !== Calc.occId(o.taskId, o.localDate)) bad('Task entry id does not match its date.');
  const out = { id: o.id, taskId: o.taskId, localDate: o.localDate, status: o.status, valuePence: o.valuePence, updatedAt: isStr(o.updatedAt, 40) ? o.updatedAt : new Date().toISOString() };
  if (isStr(o.completedAt, 40)) out.completedAt = o.completedAt;
  if (isStr(o.note, 200) && o.note) out.note = o.note;
  return out;
}
function cleanMonth(m) {
  if (!m || !Array.isArray(m.collegeDates) || !m.collegeDates.every(isDate) || m.collegeDates.length > 31) bad('Invalid month plan.');
  const out = { collegeDates: Array.from(new Set(m.collegeDates)).sort(), closed: !!m.closed };
  if (out.closed) { if (!isInt(m.finalBonusPence)) bad('A closed month needs a final bonus.'); out.finalBonusPence = m.finalBonusPence; out.closedAt = isStr(m.closedAt, 40) ? m.closedAt : new Date().toISOString(); }
  return out;
}
function cleanSettings(s) {
  if (!s || !isDate(s.startDate) || !s.tasks) bad('Invalid settings.');
  const tasks = {};
  for (const id of TASKS) {
    const t = s.tasks[id];
    if (!t || !isStr(t.label, 40) || !t.label.trim() || !isInt(t.valuePence)) bad(`Invalid settings for ${id}.`);
    tasks[id] = Object.assign({}, Calc.DEFAULT_TASKS[id], { label: t.label.trim(), valuePence: t.valuePence });
  }
  const day = (d, dflt) => (Number.isInteger(d) && d >= 1 && d <= 7 ? d : dflt);
  return { version: 1, timezone: Calc.TZ, currency: 'GBP', startDate: s.startDate, tasks, roomDay: day(s.roomDay, 6), mealDay: day(s.mealDay, 7), childName: isStr(s.childName, 40) && s.childName.trim() ? s.childName.trim() : 'LieLie' };
}
function cleanPayment(p) {
  if (!p || !isStr(p.id, 60) || !isInt(p.amountPence) || p.amountPence === 0 || !isDate(p.paidDate)) bad('Invalid payment.');
  return { id: p.id, amountPence: p.amountPence, paidDate: p.paidDate, paidAt: isStr(p.paidAt, 40) ? p.paidAt : new Date().toISOString(), note: isStr(p.note, 80) ? p.note : '' };
}
function cleanAudit(a) {
  if (!a || !isStr(a.id, 60) || !['correction', 'excuse'].includes(a.kind) || !isDate(a.localDate) || !TASKS.includes(a.taskId)) bad('Invalid audit entry.');
  return { id: a.id, kind: a.kind, at: isStr(a.at, 40) ? a.at : new Date().toISOString(), occId: String(a.occId || '').slice(0, 60), taskId: a.taskId, localDate: a.localDate, from: String(a.from || '').slice(0, 20), to: String(a.to || '').slice(0, 20), reason: isStr(a.reason, 120) ? a.reason : '', valuePence: isInt(a.valuePence) ? a.valuePence : 0 };
}

/** Apply a list of operations from the parent portal. Throws before writing if any op is invalid. */
export function applyOps(state, ops) {
  if (!Array.isArray(ops) || ops.length === 0 || ops.length > 50) bad('Send between 1 and 50 operations.');
  const S = state;
  for (const op of ops) {
    switch (op && op.type) {
      case 'setOcc': { const o = cleanOcc(op.occ); S.occ[o.id] = o; break; }
      case 'delOcc': if (!isStr(op.id, 60)) bad('Invalid id.'); delete S.occ[op.id]; break;
      case 'addAudit': S.audit.push(cleanAudit(op.audit)); if (S.audit.length > 3000) S.audit = S.audit.slice(-3000); break;
      case 'setMonth': if (!/^\d{4}-\d{2}$/.test(op.ym)) bad('Invalid month.'); S.months[op.ym] = cleanMonth(op.month); break;
      case 'setSettings': S.settings = cleanSettings(op.settings); break;
      case 'addPayment': { const p = cleanPayment(op.payment); S.payments = S.payments.filter((x) => x.id !== p.id).concat([p]); break; }
      case 'delPayment': S.payments = S.payments.filter((x) => x.id !== op.id); break;
      case 'replaceAll': {
        const errs = Calc.validateImport(op.data);
        if (errs.length) bad('Backup rejected: ' + errs.join(' '));
        const d = op.data;
        const next = empty();
        next.settings = cleanSettings(d.settings);
        for (const [ym, m] of Object.entries(d.months)) next.months[ym] = cleanMonth(m);
        for (const o of d.occurrences) { const c = cleanOcc(o); next.occ[c.id] = c; }
        next.payments = d.payments.map(cleanPayment);
        next.audit = (d.auditEvents || []).filter((a) => a && ['correction', 'excuse'].includes(a.kind)).map(cleanAudit);
        Object.assign(S, next);
        break;
      }
      case 'eraseAll': Object.assign(S, empty()); break;
      default: bad('Unknown operation.');
    }
  }
  return S;
}

/** What the public, read-only view may see: no notes, reasons or audit history. */
export function publicState(S) {
  if (!S.settings) return { settings: null, months: {}, occ: {}, payments: [], audit: [] };
  const tasks = {};
  for (const id of TASKS) { const t = S.settings.tasks[id]; tasks[id] = { label: t.label, valuePence: t.valuePence, schedule: t.schedule, monthlyCap: t.monthlyCap, subtitle: '' }; }
  const occ = {};
  for (const [k, o] of Object.entries(S.occ)) occ[k] = { id: o.id, taskId: o.taskId, localDate: o.localDate, status: o.status, valuePence: o.valuePence, completedAt: o.completedAt, updatedAt: o.updatedAt };
  const months = {};
  for (const [k, m] of Object.entries(S.months)) months[k] = { collegeDates: m.collegeDates, closed: !!m.closed, finalBonusPence: m.finalBonusPence };
  return {
    settings: { startDate: S.settings.startDate, tasks, roomDay: S.settings.roomDay, mealDay: S.settings.mealDay, childName: S.settings.childName || 'LieLie' },
    months, occ, payments: S.payments.map((p) => ({ id: p.id, amountPence: p.amountPence, paidDate: p.paidDate, paidAt: p.paidAt })), audit: [],
  };
}
