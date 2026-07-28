import type { Metadata } from 'next';
import { marketingMetadata } from '@/lib/seo';

/**
 * Blog catalogue — single source of truth for the /blog index, the individual
 * post pages, the sitemap and internal links. Adding a post here (plus its
 * app/blog/<slug>/page.tsx) is all that's needed for it to appear everywhere.
 */
export interface BlogPost {
  slug: string;
  /** <title> tag — keyword-led. */
  title: string;
  /** H1 shown on the page (usually a friendlier variant of title). */
  heading: string;
  /** Meta description + card blurb + lede. */
  description: string;
  category: string;
  /** ISO date, e.g. '2026-07-04'. */
  datePublished: string;
  /**
   * ISO date of the last substantive edit. Feeds `dateModified` in the Article
   * schema and `lastModified` in the sitemap — Google uses it to decide how
   * fresh a guide is. Falls back to datePublished when a post is untouched.
   */
  dateModified?: string;
  /** Human date, e.g. '4 July 2026'. */
  dateHuman: string;
  readMinutes: number;
  keywords: string[];
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'fleet-tracking-without-gps-hardware',
    title: 'Fleet Tracking Without GPS Hardware (2026)',
    heading: 'Fleet tracking without GPS hardware or installers',
    description:
      'See how phone-based fleet tracking works without a GPS box in every car, what it saves against hardwired trackers, and when a wired unit still wins.',
    category: 'Live tracking',
    datePublished: '2026-07-04',
    dateModified: '2026-07-26',
    dateHuman: '4 July 2026',
    readMinutes: 7,
    keywords: [
      'fleet tracking without GPS hardware',
      'gps fleet tracking without hardware',
      'fleet management software without hardware',
      'phone based fleet tracking',
      'smartphone fleet tracking app',
      'no hardware vehicle tracking',
      'driver tracking app',
    ],
  },
  {
    slug: 'how-to-run-a-taxi-fleet',
    title: 'How to Run a Taxi Fleet: 2026 Operator Guide',
    heading: 'How to run a taxi fleet without the chaos',
    description:
      'Running a taxi or rideshare fleet means juggling cars, drivers, shifts, compliance and weekly pay. A practical guide for 5–50 vehicle operators.',
    category: 'Operations',
    datePublished: '2026-07-04',
    dateModified: '2026-07-26',
    dateHuman: '4 July 2026',
    readMinutes: 9,
    keywords: [
      'how to run a taxi fleet',
      'how to manage a taxi fleet',
      'taxi fleet management',
      'how to start a taxi business',
      'rideshare fleet operations',
      'taxi fleet owner guide',
      'small taxi fleet management',
    ],
  },
  {
    slug: 'spreadsheets-vs-fleet-management-software',
    title: 'Spreadsheets vs Fleet Management Software',
    heading: 'When to swap spreadsheets for fleet management software',
    description:
      'Every fleet starts in a spreadsheet and most outgrow it quietly. Six signs yours is now costing money, and what fleet management software changes.',
    category: 'Operations',
    datePublished: '2026-07-04',
    dateModified: '2026-07-26',
    dateHuman: '4 July 2026',
    readMinutes: 6,
    keywords: [
      'spreadsheets vs fleet management software',
      'fleet management software vs spreadsheets',
      'fleet management spreadsheet',
      'fleet management excel template',
      'when to buy fleet management software',
      'fleet management software for small fleets',
    ],
  },
  {
    slug: 'driver-settlements-explained',
    title: 'Driver Settlements Explained for Uber & Bolt',
    heading: 'Driver settlements explained: one clear weekly number',
    description:
      'Fares, platform commission, tips, cash, rent and deductions all land in one weekly number. How fleets calculate driver settlements without arguments.',
    category: 'Driver pay',
    datePublished: '2026-07-04',
    dateModified: '2026-07-26',
    dateHuman: '4 July 2026',
    readMinutes: 8,
    keywords: [
      'driver settlements',
      'what is a driver settlement',
      'how to pay Uber drivers fleet',
      'Bolt fleet driver pay',
      'taxi driver settlement calculation',
      'driver pay split vs rent',
      'fleet driver payout',
    ],
  },
  {
    slug: 'fleet-management-software-malta',
    title: 'Fleet Management Software in Malta (2026)',
    heading: 'How to choose fleet management software in Malta',
    description:
      'Malta’s ride-hailing boom turned cab garages into real fleet businesses. What local operators should check: EU hosting, GDPR, Bolt and Uber driver pay.',
    category: 'Guides',
    datePublished: '2026-07-04',
    dateModified: '2026-07-26',
    dateHuman: '4 July 2026',
    readMinutes: 6,
    keywords: [
      'fleet management software Malta',
      'taxi fleet software Malta',
      'fleet management Malta',
      'Bolt fleet Malta',
      'Uber fleet Malta',
      'Y plate fleet management',
      'vehicle tracking Malta',
    ],
  },
];

export const blogHref = (slug: string) => `/blog/${slug}`;

export const getPost = (slug: string): BlogPost => {
  const post = BLOG_POSTS.find((p) => p.slug === slug);
  if (!post) throw new Error(`Unknown blog post: ${slug}`);
  return post;
};

/** Page metadata for a blog post — marketing metadata with article-flavoured Open Graph. */
export function postMetadata(post: BlogPost): Metadata {
  const base = marketingMetadata({
    title: `${post.title} — Rovora Blog`,
    description: post.description,
    path: blogHref(post.slug),
    keywords: post.keywords,
  });
  return {
    ...base,
    openGraph: {
      ...base.openGraph,
      type: 'article',
      publishedTime: post.datePublished,
      authors: ['Rovora'],
    },
  };
}
