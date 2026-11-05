const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { setup, root } = require('./browser-harness.cjs');
const dist = path.resolve(root, '../dist');
const flush = async () => { for (let i = 0; i < 30; i++) await new Promise(setImmediate); };

test('Язык определяется автоматически, ручной выбор и ссылки сохраняют его', () => {
  const page = setup('index.html', { languages: ['ru-RU'] });
  assert.equal(page.document.documentElement.lang, 'ru');
  page.click('en');
  assert.equal(page.local.get('slipcast-language'), 'en');
  assert.equal(page.document.querySelector('[data-i18n="projects"]').textContent, 'Projects');
  assert.ok(page.document.querySelector('a[href]').attrs.href.includes('lang=en'));
  assert.equal(setup('index.html', { languages: ['ru'], saved: 'en' }).document.documentElement.lang, 'en');
  assert.equal(setup('index.html', { languages: ['fr'], blocked: true }).document.documentElement.lang, 'en');
  assert.equal(setup('index.html', { languages: ['ru'], query: '?lang=en' }).document.documentElement.lang, 'en');
});

test('Первое вступление последовательно, кнопки доступны только после приветствия', () => {
  const page = setup('index.html');
  const complete = [];
  for (let i = 0; i < 2500; i++) {
    const before = vm.runInContext('phase', page.context);
    page.step();
    const state = vm.runInContext('({phase, mode, itemIndex, navigationVisible})', page.context);
    if (state.mode === 'intro' && state.itemIndex === 0) assert.equal(state.navigationVisible, false);
    if (before === 'typing' && state.phase === 'holding') complete.push(page.document.querySelector('#terminal-text').textContent);
  }
  assert.equal(complete[0], 'Вход разрешен.');
  assert.equal(complete[1], 'Добро пожаловать в репозиторий Slipcast-Dev');
  assert.equal(complete[2], 'system_profiler SPHardwareDataType');
  assert.equal(page.session.get('slipcast-navigation-seen'), '1');
  const returning = setup('index.html', { seen: true });
  assert.equal(vm.runInContext('mode', returning.context), 'commands');
  assert.ok(!returning.document.querySelector('.navigation').classList.contains('pending'));
});

test('Страницы разработчика и сайтов переведены; Telegram, аватар и превью подключены', () => {
  const page = setup('developer.html', { languages: ['en'] });
  assert.ok(page.document.querySelector('[data-i18n="bioIntro"]').textContent.startsWith('I am a developer'));
  assert.equal(page.document.querySelector('.telegram-button').attrs.href, 'tg://resolve?domain=slipcast666');
  page.click('ru');
  assert.ok(page.document.querySelector('[data-i18n="bioIntro"]').textContent.startsWith('Я разработчик'));
  assert.ok(fs.existsSync(path.join(root, 'assets/avatar.jpg')));
  const websites = setup('websites.html', { languages: ['en'] });
  assert.equal(websites.document.querySelector('h1').textContent, 'Websites');
  assert.equal(websites.nodes.filter(node => node.tag === 'iframe').length, 2);
  assert.ok(websites.nodes.filter(node => node.tag === 'iframe').every(node => node.attrs.sandbox === 'allow-scripts'));
});

test('Проекты выводятся сразу без GitHub API, приватные и сайты исключаются', () => {
  const page = setup('projects.html', { languages: ['en'] });
  assert.ok(page.document.querySelector('#project-list').children.length >= 1);
  assert.equal(page.calls.length, 0);
  const data = { repositories: [
    { id: 1, name: '<script>', private: false, owner: { login: 'Slipcast-dev' }, description: '<img onerror=alert(1)>', version: 'v1' },
    { id: 2, name: 'secret', private: true, owner: { login: 'Slipcast-dev' } },
    { id: 3, name: 'test-website', private: false, owner: { login: 'Slipcast-dev' } },
    { id: 4, name: 'SLIPCAST-DEV', private: false, owner: { login: 'Slipcast-dev' } }
  ] };
  page.context.testSnapshot = data;
  vm.runInContext('renderProjects(testSnapshot)', page.context);
  const cards = page.document.querySelector('#project-list').children;
  assert.equal(cards.length, 1);
  assert.equal(cards[0].children[0].children[1].textContent, '<script>');
  assert.ok(cards[0].children[0].href.includes('%3Cscript%3E'));
  assert.equal(cards[0].children[0].children[2].textContent, '<img onerror=alert(1)>');
});

