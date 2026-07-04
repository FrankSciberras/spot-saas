import FeatureShell from '@/components/marketing/feature/FeatureShell';
import { SecHead, IconGrid } from '@/components/marketing/feature/Sections';
import { marketingMetadata } from '@/lib/seo';

export const metadata = marketingMetadata({
  title: 'Careers — Rovora',
  description:
    'Join Rovora and help small taxi & cab fleets run smoothly. We’re a small, product-led team building software operators actually love.',
  path: '/careers',
});

const CAREERS_EMAIL = 'mailto:careers@rovora.eu?subject=Working%20at%20Rovora';

export default function CareersPage() {
  return (
    <FeatureShell>
      {/* Hero */}
      <section className="hero" id="top">
        <div className="container reveal-stagger">
          <span className="eyebrow"><span className="live" /> Careers</span>
          <h1 className="hero-title">Help small fleets <span className="pos">run smoothly</span>.</h1>
          <p className="hero-sub">
            We’re a small, product-led team building the tools taxi & cab operators rely on every day. If you like
            shipping real things that save real people real time, you’ll feel at home here.
          </p>
          <div className="hero-cta">
            <a className="btn btn-primary btn-lg" href={CAREERS_EMAIL}>Send us your CV</a>
            <a className="btn btn-ghost btn-lg" href="/about">About Rovora</a>
          </div>
        </div>
      </section>

      {/* What it's like */}
      <section className="sec-pad" id="culture">
        <div className="container">
          <SecHead
            kicker="How we work"
            title="A small team, real ownership"
            desc="No layers, no busywork. You’ll own meaningful problems end-to-end and see your work in front of operators within days, not quarters."
          />
          <IconGrid
            items={[
              { icon: 'bolt', title: 'Ship fast', body: 'Short feedback loops and real autonomy — your work goes live quickly.' },
              { icon: 'users', title: 'Close to customers', body: 'We build with operators, not for an imagined persona.' },
              { icon: 'chart', title: 'Grow with us', body: 'Early team means outsized impact and room to grow as we do.' },
              { icon: 'clock', title: 'Flexible & remote-friendly', body: 'We care about outcomes, not hours at a desk.' },
              { icon: 'shield', title: 'Do it right', body: 'Quality, privacy and craft matter here — we’re in it for the long run.' },
              { icon: 'phone', title: 'Supportive', body: 'A team that has your back and celebrates the wins together.' },
            ]}
          />
        </div>
      </section>

      {/* Open roles */}
      <section className="sec-pad" id="roles" style={{ background: 'var(--bg-1)', borderTop: '1px solid var(--line-1)', borderBottom: '1px solid var(--line-1)' }}>
        <div className="container">
          <SecHead kicker="Open roles" title="No open positions right now" />
          <div className="reveal" style={{ textAlign: 'center', maxWidth: 600, margin: '0 auto' }}>
            <p className="sec-desc" style={{ margin: '0 auto 28px' }}>
              We’re not actively hiring at the moment — but we’re always happy to hear from talented people who
              care about this space. Engineering, design, support or sales: if you think you could help fleets run
              better, introduce yourself.
            </p>
            <a className="btn btn-primary btn-lg" href={CAREERS_EMAIL}>Introduce yourself</a>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '20px 0 0' }}>
        <div className="container">
          <div className="cta-band reveal">
            <h2>Like the sound of Rovora?</h2>
            <p>Tell us what you’d love to work on. We read every message that lands in our inbox.</p>
            <div className="hero-cta">
              <a className="btn btn-primary btn-lg" href={CAREERS_EMAIL}>Get in touch</a>
              <a className="btn btn-ghost btn-lg" href="/about">Learn about us</a>
            </div>
          </div>
        </div>
      </section>
    </FeatureShell>
  );
}
