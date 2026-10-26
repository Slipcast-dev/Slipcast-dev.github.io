// @ts-check
import { defineConfig } from 'astro/config';

// Канонический адрес сайта используется в SEO и ссылках на социальное превью.
export default defineConfig({
  site: 'https://slipcast-dev.github.io',
  // Локальный сервер доступен только на этой машине.
  server: { host: '127.0.0.1' },
});
