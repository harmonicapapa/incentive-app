// POST /api/login  {password}  -> sets the parent session cookie
// DELETE /api/login            -> signs out
import { checkPassword, makeSessionCookie, clearSessionCookie, isParent, json, handle } from '../lib/ledger.mjs';

export default (req) => handle(async () => {
  if (req.method === 'GET') return json({ parent: isParent(req) });
  if (req.method === 'DELETE') return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie(req) });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  let body = {};
  try { body = await req.json(); } catch { /* empty body */ }
  if (!checkPassword(body.password)) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return json({ error: "That password isn't right." }, 401);
  }
  return json({ ok: true }, 200, { 'set-cookie': makeSessionCookie(req) });
});

export const config = { path: '/api/login' };
