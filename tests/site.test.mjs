import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';
import sharp from 'sharp';

const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/styles/global.css', import.meta.url), 'utf8');
const projects = JSON.parse(await readFile(new URL('../src/data/projects.snapshot.json', import.meta.url), 'utf8'));
// Парсер восстанавливает дерево как браузер; отдельно ловим ошибки исходной разметки.
const errors = [];
const document = parse(html, { onParseError: (error) => errors.push(error.code) });
const attribute = (node, name) => node?.attrs?.find((attr) => attr.name === name)?.value;
const classes = (node) => (attribute(node, 'class') ?? '').split(/\s+/);
const walk = (node) => [node, ...(node.childNodes ?? []).flatMap(walk)];
const nodes = walk(document);
const links = nodes.filter((node) => node.tagName === 'a');

test('repository and release links are separate, accessible targets', () => {
  assert.deepEqual(errors, []);
  for (const project of projects) {
    const repository = links.find((node) => attribute(node, 'href') === project.url);
    assert.ok(repository, `Missing repository link for ${project.name}`);
    if (!project.release) continue;
    const release = links.find((node) => attribute(node, 'href') === project.release);
    assert.ok(release, `Missing release link for ${project.name}`);
    assert.ok(attribute(release, 'aria-label')?.includes(project.name));
    assert.equal(release.parentNode, repository.parentNode, 'Links must be siblings');
  }
  for (const link of links) {
    assert.equal(walk(link).filter((node) => node.tagName === 'a').length, 1);
    if (attribute(link, 'target') === '_blank') {
      assert.match(attribute(link, 'rel'), /noopener/);
      assert.match(attribute(link, 'rel'), /noreferrer/);
    }
  }
});

test('project cards use a unique snapshot sorted by most recent push', () => {
  assert.ok(projects.length > 0);
  assert.equal(nodes.filter((node) => classes(node).includes('project')).length, projects.length);
  assert.equal(new Set(projects.map((project) => project.url)).size, projects.length);
  for (const project of projects) {
    assert.match(project.url, /^https:\/\/github\.com\/Slipcast-dev\/[\w.-]+$/);
    assert.ok(Number.isFinite(Date.parse(project.pushedAt)));
  }
  for (let index = 1; index < projects.length; index += 1) {
    assert.ok(Date.parse(projects[index - 1].pushedAt) >= Date.parse(projects[index].pushedAt));
  }
});

test('canonical and social preview use the production origin', async () => {
  const meta = (key) => attribute(nodes.find((node) => node.tagName === 'meta' &&
    (attribute(node, 'property') === key || attribute(node, 'name') === key)), 'content');
  const canonical = nodes.find((node) => node.tagName === 'link' && attribute(node, 'rel') === 'canonical');
  assert.equal(attribute(canonical, 'href'), 'https://slipcast-dev.github.io/');
  assert.equal(meta('og:url'), 'https://slipcast-dev.github.io/');
  assert.equal(meta('og:image'), 'https://slipcast-dev.github.io/social-preview.png');
  assert.equal(meta('twitter:card'), 'summary_large_image');
  assert.equal(meta('twitter:image'), meta('og:image'));
  const image = await sharp(fileURLToPath(new URL('../dist/social-preview.png', import.meta.url))).metadata();
  assert.equal(image.width, 1200);
  assert.equal(image.height, 630);
  assert.equal(image.format, 'png');
});

test('the production page ships without browser JavaScript', () => {
  assert.equal(nodes.filter((node) => node.tagName === 'script').length, 0);
});

/** WCAG использует относительную яркость в линейном sRGB, а не среднее RGB. */
function luminance(hex) {
  const [red, green, blue] = hex.match(/\w{2}/g).map((part) => {
    const value = Number.parseInt(part, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

test('small text meets WCAG AA on all surfaces where it is used', () => {
  const variables = Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[\da-f]{6})/gi)]
    .map((match) => [match[1], match[2]]));
  const combinations = [
    ['muted', 'panel'], ['muted', 'card-highlight'], ['muted', 'frame'], ['muted', 'card'],
    ['accent', 'card-highlight'], ['accent', 'card'], ['accent', 'panel'],
    ['muted-strong', 'panel'], ['ink-soft', 'card-highlight'], ['ink-soft', 'panel'],
  ];
  for (const [foreground, background] of combinations) {
    const values = [luminance(variables[foreground]), luminance(variables[background])];
    const contrast = (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
    assert.ok(contrast >= 4.5, `${foreground} on ${background}: ${contrast.toFixed(2)}:1`);
  }
});
