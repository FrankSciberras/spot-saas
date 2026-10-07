import type { ReactNode } from 'react';
import Link from 'next/link';
import FeatureShell from '../feature/FeatureShell';
import { CtaBand } from '../feature/Sections';
import { legalStyles as s } from '../legal/LegalLayout';
import { SITE_URL, OG_IMAGE, ORGANIZATION_ID, breadcrumbJsonLd, organizationJsonLd } from '@/lib/seo';
import { BLOG_POSTS, blogHref, type BlogPost } from './posts';
import styles from './blog.module.css';

export interface PostSection {
  /** Anchor id, also used by the table-of-contents link. */
  id: string;
  heading: string;
  body: ReactNode;
}

/** BlogPosting + BreadcrumbList structured data for a post. */
function buildArticleJsonLd(post: BlogPost) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organizationJsonLd(),
      {
        '@type': 'BlogPosting',
        headline: post.title,
        description: post.description,
        datePublished: post.datePublished,
        dateModified: post.dateModified ?? post.datePublished,
        image: `${SITE_URL}${OG_IMAGE.url}`,
        mainEntityOfPage: `${SITE_URL}${blogHref(post.slug)}`,
        author: { '@id': ORGANIZATION_ID },
        publisher: { '@id': ORGANIZATION_ID },
      },
      breadcrumbJsonLd([
        { name: 'Blog', path: '/blog' },
        { name: post.heading, path: blogHref(post.slug) },
      ]),
    ],
  };
}

/**
 * Scaffold for blog posts — shares the legal pages' prose/TOC styling so the
 * blog matches the rest of the marketing site, and adds Article/Breadcrumb
 * structured data, related-post links and the trial CTA band.
 */
export default function BlogLayout({ post, sections }: { post: BlogPost; sections: PostSection[] }) {
  // The next three posts in the catalogue (wrapping around), so every post is
  // linked from some others — always taking the first three left the rest
  // without a single internal link from another article.
  const at = BLOG_POSTS.findIndex((p) => p.slug === post.slug);
  const related = [1, 2, 3].map((k) => BLOG_POSTS[(at + k) % BLOG_POSTS.length]).filter((p) => p.slug !== post.slug);
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
              <span className="dot" /> <time dateTime={post.datePublished}>{post.dateHuman}</time>
            </span>
            {post.dateModified && post.dateModified !== post.datePublished && (
              <span className={s.metaPill}>
                Updated{' '}
                <time dateTime={post.dateModified}>
                  {new Date(post.dateModified).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </time>
              </span>
            )}
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
