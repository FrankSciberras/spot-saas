import { INTEGRATION_LOGOS, type IntegrationWithWordmark } from '@/lib/integrations/catalog';

/** "Xero CSV export" → "Xero", "Teltonika Trackers" → "Teltonika". */
export function brandName(name: string): string {
  return name.replace(/\s+(CSV export|sign-in|Trackers)$/i, '');
}

function Logo({ it, decorative }: { it: IntegrationWithWordmark; decorative?: boolean }) {
  const { src, height, label } = it.wordmark;
  return (
    <li className="mq-item">
      {/* eslint-disable-next-line @next/next/no-img-element -- small static logo; drawn grey by CSS */}
      <img src={src} alt={decorative || label ? '' : brandName(it.name)} style={{ height }} loading="lazy" />
      {label && <span className="mq-label" aria-hidden={decorative || undefined}>{label}</span>}
    </li>
  );
}

/**
 * A slow, endless strip of every partner logo in one grey (the same treatment
 * as the Uber / Bolt marks near the top of the page). The list is drawn twice
 * so the loop is seamless; the second copy is hidden from screen readers.
 * Pauses on hover, and stands still for people who ask for reduced motion.
 */
export default function IntegrationsMarquee() {
  const names = INTEGRATION_LOGOS.map((it) => brandName(it.name)).join(', ');
  return (
    <div className="mq" role="region" aria-label={`Rovora connects with ${names}`}>
      <div className="mq-track">
        <ul className="mq-set">
          {INTEGRATION_LOGOS.map((it) => <Logo key={it.name} it={it} />)}
        </ul>
        <ul className="mq-set" aria-hidden="true">
          {INTEGRATION_LOGOS.map((it) => <Logo key={it.name} it={it} decorative />)}
        </ul>
      </div>
    </div>
  );
}
