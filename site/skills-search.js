(() => {
  'use strict';

  // Общие понятия связывают русские запросы с англоязычными описаниями скиллов.
  const concepts = [
    'скриншот screenshot снимок захват',
    'визуал visual интерфейс ui usability',
    'регрес regression baseline эталон',
    'тест test qa проверк проверит приемк acceptance check validat verification',
    'автоматиза automation automate автотест',
    'разработ development engineering программирован coding',
    'код code source исходник',
    'ревью review аудит audit проверк проверит',
    'ошибк bug баг сбой debug диагност troubleshooting',
    'установ installer install упаковк packaging дистрибуц',
    'офлайн offline автономн',
    'резерв backup',
    'копи copy backup',
    'производительност performance lighthouse vitals',
    'релиз release выпуск deploy',
    'структур structured schema схем',
    'источник source citation цитат',
    'синхрон sync конфликт conflict',
    'очеред queue',
    'retry повтор повторн',
    'восстанов recovery restore',
    'парс parsing parse scraper scraping извлеч extraction',
    'формат format schema схем drift контракт',
    'rss feed фид лент',
    'данн data датасет dataset',
    'аналит analytics analysis анализ',
    'модел model llm нейросет',
    'ии ai artificial intelligence',
    'агент agent subagent субагент',
    'промпт промт prompt инструкция instruction',
    'поиск search retrieval ранжир',
    'безопасн security защита hardening',
    'приватност privacy конфиденц',
    'дизайн design макет прототип prototype',
    'доступност accessibility a11y',
    'документ document docs документац',
    'текст writing copy копирайт редактур editing',
    'контент content публикац publishing',
    'изображен image фото photo graphic',
    'таблиц spreadsheet excel sheets',
    'презентац presentation slides слайд',
    'перевод translation локализа localization',
    'финанс finance бюджет budget',
    'обучен learning education учеб',
    'веб web сайт website',
    'облак cloud devops эксплуатац',
    'макос macos mac',
    'виндовс windows',
    'телеграм telegram бот bot'
  ].map(group => group.split(' '));
  const stop = new Set(('и в во на для по с со к о у об как из что это найти работа работой нужен нужна нужно мне который через под при или ' +
    'a an the in on at to for of by and or with how is find i need my that from using').split(' '));

  function tokens(text) {
    return text.toLowerCase().normalize('NFC').replace(/ё/g, 'е')
      .match(/[\p{Letter}\p{Number}]+/gu) || [];
  }

  function part(word, root) {
    return word === root || ((root.length >= 4 || root === 'код') && word.startsWith(root));
  }

  function searchable(collection, name, description) {
    return {
      collection, name, description,
      nameWords: tokens(name),
      textWords: tokens(description),
      contextWords: collection.contextWords
    };
  }

  function search(index, query, platform) {
    const queryWords = tokens(query);
    const terms = [...new Set(queryWords.filter(word => !stop.has(word)))].slice(0, 12);
    if (!terms.length) return [];
    const phrase = terms.join(' ');
    const criteria = terms.map(word => ({
      word,
      aliases: [...new Set(concepts.filter(group => group.some(root => part(word, root))).flat())]
    }));
    const matches = [];
    for (const entry of index) {
      if (platform !== 'all' && entry.collection.engine !== platform) continue;
      let score = 0;
      for (const { word, aliases } of criteria) {
        const exactName = entry.nameWords.includes(word);
        const directName = exactName || entry.nameWords.some(token => part(token, word));
        const directText = entry.textWords.some(token => part(token, word));
        const related = list => aliases.some(root => list.some(token => part(token, root)));
        const weight = exactName ? 12 : directName ? 9 : directText ? 6 :
          related(entry.nameWords) ? 5 : related(entry.textWords) ? 3 :
          entry.contextWords.some(token => part(token, word)) || related(entry.contextWords) ? 1 : 0;
        if (!weight) {
          score = 0;
          break;
        }
        score += weight;
      }
      if (score && entry.nameWords.join(' ').includes(phrase)) score += 16;
      if (score) matches.push({ entry, score });
    }
    return matches.sort((left, right) => right.score - left.score || left.entry.name.localeCompare(right.entry.name));
  }

  window.skillSearch = { tokens, searchable, search };
})();
