import type { ReactNode } from 'react';
import Link from 'next/link';
import FeatureShell from '../feature/FeatureShell';
import { CtaBand } from '../feature/Sections';
import { legalStyles as s } from '../legal/LegalLayout';
import { SITE_URL, OG_IMAGE } from '@/lib/seo';
import { BLOG_POSTS, blogHref, type BlogPost } from './posts';
import styles from './blog.module.css';

export interface PostSection {
  /** Anchor id, also used by the table-of-contents link. */
  id: string;
  heading: string;
  body: ReactNode;
}

/** Article + BreadcrumbList structured data for a post. */
function buildArticleJsonLd(post: BlogPost) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: post.title,
        description: post.description,
        datePublished: post.datePublished,
        dateModified: post.datePublished,
        image: `${SITE_URL}${OG_IMAGE.url}`,
        mainEntityOfPage: `${SITE_URL}${blogHref(post.slug)}`,
        author: { '@type': 'Organization', name: 'Rovora', url: SITE_URL },
        publisher: {
          '@type': 'Organization',
          name: 'Rovora',
          logo: { '@type': 'ImageObject', url: `${SITE_URL}/icons/apple-touch-icon.png` },
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog` },
          { '@type': 'ListItem', position: 3, name: post.heading, item: `${SITE_URL}${blogHref(post.slug)}` },
        ],
      },
    ],
  };
}

/**
 * Scaffold for blog posts — shares the legal pages' prose/TOC styling so the
 * blog matches the rest of the marketing site, and adds Article/Breadcrumb
 * structured data, related-post links and the trial CTA band.
 */
export default function BlogLayout({ post, sections }: { post: BlogPost; sections: PostSection[] }) {
  const related = BLOG_POSTS.filter((p) => p.slug !== post.slug).slice(0, 3);
  return (
    <FeatureShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildArticleJsonLd(post)) }}
      />
      <header className={s.hero}>
        <div className="container">
          <nav className={styles.crumbs} aria-label="Breadcrumb">
            <Link href="/blog">Blog</Link>
            <span aria-hidden>/</span>
            <span>{post.category}</span>
          </nav>
          <h1 className={s.title}>{post.heading}</h1>
          <p className={s.lede}>{post.description}</p>
          <div className={s.meta}>
            <span className={s.metaPill}>
              <span className="dot" /> {post.dateHuman}
            </span>
            <span className={s.metaPill}>{post.readMinutes} min read</span>
            <span className={s.metaPill}>By the Rovora team</span>
          </div>
        </div>
      </header>

      <div className="container">
        <div className={s.body}>
          <nav className={s.toc} aria-label="On this page">
            <p className={s.tocLabel}>In this article</p>
            {sections.map((sec) => (
              <a key={sec.id} href={`#${sec.id}`}>
                {sec.heading}
              </a>
            ))}
          </nav>

          <article className={s.prose}>
            {sections.map((sec) => (
              <section key={sec.id} id={sec.id}>
                <h2>{sec.heading}</h2>
                {sec.body}
              </section>
            ))}

            <aside className={styles.related}>
              <p className={styles.relatedLabel}>Keep reading</p>
              <ul>
                {related.map((p) => (
                  <li key={p.slug}>
                    <Link href={blogHref(p.slug)}>{p.heading}</Link>
                  </li>
                ))}
              </ul>
            </aside>
          </article>
        </div>
      </div>

      <CtaBand
        title="Ready to run your fleet from one place?"
        body="Vehicles, drivers, shifts, tracking and weekly pay — Rovora keeps the whole operation in a single dashboard. Free trial, no card required."
      />
      <div style={{ paddingBottom: 72 }} />
    </FeatureShell>
  );
}
