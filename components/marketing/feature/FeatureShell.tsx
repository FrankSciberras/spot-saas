import type { ReactNode } from 'react';
import { rovoraFontVars } from '@/lib/rovoraFonts';
import RovoraReveal from '../RovoraReveal';
import RovoraSmoothScroll from '../RovoraSmoothScroll';
import RovoraSupportChat from '../RovoraSupportChat';
import MarketingNav from '../MarketingNav';
import MarketingFooter from '../MarketingFooter';

/**
 * Page shell for the marketing /features/* pages. Mirrors the landing page's
 * theme wrapper (data-theme + fonts + ambient wash), shares the nav/footer, and
 * keeps the smooth-scroll + support chat behaviours.
 */
export default function FeatureShell({ children }: { children: ReactNode }) {
  return (
    <div className={`rovora-site ${rovoraFontVars}`} data-theme="light">
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
