// Local preview without a Netlify account: serves /public and runs the functions
// against an in-memory store (data is lost when the server stops).
// Usage: npm run dev  ->  http://localhost:8888  and  http://localhost:8888/parent
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const mem = new Map(); let ver = 0;
globalThis.__LEDGER_STORE__ = {
  async getWithMetadata(key) { const v = mem.get(key); return v ? { data: JSON.parse(v.body), etag: v.etag } : null; },
  async setJSON(key, value, opts = {}) {
    const cur = mem.get(key);
    if (opts.onlyIfNew && cur) return { modified: false };
    if (opts.onlyIfMatch && (!cur || cur.etag !== opts.onlyIfMatch)) return { modified: false };
    mem.set(key, { body: JSON.stringify(value), etag: 'e' + ++ver }); return { modified: true, etag: 'e' + ver };
  },
};
const routes = {
  '/api/login': (await import('../netlify/functions/login.mjs')).default,
  '/api/state': (await import('../netlify/functions/state.mjs')).default,
  '/api/public': (await import('../netlify/functions/public.mjs')).default,
};
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const port = Number(process.env.PORT || 8888);

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const fn = routes[url.pathname];
  if (fn) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
    const response = await fn(request, {});
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
    return;
  }
  let path = url.pathname === '/' ? '/index.html' : url.pathname === '/parent' ? '/parent.html' : url.pathname === '/demo' ? '/demo.html' : url.pathname;
  const file = normalize(join(root, 'public', path));
  if (!file.startsWith(join(root, 'public'))) { res.writeHead(403); return res.end(); }
  try { const body = await readFile(file); res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, () => console.log(`Earned ledger running at http://localhost:${port}  (parent portal: /parent)`));
