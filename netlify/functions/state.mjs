// GET /api/state   (parent only) -> full ledger
// POST /api/state  (parent only) {ops:[...]} -> applies operations, returns the new ledger
import { getLedgerStore, readState, updateState, applyOps, requireParent, json, handle } from '../lib/ledger.mjs';

export default (req) => handle(async () => {
  requireParent(req);
  const store = await getLedgerStore();
  if (req.method === 'GET') return json({ state: (await readState(store)).state });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Send JSON.' }, 400); }
  const state = await updateState(store, (s) => applyOps(s, body.ops));
  return json({ state });
});

export const config = { path: '/api/state' };
