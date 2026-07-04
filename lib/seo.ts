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
    title,
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
