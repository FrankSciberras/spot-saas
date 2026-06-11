import type { MetadataRoute } from 'next';

const SITE_URL = 'https://rovora.eu';

/** Allow crawling of public marketing pages; keep the authenticated app private. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/fleet/', '/driver/', '/login', '/onboarding/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
