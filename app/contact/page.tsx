import FeatureShell from '@/components/marketing/feature/FeatureShell';
import { Icon } from '@/components/marketing/feature/icons';
import { marketingMetadata } from '@/lib/seo';

export const metadata = marketingMetadata({
  title: 'Contact — Rovora',
  description:
    'Get in touch with Rovora — sales and demos, product support, partnerships, or anything else. We reply fast.',
  path: '/contact',
});

const METHODS: {
  icon: keyof typeof Icon;
  accent: string;
  title: string;
  body: string;
  email: string;
  label: string;
}[] = [
  {
    icon: 'chart', accent: 'mi-green',
    title: 'Sales & demos',
    body: 'See Rovora on your own fleet’s numbers. We’ll walk you through it and answer pricing questions.',
    email: 'mailto:hello@rovora.eu?subject=Book%20a%20demo', label: 'hello@rovora.eu',
  },
  {
    icon: 'phone', accent: 'mi-violet',
    title: 'Product support',
    body: 'Already using Rovora and need a hand? Our team helps you get unstuck quickly.',
    email: 'mailto:support@rovora.eu?subject=Support%20request', label: 'support@rovora.eu',
  },
  {
    icon: 'bolt', accent: 'mi-amber',
    title: 'Partnerships',
    body: 'Integrations, resellers or platform partnerships — let’s explore working together.',
    email: 'mailto:hello@rovora.eu?subject=Partnership', label: 'hello@rovora.eu',
  },
  {
    icon: 'send', accent: 'mi-teal',
    title: 'Everything else',
    body: 'Press, feedback or a question that doesn’t fit a box? Drop us a line any time.',
    email: 'mailto:hello@rovora.eu', label: 'hello@rovora.eu',
  },
];

export default function ContactPage() {
  return (
    <FeatureShell>
      {/* Hero */}
      <section className="hero" id="top">
        <div className="container reveal-stagger">
          <span className="eyebrow"><span className="live" /> Contact</span>
          <h1 className="hero-title">Talk to <span className="pos">us</span>.</h1>
          <p className="hero-sub">
            Whether you’re sizing up Rovora for your fleet or already running on it, we’d love to hear from you.
            Pick the inbox that fits and we’ll get back to you fast — usually within a few hours on business days.
          </p>
        </div>
      </section>

      {/* Contact methods */}
      <section className="sec-pad" id="methods" style={{ paddingTop: 24 }}>
        <div className="container">
          <div className="mini-grid reveal-stagger">
            {METHODS.map((m) => {
              const I = Icon[m.icon];
              return (
                <a className="mini" href={m.email} key={m.title}>
                  <div className={`mi ${m.accent}`}><I /></div>
                  <h4>{m.title}</h4>
                  <p>{m.body}</p>
                  <p className="accent" style={{ marginTop: 12, fontWeight: 500, fontSize: 13.5 }}>{m.label} →</p>
                </a>
              );
            })}
          </div>
        </div>
      </section>

      {/* Reassurance band */}
      <section style={{ padding: '20px 0 0' }}>
        <div className="container">
          <div className="cta-band reveal">
            <h2>Prefer to chat?</h2>
            <p>Use the chat bubble in the corner of any page — or start a free trial and explore Rovora yourself, no card required.</p>
            <div className="hero-cta">
              <a className="btn btn-primary btn-lg" href="/login?mode=signup">Start free trial</a>
              <a className="btn btn-ghost btn-lg" href="mailto:hello@rovora.eu?subject=Book%20a%20demo">Book a demo</a>
            </div>
          </div>
        </div>
      </section>
    </FeatureShell>
  );
}
