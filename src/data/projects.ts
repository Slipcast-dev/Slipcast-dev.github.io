import snapshot from './projects.snapshot.json';

/** Данные витрины отделены от шаблона; тип проверяется командой astro check. */
export interface Project {
  name: string;
  summary: string;
  tags: string[];
  url: string;
  release?: string;
  version?: string;
  prerelease?: boolean;
  pushedAt: string;
}

// Снимок хранится в Git: сборка и просмотр не зависят от доступности GitHub API.
export const projects: Project[] = snapshot;
