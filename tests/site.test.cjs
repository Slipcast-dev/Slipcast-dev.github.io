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
  assert.equal(page.document.querySelector('[data-i18n="projects"]').textContent, 'Applications');
  assert.ok(page.document.querySelector('[data-i18n="projects"]').attrs.href.includes('lang=en'));
  assert.equal(setup('index.html', { languages: ['ru'], saved: 'en' }).document.documentElement.lang, 'en');
  assert.equal(setup('index.html', { languages: ['fr'], blocked: true }).document.documentElement.lang, 'en');
  assert.equal(setup('index.html', { languages: ['ru'], query: '?lang=en' }).document.documentElement.lang, 'en');
});

test('Меню доступно сразу, а терминал начинает с цикла команд', () => {
  const page = setup('index.html');
  const menu = page.document.querySelector('.navigation');
  assert.equal(menu.inert, false);
  assert.ok(!menu.classList.contains('pending'));

  const complete = [];
  for (let i = 0; i < 250 && complete.length < 2; i++) {
    const before = vm.runInContext('phase', page.context);
    page.step();
    if (before === 'typing' && vm.runInContext('phase', page.context) === 'holding') {
      complete.push(page.document.querySelector('#terminal-text').textContent);
    }
  }
  assert.deepEqual(complete, ['system_profiler SPHardwareDataType', 'defaults read -g AppleLanguages']);
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
  assert.equal(websites.nodes.filter(node => node.tag === 'iframe').length, 3);
  assert.ok(websites.nodes.filter(node => node.tag === 'iframe').every(node => node.attrs.sandbox === 'allow-scripts'));
  assert.ok(websites.nodes.some(node => node.tag === 'iframe' && node.attrs.src === 'https://slipcast-dev.github.io/vibewave-website/'));
  assert.ok(websites.nodes.some(node => node.tag === 'a' && node.attrs.href === 'https://slipcast-dev.github.io/vibewave-website/'));
  const vibewaveDescription = websites.document.querySelector('[data-i18n="vibewaveWebsiteDescription"]');
  assert.ok(vibewaveDescription.textContent.startsWith('The VibeWave website:'));
  websites.click('ru');
  assert.ok(vibewaveDescription.textContent.startsWith('Сайт VibeWave'));
});

test('Проекты выводятся сразу без GitHub API, приватные и сайты исключаются', () => {
  const page = setup('projects.html', { languages: ['en'] });
  assert.ok(page.document.querySelector('#project-list').children.length >= 1);
  assert.equal(page.calls.length, 0);
  const data = { repositories: [
    { id: 1, name: '<script>', private: false, owner: { login: 'Slipcast-dev' }, description: '<img onerror=alert(1)>', version: 'v1' },
    { id: 2, name: 'secret', private: true, owner: { login: 'Slipcast-dev' } },
    { id: 3, name: 'test-website', private: false, owner: { login: 'Slipcast-dev' } },
    { id: 4, name: 'SLIPCAST-DEV', private: false, owner: { login: 'Slipcast-dev' } },
    { id: 1444783625, name: 'renamed-codex-collection', private: false, owner: { login: 'Slipcast-dev' } },
    { id: 1446028185, name: 'claude-skills', private: false, owner: { login: 'Slipcast-dev' } },
    { id: 1449438166, name: 'renamed-mindnotes', private: false, owner: { login: 'Slipcast-dev' } },
    { id: 1456992734, name: 'renamed-webclipper', private: false, owner: { login: 'Slipcast-dev' } },
    { id: 1457278588, name: 'renamed-github-plugin', private: false, owner: { login: 'Slipcast-dev' } },
    { id: 1461694197, name: 'renamed-desktop-app', private: false, owner: { login: 'Slipcast-dev' } },
    { id: 1469982790, name: 'renamed-ipad-app', private: false, owner: { login: 'Slipcast-dev' } },
    { id: 10, name: 'codex-user-skills', private: false, owner: { login: 'Slipcast-dev' } }
  ] };
  page.context.testSnapshot = data;
  vm.runInContext('renderProjects(testSnapshot)', page.context);
  const cards = page.document.querySelector('#project-list').children;
  assert.equal(cards.length, 1);
  assert.equal(cards[0].children[0].children[0].textContent, '<script>');
  assert.equal(cards[0].children[0].href, undefined);
  assert.equal(cards[0].children[0].children[1].textContent, '<img onerror=alert(1)>');
});

