import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEnglishAggregator } from './localize-aggregator.mjs';
const sourceRoot = fileURLToPath(new URL('../site', import.meta.url));
const root = resolve(process.argv[2] || 'site');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8' };
createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    // Предпросмотр исходников использует тот же перевод, что и GitHub Pages.
    if (root === sourceRoot && path === '/ai-aggregator-en.html') {
      const source = await readFile(resolve(root, 'ai-aggregator.html'), 'utf8');
      const html = await buildEnglishAggregator(source);
      response.writeHead(200, { 'Content-Type': types['.html'] });
      response.end(request.method === 'HEAD' ? undefined : html);
      return;
    }
    const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
    if (relative(root, file).startsWith('..') || !(await stat(file)).isFile()) throw new Error('Not found');
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    response.end(request.method === 'HEAD' ? undefined : await readFile(file));
  } catch { response.writeHead(404); response.end('Not found'); }
}).listen(4321, '127.0.0.1', () => console.log('Preview: http://127.0.0.1:4321'));
