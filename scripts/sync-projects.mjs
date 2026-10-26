import { readFile, rename, writeFile } from 'node:fs/promises';

// Явный список исключает случайную публикацию нового или приватного репозитория.
const repositories = [
  ['Athena-Agent', 'Athena-Agent', ['Swift', 'macOS', 'AI', 'MCP', 'Monitoring']],
  ['Ares-Agent', 'Ares-Agent', ['Swift', 'macOS', 'AI', 'MCP', 'File Automation']],
  ['translator-Koto', 'translator-Koto', ['Swift', 'SwiftUI', 'macOS', 'Translation', 'OCR']],
];
const destination = new URL('../src/data/projects.snapshot.json', import.meta.url);

/**
 * Ограничение времени не даёт зависнуть CI. Токен необязателен и никогда не пишется в файл.
 * Ошибки API прерывают обновление: рабочий снимок при этом остаётся нетронутым.
 */
async function github(path) {
  const response = await fetch(`https://api.github.com/repos/Slipcast-dev/${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`GitHub API: ${response.status} for ${path}`);
  return response.json();
}

/** Метаданные берём только из публичных репозиториев и опубликованных релизов. */
async function projectFromRepository([slug, name, tags]) {
  const repo = await github(slug);
  if (repo.private || repo.fork) throw new Error(`Repository is not public and original: ${slug}`);
  if (typeof repo.description !== 'string' || !repo.description.trim()) {
    throw new Error(`Missing public description: ${slug}`);
  }
  if (!Number.isFinite(Date.parse(repo.pushed_at))) throw new Error(`Invalid push date: ${slug}`);

  // /latest исключает prerelease, поэтому просматриваем список с пагинацией.
  const releases = [];
  for (let page = 1; ; page += 1) {
    const batch = await github(`${slug}/releases?per_page=100&page=${page}`);
    releases.push(...batch.filter((release) => !release.draft && release.published_at));
    if (batch.length < 100) break;
  }
  releases.sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
  const latest = releases[0];
  return {
    name,
    summary: repo.description.trim(),
    tags,
    url: `https://github.com/Slipcast-dev/${slug}`,
    ...(latest ? {
      release: `https://github.com/Slipcast-dev/${slug}/releases`,
      version: latest.tag_name,
      prerelease: latest.prerelease,
    } : {}),
    pushedAt: repo.pushed_at,
  };
}

try {
  // Ограниченный параллелизм: три публичных репозитория, без обхода всего аккаунта.
  const projects = await Promise.all(repositories.map(projectFromRepository));
  projects.sort((a, b) => Date.parse(b.pushedAt) - Date.parse(a.pushedAt) || a.url.localeCompare(b.url));
  const next = `${JSON.stringify(projects, null, 2)}\n`;
  const previous = await readFile(destination, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  if (previous === next) {
    console.log('Project snapshot is already up to date.');
  } else {
    // Атомарная замена защищает от частичной записи при прерывании процесса.
    const temporary = new URL(`${destination.href}.tmp`);
    await writeFile(temporary, next);
    await rename(temporary, destination);
    console.log(`Updated ${projects.length} public projects.`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Project synchronization failed.');
  process.exitCode = 1;
}
