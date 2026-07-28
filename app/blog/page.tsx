import Link from 'next/link';
import FeatureShell from '@/components/marketing/feature/FeatureShell';
import { legalStyles as s } from '@/components/marketing/legal/LegalLayout';
import { marketingMetadata } from '@/lib/seo';
import { BLOG_POSTS, blogHref } from '@/components/marketing/blog/posts';
import styles from '@/components/marketing/blog/blog.module.css';

export const metadata = marketingMetadata({
  title: 'Fleet Management Guides for Taxi Fleets — Rovora',
  description:
    'Practical guides on running a taxi or rideshare fleet: hardware-free tracking, driver pay and settlements, maintenance schedules, compliance and admin.',
  path: '/blog',
  keywords: [
    'fleet management guides',
    'taxi fleet management guides',
    'how to run a taxi fleet',
    'how to start a taxi business',
    'driver pay guides',
    'fleet tracking without hardware',
    'spreadsheets vs fleet management software',
  ],
});

export default function BlogIndexPage() {
  return (
    <FeatureShell>
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
