'use strict';
(() => {
  const OWNER = 'Slipcast-dev';

  /** Скрытые владельцем проекты исключаются по постоянным ID, включая переименования.
   * Возвращать их на сайт можно только по явному указанию владельца. */
  function isHiddenProject(repo) {
    return [1449438166, 1456992734, 1457278588, 1461694197, 1469982790].includes(repo.id);
  }

  /** Перенесённые коллекции исключаем из проектов и после переименования. */
  function isSkillCollection(repo) {
    return [1444783625, 1446028185].includes(repo.id)
      || ['codex-skills', 'codex-user-skills', 'claude-skills'].includes(repo.name.toLowerCase());
  }

  /** Определяем сайты по явным метаданным, не исключая приложения с собственным homepage. */
  function isWebsite(repo) {
    return /(^|[-_.])(website|web-site|site|landing|landing-page)([-_.]|$)/i.test(repo.name)
      || repo.name.toLowerCase().endsWith('.github.io')
      || (Array.isArray(repo.topics) ? repo.topics : []).some(topic => typeof topic === 'string'
        && ['website', 'web-site', 'landing-page', 'github-pages'].includes(topic.toLowerCase()));
  }

  /** Проверяем, что ссылка ведёт на файл релиза именно этого репозитория. */
  function releaseDownload(repo, asset) {
    if (typeof asset?.name !== 'string' || !asset.name || /[\\/]/.test(asset.name)
      || typeof repo.version !== 'string' || !repo.version) return null;
    const prefix = `https://github.com/${OWNER}/${encodeURIComponent(repo.name)}/releases/download/`;
    try {
      const url = new URL(asset.url);
      return url.href === prefix + encodeURIComponent(repo.version) + '/' + encodeURIComponent(asset.name)
        ? url.href : null;
    } catch {
      return null;
    }
  }

  /** Один установщик на платформу и архитектуру. DMG предпочтительнее PKG, MSI — EXE. */
  function projectDownloads(repo) {
    const formats = ['dmg', 'pkg', 'msi', 'exe', 'appimage', 'deb', 'rpm'];
    const builds = new Map();
    for (const asset of (Array.isArray(repo.downloads) ? repo.downloads : [])) {
      const url = releaseDownload(repo, asset);
      if (!url) continue;
      const filename = asset.name.toLowerCase();
      const rank = formats.indexOf(filename.split('.').at(-1));
      if (rank < 0) continue;
      const platform = rank < 2 ? 'mac' : rank < 4 ? 'windows' : 'linux';
      const arch = /(?:^|[-_.])(?:arm64|aarch64)(?=[-_.])/.test(filename) ? 'Arm'
        : /(?:^|[-_.])(?:x64|x86_64|intel)(?=[-_.])/.test(filename) ? 'Intel' : '';
      const key = platform + arch;
      if (!builds.has(key) || builds.get(key).rank > rank) builds.set(key, { key, platform, url, rank });
    }
    return [...builds.values()].sort((a, b) => a.rank - b.rank || a.key.localeCompare(b.key));
  }

  /** Собираем только публичные данные; браузер работает без токена, сборка может передать его явно. */
  async function collectProjects({
    fetchImpl = fetch, token = '', previousSnapshot = null, onProgress = null,
    tolerateReleaseErrors = false
  } = {}) {
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
        if (!response.ok) {
          const error = new Error(`GitHub API HTTP ${response.status}: ${path}`);
          error.status = response.status;
          // GitHub сообщает момент сброса лимита. Браузер прекращает частые повторы до этого срока.
          const reset = Number(response.headers?.get('x-ratelimit-reset')) * 1000;
          const retry = Number(response.headers?.get('retry-after')) * 1000;
          error.retryAt = Math.max(reset || 0, Date.now() + (retry || 60 * 1000));
          throw error;
        }
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
          || repo.name.toLowerCase() === OWNER.toLowerCase() || isWebsite(repo) || isSkillCollection(repo) || isHiddenProject(repo)) continue;
        unique.set(repo.id, repo);
      }
      if (batch.length < 100) { complete = true; break; }
    }
    if (!complete) throw new Error('Repository pagination limit exceeded');
    const repos = [...unique.values()];
    const previous = new Map((previousSnapshot?.repositories || []).map(repo => [repo.id, repo]));
    // Показываем свежий состав, имена и описания до завершения запросов релизов.
    // Версии сохраняем по ID, чтобы переименование не потеряло уже известный релиз.
    const result = repos.map(repo => {
      const cached = previous.get(repo.id);
      return {
        id: repo.id, name: repo.name,
        description: typeof repo.description === 'string' ? repo.description : null,
        private: false, owner: { login: OWNER },
        topics: Array.isArray(repo.topics) ? repo.topics.filter(topic => typeof topic === 'string') : [],
        version: cached?.version ?? null,
        downloads: cached?.name === repo.name ? cached.downloads : undefined,
        releaseState: cached?.releaseState ?? (cached ? 'ready' : 'loading'),
        releaseCheckedAt: cached?.releaseCheckedAt ?? null,
        sourceUpdatedAt: cached?.sourceUpdatedAt ?? null,
        sourcePushedAt: cached?.sourcePushedAt ?? null
      };
    });
    const snapshot = () => ({ schemaVersion: 1, fetchedAt: new Date().toISOString(), repositories: result });
    if (onProgress) onProgress(snapshot());
    let cursor = 0;
    async function worker() {
      while (cursor < repos.length) {
        const index = cursor++;
        const repo = repos[index];
        const cached = previous.get(repo.id);
        // Изменённый проект проверяем сразу. Неизменённые релизы проверяем раз в 15 минут,
        // поскольку публикация релиза без push может не изменить pushed_at репозитория.
        const cacheIsFresh = cached && Array.isArray(cached.downloads) && cached.releaseState === 'ready'
          && cached.name === repo.name && cached.description === repo.description
          && cached.sourceUpdatedAt === repo.updated_at && cached.sourcePushedAt === repo.pushed_at
          && Date.now() - Date.parse(cached.releaseCheckedAt) < 15 * 60 * 1000;
        if (cacheIsFresh) continue;
        let latest = null;
        let releasesComplete = false;
        try {
          for (let page = 1; page <= 20; page++) {
            // ID сохраняется при переименовании: устаревшее имя из списка не вызывает 301 и срыв синхронизации.
            const releases = await github(`/repositories/${repo.id}/releases?per_page=100&page=${page}`);
            for (const release of releases) {
              if (release.draft !== false || typeof release.tag_name !== 'string' || !release.tag_name.trim()
                || !Number.isFinite(Date.parse(release.published_at))) continue;
              if (!latest || Date.parse(release.published_at) > Date.parse(latest.published_at)) latest = release;
            }
            if (releases.length < 100) { releasesComplete = true; break; }
          }
          if (!releasesComplete) throw new Error(`Release pagination limit exceeded: ${repo.name}`);
        } catch (error) {
          if (!tolerateReleaseErrors || [403, 429].includes(error.status)) throw error;
          // Сбой одного релиза не задерживает остальные карточки и свежие описания.
          result[index].releaseState = cached ? 'stale' : 'unavailable';
          if (onProgress) onProgress(snapshot());
          continue;
        }
        Object.assign(result[index], {
          version: latest?.tag_name ?? null, releaseState: 'ready',
          downloads: (Array.isArray(latest?.assets) ? latest.assets : [])
            .filter(asset => asset?.state === 'uploaded' && releaseDownload({ name: repo.name, version: latest.tag_name },
              { name: asset.name, url: asset.browser_download_url }))
            .map(asset => ({ name: asset.name, url: asset.browser_download_url })),
          releaseCheckedAt: new Date().toISOString(),
          sourceUpdatedAt: repo.updated_at ?? null, sourcePushedAt: repo.pushed_at ?? null
        });
        if (onProgress) onProgress(snapshot());
      }
    }
    // Дожидаемся обоих обработчиков и при ошибке: запоздалый ответ не должен
    // перезаписывать карточки после завершения цикла или начала новой проверки.
    const workers = await Promise.allSettled(Array.from({ length: Math.min(2, repos.length) }, worker));
    const failure = workers.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
    return snapshot();
  }

  // Один сборщик для публикации и браузера сохраняет одинаковую фильтрацию и выбор релизов.
  globalThis.publicProjectsApi = Object.freeze({ OWNER, isWebsite, isSkillCollection, isHiddenProject, projectDownloads, collectProjects });
})();
