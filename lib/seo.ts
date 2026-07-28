import type { Metadata } from 'next';

/** Canonical production origin — used for absolute URLs in metadata, sitemap and robots. */
export const SITE_URL = 'https://rovora.eu';

/** Shared social-share card (1200×630) served from /public. */
export const OG_IMAGE = {
  url: '/og-image.png',
  width: 1200,
  height: 630,
  alt: 'Rovora — fleet management software for taxi & rideshare operators',
};

/**
 * BreadcrumbList JSON-LD for a nested marketing page.
 *
 * Feature pages shipped with no structured data at all, so Google had to infer
 * the site's hierarchy from links alone and could not show a breadcrumb trail in
 * the result. Pass the crumbs after Home, e.g.
 * `breadcrumbJsonLd([{ name: 'Features', path: '/#features' }, { name: 'Vehicle management', path: '/features/vehicles' }])`.
 */
export function breadcrumbJsonLd(crumbs: { name: string; path: string }[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      ...crumbs.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 2,
        name: c.name,
        item: `${SITE_URL}${c.path}`,
      })),
    ],
  };
}

/** Renders a `@graph` of JSON-LD nodes into the page. */
export function jsonLdGraph(nodes: object[]) {
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes });
}

interface MarketingMeta {
  title: string;
  description: string;
  /** Site-relative path of the page, e.g. '/about' or '/features/vehicles'. */
  path: string;
  keywords?: string[];
}

/**
 * Consistent SEO metadata for public marketing pages: canonical URL,
 * Open Graph and Twitter cards all pointing at the same title/description.
 * Relative URLs resolve against metadataBase (set in app/layout.tsx).
 */
export function marketingMetadata({ title, description, path, keywords }: MarketingMeta): Metadata {
  return {
    // `absolute` opts out of the root layout's "%s — Rovora" template: these
    // titles already carry the brand and are hand-tuned to fit Google's ~60-char
    // display budget, so appending anything would truncate the keyword.
    title: { absolute: title },
    description,
    ...(keywords ? { keywords } : {}),
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      siteName: 'Rovora',
      title,
      description,
      url: path,
      images: [OG_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [OG_IMAGE.url],
    },
  };
}
