import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import astroConfig from '../astro.config.mjs';

const site = astroConfig.site.replace(/\/$/, '');
const output = path.resolve(process.argv[2] ?? 'dist');
const content = path.resolve(process.argv[3] ?? 'src/content/modulos');
const requiredFiles = [
  '404.html',
  'index.html',
  'modulos/index.html',
  'robots.txt',
  'search-index.json',
  'sitemap-index.xml',
];
const forbiddenPaths = [
  /^app(?:\/|$)/,
  /^cka-study-web(?:\/|$)/,
  /^landing(?:\/|$)/,
];
const forbiddenReferences = [
  /(?:href|src)=["'][^"']*\/app\//i,
  /cka-study-web/i,
  /(?:href|src)=["'][^"']*\.txt(?:[?#"'])/i,
  /(?:parser|render)\.js/i,
];

async function listFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path.join(directory, entry.name), relative));
    else files.push(relative);
  }
  return files;
}

const files = await listFiles(output);
const errors = [];
const moduleSlugs = (await readdir(content, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
  .map((entry) => entry.name.slice(0, -3))
  .sort();

for (const required of requiredFiles) {
  if (!files.includes(required)) errors.push(`dist/${required}: artefacto requerido ausente`);
}
for (const file of files) {
  if (forbiddenPaths.some((pattern) => pattern.test(file))) errors.push(`dist/${file}: artefacto V1 prohibido`);
  if (file.endsWith('.txt') && file !== 'robots.txt') errors.push(`dist/${file}: fuente TXT prohibida`);
  if (!/\.(?:html|xml|txt)$/.test(file)) continue;
  const source = await readFile(path.join(output, file), 'utf8');
  if (forbiddenReferences.some((pattern) => pattern.test(source))) errors.push(`dist/${file}: referencia runtime V1 prohibida`);
}

const robots = files.includes('robots.txt') ? await readFile(path.join(output, 'robots.txt'), 'utf8') : '';
if (!robots.includes(`${site}/sitemap-index.xml`)) {
  errors.push('dist/robots.txt: no declara el sitemap canónico');
}

const generatedModules = files
  .map((file) => file.match(/^modulos\/([^/]+)\/index\.html$/)?.[1])
  .filter(Boolean)
  .sort();
if (generatedModules.join('\n') !== moduleSlugs.join('\n')) {
  errors.push(`dist/modulos: rutas generadas (${generatedModules.join(', ') || 'ninguna'}) no coinciden con el contenido (${moduleSlugs.join(', ') || 'ninguno'})`);
}

const catalog = files.includes('modulos/index.html') ? await readFile(path.join(output, 'modulos/index.html'), 'utf8') : '';
const sitemapFiles = files.filter((file) => /^sitemap-\d+\.xml$/.test(file));
const sitemap = (await Promise.all(sitemapFiles.map((file) => readFile(path.join(output, file), 'utf8')))).join('\n');
const searchIndex = files.includes('search-index.json')
  ? JSON.parse(await readFile(path.join(output, 'search-index.json'), 'utf8'))
  : [];
const indexedSlugs = Array.isArray(searchIndex) ? searchIndex.map((entry) => entry?.slug).filter(Boolean).sort() : [];

if (indexedSlugs.join('\n') !== moduleSlugs.join('\n')) {
  errors.push('dist/search-index.json: módulos distintos a la colección');
}
for (const slug of moduleSlugs) {
  const pathname = `/modulos/${slug}/`;
  if (!catalog.includes(`href="${pathname}"`)) errors.push(`dist/modulos/index.html: falta ${pathname}`);
  if (!sitemap.includes(`<loc>${site}${pathname}</loc>`)) errors.push(`dist/sitemap: falta ${pathname}`);
  const page = await readFile(path.join(output, 'modulos', slug, 'index.html'), 'utf8');
  if (!page.includes(`rel="canonical" href="${site}${pathname}"`)) {
    errors.push(`dist/modulos/${slug}/index.html: canonical incorrecta`);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Build V2 válido: ${files.length} artefactos, sin runtime V1`);
}