test('Ошибка сети не удаляет карточки; резервный JSON применяется при недоступном API', async () => {
  const page = setup('projects.html', { protocol: 'https:' });
  const initial = page.document.querySelector('#project-list').children.length;
  await flush();
  assert.equal(page.document.querySelector('#project-list').children.length, initial);
  assert.ok(page.calls.some(call => call.url.startsWith('https://api.github.com/users/')));
  assert.equal(page.document.querySelector('#load-status').textContent, '');
  const refreshed = setup('projects.html', { protocol: 'https:', respond: async url => url === 'projects.json' ? ({ ok: true, json: async () => ({ fetchedAt: '2099-01-01', repositories: [] }) }) : ({ ok: false, status: 403 }) });
  await flush();
  assert.equal(refreshed.document.querySelector('#project-list').children.length, 0);
  assert.equal(refreshed.document.querySelector('#load-status').textContent, 'Публичных проектов пока нет.');
});

test('Сборка включает локальные ресурсы, страницы и точные хеши CSP', () => {
  const pages = fs.readdirSync(dist).filter(file => file.endsWith('.html'));
  assert.equal(pages.length, 9);
  assert.ok(pages.includes('ai-aggregator.html'));
  assert.ok(pages.includes('ai-aggregator-en.html'));
  assert.ok(fs.existsSync(path.join(root, 'websites.html')), 'Исходник раздела сохранён');
  assert.ok(!fs.existsSync(path.join(dist, 'websites.html')), 'Раздел исключён из публикации');
  const sitemap = fs.readFileSync(path.join(dist, 'sitemap.xml'), 'utf8');
  assert.ok(!sitemap.includes('websites.html'));
  assert.ok(sitemap.includes('https://slipcast-dev.github.io/ai-aggregator.html'));
  assert.ok(sitemap.includes('https://slipcast-dev.github.io/ai-aggregator-en.html'));
  for (const name of ['i18n.js', 'projects-api.js']) {
    const version = createHash('sha256').update(fs.readFileSync(path.join(dist, name))).digest('hex').slice(0, 12);
    assert.ok(fs.readFileSync(path.join(dist, 'projects.html'), 'utf8').includes(`src="${name}?v=${version}"`));
  }
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
  assert.ok(page.document.querySelector('[data-i18n="projects"]').attrs.href.includes('lang=ru'));
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
  assert.equal(list.children[0].children[0].children[0].textContent, 'Grizzly');
  for (const query of ['гризли', 'ГРИЗЗЛИ', 'гриз', 'гризли markdown']) {
    search(query);
    assert.equal(list.children.length, 1, query);
    assert.equal(list.children[0].children[0].children[0].textContent, 'Grizzly', query);
  }
  search('гризли переводчик');
  assert.equal(list.children.length, 0);
  page.click('en');
  search('гризли');
  assert.equal(list.children[0].children[0].children[0].textContent, 'Grizzly');
  page.click('ru');
  search('V2.0');
  assert.equal(list.children[0].children[0].children[0].textContent, 'Koto');
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
    ['codex-toolkit', 'Development tools', 'v4'],
    ['Rdragon-K530RGB-Keyboard-Port', 'Hardware control', 'v5'],
    ['НовыйПроект', 'Будущее приложение', 'v6']
  ].map(([name, description, version], index) => ({ id: index + 400, name, description, version, private: false, owner: { login: 'Slipcast-dev' } }));
  page.context.futureSnapshot = { repositories: projects };
  vm.runInContext('renderProjects(futureSnapshot)', page.context);
  const run = query => { input.value = query; input.listeners.input.forEach(listener => listener()); return list.children.map(item => item.children[0].children[0].textContent); };
  for (const [query, expected] of [
    ['гризли', 'Grizzly'], ['ГРИЗЗЛИ', 'Grizzly'], ['кото', 'translator-Koto'],
    ['драгон макрос', 'DragonMacros'], ['кодекс', 'codex-toolkit'],
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

test('GitHub обновляет название, описание, релиз и состав карточек без публикации сайта', async () => {
  const repo = { id: 1, name: 'renamed-app', description: 'Fresh description', private: false,
    owner: { login: 'Slipcast-dev' }, topics: [] };
  const page = setup('projects.html', { protocol: 'https:', respond: async (url, options) => {
    assert.equal(options.credentials, 'omit');
    assert.equal(options.headers?.Authorization, undefined);
    return { ok: true, json: async () => url === 'projects.json'
      ? { fetchedAt: '2020-01-01', repositories: [] }
      : url.includes('/users/') ? [repo]
      : [{ draft: false, tag_name: 'v99', published_at: '2026-11-05' }] };
  } });
  await flush();
  const cards = page.document.querySelector('#project-list').children;
  assert.equal(cards.length, 1);
  const card = cards[0].children[0];
  assert.equal(card.children[0].textContent, 'renamed-app');
  assert.equal(card.children[1].textContent, 'Fresh description');
  assert.equal(vm.runInContext('currentSnapshot.repositories[0].version', page.context), 'v99');
  const count = page.calls.length;
  await vm.runInContext('lastAttempt = 0; refreshProjects()', page.context);
  assert.equal(page.calls.length, count + 1);
  assert.equal(vm.runInContext('currentSnapshot.repositories[0].version', page.context), 'v99');
  assert.ok(page.session.get('projects-live-snapshot').includes('renamed-app'));
});

test('Повторное открытие обновляет карточки после двух минут, не дожидаясь фонового цикла', async () => {
  const repo = { id: 901, name: 'NewProject', private: false, owner: { login: 'Slipcast-dev' } };
  const respond = async url => ({
    ok: true,
    json: async () => url === 'projects.json' ? { fetchedAt: '2020-01-01', repositories: [] }
      : url.includes('/users/') ? [repo] : []
  });

  const recent = setup('projects.html', { protocol: 'https:', respond,
    sessionEntries: [['projects-live-attempt', String(Date.now() - 30_000)]] });
  const reopened = setup('projects.html', { protocol: 'https:', respond,
    sessionEntries: [['projects-live-attempt', String(Date.now() - 3 * 60_000)]] });
  await flush();

  assert.deepEqual(recent.calls.map(call => call.url), ['projects.json']);
  const cards = reopened.document.querySelector('#project-list').children;
  assert.deepEqual(cards.map(item => item.children[0].children[0].textContent), ['NewProject']);
});

test('После исчерпания лимита браузер соблюдает срок ожидания GitHub', async () => {
  const retryAt = Date.now() + 30 * 60_000;
  const page = setup('projects.html', { protocol: 'https:', respond: async url => url === 'projects.json'
    ? { ok: true, json: async () => ({ fetchedAt: '2020-01-01', repositories: [] }) }
    : { ok: false, status: 403, headers: { get: name => name === 'x-ratelimit-reset' ? String(Math.ceil(retryAt / 1000)) : null } }
  });
  await flush();
  const count = page.calls.filter(call => call.url.startsWith('https://api.github.com')).length;
  assert.equal(count, 1);
  await vm.runInContext('lastAttempt = 0; lastLiveAttempt = 0; refreshProjects()', page.context);
  assert.equal(page.calls.filter(call => call.url.startsWith('https://api.github.com')).length, count);
  assert.ok(Number(page.session.get('projects-live-retry-at')) >= retryAt);
});

test('Медленный локальный JSON не задерживает обновление из GitHub и не затирает его', async () => {
  let finishSnapshot;
  const pendingSnapshot = new Promise(resolve => { finishSnapshot = resolve; });
  const repo = { id: 930, name: 'FreshProject', private: false, owner: { login: 'Slipcast-dev' } };
  const page = setup('projects.html', { protocol: 'https:', respond: async url => url === 'projects.json'
    ? pendingSnapshot
    : { ok: true, json: async () => url.includes('/users/') ? [repo]
      : [{ draft: false, tag_name: 'v10', published_at: '2026-11-11' }] }
  });
  await flush();
  const list = page.document.querySelector('#project-list');
  assert.equal(vm.runInContext('currentSnapshot.repositories[0].version', page.context), 'v10');
  finishSnapshot({ ok: true, json: async () => ({ fetchedAt: '2020-01-01', repositories: [] }) });
  await flush();
  assert.equal(list.children.length, 1);
  assert.equal(vm.runInContext('currentSnapshot.repositories[0].version', page.context), 'v10');
});

test('Раздел скиллов доступен из меню; карточки скачивают архивы, фильтры и перевод работают', () => {
  const home = setup('index.html', { languages: ['ru'], seen: true });
  const navigation = home.document.querySelector('[data-i18n="skillsTitleLabel"]');
  assert.equal(navigation.textContent, 'Скиллы');
  assert.equal(navigation.attrs.href, 'skills-agents.html?v=5&lang=ru');
  const menu = home.nodes.filter(node => (node.attrs.class || '').split(' ').includes('nav-button'));
  assert.deepEqual(menu.map(node => node.dataset.i18n), ['projects', 'skillsTitleLabel', 'aiAggregator', 'telegramChannel', 'developer']);
  assert.equal(menu[3].attrs.href, 'https://t.me/slipcastdev');
  assert.equal(menu[4].attrs.href, 'developer.html?lang=ru');
  assert.equal(menu[2].textContent, 'AI-Агрегатор');
  assert.equal(menu[2].attrs.href, 'ai-aggregator.html?lang=ru');
  assert.equal(menu[0].textContent, 'Приложения');
  home.click('en');
  assert.equal(menu[0].textContent, 'Applications');
  assert.equal(menu[2].textContent, 'AI Aggregator');
  assert.equal(menu[2].attrs.href, 'ai-aggregator-en.html?lang=en');
  assert.equal(menu[2].attrs.hreflang, 'en');
  assert.equal(menu[3].textContent, 'Telegram Channel');
  assert.equal(menu[3].attrs.href, 'https://t.me/slipcastdev');
  home.click('en');
  assert.equal(navigation.textContent, 'Skills');
  assert.equal(navigation.attrs.href, 'skills-agents.html?v=5&lang=en');

  const page = setup('skills-agents.html', { languages: ['ru'] });
  assert.equal(page.document.querySelector('h1').textContent, 'Скиллы');
  assert.equal(page.document.title, 'Скиллы — Slipcast-Dev');
  assert.ok(page.document.querySelector('.skill-list'));
  assert.equal(page.document.querySelector('[data-i18n="skillCategoryColumn"]').textContent, 'Категория');
  const builtPage = fs.readFileSync(path.join(dist, 'skills-agents.html'), 'utf8');
  const cards = page.document.querySelectorAll('[data-compatibility]');
  const codexCards = cards.filter(card => card.dataset.compatibility === 'codex');
  const claudeCards = cards.filter(card => card.dataset.compatibility === 'claude');
  assert.ok(codexCards.length > 1 && claudeCards.length > 1);
  assert.equal(cards.length, codexCards.length + claudeCards.length);

  const links = page.nodes.filter(node => node.tag === 'a' && node.attrs.download);
  assert.equal(links.length, cards.length);
  assert.equal(new Set(links.map(link => link.attrs.href)).size, cards.length);
  for (const link of links) {
    const match = link.attrs.href.match(/^downloads\/skills\/(codex|claude)\/([a-z0-9-]+)\.zip\?v=([a-f0-9]{16})$/);
    assert.ok(match, link.attrs.href);
    const [, environment, category, version] = match;
    assert.equal(link.attrs.download, environment + '-' + category + '.zip');
    assert.ok(link.attrs.class.split(' ').includes('skill-entry'));
    const archive = fs.readFileSync(path.join(dist, link.attrs.href.split('?')[0]));
    assert.ok(archive.length > 0);
    assert.equal(version, createHash('sha256').update(archive).digest('hex').slice(0, 16));
    assert.ok(builtPage.includes(link.attrs.href));
  }
  assert.doesNotMatch(builtPage, /href="downloads\/(?:codex|claude)-skills\.zip/);
  assert.doesNotMatch(builtPage, /claude-agents-.*\.zip/);
  assert.ok(!fs.existsSync(path.join(dist, 'downloads/agents')));

  const filter = name => page.document.querySelector('[data-filter="' + name + '"]');
  const choose = name => filter(name).listeners.click[0]();
  const visible = () => cards.filter(card => !card.hidden);
  assert.deepEqual(visible(), cards);
  choose('codex');
  assert.deepEqual(visible(), codexCards);
  assert.equal(filter('codex').attrs['aria-pressed'], 'true');
  assert.equal(filter('all').attrs['aria-pressed'], 'false');
  choose('claude');
  assert.deepEqual(visible(), claudeCards);
  assert.equal(filter('claude').attrs['aria-pressed'], 'true');
  assert.equal(filter('codex').attrs['aria-pressed'], 'false');
  assert.equal(page.document.querySelector('#empty-collections').hidden, true);

  const titles = page.document.querySelectorAll('[data-skill-title-en]');
  const counts = page.document.querySelectorAll('[data-skill-count]');
  const downloads = page.document.querySelectorAll('[data-i18n="skillDownload"]');
  for (const nodes of [titles, counts, downloads]) assert.equal(nodes.length, cards.length);
  assert.ok(titles.every(title => title.textContent === title.dataset.skillTitleRu));
  assert.ok(counts.every(count => Number(count.dataset.skillCount) > 0 && / скилл(?:а|ов)?$/.test(count.textContent)));
  assert.ok(downloads.every(download => download.textContent === 'Скачать ZIP'));
  page.click('en');
  assert.equal(page.document.querySelector('h1').textContent, 'Skills');
  assert.equal(page.document.title, 'Skills — Slipcast-Dev');
  assert.equal(page.document.querySelector('[data-i18n-label="skillCompatibility"]').attrs['aria-label'], 'Compatibility filter');
  assert.ok(titles.every(title => title.textContent === title.dataset.skillTitleEn));
  assert.ok(counts.every(count => / skills?$/.test(count.textContent)));
  assert.ok(downloads.every(download => download.textContent === 'Download ZIP'));
  assert.deepEqual(visible(), claudeCards);
  page.click('ru');
  assert.ok(titles.every(title => title.textContent === title.dataset.skillTitleRu));
  assert.deepEqual(visible(), claudeCards);
  choose('all');
  assert.deepEqual(visible(), cards);
});

test('Карточка приложения скачивает установщик, сборки для других платформ доступны отдельно', () => {
  const page = setup('projects.html');
  const base = 'https://github.com/Slipcast-dev/Grizzly/releases/download/v3.0.0/';
  const names = ['Grizzly-arm64.dmg', 'Grizzly-x64.dmg', 'Grizzly-portable.exe', 'SHA256SUMS.txt'];
  page.context.testSnapshot = { repositories: [{
    id: 1435902203, name: 'Grizzly', private: false, owner: { login: 'Slipcast-dev' }, version: 'v3.0.0',
    downloads: [...names.map(name => ({ name, url: base + name, size: name.endsWith('.exe') ? 110_651_686 : 14_058_439 })),
      { name: 'Grizzly.pkg', url: 'https://example.com/Grizzly.pkg' }]
  }] };
  vm.runInContext('navigator.platform = "Win32"; renderProjects(testSnapshot)', page.context);
  const item = page.document.querySelector('#project-list').children[0];
  const [card, options] = item.children;
  assert.equal(item.className, 'project-card');
  assert.equal(options.className, 'download-options');
  assert.equal(card.children[0].textContent, 'Grizzly');
  assert.match(card.children[1].textContent, /^Просмотр и редактирование Markdown/);
  assert.equal(card.href, base + 'Grizzly-portable.exe');
  assert.equal(card.getAttribute('download'), '');
  assert.deepEqual(options.children.map(link => link.href), names.slice(0, 3).map(name => base + name));
  assert.deepEqual(options.children.map(link => link.children[1].textContent.replace(/\s/g, ' ')), [
    'v3.0.0 · 14,1 МБ · macOS 13+ · Apple Silicon',
    'v3.0.0 · 14,1 МБ · macOS 13+ · Intel',
    'v3.0.0 · 110,7 МБ · Windows 10/11 · x64'
  ]);
  page.click('en');
  const [englishCard, english] = page.document.querySelector('#project-list').children[0].children;
  assert.match(englishCard.children[1].textContent, /^Read and edit Markdown/);
  assert.equal(english.children[2].children[1].textContent, 'v3.0.0 · 110.7 MB · Windows 10/11 · x64');
});

test('Английский агрегатор доступен с главной и содержит тот же каталог', () => {
  const home = setup('index.html', { languages: ['en-US'], protocol: 'https:' });
  assert.equal(home.document.querySelector('[data-i18n="aiAggregator"]').attrs.href, 'ai-aggregator-en.html?lang=en');
  const englishHome = fs.readFileSync(path.join(dist, 'index-en.html'), 'utf8');
  assert.match(englishHome, /href="ai-aggregator-en\.html\?lang=en"[^>]*>AI Aggregator</);
  const pages = ['ai-aggregator.html', 'ai-aggregator-en.html']
    .map(name => fs.readFileSync(path.join(dist, name), 'utf8'));
  const [russian, english] = pages.map(html =>
    JSON.parse(html.match(/<script id="catalog-data" type="application\/json">([\s\S]+?)<\/script>/)[1]));
  assert.match(pages[1], /<html lang="en">/);
  assert.match(pages[1], /<h1>AI Aggregator<\/h1>/);
  assert.match(pages[1], /<label for="task">Task<\/label>/);
  assert.match(pages[1], /app: \["Design an application"/);
  assert.match(pages[1], /full: \["Full lifecycle"/);
  assert.deepEqual(english.categories.map(category => category.id), russian.categories.map(category => category.id));
  assert.deepEqual(english.roles.map(role => [role.id, role.steps.length]),
                   russian.roles.map(role => [role.id, role.steps.length]));
  assert.doesNotMatch(JSON.stringify(english), /\p{Script=Cyrillic}/u);
});

test('Каждая задача агрегатора имеет подходящие этапы на обоих языках', () => {
  for (const page of ['ai-aggregator.html', 'ai-aggregator-en.html']) {
    const html = fs.readFileSync(path.join(dist, page), 'utf8');
    const catalogStart = html.indexOf('const taskGroups = ');
    const catalogEnd = html.indexOf('const platformRoles = ');
    assert.ok(catalogStart >= 0 && catalogStart < catalogEnd);
    const { tasks, phases, taskPhases } = vm.runInNewContext(
      html.slice(catalogStart, catalogEnd) + '\n({ tasks, phases, taskPhases })'
    );
    const coveredStages = new Set();
    assert.equal(taskPhases.size, Object.keys(tasks).length);
    for (const task of Object.keys(tasks)) {
      const stages = taskPhases.get(task);
      assert.ok(stages?.has('auto') && stages.size > 1, task);
      for (const stage of stages) {
        assert.ok(Object.hasOwn(phases, stage), task + ': ' + stage);
        coveredStages.add(stage);
      }
    }
    assert.equal(coveredStages.size, Object.keys(phases).length);
    assert.ok(taskPhases.get('app').has('architecture'));
    assert.ok(taskPhases.get('app').has('feasibility'));
    assert.ok(!taskPhases.get('app').has('socialPublishingPreparation'));
    assert.ok(taskPhases.get('socialPublishingPreparationTask1').has('socialPublishingPreparation'));
    assert.ok(!taskPhases.get('socialPublishingPreparationTask1').has('architecture'));
  }
});

test('Новые роли агрегатора связаны с задачами, этапами и профилями моделей', () => {
  const html = fs.readFileSync(path.join(dist, 'ai-aggregator-en.html'), 'utf8');
  const catalog = JSON.parse(html.match(/<script id="catalog-data" type="application\/json">([\s\S]+?)<\/script>/)[1]);
  const definitions = html.slice(html.indexOf('const environment = '), html.indexOf('const platformRoles = '));
  const { environment, roleModel, tasks, phases, taskPhases } = vm.runInNewContext(
    definitions + '\n({ environment, roleModel, tasks, phases, taskPhases })'
  );
  const specialized = catalog.roles.filter(role => Object.hasOwn(role, 'tier'));
  assert.equal(specialized.length, 36);
  assert.equal(new Set(specialized.map(role => role.category)).size, 12);

  for (const role of specialized) {
    const matchingTasks = Object.entries(tasks).filter(([, [, roleIds]]) => roleIds.includes(role.id));
    const matchingStages = Object.entries(phases).filter(([, stage]) => stage.roleIds.includes(role.id));
    assert.ok(matchingTasks.some(([task]) =>
      matchingStages.some(([stage]) => taskPhases.get(task).has(stage))), role.id);
    for (const engine of ['codex', 'claude']) {
      assert.equal(roleModel(role, engine, '')[0], environment[engine][role.tier][0], role.id);
      assert.equal(roleModel(role, engine, 'flagship')[0], environment[engine].flagship[0], role.id);
      assert.equal(roleModel(role, engine, 'inherit')[0], '', role.id);
    }
  }
  assert.equal(tasks.macosQuickLookCustomFormat[2], 'macos');
  assert.equal(tasks.addWindowsExplorerCommand[2], 'windows');
  assert.equal(tasks.auditAiAnswerCitations[2], undefined);
});
