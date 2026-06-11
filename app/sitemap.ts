import type { MetadataRoute } from 'next';
import { FEATURES, featureHref } from '@/components/marketing/links';

const SITE_URL = 'https://rovora.eu';

/** Public marketing routes for search engines. App routes (fleet/driver) are private. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes = ['', '/about', '/contact', '/careers', '/privacy', '/terms', '/security'];

  const featureRoutes = FEATURES.map((f) => featureHref(f.slug));

  return [...staticRoutes, ...featureRoutes].map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: path === '' ? 'weekly' : 'monthly',
    priority: path === '' ? 1 : 0.7,
  }));
}
