// Optional local static-file preview utility. The app also runs via index.html.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.json':'application/json; charset=utf-8', '.md':'text/plain; charset=utf-8' };
const server = http.createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }); response.end('Method not allowed'); return;
  }
  let path;
  try { path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch { response.writeHead(400); response.end('Invalid path'); return; }
  const file = resolve(root, `.${path === '/' ? '/index.html' : path}`);
  if (!file.startsWith(root + sep)) { response.writeHead(403); response.end('Forbidden'); return; }
  try {
    if (!(await stat(file)).isFile()) throw new Error('Not a file');
    const content = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch { response.writeHead(404); response.end('Not found'); }
});
server.on('error', error => { console.error(`Preview could not start: ${error.message}`); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Still preview: http://localhost:${port}`));
