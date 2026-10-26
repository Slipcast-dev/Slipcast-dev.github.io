import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

// fileURLToPath сохраняет кириллицу и пробелы в пути локального проекта.
// PNG совместим с социальными сетями, а редактируемый SVG остаётся источником дизайна.
await sharp(fileURLToPath(new URL('../docs/assets/banner.svg', import.meta.url)))
  .png()
  .toFile(fileURLToPath(new URL('../public/social-preview.png', import.meta.url)));
console.log('Rendered public/social-preview.png (1200 × 630).');
