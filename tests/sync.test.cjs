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
      makeRepo(4, 'other', { owner: { login: 'other' } }), makeRepo(5, 'no-release')
    ] : url.includes('/app/') ? [
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
