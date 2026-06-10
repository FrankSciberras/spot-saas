import Link from 'next/link';
import { SIGN_IN, START_TRIAL, featureHref } from './links';

/**
 * Shared marketing footer (used by the landing page and every /features page).
 * Section links resolve to `/#hash` so they work from any page; feature links
 * point at the real /features/<slug> pages.
 */
export default function MarketingFooter({ onHome = false }: { onHome?: boolean }) {
  const h = (hash: string) => (onHome ? `#${hash}` : `/#${hash}`);
  return (
    <footer>
      <div className="container">
        <div className="foot-top">
          {/* Brand + trust */}
          <div className="foot-brand">
            {onHome ? (
              <a className="logo" href="#top"><img src="/rovora logo trimmed.png" alt="Rovora" /></a>
            ) : (
              <Link className="logo" href="/"><img src="/rovora logo trimmed.png" alt="Rovora" /></Link>
            )}
            <p>Fleet management for small taxi &amp; cab operators. Drivers, vehicles, shifts and settlements — in one clean dashboard.</p>
            <div className="foot-trust">
              <span className="foot-stars" aria-hidden>★★★★★</span>
              <span>Built for taxi &amp; cab fleets of 5–50 vehicles</span>
            </div>
            <div className="foot-badge"><span className="live" /> EU-hosted · data encrypted</div>
          </div>

          {/* Link columns */}
          <div className="foot-cols">
            <div className="foot-col">
              <h5>Product</h5>
              <a href={h('features')}>Features</a>
              <a href={h('integrations')}>Integrations</a>
              <a href={h('pricing')}>Pricing</a>
              <a href={h('faq')}>FAQ</a>
              <Link href={START_TRIAL}>Start free trial</Link>
              <Link href={SIGN_IN}>Sign in</Link>
            </div>

            <div className="foot-col">
              <h5>Features</h5>
              <Link href={featureHref('live-tracking')}>Live driver tracking</Link>
              <Link href={featureHref('rosters')}>Rosters &amp; shifts</Link>
              <Link href={featureHref('maintenance')}>Maintenance &amp; services</Link>
              <a href={h('features')}>Smart alerts</a>
              <a href={h('features')}>Driver app</a>
            </div>

            <div className="foot-col">
              <h5>Money &amp; admin</h5>
              <Link href={featureHref('settlements')}>Weekly settlements</Link>
              <Link href={featureHref('flexible-pay')}>Flexible pay</Link>
              <Link href={featureHref('adjustments')}>Adjustments</Link>
              <a href={h('features')}>Financials &amp; bookkeeping</a>
              <a href={h('pricing')}>Plans &amp; billing</a>
            </div>

            <div className="foot-col">
              <h5>Integrations</h5>
              <a href={h('integrations')}>Uber</a>
              <a href={h('integrations')}>Bolt</a>
              <a href={h('integrations')}>FreeNow</a>
              <a href={h('integrations')}>Stripe</a>
              <a href="mailto:hello@rovora.eu?subject=Integration%20request">Request an integration</a>
            </div>

            <div className="foot-col">
              <h5>Company</h5>
              <Link href="/about">About</Link>
              <Link href="/contact">Contact us</Link>
              <Link href="/careers">Careers</Link>
              <a href="mailto:support@rovora.eu?subject=Support">Help &amp; support</a>
              <Link href="/contact">Book a demo</Link>
            </div>
          </div>
        </div>

        {/* Newsletter + driver app */}
        <div className="foot-news">
          <div className="foot-news-copy">
            <h4>Get fleet tips in your inbox</h4>
            <p>The occasional product update and operator playbook — no spam.</p>
          </div>
          <a className="foot-sub" href="mailto:hello@rovora.eu?subject=Subscribe%20to%20updates">
            Subscribe
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </a>
          <div className="foot-app">
            <span className="foot-app-label">Free driver app</span>
            <span className="foot-app-soon">iOS &amp; Android · coming soon</span>
          </div>
        </div>

        {/* Bottom legal bar */}
        <div className="foot-bottom">
          <span>© 2026 Rovora Fleet. All rights reserved.</span>
          <span className="foot-legal">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/security">Security</Link>
          </span>
          <span className="mono">Made for fleets that move.</span>
        </div>
      </div>
    </footer>
  );
}
