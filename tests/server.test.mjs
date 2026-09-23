// Server tests: password, sessions, operation validation and the public view's privacy.
import assert from 'node:assert/strict';
import { test } from 'node:test';

const mem = new Map(); let ver = 0;
globalThis.__LEDGER_STORE__ = {
  async getWithMetadata(k) { const v = mem.get(k); return v ? { data: JSON.parse(v.body), etag: v.etag } : null; },
  async setJSON(k, value, o = {}) { const c = mem.get(k); if (o.onlyIfNew && c) return { modified: false }; if (o.onlyIfMatch && (!c || c.etag !== o.onlyIfMatch)) return { modified: false }; mem.set(k, { body: JSON.stringify(value), etag: 'e' + ++ver }); return { modified: true }; },
};
const login = (await import('../netlify/functions/login.mjs')).default;
const state = (await import('../netlify/functions/state.mjs')).default;
const pub = (await import('../netlify/functions/public.mjs')).default;
const req = (path, method = 'GET', body, cookie) => new Request('https://x.test' + path, { method, headers: Object.assign({ 'content-type': 'application/json' }, cookie ? { cookie } : {}), body: body ? JSON.stringify(body) : undefined });

let cookie;
test('wrong password is rejected', async () => {
  const r = await login(req('/api/login', 'POST', { password: 'nope' }));
  assert.equal(r.status, 401);
});
test('correct password sets a secure http-only cookie', async () => {
  const r = await login(req('/api/login', 'POST', { password: 'Vermont2527' }));
  assert.equal(r.status, 200);
  const sc = r.headers.get('set-cookie');
  assert.match(sc, /HttpOnly/); assert.match(sc, /Secure/); assert.match(sc, /SameSite=Strict/);
  cookie = sc.split(';')[0];
});
test('state requires a session', async () => {
  assert.equal((await state(req('/api/state'))).status, 401);
  assert.equal((await state(req('/api/state', 'GET', null, 'ledger_session=abc.def'))).status, 401);
  assert.equal((await state(req('/api/state', 'POST', { ops: [{ type: 'eraseAll' }] }))).status, 401);
});
test('parent can set up, complete and add private notes', async () => {
  const settings = { startDate: '2026-09-01', tasks: { morning: { label: 'Morning routine', valuePence: 300 }, college: { label: 'College attendance', valuePence: 500 }, room: { label: 'Room reset', valuePence: 500 }, meal: { label: 'Meal preparation', valuePence: 1000 } }, roomDay: 6, mealDay: 7, childName: 'LieLie' };
  let r = await state(req('/api/state', 'POST', { ops: [{ type: 'setSettings', settings }, { type: 'setMonth', ym: '2026-09', month: { collegeDates: ['2026-09-01'] } }] }, cookie));
  assert.equal(r.status, 200);
  r = await state(req('/api/state', 'POST', { ops: [
    { type: 'setOcc', occ: { id: 'morning_2026-09-02', taskId: 'morning', localDate: '2026-09-02', status: 'completed', valuePence: 300, completedAt: '2026-09-02T07:00:00Z' } },
    { type: 'setOcc', occ: { id: 'college_2026-09-01', taskId: 'college', localDate: '2026-09-01', status: 'excused', valuePence: 0, note: 'private note' } },
    { type: 'addAudit', audit: { id: 'a1', kind: 'excuse', taskId: 'college', localDate: '2026-09-01', from: 'missed', to: 'excused', reason: 'secret reason' } },
    { type: 'addPayment', payment: { id: 'p1', amountPence: 300, paidDate: '2026-09-04', note: 'cash' } },
  ] }, cookie));
  assert.equal(r.status, 200);
  const s = (await r.json()).state;
  assert.equal(s.occ['morning_2026-09-02'].status, 'completed');
  assert.equal(s.audit.length, 1);
});
test('invalid operations are rejected without changing anything', async () => {
  const before = mem.get('state').body;
  const r = await state(req('/api/state', 'POST', { ops: [{ type: 'addPayment', payment: { id: 'p2', amountPence: 500, paidDate: '2026-09-05' } }, { type: 'setOcc', occ: { id: 'morning_2026-09-09', taskId: 'morning', localDate: '2026-09-03', status: 'completed', valuePence: 300 } }] }, cookie));
  assert.equal(r.status, 400);
  assert.equal(mem.get('state').body, before);
});
test('invalid backup import is rejected', async () => {
  const before = mem.get('state').body;
  const r = await state(req('/api/state', 'POST', { ops: [{ type: 'replaceAll', data: { app: 'other' } }] }, cookie));
  assert.equal(r.status, 400);
  assert.equal(mem.get('state').body, before);
});
test('public view hides notes, reasons and audit history', async () => {
  const r = await pub(req('/api/public'));
  assert.equal(r.status, 200);
  const text = await r.text();
  assert.ok(!text.includes('private note')); assert.ok(!text.includes('secret reason')); assert.ok(!text.includes('cash'));
  assert.ok(!text.includes('Medication'));
  const s = JSON.parse(text).state;
  assert.deepEqual(s.audit, []); assert.equal(s.settings.childName, 'LieLie');
  assert.equal(s.occ['morning_2026-09-02'].status, 'completed');
});
test('public view cannot write', async () => {
  assert.equal((await pub(req('/api/public', 'POST', { ops: [] }))).status, 405);
});
test('sign out clears the cookie', async () => {
  const r = await login(req('/api/login', 'DELETE', null, cookie));
  assert.match(r.headers.get('set-cookie'), /Max-Age=0/);
});
