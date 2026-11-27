import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildEnglishAggregator } from './localize-aggregator.mjs';
const source = fileURLToPath(new URL('../site/', import.meta.url));
const destination = fileURLToPath(new URL('../dist/', import.meta.url));
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
// Раздел веб-сайтов остаётся в исходниках для локальной работы, но не попадает в GitHub Pages.
await cp(source, destination, {
  recursive: true,
  filter: path => path !== source + 'websites.html'
});
// Роботы превью не выполняют JS и не различают язык по query-параметру на GitHub Pages.
// Отдельный HTML даёт английское описание непосредственно в HTTP-ответе.
const russianHome = await readFile(`${destination}/index.html`, 'utf8');
const englishHome = russianHome
  .replace('<html lang="ru">', '<html lang="en">')
  .replaceAll('Программное обеспечение, ИИ Агенты, Скилы', 'Software, AI Agents, Skills')
  .replaceAll('Личный терминал — Slipcast-Dev', 'Personal Terminal — Slipcast-Dev')
  .replace('href="ai-aggregator.html" data-i18n="aiAggregator" hreflang="ru">AI-Агрегатор', 'href="ai-aggregator-en.html?lang=en" data-i18n="aiAggregator" hreflang="en">AI Aggregator')
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
const russianAggregator = await readFile(destination + 'ai-aggregator.html', 'utf8');
const englishAggregator = await buildEnglishAggregator(russianAggregator);
await writeFile(destination + 'ai-aggregator-en.html', englishAggregator);
for (const entry of await readdir(destination, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
  const path = `${destination}/${entry.name}`;
  let html = await readFile(path, 'utf8');
  // Изменённый общий JS получает новый адрес, чтобы старый кеш не ломал новые страницы.
  for (const name of ['i18n.js', 'projects-api.js']) {
    const version = createHash('sha256').update(await readFile(destination + name)).digest('hex').slice(0, 12);
    html = html.replaceAll(`src="${name}"`, `src="${name}?v=${version}"`);
  }
  if (entry.name === 'skills-agents.html') {
    // После замены ZIP меняется адрес скачивания, чтобы браузер получил архив из новой сборки.
    for (const archive of ['codex-skills.zip', 'claude-skills.zip']) {
      const relativePath = `downloads/${archive}`;
      const version = createHash('sha256').update(await readFile(destination + relativePath)).digest('hex').slice(0, 16);
      html = html.replace(`href="${relativePath}"`, `href="${relativePath}?v=${version}"`);
    }
  }
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
