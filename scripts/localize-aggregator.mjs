import { readFile } from 'node:fs/promises';

const translationsUrl = new URL('../translations/ai-aggregator-en.json', import.meta.url);
const cyrillic = /\p{Script=Cyrillic}/u;
const catalogTag = /(<script id="catalog-data" type="application\/json">)([\s\S]*?)(<\/script>)/;

// Английская страница собирается из общего HTML. При отсутствии перевода сборка сообщает точный ключ.
export async function buildEnglishAggregator(source) {
  const translations = JSON.parse(await readFile(translationsUrl, 'utf8'));
  const label = text => cyrillic.test(text) ? required(translations.labels, text, 'label') : text;
  const html = source.replace('<html lang="ru">', '<html lang="en">')
    .replace('rel="canonical" href="https://slipcast-dev.github.io/ai-aggregator.html"',
             'rel="canonical" href="https://slipcast-dev.github.io/ai-aggregator-en.html"')
    .replace(/(data-aggregator-language="ru") aria-current="page"/, '$1')
    .replace('data-aggregator-language="en"', 'data-aggregator-language="en" aria-current="page"')
    .replaceAll('data-terminal-link href="index.html?lang=ru"', 'data-terminal-link href="index-en.html?lang=en"')
    .replace(catalogTag, (_, start, json, end) => {
      const catalog = JSON.parse(json);
      if (Object.keys(translations.roles).length !== catalog.roles.length) {
        throw new Error('AI Aggregator: role counts differ between locales');
      }
      for (const role of catalog.roles) {
        const [name, description, steps] = required(translations.roles, role.id, 'role');
        if (!name || !description || !Array.isArray(steps) || steps.length !== role.steps.length
            || [name, description, ...steps].some(text => !text || cyrillic.test(text))) {
          throw new Error('AI Aggregator: invalid role translation for ' + role.id);
        }
        Object.assign(role, { name, description, steps });
      }
      for (const category of catalog.categories) category.label = label(category.label);
      for (const language of catalog.languages) {
        language.guidance = required(translations.guidance, language.id, 'language guidance');
      }
      // Не даём строкам данных закрыть элемент script при вставке в HTML.
      return start + JSON.stringify(catalog).replaceAll('<', '\\u003c') + end;
    })
    .replace(/(<script>)([\s\S]*?)(<\/script>)/g, (_, start, script, end) => {
      for (const name of ['tasks', 'phases']) {
        const declaration = name === 'tasks' ? 'taskGroups' : 'phaseGroups';
        script = script.replace(new RegExp('const ' + declaration + ' = \\[[\\s\\S]*?^\\];', 'm'), group =>
          group.replace(/^(\s+)(\w+): \['((?:\\.|[^'\\])*)'/gm, (_, indent, id) =>
            indent + id + ': [' + JSON.stringify(required(translations[name], id, name))));
      }
      const localized = script.split('\n').map(line => {
        if (line.trimStart().startsWith('//')) return line;
        return line.replace(/'((?:\\.|[^'\\])*)'/g, (literal, text) => {
          if (!cyrillic.test(text)) return literal;
          return JSON.stringify(label(text).replaceAll('\\n', '\n'));
        });
      }).join('\n');
      return start + localized + end;
    });

  // Сохраняем CSS и JS как отдельные блоки. В разметке переводим видимый текст и атрибуты.
  return html.split(/(<(?:style|script)\b[^>]*>[\s\S]*?<\/(?:style|script)>)/g).map((part, index) => {
    if (index % 2) return part;
    return part
      .replace(/>([^<>]+)</g, (_, text) => '>' + label(text) + '<')
      .replace(/\b(aria-label|placeholder|content)="([^"]*)"/g, (_, attribute, text) =>
        attribute + '="' + label(text).replaceAll('"', '&quot;') + '"');
  }).join('');
}

function required(dictionary, key, section) {
  if (!Object.hasOwn(dictionary, key)) throw new Error('AI Aggregator: missing English ' + section + ' for ' + key);
  return dictionary[key];
}
