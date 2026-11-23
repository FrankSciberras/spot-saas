import Link from 'next/link';
import FeatureShell from '@/components/marketing/feature/FeatureShell';
import { legalStyles as s } from '@/components/marketing/legal/LegalLayout';
import { marketingMetadata, organizationJsonLd, SITE_URL, ORGANIZATION_ID } from '@/lib/seo';
import { BLOG_POSTS, blogHref } from '@/components/marketing/blog/posts';
import styles from '@/components/marketing/blog/blog.module.css';

/** The blog and its posts, for search engines. */
function blogJsonLd() {
  return {
    '@type': 'Blog',
    '@id': `${SITE_URL}/blog#blog`,
    url: `${SITE_URL}/blog`,
    name: 'Rovora blog',
    description: 'Guides for running a taxi or rideshare fleet: maintenance, driver pay, tracking and growth.',
    inLanguage: 'en',
    publisher: { '@id': ORGANIZATION_ID },
    blogPost: BLOG_POSTS.map((p) => ({
      '@type': 'BlogPosting',
      headline: p.title,
      url: `${SITE_URL}${blogHref(p.slug)}`,
      datePublished: p.datePublished,
      dateModified: p.dateModified ?? p.datePublished,
      image: `${SITE_URL}/og${blogHref(p.slug)}.png`,
      author: { '@id': ORGANIZATION_ID },
    })),
  };
}

export const metadata = marketingMetadata({
  title: 'Fleet Management Guides for Taxi Fleets — Rovora',
  description:
    'Practical guides on running a taxi or rideshare fleet: hardware-free tracking, driver pay and settlements, maintenance schedules, compliance and admin.',
  path: '/blog',
  keywords: [
    'fleet management guides',
    'fleet tracking',
    'fleet management software',
    'fleet maintenance software',
    'taxi fleet',
    'how to run a taxi fleet',
    'driver pay',
    'fleet monitoring',
    'small fleet tracking',
  ],
});

export default function BlogIndexPage() {
  return (
    <FeatureShell breadcrumb={[{ name: 'Blog', path: '/blog' }]} jsonLd={[blogJsonLd(), organizationJsonLd()]}>
      <header className={s.hero}>
        <div className="container">
          <span className={s.eyebrow}>Blog</span>
          <h1 className={s.title}>Fleet management guides for taxi fleet owners</h1>
          <p className={s.lede}>
            Practical, no-fluff guides on running a taxi or rideshare fleet — tracking, driver pay,
            maintenance and the boring-but-vital admin in between.
          </p>
        </div>
      </header>

      <div className="container">
        <div className={styles.grid}>
          {BLOG_POSTS.map((post) => (
            <Link key={post.slug} href={blogHref(post.slug)} className={styles.card}>
              <span className={styles.cardCat}>{post.category}</span>
              <h2 className={styles.cardTitle}>{post.heading}</h2>
              <p className={styles.cardBlurb}>{post.description}</p>
              <span className={styles.cardMeta}>
                <span>{post.dateHuman}</span>
                <span>{post.readMinutes} min read</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </FeatureShell>
  );
}
