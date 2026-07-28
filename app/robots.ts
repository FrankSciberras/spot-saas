import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';
import { APP_ROUTE_PREFIXES } from '@/lib/routes';

/**
 * Private areas of the app. These render nothing useful to a signed-out crawler
 * and would otherwise burn crawl budget on redirect chains to /login.
 *
 * Derived from the shared app-route list so robots.txt cannot drift out of sync
 * with what the auth gate actually protects.
 */
const PRIVATE_PATHS = [
  ...APP_ROUTE_PREFIXES.map((p) => `${p}/`),
  '/api/',
  '/auth/',
  '/login',
  '/offline',
];

/**
 * Allow crawling of public marketing pages; keep the authenticated app private.
 *
 * AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) are
 * deliberately ALLOWED: a growing share of B2B software discovery happens inside
 * AI assistants, and blocking them removes Rovora from those answers entirely.
 * They get the same public-only surface as Googlebot.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: PRIVATE_PATHS,
      },
      {
        // Listed explicitly so the decision to welcome AI crawlers is documented
        // rather than incidental to the wildcard rule.
        userAgent: [
          'GPTBot',
          'OAI-SearchBot',
          'ChatGPT-User',
          'ClaudeBot',
          'Claude-Web',
          'PerplexityBot',
          'Google-Extended',
          'Applebot-Extended',
        ],
        allow: '/',
        disallow: PRIVATE_PATHS,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
