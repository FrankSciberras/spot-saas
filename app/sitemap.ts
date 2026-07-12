import type { MetadataRoute } from 'next';
import { FEATURES, featureHref } from '@/components/marketing/links';
import { BLOG_POSTS, blogHref } from '@/components/marketing/blog/posts';

const SITE_URL = 'https://rovora.eu';

/** Public marketing routes for search engines. App routes (fleet/driver) are private. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes = ['', '/integrations', '/ai', '/about', '/contact', '/careers', '/privacy', '/terms', '/security', '/blog'];

  const featureRoutes = FEATURES.map((f) => featureHref(f.slug));

  const blogRoutes = BLOG_POSTS.map((p) => blogHref(p.slug));

  return [...staticRoutes, ...featureRoutes, ...blogRoutes].map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: path === '' || path === '/blog' ? 'weekly' : 'monthly',
    priority: path === '' ? 1 : 0.7,
  }));
}
