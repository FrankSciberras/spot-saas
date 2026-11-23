import Link from 'next/link';
import FeatureShell from '../feature/FeatureShell';
import ShotFrame from '../feature/ShotFrame';
import { IconGrid, SecHead, CtaBand } from '../feature/Sections';
import { START_TRIAL } from '../links';
import { getTrialCopy } from '@/lib/billing/trial-offer-data';
import { Audience, Pains, Steps, Limits, Faq, Related, PriceStrip } from './Deep';
import type { DeepContent } from './types';
import styles from './deep.module.css';

/**
 * One long-form marketing page, drawn from a DeepContent object. Used by the
 * feature deep-dives (/features/messages, /features/bolt, …) and the audience
 * pages (/for/*). Section order follows the questions a buyer asks: what, who,
 * why, how, what exactly, what not, FAQ, price, next step.
 */
export default async function DeepPage({ content: c }: { content: DeepContent }) {
  const trial = await getTrialCopy();
  return (
    <FeatureShell
      breadcrumb={[c.crumb.parent, { name: c.crumb.name, path: c.path }]}
    >
      <section className="hero" id="top">
        <div className="container reveal-stagger">
          <span className="eyebrow"><span className="live" /> {c.eyebrow}</span>
          <h1 className="hero-title">{c.title} <span className="pos">{c.accent}</span></h1>
          <p className="hero-sub">{c.sub}</p>
          <div className="hero-cta">
            <Link className="btn btn-primary btn-lg" href={START_TRIAL}>Get started free</Link>
            <Link className="btn btn-ghost btn-lg" href="/contact?topic=demo#form">Book a 15-minute demo</Link>
          </div>
          <div className="hero-micro">
            <span><span className="ck">✓</span> {trial.freeLabel}</span>
            <span><span className="ck">✓</span> No card required</span>
            <span><span className="ck">✓</span> Set up in an afternoon</span>
          </div>
          <div className={styles.proof}>
            {c.proof.map((p) => (
              <span key={p}>{p}</span>
            ))}
          </div>
        </div>
        <div className="container hero-shot-wrap reveal">
          <ShotFrame path={c.mock.path}>
            <div className="mock-top">
              <span className="mock-title">{c.mock.title}</span>
              {c.mock.pill && <span className="mock-pill">● {c.mock.pill}</span>}
            </div>
            <div className="mock-rows">
              {c.mock.rows.map((r) => (
                <div className="mock-row" key={r.name + (r.meta ?? '')}>
                  <span className="nm">{r.name}</span>
                  {r.meta && <span className="meta">· {r.meta}</span>}
                  {r.amt && <span className="amt">{r.amt}</span>}
                  {r.st && <span className={`st${r.idle ? ' idle' : ''}`}>{r.st}</span>}
                </div>
              ))}
            </div>
          </ShotFrame>
        </div>
      </section>

      <Audience title={c.audienceTitle} items={c.audience} />

      {c.pains && c.painsTitle && (
        <Pains title={c.painsTitle} intro={c.painsIntro} items={c.pains} />
      )}

      <Steps kicker={c.stepsKicker} title={c.stepsTitle} intro={c.stepsIntro} items={c.steps} />

      <section className={`sec-pad ${styles.band}`} id="included">
        <div className="container">
          <SecHead kicker="What’s included" title={c.includedTitle} />
          <IconGrid items={c.included} />
        </div>
      </section>

      {c.limits && c.limits.length > 0 && <Limits items={c.limits} />}

      <Faq items={c.faq} />

      <Related paths={c.related} />

      <PriceStrip />

      <CtaBand title={c.cta.title} body={c.cta.body.replace('{free}', trial.first)} />
    </FeatureShell>
  );
}
