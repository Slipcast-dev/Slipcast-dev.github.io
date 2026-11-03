/* Общий словарь интерфейса. Данные репозиториев сохраняются в оригинале GitHub. */
(() => {
  'use strict';
  const strings = {
    ru: {
      developmentLog: 'Журнал разработок',
      developerTitle: 'Разработчик — Slipcast-Dev', developerMetaDescription: 'Страница разработчика Slipcast-Dev.',
      bioIntro: 'Я разработчик на стыке кода, искусственного интеллекта и автоматизации. Создаю приложения и цифровые инструменты, в которых ИИ становится частью рабочего процесса: помогает анализировать данные, принимать решения и выполнять задачи.',
      bioAgents: 'Проектирую ИИ-агентов, подключаю их к API и сервисам, выстраиваю совместную работу нескольких агентов — от поиска информации до выполнения последовательных действий. Уделяю внимание точности, управляемости и понятным границам их самостоятельности.',
      bioApproach: 'Мой подход — превращать смелые идеи в продуманные продукты. Чистый код, простая архитектура и технологии, которые приносят ощутимую пользу.',
      telegramContact: 'Написать в Telegram ↗',
      websitesTitle: 'Вэб-сайты — Slipcast-Dev', websitesMetaDescription: 'Сайты Grizzly и Koto от Slipcast-Dev с живыми превью.',
      websiteList: 'Сайты Slipcast-Dev', visitWebsite: 'Открыть сайт ↗',
      grizzlyWebsiteDescription: 'Сайт Grizzly — приложения для чтения и редактирования Markdown, текста и кода на macOS и Windows.',
      kotoWebsiteDescription: 'Сайт Koto — нативного переводчика для Mac: перевод текста, выделения и области экрана.',
      homeTitle: 'Личный терминал — Slipcast-Dev', projectsTitle: 'Проекты — Slipcast-Dev',
      homeDescription: 'Личный сайт Slipcast-Dev: разработчик, проекты и веб-сайты.',
      projectsDescription: 'Публичные проекты Slipcast-dev: версии, названия и описания из GitHub.',
      heading: 'Личный сайт — разработчик, проекты и веб-сайты', developer: 'Разработчик', projects: 'Проекты', websites: 'Вэб-сайты',
      access: 'Вход разрешен.', welcome: 'Добро пожаловать в репозиторий Slipcast-Dev',
      terminalSummary: 'Вход разрешен. Добро пожаловать в репозиторий Slipcast-Dev. Декоративная анимация команд macOS, Linux и GitHub CLI.',
      sections: 'Разделы сайта', navigation: 'Навигация сайта', back: '← Назад в терминал', terminal: '← Терминал',
      websitesDescription: 'Раздел для портфолио веб-сайтов: дизайн, разработка и ссылки на опубликованные работы.',
      projectList: 'Публичные проекты Slipcast-dev', loadingProjects: 'Загрузка публичных проектов…', loadingVersion: 'Загрузка версии…',
      noDescription: 'Описание пока не добавлено.', noRelease: 'Без релиза', versionUnavailable: 'Версия недоступна',
      emptyProjects: 'Публичных проектов пока нет.', partialVersions: 'Проекты загружены. Часть версий временно недоступна — обновление повторится автоматически.',
      apiLimit: 'GitHub временно ограничил запросы. Обновление повторится позже.', apiUnavailable: 'GitHub временно недоступен. Обновление повторится автоматически.',
      invalidProjects: 'GitHub вернул некорректный список проектов.', tooManyProjects: 'Не удалось загрузить список проектов полностью.', invalidReleases: 'Некорректный список релизов.',
      timeout: 'GitHub не ответил вовремя. Обновление повторится автоматически.', offline: 'Не удалось связаться с GitHub. Проверьте интернет. Обновление повторится автоматически.'
    },
    en: {
      developmentLog: 'Development Log',
      developerTitle: 'Developer — Slipcast-Dev', developerMetaDescription: 'About the developer behind Slipcast-Dev.',
      bioIntro: 'I am a developer working at the intersection of code, artificial intelligence and automation. I build applications and digital tools that make AI part of the workflow: helping analyze data, make decisions and carry out tasks.',
      bioAgents: 'I design AI agents, connect them to APIs and services, and orchestrate collaboration between multiple agents — from finding information to carrying out sequences of actions. I focus on accuracy, control and clear boundaries for their autonomy.',
      bioApproach: 'My approach is to turn bold ideas into thoughtfully designed products. Clean code, simple architecture and technology that delivers tangible value.',
      telegramContact: 'Message me on Telegram ↗',
      websitesTitle: 'Websites — Slipcast-Dev', websitesMetaDescription: 'Grizzly and Koto websites by Slipcast-Dev, with live previews.',
      websiteList: 'Slipcast-Dev websites', visitWebsite: 'Visit website ↗',
      grizzlyWebsiteDescription: 'The Grizzly website: a Markdown, text and source code reader and editor for macOS and Windows.',
      kotoWebsiteDescription: 'The Koto website: a native Mac translator for text, selections and screen regions.',
      homeTitle: 'Personal Terminal — Slipcast-Dev', projectsTitle: 'Projects — Slipcast-Dev',
      homeDescription: 'Slipcast-Dev personal website: developer, projects and websites.',
      projectsDescription: 'Public Slipcast-dev projects: releases, names and descriptions from GitHub.',
      heading: 'Personal website — developer, projects and websites', developer: 'Developer', projects: 'Projects', websites: 'Websites',
      access: 'Access granted.', welcome: 'Welcome to the Slipcast-Dev repository.',
      terminalSummary: 'Access granted. Welcome to the Slipcast-Dev repository. Decorative macOS, Linux and GitHub CLI command animation.',
      sections: 'Website sections', navigation: 'Website navigation', back: '← Back to terminal', terminal: '← Terminal',
      websitesDescription: 'A website portfolio section for design, development and links to published work.',
      projectList: 'Public Slipcast-dev projects', loadingProjects: 'Loading public projects…', loadingVersion: 'Loading version…',
      noDescription: 'No description provided yet.', noRelease: 'No release', versionUnavailable: 'Version unavailable',
      emptyProjects: 'No public projects yet.', partialVersions: 'Projects loaded. Some versions are temporarily unavailable and will update automatically.',
      apiLimit: 'GitHub has temporarily limited requests. Updates will resume later.', apiUnavailable: 'GitHub is temporarily unavailable. Updates will retry automatically.',
      invalidProjects: 'GitHub returned an invalid project list.', tooManyProjects: 'The complete project list could not be loaded.', invalidReleases: 'Invalid release list.',
      timeout: 'GitHub did not respond in time. Updates will retry automatically.', offline: 'Could not connect to GitHub. Check your connection. Updates will retry automatically.'
    }
  };
  const valid = value => value === 'ru' || value === 'en';
  const query = new URL(location.href).searchParams.get('lang');
  let saved;
  try { saved = localStorage.getItem('slipcast-language'); } catch { /* Локальное хранилище может быть запрещено. */ }
  // Браузер предоставляет языковые предпочтения пользователя, а не прямой доступ к настройкам ОС.
  const preferred = (navigator.languages?.length ? navigator.languages : [navigator.language || 'en'])
    .map(value => value.toLowerCase().split('-')[0]).find(valid) || 'en';
  let language = valid(query) ? query : valid(saved) ? saved : preferred;
  document.documentElement.lang = language;
  const t = key => strings[language][key] || strings.en[key] || key;
  function message(node, key) {
    if (key) node.dataset.i18n = key;
    else delete node.dataset.i18n;
    node.textContent = key ? t(key) : '';
  }
  function apply() {
    document.documentElement.lang = language;
    document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });
    document.querySelectorAll('[data-i18n-label]').forEach(node => { node.setAttribute('aria-label', t(node.dataset.i18nLabel)); });
    const page = document.body.dataset.page;
    document.title = t(page === 'developer' ? 'developerTitle' : page === 'websites' ? 'websitesTitle' : page === 'projects' ? 'projectsTitle' : 'homeTitle');
    document.querySelector('meta[name="description"]').content = t(page === 'developer' ? 'developerMetaDescription' : page === 'websites' ? 'websitesMetaDescription' : page === 'projects' ? 'projectsDescription' : 'homeDescription');
    document.querySelectorAll('[data-language]').forEach(button => {
      const active = button.dataset.language === language;
      button.setAttribute('aria-pressed', String(active));
    });
    // Параметр сохраняет язык между локальными файлами даже при изоляции хранилищ браузером.
    document.querySelectorAll('a[href]').forEach(link => {
      const href = link.getAttribute('href');
      if (!/^(index|projects|websites|developer)\.html(?:[?#]|$)/.test(href)) return;
      const url = new URL(href, location.href);
      url.searchParams.set('lang', language);
      link.setAttribute('href', url.pathname.split('/').pop() + url.search + url.hash);
    });
  }
  function setLanguage(next) {
    if (!valid(next) || next === language) return;
    language = next;
    try { localStorage.setItem('slipcast-language', next); } catch { /* Ссылки с lang работают и без хранилища. */ }
    // Обновляем текущий URL без перезагрузки; file:// может запрещать History API.
    try {
      const url = new URL(location.href); url.searchParams.set('lang', next);
      history.replaceState(null, '', url.href);
    } catch { /* Текущая страница остаётся работоспособной без History API. */ }
    apply();
    document.dispatchEvent(new Event('languagechange'));
  }
  window.siteI18n = { t, message, get language() { return language; }, setLanguage };
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    document.querySelectorAll('[data-language]').forEach(button => {
      button.addEventListener('click', () => setLanguage(button.dataset.language));
    });
  });
})();