test('Ошибка сети не удаляет карточки; успешное обновление читает только свой JSON', async () => {
  const page = setup('projects.html', { protocol: 'https:' });
  const initial = page.document.querySelector('#project-list').children.length;
  await flush();
  assert.equal(page.document.querySelector('#project-list').children.length, initial);
  assert.ok(page.calls.every(call => call.url === 'projects.json'));
  assert.equal(page.document.querySelector('#load-status').textContent, '');
  const refreshed = setup('projects.html', { protocol: 'https:', respond: async () => ({ ok: true, json: async () => ({ repositories: [] }) }) });
  await flush();
  assert.equal(refreshed.document.querySelector('#project-list').children.length, 0);
  assert.equal(refreshed.document.querySelector('#load-status').textContent, 'Публичных проектов пока нет.');
});

test('Сборка включает локальные ресурсы, страницы и точные хеши CSP', () => {
  const pages = fs.readdirSync(dist).filter(file => file.endsWith('.html'));
  assert.equal(pages.length, 7);
  for (const name of pages) {
    const html = fs.readFileSync(path.join(dist, name), 'utf8');
    for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      const value = match[1];
      if (/^(https?:|tg:|#)/.test(value)) continue;
      const file = value.split('?')[0];
      assert.ok(fs.existsSync(path.join(dist, file === '/' ? 'index.html' : file)), `${name}: ${file}`);
    }
    assert.ok(html.includes("connect-src 'self'"));
    for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
      if (!script[1].trim()) continue;
      const hash = createHash('sha256').update(script[1]).digest('base64');
      assert.ok(html.includes(`'sha256-${hash}'`), name);
    }
  }
  const snapshot = JSON.parse(fs.readFileSync(path.join(dist, 'projects.json'), 'utf8'));
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(dist, 'projects-data.js'), 'utf8'), context);
  assert.equal(JSON.stringify(context.window.publicProjectsSnapshot), JSON.stringify(snapshot));
  assert.ok(fs.existsSync(path.join(dist, '.nojekyll')));
  assert.ok(!fs.existsSync(path.join(dist, 'README.md')));
});

test('Workflow публикует main, обновляет данные на сервере и ограничивает права', () => {
  const workflow = fs.readFileSync(path.resolve(root, '../.github/workflows/deploy.yml'), 'utf8');
  assert.ok(workflow.includes("cron: '7,17,27,37,47,57 * * * *'"));
  assert.ok(workflow.includes('node scripts/sync-projects.mjs dist'));
  assert.ok(workflow.includes('persist-credentials: false'));
  assert.ok(workflow.includes('contents: read'));
  assert.ok(workflow.includes('pages: write'));
  assert.ok(workflow.includes("github.event_name != 'pull_request'"));
  assert.ok([...workflow.matchAll(/uses: (\S+)/g)].every(match => /@[a-f0-9]{40}$/.test(match[1])));
});

test('Превью RU/EN содержат описание без JavaScript и имеют разные канонические URL', () => {
  for (const [name, description, locale] of [
    ['index.html', 'Программное обеспечение, ИИ Агенты, Скилы', 'ru_RU'],
    ['index-ru.html', 'Программное обеспечение, ИИ Агенты, Скилы', 'ru_RU'],
    ['index-en.html', 'Software, AI Agents, Skills', 'en_US']
  ]) {
    const html = fs.readFileSync(path.join(dist, name), 'utf8');
    assert.ok(html.includes(`name="description" content="${description}"`));
    assert.ok(html.includes(`property="og:description" content="${description}"`));
    assert.ok(html.includes(`name="twitter:description" content="${description}"`));
    assert.ok(html.includes(`property="og:locale" content="${locale}"`));
    assert.ok(!html.includes('Личный сайт в стиле терминала:'));
  }
  const en = fs.readFileSync(path.join(dist, 'index-en.html'), 'utf8');
  assert.ok(en.includes('property="og:url" content="https://slipcast-dev.github.io/index-en.html"'));
  const page = setup('index.html', { languages: ['ru'] });
  assert.equal(page.document.querySelector('meta[name="description"]').content, 'Программное обеспечение, ИИ Агенты, Скилы');
  page.click('en');
  assert.equal(page.document.querySelector('meta[name="description"]').content, 'Software, AI Agents, Skills');
});

test('Русская ссылка имеет собственные canonical и og:url и не содержит старого превью', () => {
  const html = fs.readFileSync(path.join(dist, 'index-ru.html'), 'utf8');
  assert.ok(html.includes('rel="canonical" href="https://slipcast-dev.github.io/index-ru.html"'));
  assert.ok(html.includes('property="og:url" content="https://slipcast-dev.github.io/index-ru.html"'));
  assert.ok(html.includes('property="og:image" content="https://slipcast-dev.github.io/assets/avatar.jpg"'));
  assert.ok(!/Building useful software|Independent developer building|social-preview\.png/.test(html));
  const page = setup('index.html', { protocol: 'https:', languages: ['ru'] });
  assert.ok(page.document.querySelector('a[href]').attrs.href.includes('lang=ru'));
});


