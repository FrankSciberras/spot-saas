import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';
import { BLOG_POSTS, blogHref } from '@/components/marketing/blog/posts';

/**
 * Generated sitemap — replaces the old hand-written public/sitemap.xml plus the
 * prebuild script that regenerated it, neither of which carried lastmod,
 * changefreq or priority.
 *
 * Adding a marketing route here (or a post to BLOG_POSTS) is all that's needed
 * for it to be submitted to search engines.
 */

/** Static marketing routes, with the relative importance we want crawlers to see. */
const ROUTES: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }> = [
  { path: '/', priority: 1.0, changeFrequency: 'weekly' },
  { path: '/pricing', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/features/settlements', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/features/live-tracking', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/features/maintenance', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/features/vehicles', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/features/rosters', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/features/damage', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/features/flexible-pay', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/features/adjustments', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/integrations', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/blog', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/ai', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/about', priority: 0.6, changeFrequency: 'yearly' },
  { path: '/contact', priority: 0.6, changeFrequency: 'yearly' },
  { path: '/changelog', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/security', priority: 0.5, changeFrequency: 'yearly' },
  { path: '/careers', priority: 0.4, changeFrequency: 'monthly' },
  { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/terms', priority: 0.3, changeFrequency: 'yearly' },
];

export default function sitemap(): MetadataRoute.Sitemap {
  // Build-time constant: the sitemap is regenerated on every deploy, so this
  // doubles as an honest "last touched" signal without churning every request.
  const builtAt = new Date();

  const staticEntries = ROUTES.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: builtAt,
    changeFrequency,
    priority,
  }));

  const postEntries = BLOG_POSTS.map((post) => ({
    url: `${SITE_URL}${blogHref(post.slug)}`,
    lastModified: new Date(post.dateModified ?? post.datePublished),
    changeFrequency: 'yearly' as const,
    priority: 0.7,
  }));

  return [...staticEntries, ...postEntries];
}
