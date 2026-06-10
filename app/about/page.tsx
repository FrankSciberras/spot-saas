import type { Metadata } from 'next';
import Link from 'next/link';
import FeatureShell from '@/components/marketing/feature/FeatureShell';
import { SecHead, IconGrid, Stats, CtaBand } from '@/components/marketing/feature/Sections';
import { START_TRIAL } from '@/components/marketing/links';

export const metadata: Metadata = {
  title: 'About — Rovora',
  description:
    'Rovora is fleet management built for small taxi & cab operators — drivers, vehicles, shifts and weekly settlements in one clean, EU-hosted dashboard.',
};

export default function AboutPage() {
  return (
    <FeatureShell>
      {/* Hero */}
      <section className="hero" id="top">
        <div className="container reveal-stagger">
          <span className="eyebrow"><span className="live" /> About Rovora</span>
          <h1 className="hero-title">Built for the people who keep <span className="pos">cars on the road</span>.</h1>
          <p className="hero-sub">
            Rovora started with a simple frustration: running a taxi or cab fleet means living in spreadsheets,
            group chats and paperwork. We set out to pull the whole operation — drivers, vehicles, shifts,
            compliance and weekly pay — into one clean dashboard, so operators can spend less time on admin and
            more time keeping their fleet moving.
          </p>
          <div className="hero-cta">
            <Link className="btn btn-primary btn-lg" href={START_TRIAL}>Start free trial</Link>
            <a className="btn btn-ghost btn-lg" href="/contact">Talk to us</a>
          </div>
        </div>
      </section>

      <Stats
        items={[
          { num: 'EU', label: 'hosted, with data encrypted in transit & at rest' },
          { num: '1', label: 'dashboard for the whole operation' },
          { num: '5–50', label: 'vehicle fleets we’re built for' },
          { num: '24/7', label: 'your fleet, always in view' },
        ]}
      />

      {/* Mission / story */}
      <section className="sec-pad" id="mission">
        <div className="container">
          <SecHead
            kicker="Why we exist"
            title="Fleet software that respects your time"
            desc="Most tools are either built for 500-vehicle enterprises or are a patchwork of spreadsheets. Rovora is purpose-built for the small operator — powerful where it counts, simple everywhere else."
          />
          <IconGrid
            items={[
              { icon: 'users', title: 'Operator-first', body: 'Every feature earns its place by saving a real fleet real time each week.' },
              { icon: 'coins', title: 'Honest about money', body: 'Transparent settlements and clear numbers — for you and for your drivers.' },
              { icon: 'shield', title: 'Trustworthy by default', body: 'EU-hosted, encrypted, and yours — we never sell or share your data.' },
              { icon: 'bolt', title: 'Fast to adopt', body: 'Set up in an afternoon. If it needs a manual, we built it wrong.' },
              { icon: 'pulse', title: 'Always improving', body: 'We ship constantly, guided by the operators who use Rovora every day.' },
              { icon: 'phone', title: 'Real support', body: 'Talk to people who understand fleets — not a ticket queue.' },
            ]}
          />
        </div>
      </section>

      <CtaBand
        title="Come see what a calmer fleet feels like."
        body="Start your 14-day free trial — no card, no lock-in — or book a demo and we’ll walk you through it."
      />
    </FeatureShell>
  );
}
