import { Audience, Faq, Related, PriceStrip } from './Deep';
import { FEATURE_EXTRAS } from './feature-extras';

/**
 * The sections every hand-written /features/* page gets on top of its own
 * content: who it's for, FAQ (with FAQPage structured data), cross-links to
 * related pages and the live prices. Content lives in feature-extras.ts.
 */
export default function FeatureExtras({ slug }: { slug: string }) {
  const extra = FEATURE_EXTRAS[slug];
  if (!extra) return null;
  return (
    <>
      <Audience title={extra.audienceTitle} items={extra.audience} />
      <Faq items={extra.faq} />
      <Related paths={extra.related} />
      <PriceStrip />
    </>
  );
}
