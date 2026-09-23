// GET /api/public -> read-only progress for the public view (no notes, reasons or history)
import { getLedgerStore, readState, publicState, json, handle } from '../lib/ledger.mjs';

export default (req) => handle(async () => {
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const { state } = await readState(await getLedgerStore());
  return json({ state: publicState(state) }, 200, { 'cache-control': 'public, max-age=15' });
});

export const config = { path: '/api/public' };
