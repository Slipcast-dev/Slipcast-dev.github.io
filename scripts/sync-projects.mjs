import { mkdir, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import '../site/projects-api.js';
export const { OWNER, isWebsite } = globalThis.publicProjectsApi;

/** В сборке используем автоматически выданный токен только на сервере. */
export function collectProjects(options = {}) {
  return globalThis.publicProjectsApi.collectProjects({ token: process.env.GITHUB_TOKEN, ...options });
}

export async function writeSnapshot(destination, snapshot) {
  await mkdir(destination, { recursive: true });
  const json = JSON.stringify(snapshot, null, 2).replaceAll('<', '\\u003c');
  for (const [name, body] of [['projects.json', json + '\n'], ['projects-data.js', `/* Public data only; generated during deployment. */\nwindow.publicProjectsSnapshot = ${json};\n`]]) {
    const path = resolve(destination, name);
    await writeFile(path + '.tmp', body);
    await rename(path + '.tmp', path);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const snapshot = await collectProjects();
    await writeSnapshot(resolve(process.argv[2] || 'site'), snapshot);
    console.log(`Updated ${snapshot.repositories.length} public projects.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
