const { test } = require('node:test');
const assert = require('node:assert/strict');
const makeRepo = (id, name, extra = {}) => ({ id, name, private: false, owner: { login: 'Slipcast-dev' }, description: 'Public description', topics: [], ...extra });

test('Синхронизация фильтрует приватные, чужие и сайты, выбирает последний опубликованный prerelease', async () => {
  const { collectProjects } = await import('../scripts/sync-projects.mjs');
  const paths = [];
  const result = await collectProjects({ token: 'test-token', fetchImpl: async (url, options) => {
    paths.push(url);
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    return { ok: true, status: 200, json: async () => url.includes('/users/') ? [
      makeRepo(1, 'app'), makeRepo(2, 'test-website'), makeRepo(3, 'hidden', { private: true }),
      makeRepo(4, 'other', { owner: { login: 'other' } }), makeRepo(5, 'no-release'), makeRepo(6, 'SLIPCAST-DEV'),
      makeRepo(1444783625, 'renamed-codex-collection'), makeRepo(1446028185, 'claude-skills'),
      makeRepo(10, 'codex-user-skills')
    ] : url.includes('/repositories/1/releases?') ? [
      { draft: false, tag_name: 'v1', published_at: '2026-01-01' },
      { draft: false, tag_name: 'v2-alpha', prerelease: true, published_at: '2026-02-01' },
      { draft: true, tag_name: 'v3', published_at: '2026-03-01' }
    ] : [] };
  } });
  assert.equal(result.repositories.length, 2);
  assert.equal(result.repositories[0].version, 'v2-alpha');
  assert.equal(result.repositories[1].version, null);
  assert.ok(!JSON.stringify(result).includes('test-token'));
  assert.equal(paths.length, 3);
});

test('Обход репозиториев учитывает пагинацию и убирает дубликаты', async () => {
  const { collectProjects } = await import('../scripts/sync-projects.mjs');
  const result = await collectProjects({ token: '', fetchImpl: async url => ({ ok: true, status: 200,
    json: async () => url.includes('/users/')
      ? url.endsWith('page=1') ? Array.from({ length: 100 }, () => makeRepo(1, 'app')) : [makeRepo(1, 'app'), makeRepo(2, 'another')]
      : [] }) });
  assert.equal(result.repositories.length, 2);
});

test('Ошибка API прекращает синхронизацию, а не публикует частичный список', async () => {
  const { collectProjects } = await import('../scripts/sync-projects.mjs');
  await assert.rejects(collectProjects({ token: '', fetchImpl: async () => ({ ok: false, status: 403 }) }), /HTTP 403/);
});

test('Переименование проекта не прерывает получение релизов по постоянному ID', async () => {
  const { collectProjects } = await import('../scripts/sync-projects.mjs');
  let renamed = false;
  const fetchImpl = async url => {
    if (url.includes('/users/')) {
      return { ok: true, json: async () => [makeRepo(901,
        renamed ? 'RenamedApp' : 'OriginalApp',
        { description: renamed ? 'New description' : 'Original description' })] };
    }
    // После переименования старый адрес релизов возвращает 301.
    if (!url.includes('/repositories/901/releases?')) return { ok: false, status: 301 };
    return { ok: true, json: async () => [{
      draft: false, tag_name: renamed ? 'v1.2.0' : 'v1.0.0', published_at: '2026-11-11'
    }] };
  };
  const before = await collectProjects({ token: '', fetchImpl });
  renamed = true;
  const after = await collectProjects({ token: '', fetchImpl });
  assert.equal(before.repositories[0].version, 'v1.0.0');
  assert.equal(after.repositories[0].name, 'RenamedApp');
  assert.equal(after.repositories[0].description, 'New description');
  assert.equal(after.repositories[0].version, 'v1.2.0');
});

