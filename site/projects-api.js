'use strict';
(() => {
  const OWNER = 'Slipcast-dev';

  /** Определяем сайты по явным метаданным, не исключая приложения с собственным homepage. */
  function isWebsite(repo) {
    return /(^|[-_.])(website|web-site|site|landing|landing-page)([-_.]|$)/i.test(repo.name)
      || repo.name.toLowerCase().endsWith('.github.io')
      || (Array.isArray(repo.topics) ? repo.topics : []).some(topic => typeof topic === 'string'
        && ['website', 'web-site', 'landing-page', 'github-pages'].includes(topic.toLowerCase()));
  }

  /** Собираем только публичные данные; браузер работает без токена, сборка может передать его явно. */
  async function collectProjects({ fetchImpl = fetch, token = '' } = {}) {
    async function github(path) {
      for (let attempt = 0; attempt < 3; attempt++) {
        let response;
        try {
          response = await fetchImpl(`https://api.github.com${path}`, {
            headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10',
              ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            signal: AbortSignal.timeout(20000), redirect: 'error', cache: 'no-store', credentials: 'omit'
          });
        } catch (error) {
          if (attempt === 2) throw new Error('GitHub API network request failed', { cause: error });
          await new Promise(done => setTimeout(done, 500 * 2 ** attempt + Math.random() * 300));
          continue;
        }
        if ([502, 503, 504].includes(response.status) && attempt < 2) {
          await new Promise(done => setTimeout(done, 500 * 2 ** attempt + Math.random() * 300));
          continue;
        }
        if (!response.ok) throw new Error(`GitHub API HTTP ${response.status}: ${path}`);
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error(`Unexpected GitHub response: ${path}`);
        return data;
      }
    }
    const unique = new Map();
    let complete = false;
    for (let page = 1; page <= 20; page++) {
      const batch = await github(`/users/${OWNER}/repos?type=owner&sort=updated&per_page=100&page=${page}`);
      for (const repo of batch) {
        if (!repo || repo.private !== false || repo.owner?.login?.toLowerCase() !== OWNER.toLowerCase()
          || !Number.isInteger(repo.id) || typeof repo.name !== 'string' || !repo.name
          || repo.name.toLowerCase() === OWNER.toLowerCase() || isWebsite(repo)) continue;
        unique.set(repo.id, repo);
      }
      if (batch.length < 100) { complete = true; break; }
    }
    if (!complete) throw new Error('Repository pagination limit exceeded');
    const repos = [...unique.values()];
    const result = new Array(repos.length);
    let cursor = 0;
    async function worker() {
      while (cursor < repos.length) {
        const index = cursor++;
        const repo = repos[index];
        let latest = null;
        let releasesComplete = false;
        for (let page = 1; page <= 20; page++) {
          const releases = await github(`/repos/${OWNER}/${encodeURIComponent(repo.name)}/releases?per_page=100&page=${page}`);
          for (const release of releases) {
            if (release.draft !== false || typeof release.tag_name !== 'string' || !release.tag_name.trim()
              || !Number.isFinite(Date.parse(release.published_at))) continue;
            if (!latest || Date.parse(release.published_at) > Date.parse(latest.published_at)) latest = release;
          }
          if (releases.length < 100) { releasesComplete = true; break; }
        }
        if (!releasesComplete) throw new Error(`Release pagination limit exceeded: ${repo.name}`);
        result[index] = { id: repo.id, name: repo.name,
          description: typeof repo.description === 'string' ? repo.description : null,
          private: false, owner: { login: OWNER }, topics: Array.isArray(repo.topics) ? repo.topics.filter(t => typeof t === 'string') : [],
          version: latest?.tag_name ?? null };
      }
    }
    await Promise.all(Array.from({ length: Math.min(2, repos.length) }, worker));
    return { schemaVersion: 1, fetchedAt: new Date().toISOString(), repositories: result };
  }

  // Один сборщик для публикации и браузера сохраняет одинаковую фильтрацию и выбор релизов.
  globalThis.publicProjectsApi = Object.freeze({ OWNER, isWebsite, collectProjects });
})();
