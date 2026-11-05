import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const source = fileURLToPath(new URL('../site/', import.meta.url));
const destination = fileURLToPath(new URL('../dist/', import.meta.url));
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
// Роботы превью не выполняют JS и не различают язык по query-параметру на GitHub Pages.
// Отдельный HTML даёт английское описание непосредственно в HTTP-ответе.
const russianHome = await readFile(`${destination}/index.html`, 'utf8');
const englishHome = russianHome
  .replace('<html lang="ru">', '<html lang="en">')
  .replaceAll('Программное обеспечение, ИИ Агенты, Скилы', 'Software, AI Agents, Skills')
  .replaceAll('Личный терминал — Slipcast-Dev', 'Personal Terminal — Slipcast-Dev')
  .replace('<title>Личный терминал</title>', '<title>Personal Terminal — Slipcast-Dev</title>')
  .replace('<link rel="canonical" href="https://slipcast-dev.github.io/">', '<link rel="canonical" href="https://slipcast-dev.github.io/index-en.html">')
  .replace('<meta property="og:url" content="https://slipcast-dev.github.io/">', '<meta property="og:url" content="https://slipcast-dev.github.io/index-en.html">')
  .replace('property="og:locale" content="ru_RU"', 'property="og:locale" content="en_US"')
  .replace('property="og:locale:alternate" content="en_US"', 'property="og:locale:alternate" content="ru_RU"');
await writeFile(`${destination}/index-en.html`, englishHome);
// Новый постоянный адрес RU имеет собственный og:url и не использует идентичность старого сайта.
const russianShareHome = russianHome
  .replace('<link rel="canonical" href="https://slipcast-dev.github.io/">', '<link rel="canonical" href="https://slipcast-dev.github.io/index-ru.html">')
  .replace('<meta property="og:url" content="https://slipcast-dev.github.io/">', '<meta property="og:url" content="https://slipcast-dev.github.io/index-ru.html">');
await writeFile(`${destination}/index-ru.html`, russianShareHome);
for (const entry of await readdir(destination, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
  const path = `${destination}/${entry.name}`;
  let html = await readFile(path, 'utf8');
  // Разрешены только локальные JS-файлы и точные хеши встроенных сценариев этой сборки.
  const hashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
    .filter(match => match[1].trim())
    .map(match => `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`);
  const policy = ["default-src 'self'", `script-src 'self' ${hashes.join(' ')}`, "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:", (entry.name === 'projects.html' ? "connect-src 'self' https://api.github.com" : "connect-src 'self'"), 'frame-src https://slipcast-dev.github.io',
    "object-src 'none'", "base-uri 'none'", "form-action 'none'"].join('; ');
  html = html.replace('<head>', `<head>\n  <meta http-equiv="Content-Security-Policy" content="${policy}">`);
  await writeFile(path, html);
}
await writeFile(`${destination}/.nojekyll`, '');
console.log('Static site built in dist/.');
