// =============================================================================
// Every share card that exists: the fixed page cards (lib/og/cards.ts) plus
// one per blog post. Used only by the image route (app/og/[...slug]/route.tsx)
// — kept apart from cards.ts so lib/seo.ts never imports the blog catalogue
// (which imports lib/seo.ts).
// =============================================================================

import { BLOG_POSTS, blogHref } from '@/components/marketing/blog/posts';
import { PAGE_CARD_PATHS, ogImagePath, pageCard, type OgCard, type OgShot } from './cards';

/** A screenshot that fits a blog post's topic. */
function postShot(category: string): OgShot {
  const c = category.toLowerCase();
  if (/maint|vehicle|damage/.test(c)) return 'vehicle-record';
  if (/track|gps|map/.test(c)) return 'live-map';
  if (/settle|pay|money|financ|earn/.test(c)) return 'earnings';
  return 'dashboard';
}

function postCard(path: string): OgCard | null {
  const post = BLOG_POSTS.find((p) => blogHref(p.slug) === path);
  if (!post) return null;
  return {
    eyebrow: `Blog · ${post.category}`,
    title: post.heading,
    sub: `${post.readMinutes}-minute read · ${post.dateHuman}`,
    shot: postShot(post.category),
  };
}

export function ogCardFor(path: string): OgCard | null {
  return pageCard(path) ?? postCard(path);
}

/** Every page path that has a card. */
export function ogCardPaths(): string[] {
  return [...PAGE_CARD_PATHS, ...BLOG_POSTS.map((p) => blogHref(p.slug))];
}

/** URL segments under /og/ → the page path ('home.png' → '/'), if it has a card. */
export function pathFromOgSlug(slug: string[]): string | null {
  if (!slug.length) return null;
  const last = slug[slug.length - 1];
  if (!last.endsWith('.png')) return null;
  const parts = [...slug.slice(0, -1), last.slice(0, -4)];
  const path = parts.length === 1 && parts[0] === 'home' ? '/' : `/${parts.join('/')}`;
  return ogCardFor(path) && ogImagePath(path) === `/og/${slug.join('/')}` ? path : null;
}
