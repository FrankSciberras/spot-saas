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
  /** Human date, e.g. '4 July 2026'. */
  dateHuman: string;
  readMinutes: number;
  keywords: string[];
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'fleet-tracking-without-gps-hardware',
    title: 'Fleet Tracking Without GPS Hardware: How It Works (2026)',
    heading: 'Fleet tracking without GPS hardware: how it works',
    description:
      'You don’t need to wire a GPS box into every car to know where your fleet is. Here’s how hardware-free fleet tracking works, what it costs compared to traditional trackers, and when a hardwired unit still makes sense.',
    category: 'Live tracking',
    datePublished: '2026-07-04',
    dateHuman: '4 July 2026',
    readMinutes: 7,
    keywords: [
      'fleet tracking',
      'fleet tracking without hardware',
      'fleet tracking software',
      'GPS fleet tracking alternative',
      'driver tracking app',
    ],
  },
  {
    slug: 'how-to-run-a-taxi-fleet',
    title: 'How to Run a Taxi Fleet: A Complete Guide for Small Operators',
    heading: 'How to run a taxi fleet: the complete guide',
    description:
      'Vehicles, drivers, shifts, compliance and weekly pay — running a taxi or rideshare fleet is five businesses in one. This guide walks through each part and shows what good looks like for a 5–50 vehicle operation.',
    category: 'Operations',
    datePublished: '2026-07-04',
    dateHuman: '4 July 2026',
    readMinutes: 9,
    keywords: [
      'how to run a taxi fleet',
      'taxi fleet management',
      'rideshare fleet operations',
      'taxi fleet business guide',
    ],
  },
  {
    slug: 'spreadsheets-vs-fleet-management-software',
    title: 'Spreadsheets vs Fleet Management Software: When to Switch',
    heading: 'Spreadsheets vs fleet management software: when to switch',
    description:
      'Every fleet starts in a spreadsheet — and most outgrow it without noticing. These are the signs the spreadsheet is now costing you money, and what switching to fleet management software actually changes.',
    category: 'Operations',
    datePublished: '2026-07-04',
    dateHuman: '4 July 2026',
    readMinutes: 6,
    keywords: [
      'fleet management spreadsheet',
      'fleet management software small fleet',
      'spreadsheet vs fleet software',
      'when to buy fleet management software',
    ],
  },
  {
    slug: 'driver-settlements-explained',
    title: 'Driver Settlements Explained: Paying Uber & Bolt Drivers Right',
    heading: 'Driver settlements explained: paying Uber & Bolt drivers right',
    description:
      'Gross fares, platform fees, tips, campaigns, cash collected, fuel cards, rent — a driver’s week is a maths problem. Here’s how professional fleets reconcile it into one payable number without arguments.',
    category: 'Driver pay',
    datePublished: '2026-07-04',
    dateHuman: '4 July 2026',
    readMinutes: 8,
    keywords: [
      'driver settlements',
      'how to pay Uber drivers fleet',
      'Bolt fleet driver pay',
      'taxi driver settlement calculation',
      'rideshare fleet payroll',
    ],
  },
  {
    slug: 'fleet-management-software-malta',
    title: 'Fleet Management Software in Malta: 2026 Buyer’s Guide',
    heading: 'Choosing fleet management software in Malta',
    description:
      'Malta’s ride-hailing boom has turned small cab garages into real fleet businesses. What local operators should look for in fleet software — from GDPR and EU hosting to Bolt and Uber settlement handling.',
    category: 'Guides',
    datePublished: '2026-07-04',
    dateHuman: '4 July 2026',
    readMinutes: 6,
    keywords: [
      'fleet management software Malta',
      'taxi fleet software Malta',
      'Malta ride-hailing fleet',
      'Bolt fleet Malta',
      'Y plate fleet management',
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
