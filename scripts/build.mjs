import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const source = fileURLToPath(new URL('../site/', import.meta.url));
const destination = fileURLToPath(new URL('../dist/', import.meta.url));
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
for (const entry of await readdir(destination, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
  const path = `${destination}/${entry.name}`;
  let html = await readFile(path, 'utf8');
  // Разрешены только локальные JS-файлы и точные хеши встроенных сценариев этой сборки.
  const hashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
    .filter(match => match[1].trim())
    .map(match => `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`);
  const policy = ["default-src 'self'", `script-src 'self' ${hashes.join(' ')}`, "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:", "connect-src 'self'", 'frame-src https://slipcast-dev.github.io',
    "object-src 'none'", "base-uri 'none'", "form-action 'none'"].join('; ');
  html = html.replace('<head>', `<head>\n  <meta http-equiv="Content-Security-Policy" content="${policy}">`);
  await writeFile(path, html);
}
await writeFile(`${destination}/.nojekyll`, '');
console.log('Static site built in dist/.');
