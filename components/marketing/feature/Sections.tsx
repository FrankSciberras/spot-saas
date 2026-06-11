import type { ReactNode } from 'react';
import Link from 'next/link';
import { START_TRIAL } from '../links';
import { TRIAL_DAYS } from '@/lib/billing/plans';
import { Icon, type IconName } from './icons';

const accents = ['green', 'violet', 'amber', 'teal'] as const;
type Accent = (typeof accents)[number];

/** Page hero: eyebrow pill, big title with accent, sub, CTAs and a visual. */
export function FeatureHero({
  eyebrow,
  title,
  accent,
  sub,
  visual,
  micro = [`${TRIAL_DAYS}-day free trial`, 'No card required', 'Set up in an afternoon'],
}: {
  eyebrow: string;
  title: ReactNode;
  accent: string;
  sub: string;
  visual?: ReactNode;
  micro?: string[];
}) {
  return (
    <section className="hero" id="top">
      <div className="container reveal-stagger">
        <span className="eyebrow"><span className="live" /> {eyebrow}</span>
        <h1 className="hero-title">{title} <span className="pos">{accent}</span></h1>
        <p className="hero-sub">{sub}</p>
        <div className="hero-cta">
          <Link className="btn btn-primary btn-lg" href={START_TRIAL}>Start free trial</Link>
          <a className="btn btn-ghost btn-lg" href="/#pricing">See pricing</a>
        </div>
        <div className="hero-micro">
          {micro.map((m) => (
            <span key={m}><span className="ck">✓</span> {m}</span>
          ))}
        </div>
      </div>
      {visual && <div className="container hero-shot-wrap reveal">{visual}</div>}
    </section>
  );
}

/** Centered section heading. */
export function SecHead({
  kicker,
  title,
  desc,
}: {
  kicker: string;
  title: string;
  desc?: string;
}) {
  return (
    <div className="sec-head center reveal" style={{ marginBottom: 56 }}>
      <span className="kicker">{kicker}</span>
      <h2 className="sec-title">{title}</h2>
      {desc && <p className="sec-desc">{desc}</p>}
    </div>
  );
}

/** Alternating text + visual row. */
export function SplitRow({
  icon,
  title,
  body,
  bullets = [],
  visual,
  flip = false,
}: {
  icon: IconName;
  title: string;
  body: string;
  bullets?: string[];
  visual: ReactNode;
  flip?: boolean;
}) {
  const I = Icon[icon];
  return (
    <div className={`frow reveal${flip ? ' flip' : ''}`}>
      <div className="ftext">
        <div className="feat-ico"><I /></div>
        <h3>{title}</h3>
        <p>{body}</p>
        {bullets.length > 0 && (
          <ul className="feat-list">
            {bullets.map((b) => (
              <li key={b}>
                <span className="tick"><Icon.check /></span> {b}
              </li>
            ))}
          </ul>
        )}
      </div>
      {visual}
    </div>
  );
}

/** Colourful 3-up icon card grid. */
export function IconGrid({
  items,
}: {
  items: { icon: IconName; title: string; body: string }[];
}) {
  return (
    <div className="mini-grid reveal-stagger">
      {items.map((it, i) => {
        const I = Icon[it.icon];
        const accent: Accent = accents[i % accents.length];
        return (
          <div className="mini" key={it.title}>
            <div className={`mi mi-${accent}`}><I /></div>
            <h4>{it.title}</h4>
            <p>{it.body}</p>
          </div>
        );
      })}
    </div>
  );
}

/** Stat band (4-up). */
export function Stats({ items }: { items: { num: string; unit?: string; label: string }[] }) {
  return (
    <section className="stats">
      <div className="container">
        <div className="stats-grid reveal-stagger">
          {items.map((s) => (
            <div className="stat" key={s.label}>
              <div className="num mono">
                {s.num}
                {s.unit && <span style={{ fontSize: 24 }}> {s.unit}</span>}
              </div>
              <div className="lbl">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Closing call-to-action band. */
export function CtaBand({ title, body }: { title: string; body: string }) {
  return (
    <section style={{ padding: '20px 0 0' }}>
      <div className="container">
        <div className="cta-band reveal">
          <h2>{title}</h2>
          <p>{body}</p>
          <div className="hero-cta">
            <Link className="btn btn-primary btn-lg" href={START_TRIAL}>Start free trial</Link>
            <a className="btn btn-ghost btn-lg" href="/contact">Book a demo</a>
          </div>
        </div>
      </div>
    </section>
  );
}
