import type { ReactNode } from 'react';
import { rovoraFontVars } from '@/lib/rovoraFonts';
import { breadcrumbJsonLd, jsonLdGraph } from '@/lib/seo';
import RovoraReveal from '../RovoraReveal';
import RovoraSmoothScroll from '../RovoraSmoothScroll';
import RovoraSupportChat from '../RovoraSupportChat';
import MarketingNav from '../MarketingNav';
import MarketingFooter from '../MarketingFooter';

/**
 * Page shell for the marketing /features/* pages. Mirrors the landing page's
 * theme wrapper (data-theme + fonts + ambient wash), shares the nav/footer, and
 * keeps the smooth-scroll + support chat behaviours.
 *
 * Pass `breadcrumb` to emit BreadcrumbList structured data. Feature pages
 * shipped with no structured data at all, so Google had to infer the hierarchy
 * from links and could not render a breadcrumb trail in the result. Pages that
 * emit their own JSON-LD (blog posts, /pricing) simply omit the prop.
 */
export default function FeatureShell({
  children,
  breadcrumb,
}: {
  children: ReactNode;
  /** Crumbs after "Home", e.g. `[{ name: 'Features', path: '/#features' }, …]`. */
  breadcrumb?: { name: string; path: string }[];
}) {
  return (
    <div className={`rovora-site ${rovoraFontVars}`} data-theme="light">
      {breadcrumb && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdGraph([breadcrumbJsonLd(breadcrumb)]) }}
        />
      )}
      <noscript>
        <style>{`.rovora-site .reveal{opacity:1!important;transform:none!important}`}</style>
      </noscript>
      <RovoraReveal />
      <RovoraSmoothScroll />
      <div className="wrap">
        <MarketingNav />
        {children}
        <MarketingFooter />
      </div>
      <RovoraSupportChat />
    </div>
  );
}
