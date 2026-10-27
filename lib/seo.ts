import type { Metadata } from 'next';
import type { PlanDef } from '@/lib/billing/plans';

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

/** Stable @id of the Organization node, so every page's graph points at one entity. */
export const ORGANIZATION_ID = `${SITE_URL}/#organization`;

/**
 * The company behind Rovora. Address and VAT number match the legal pages
 * (app/terms, app/privacy) — Google and AI assistants use these to tie the
 * site to a real, local business ("fleet software in Malta").
 */
export function organizationJsonLd() {
  return {
    '@type': 'Organization',
    '@id': ORGANIZATION_ID,
    name: 'Rovora',
    url: SITE_URL,
    logo: `${SITE_URL}/icons/apple-touch-icon.png`,
    description:
      'Fleet management software for taxi & rideshare operators — vehicles, maintenance, damage, drivers, shifts and driver pay in one dashboard.',
    email: 'hello@rovora.eu',
    vatID: 'MT29253436',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'G1 Citycode, Triq Francesco Masini',
      addressLocality: 'Victoria',
      addressRegion: 'Gozo',
      addressCountry: 'MT',
    },
    areaServed: 'Europe',
    contactPoint: [
      { '@type': 'ContactPoint', contactType: 'sales', email: 'hello@rovora.eu', availableLanguage: ['English'] },
      { '@type': 'ContactPoint', contactType: 'customer support', email: 'support@rovora.eu', availableLanguage: ['English'] },
    ],
  };
}

/**
 * The product, with one Offer per self-serve plan. SoftwareApplication (not
 * Product): Product markup with offers makes Google validate it as a physical
 * merchant listing (image/shipping/returns required).
 */
export function softwareApplicationJsonLd(plans: PlanDef[]) {
  return {
    '@type': 'SoftwareApplication',
    '@id': `${SITE_URL}/#software`,
    name: 'Rovora Fleet Management',
    url: SITE_URL,
    description:
      'All-in-one taxi & rideshare fleet management — vehicle upkeep, maintenance and damage tracking, rosters, live shifts, driver pay and compliance alerts.',
    applicationCategory: 'BusinessApplication',
    // The dashboard runs in any browser; drivers also get the Android app.
    operatingSystem: 'Web, Android',
    image: `${SITE_URL}/og-image.png`,
    brand: { '@type': 'Brand', name: 'Rovora' },
    publisher: { '@id': ORGANIZATION_ID },
    offers: plans
      .filter((p) => p.priceAmount > 0 && !p.isCustom)
      .map((p) => ({
        '@type': 'Offer',
        name: p.name,
        ...(p.billingNote ? { description: p.billingNote } : {}),
        // Plain price for validators that expect it; the UnitPriceSpecification
        // below says it's monthly so the markup matches the "/ mo" on the page.
        price: p.priceAmount,
        priceCurrency: 'EUR',
        priceSpecification: [
          {
            '@type': 'UnitPriceSpecification',
            price: p.priceAmount,
            priceCurrency: 'EUR',
            billingIncrement: 1,
            unitCode: 'MON',
            valueAddedTaxIncluded: false,
          },
          ...(p.perVehiclePrice
            ? [{
                '@type': 'UnitPriceSpecification',
                price: p.perVehiclePrice,
                priceCurrency: 'EUR',
                unitText: 'per extra vehicle per month',
                valueAddedTaxIncluded: false,
              }]
            : []),
        ],
        url: `${SITE_URL}/pricing`,
        availability: 'https://schema.org/InStock',
        seller: { '@id': ORGANIZATION_ID },
      })),
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
