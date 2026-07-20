import { readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_URL = 'https://rovora.eu';

const STATIC_ROUTES = [
  '/',
  '/integrations',
  '/ai',
  '/changelog',
  '/about',
  '/contact',
  '/careers',
  '/privacy',
  '/terms',
  '/security',
  '/blog',
];

async function pageRoutes(directory, prefix) {
  const entries = await readdir(join(ROOT, directory), { withFileTypes: true });

  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('['))
    .map((entry) => `${prefix}/${entry.name}`)
    .sort();
}

const routes = [
  ...STATIC_ROUTES,
  ...(await pageRoutes('app/features', '/features')),
  ...(await pageRoutes('app/blog', '/blog')),
];

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...routes.flatMap((route) => [
    '  <url>',
    `    <loc>${SITE_URL}${route}</loc>`,
    '  </url>',
  ]),
  '</urlset>',
  '',
].join('\n');

await writeFile(join(ROOT, 'public/sitemap.xml'), xml, 'utf8');
console.log(`Generated public/sitemap.xml with ${routes.length} URLs.`);