test('Поиск фильтрует карточки без учёта регистра, поддерживает несколько слов и сохраняется при обновлении', () => {
  const page = setup('projects.html');
  const input = page.document.querySelector('#project-search');
  const list = page.document.querySelector('#project-list');
  page.context.searchSnapshot = { repositories: [
    { id: 301, name: 'Grizzly', description: 'Редактор Markdown', version: 'v1.4.2', private: false, owner: { login: 'Slipcast-dev' } },
    { id: 302, name: 'Koto', description: 'Переводчик текста', version: 'v2.0', private: false, owner: { login: 'Slipcast-dev' } }
  ] };
  vm.runInContext('renderProjects(searchSnapshot)', page.context);
  const search = value => { input.value = value; input.listeners.input.forEach(listener => listener()); };
  search('  GRIZZLY   редактор  ');
  assert.equal(list.children.length, 1);
  assert.equal(list.children[0].children[0].children[1].textContent, 'Grizzly');
  for (const query of ['гризли', 'ГРИЗЗЛИ', 'гриз', 'гризли markdown']) {
    search(query);
    assert.equal(list.children.length, 1, query);
    assert.equal(list.children[0].children[0].children[1].textContent, 'Grizzly', query);
  }
  search('гризли переводчик');
  assert.equal(list.children.length, 0);
  page.click('en');
  search('гризли');
  assert.equal(list.children[0].children[0].children[1].textContent, 'Grizzly');
  page.click('ru');
  search('V2.0');
  assert.equal(list.children[0].children[0].children[1].textContent, 'Koto');
  search('<script>');
  assert.equal(list.children.length, 0);
  assert.equal(page.document.querySelector('#load-status').textContent, 'Проекты не найдены. Попробуйте другой запрос.');
  page.click('en');
  assert.equal(input.attrs.placeholder, 'Find a project…');
  assert.equal(input.attrs['aria-label'], 'Search by name, description or version');
  assert.equal(page.document.querySelector('#load-status').textContent, 'No matching projects. Try another search.');
  search('KOTO');
  vm.runInContext('renderProjects(searchSnapshot)', page.context);
  assert.equal(input.value, 'KOTO');
  assert.equal(list.children.length, 1);
  input.listeners.keydown.forEach(listener => listener({ key: 'Escape' }));
  assert.equal(input.value, '');
  assert.equal(list.children.length, 2);
  search('   ');
  assert.equal(list.children.length, 2);
  assert.equal(page.document.querySelector('#load-status').textContent, '');
});


test('Общий поиск сопоставляет кириллицу и латиницу для текущих и новых карточек', () => {
  const page = setup('projects.html');
  const input = page.document.querySelector('#project-search');
  const list = page.document.querySelector('#project-list');
  const projects = [
    ['Grizzly', 'Markdown editor', 'v1.1'],
    ['translator-Koto', 'Переводчик текста', 'v2'],
    ['DragonMacros', 'Keyboard automation', 'v3'],
    ['codex-user-skills', 'Agent skills', 'v4'],
    ['Rdragon-K530RGB-Keyboard-Port', 'Hardware control', 'v5'],
    ['НовыйПроект', 'Будущее приложение', 'v6']
  ].map(([name, description, version], index) => ({ id: index + 400, name, description, version, private: false, owner: { login: 'Slipcast-dev' } }));
  page.context.futureSnapshot = { repositories: projects };
  vm.runInContext('renderProjects(futureSnapshot)', page.context);
  const run = query => { input.value = query; input.listeners.input.forEach(listener => listener()); return list.children.map(item => item.children[0].children[1].textContent); };
  for (const [query, expected] of [
    ['гризли', 'Grizzly'], ['ГРИЗЗЛИ', 'Grizzly'], ['кото', 'translator-Koto'],
    ['драгон макрос', 'DragonMacros'], ['кодекс', 'codex-user-skills'],
    ['рдрагон', 'Rdragon-K530RGB-Keyboard-Port'], ['noviiproekt', 'НовыйПроект'],
    ['perevodchik', 'translator-Koto'], ['гризли markdown', 'Grizzly']
  ]) assert.deepEqual(run(query), [expected], query);
  assert.deepEqual(run('v1.11'), []);
  assert.deepEqual(run('ьъ'), []);
  assert.deepEqual(run('несуществующее название'), []);
  assert.deepEqual(run('гризли hardware'), []);
  assert.equal(run('').length, projects.length);
  page.click('en');
  assert.deepEqual(run('КоТо'), ['translator-Koto']);
  page.context.futureSnapshot.repositories.push({ id: 999, name: 'FutureApp', description: 'New application', private: false, owner: { login: 'Slipcast-dev' } });
  vm.runInContext('renderProjects(futureSnapshot)', page.context);
  assert.deepEqual(run('футуреапп'), ['FutureApp']);
});
