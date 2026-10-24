# Slipcast / Dev — Portfolio

Минималистичное портфолио-сайт независимого разработчика на Astro.
Одностраничная витрина: слева — о себе и направлениях работы, справа — open source проекты.

## Стек

- [Astro 5](https://astro.build) — статическая сборка, нулевой JS по умолчанию
- Чистый CSS (переменные, без фреймворков)
- Никаких клиентских библиотек

## Запуск

```bash
npm install
npm run dev      # дев-сервер на http://localhost:4321
```

## Сборка

```bash
npm run build    # статика в dist/
npm run preview  # локальный просмотр собранной версии
```

## Структура

```
src/
  layouts/Layout.astro    # HTML-каркас, meta, шапка документа
  pages/index.astro       # единственная страница (контент и разметка)
  styles/global.css       # дизайн-система: цвета, сетка, типографика
public/
  favicon.svg
```

## Кастомизация

Всё содержимое живёт в `src/pages/index.astro`:

- `focusAreas` — список направлений «What I focus on»
- `projects` — карточки проектов. Поля:
  - `url` — ссылка на репозиторий (кликабельна вся карточка)
  - `release` — если задана, на карточке появляется иконка ⬇ со ссылкой на установщики/релизы
  - `highlighted: true` — подсвеченный фон карточки
- Ссылки на GitHub прописаны в разметке — замените `https://github.com/Slipcast-dev` на свой профиль.

### Актуальный список проектов

Данные тянутся из GitHub API профиля `Slipcast-dev` (публичные, нефоркнутые репозитории, отсортированы по дате push):

- **Athena-Agent** — локальный macOS-агент, RU/EN, Apple Silicon preview (Swift)
- **Ares-Agent** — локальный macOS-агент, RU/EN, Apple Silicon preview (Swift)
- **Rdragon K530RGB — Keyboard Port** — нативный порт утилиты клавиатуры Redragon на macOS (Swift)
- **translator-Koto** — в разработке, описание и теги появятся позже

Репозиторий профиля `Slipcast-dev` в витрину не выводится — он нужен только для GitHub Actions, которые подтягивают список репозиториев в README.

Палитра и отступы вынесены в `:root` в `src/styles/global.css` — правьте переменные, чтобы перекрасить сайт.