test('Список и готовые версии доступны до завершения медленного запроса релиза', async () => {
  const { collectProjects } = await import('../scripts/sync-projects.mjs');
  const repos = [makeRepo(1, 'fast'), makeRepo(2, 'slow')];
  const progress = [];
  let finishSlow;
  const slow = new Promise(resolve => { finishSlow = resolve; });
  let fastReady;
  const ready = new Promise(resolve => { fastReady = resolve; });
  const pending = collectProjects({
    token: '',
    onProgress(snapshot) {
      progress.push(JSON.parse(JSON.stringify(snapshot)));
      if (snapshot.repositories[0]?.version === 'v2') fastReady();
    },
    fetchImpl: async url => {
      if (url.includes('/users/')) return { ok: true, json: async () => repos };
      if (url.includes('/repositories/2/')) await slow;
      return { ok: true, json: async () => [{ draft: false, tag_name: 'v2', published_at: '2026-11-11' }] };
    }
  });
  await ready;
  assert.equal(progress[0].repositories.length, 2);
  assert.equal(progress[0].repositories[1].releaseState, 'loading');
  assert.equal(progress.at(-1).repositories[0].version, 'v2');
  assert.equal(progress.at(-1).repositories[1].releaseState, 'loading');
  finishSlow();
  assert.equal((await pending).repositories[1].version, 'v2');
});

test('Неизменённые релизы кешируются, изменение репозитория и истечение срока вызывают проверку', async () => {
  const { collectProjects } = await import('../scripts/sync-projects.mjs');
  let repo = makeRepo(1, 'app', { updated_at: '2026-11-11T12:00:00Z', pushed_at: '2026-11-11T12:00:00Z' });
  let releases = 0;
  const fetchImpl = async url => ({
    ok: true, json: async () => url.includes('/users/') ? [repo]
      : (releases++, [{ draft: false, tag_name: 'v' + releases, published_at: '2026-11-11' }])
  });
  const first = await collectProjects({ token: '', fetchImpl });
  const cached = await collectProjects({ token: '', fetchImpl, previousSnapshot: first });
  assert.equal(releases, 1);
  assert.equal(cached.repositories[0].version, 'v1');
  repo = { ...repo, pushed_at: '2026-11-11T12:10:00Z' };
  const changed = await collectProjects({ token: '', fetchImpl, previousSnapshot: cached });
  assert.equal(changed.repositories[0].version, 'v2');
  changed.repositories[0].releaseCheckedAt = new Date(Date.now() - 16 * 60_000).toISOString();
  const expired = await collectProjects({ token: '', fetchImpl, previousSnapshot: changed });
  assert.equal(expired.repositories[0].version, 'v3');
});

test('Сбой отдельного релиза сохраняет его версию и обновляет остальные данные в браузере', async () => {
  const { collectProjects } = await import('../scripts/sync-projects.mjs');
  const result = await collectProjects({
    token: '', tolerateReleaseErrors: true,
    previousSnapshot: { repositories: [{ ...makeRepo(1, 'old-name'), version: 'v1' }] },
    fetchImpl: async url => url.includes('/users/')
      ? { ok: true, json: async () => [makeRepo(1, 'new-name'), makeRepo(2, 'other')] }
      : url.includes('/repositories/1/')
        ? { ok: false, status: 404 }
        : { ok: true, json: async () => [{ draft: false, tag_name: 'v3', published_at: '2026-11-11' }] }
  });
  assert.equal(result.repositories[0].name, 'new-name');
  assert.equal(result.repositories[0].version, 'v1');
  assert.equal(result.repositories[0].releaseState, 'stale');
  assert.equal(result.repositories[1].version, 'v3');
});

test('Скрытый MindNotes не возвращается из API или кеша после переименования', async () => {
  const { collectProjects } = await import('../scripts/sync-projects.mjs');
  const hidden = makeRepo(1449438166, 'renamed-hidden-project');
  const result = await collectProjects({
    token: '',
    previousSnapshot: { repositories: [hidden] },
    fetchImpl: async url => {
      assert.ok(url.includes('/users/'), 'Релизы скрытого проекта не запрашиваются');
      return { ok: true, json: async () => [hidden] };
    }
  });
  assert.deepEqual(result.repositories, []);
});
