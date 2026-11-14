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
    { id: 10, name: 'codex-user-skills', private: false, owner: { login: 'Slipcast-dev' } }
  ] };
  page.context.testSnapshot = data;
  vm.runInContext('renderProjects(testSnapshot)', page.context);
  const cards = page.document.querySelector('#project-list').children;
  assert.equal(cards.length, 1);
  assert.equal(cards[0].children[0].children[1].textContent, '<script>');
  assert.ok(cards[0].children[0].href.includes('%3Cscript%3E'));
  assert.equal(cards[0].children[0].children[2].textContent, '<img onerror=alert(1)>');
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
  assert.equal(pages.length, 8);
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
    ['codex-toolkit', 'Development tools', 'v4'],
    ['Rdragon-K530RGB-Keyboard-Port', 'Hardware control', 'v5'],
    ['НовыйПроект', 'Будущее приложение', 'v6']
  ].map(([name, description, version], index) => ({ id: index + 400, name, description, version, private: false, owner: { login: 'Slipcast-dev' } }));
  page.context.futureSnapshot = { repositories: projects };
  vm.runInContext('renderProjects(futureSnapshot)', page.context);
  const run = query => { input.value = query; input.listeners.input.forEach(listener => listener()); return list.children.map(item => item.children[0].children[1].textContent); };
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
  assert.equal(card.children[0].textContent, 'v99');
  assert.equal(card.children[1].textContent, 'renamed-app');
  assert.equal(card.children[2].textContent, 'Fresh description');
  const count = page.calls.length;
  await vm.runInContext('lastAttempt = 0; refreshProjects()', page.context);
  assert.equal(page.calls.length, count + 1);
  assert.equal(page.document.querySelector('#project-list').children[0].children[0].children[0].textContent, 'v99');
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
  assert.deepEqual(cards.map(item => item.children[0].children[1].textContent), ['NewProject']);
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
  assert.equal(list.children[0].children[0].children[0].textContent, 'v10');
  finishSnapshot({ ok: true, json: async () => ({ fetchedAt: '2020-01-01', repositories: [] }) });
  await flush();
  assert.equal(list.children.length, 1);
  assert.equal(list.children[0].children[0].children[0].textContent, 'v10');
});

test('Новый раздел доступен из меню; фильтры и перевод работают, репозитории связаны с GitHub', () => {
  const home = setup('index.html', { languages: ['ru'], seen: true });
  const navigation = home.document.querySelector('[data-i18n="skillsAgents"]');
  assert.equal(navigation.textContent, 'Скиллы и агенты');
  assert.equal(navigation.attrs.href, 'skills-agents.html?v=2&lang=ru');
  const menu = home.nodes.filter(node => (node.attrs.class || '').split(' ').includes('nav-button'));
  assert.deepEqual(menu.map(node => node.dataset.i18n), ['skillsAgents', 'projects', 'developer', 'websites']);
  assert.ok(menu[2].attrs.class.includes('nav-secondary'));
  home.click('en');
  assert.equal(navigation.textContent, 'Skills & Agents');
  assert.equal(navigation.attrs.href, 'skills-agents.html?v=2&lang=en');

  const page = setup('skills-agents.html', { languages: ['ru'] });
  assert.equal(page.document.querySelector('h1').textContent, 'Скиллы и агенты');
  assert.equal(page.document.title, 'Скиллы и агенты — Slipcast-Dev');
  assert.ok(page.nodes.some(node => node.tag === 'a' && node.attrs.href === 'https://github.com/Slipcast-dev/codex-skills'));
  assert.ok(page.nodes.some(node => node.tag === 'a' && node.attrs.href === 'https://github.com/Slipcast-dev/claude-skills'));
  const installationLinks = page.document.querySelectorAll('[data-i18n="skillInstallation"]');
  assert.deepEqual(installationLinks.map(node => node.attrs.href), [
    'https://github.com/Slipcast-dev/codex-skills/releases/latest',
    'https://github.com/Slipcast-dev/claude-skills/releases/latest'
  ]);
  const cards = page.document.querySelectorAll('[data-collection]');
  assert.equal(cards.length, 2);
  const choose = name => page.document.querySelector('[data-filter="' + name + '"]').listeners.click[0]();
  choose('agents');
  assert.ok(cards.every(card => card.hidden));
  assert.equal(page.document.querySelector('#empty-collections').hidden, false);
  page.click('en');
  assert.equal(page.document.querySelector('h1').textContent, 'Skills & Agents');
  assert.equal(page.document.title, 'Skills & Agents — Slipcast-Dev');
  assert.equal(page.document.querySelector('#empty-collections').textContent, 'No agent collections have been published yet.');
  assert.ok(cards.every(card => card.hidden));
  choose('skills');
  assert.ok(cards.every(card => !card.hidden));
  assert.equal(page.document.querySelector('#empty-collections').hidden, true);
  choose('all');
  assert.ok(cards.every(card => !card.hidden));
});
