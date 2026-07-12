import Link from 'next/link';
import FeatureShell from '@/components/marketing/feature/FeatureShell';
import ShotFrame from '@/components/marketing/feature/ShotFrame';
import { SecHead, SplitRow, IconGrid, Stats } from '@/components/marketing/feature/Sections';
import { START_TRIAL } from '@/components/marketing/links';
import { marketingMetadata } from '@/lib/seo';

export const metadata = marketingMetadata({
  title: 'Rovora AI — The paperwork does itself — Rovora',
  description:
    'Rovora AI is coming: snap a receipt and it becomes a logged expense, drop in an Uber or Bolt statement and settlements fill themselves, ask your fleet anything in plain English, and get a second opinion on every repair quote. Join the early-access list.',
  path: '/ai',
  keywords: [
    'AI fleet management',
    'AI receipt scanning fleet',
    'fleet AI assistant',
    'AI invoice processing fleet',
    'Uber statement import',
    'Bolt statement import',
    'taxi fleet AI',
    'repair quote AI',
  ],
});

/** Early-access signup — same mailto pattern as the integrations marketplace. */
const EARLY_ACCESS_MAILTO = `mailto:hello@rovora.eu?subject=${encodeURIComponent(
  'Rovora AI early access',
)}&body=${encodeURIComponent(
  `Hi Rovora team,

I'd like early access to Rovora AI.

My fleet: (how many vehicles?)
Most excited about: (receipt scanning / statement import / fleet assistant / repair advisor)

Thanks!`,
)}`;

export default function RovoraAiPage() {
  return (
    <FeatureShell>
      {/* Hero — same markup as FeatureHero, but with an early-access CTA. */}
      <section className="hero" id="top">
        <div className="container reveal-stagger">
          <span className="eyebrow"><span className="live" /> Rovora AI · In development</span>
          <h1 className="hero-title">The paperwork does <span className="pos">itself.</span></h1>
          <p className="hero-sub">
            Rovora AI reads your receipts, imports your platform statements, gives a second
            opinion on repair bills and answers questions about your fleet in plain English.
            We&rsquo;re building it now — join the early-access list and be first in.
          </p>
          <div className="hero-cta">
            <a className="btn btn-primary btn-lg" href={EARLY_ACCESS_MAILTO}>Get early access</a>
            <Link className="btn btn-ghost btn-lg" href={START_TRIAL}>Start free trial</Link>
          </div>
          <div className="hero-micro">
            <span><span className="ck">✓</span> Built into Rovora — no extra apps</span>
            <span><span className="ck">✓</span> Works on your own fleet data</span>
            <span><span className="ck">✓</span> Early fleets shape what ships first</span>
          </div>
        </div>
        <div className="container hero-shot-wrap reveal">
          <ShotFrame path="ai">
            <div className="mock-top">
              <span className="mock-title">Rovora AI</span>
              <span className="mock-pill">● Reading receipt…</span>
            </div>
            <div className="mock-cards">
              <div className="mock-card"><div className="k">Receipt read</div><div className="v">4s</div></div>
              <div className="mock-card"><div className="k">Fields filled</div><div className="v accent">9/9</div></div>
              <div className="mock-card"><div className="k">Typed by you</div><div className="v">0</div></div>
              <div className="mock-card"><div className="k">Filed under</div><div className="v pos">Fuel</div></div>
            </div>
            <div className="mock-rows">
              <div className="mock-row"><span className="nm">Circle K, Santry</span><span className="meta">· Diesel · 42.1 L · 12-D-4471</span><span className="amt">€68.40</span></div>
              <div className="mock-row"><span className="nm">Odometer</span><span className="meta">· read from the receipt</span><span className="amt mono">84,112 km</span></div>
              <div className="mock-row"><span className="nm">Logged to bookkeeping</span><span className="meta">· VAT split out automatically</span><span className="st">Done</span></div>
            </div>
          </ShotFrame>
        </div>
      </section>

      <Stats
        items={[
          { num: '4', unit: 's', label: 'from receipt photo to logged expense' },
          { num: '0', label: 'manual typing on invoices & statements' },
          { num: '24/7', label: 'watching costs, services and defects' },
          { num: '1', label: 'plain-English question away from any answer' },
        ]}
      />

      <section className="sec-pad" id="coming">
        <div className="container">
          <SecHead
            kicker="Coming soon · four features first"
            title="AI that does the admin — not a chatbot bolted on"
            desc="Each of these lands in early access first, built with real fleets on real data. Tell us which one you need and we'll move it up the queue."
          />

          <SplitRow
            icon="camera"
            title="Snap a receipt, Rovora fills it in"
            body="A driver hands you a crumpled fuel receipt, or the garage emails an invoice. Take a photo or drag the PDF in — Rovora AI reads the vendor, the vehicle, the odometer, the line items and the VAT, then files everything where it belongs."
            bullets={[
              'Any format — photos, PDFs, email attachments',
              'Parts, labour and VAT split out line by line',
              'Lands in bookkeeping and the vehicle’s service history',
            ]}
            visual={
              <ShotFrame path="bookkeeping" tight>
                <div className="mock-top">
                  <span className="mock-title">Scanned today</span>
                  <span className="mock-pill">● Coming soon</span>
                </div>
                <div className="mock-rows">
                  <div className="mock-row"><span className="nm">Fuel — Circle K</span><span className="meta">· 12-D-4471 · from photo</span><span className="amt">€68.40</span></div>
                  <div className="mock-row"><span className="nm">Brake pads + fitting</span><span className="meta">· Murphys · from invoice</span><span className="amt">€240.00</span></div>
                  <div className="mock-row"><span className="nm">Wash &amp; valet</span><span className="meta">· blurry photo</span><span className="st idle">Check</span></div>
                </div>
              </ShotFrame>
            }
          />

          <SplitRow
            icon="file"
            flip
            title="Platform statements, imported for you"
            body="Drop in the weekly Uber or Bolt statement and Rovora AI matches every line to the right driver — fares, tips, tolls and fees land in that week's settlement, ready to reconcile. No more Sunday evenings copying numbers across."
            bullets={[
              'Reads Uber & Bolt weekly statements — PDF or CSV',
              'Every line matched to a driver automatically',
              'Feeds straight into weekly settlements',
            ]}
            visual={
              <ShotFrame path="settlements" tight>
                <div className="mock-top">
                  <span className="mock-title">Uber · week 27</span>
                  <span className="mock-pill">● Coming soon</span>
                </div>
                <div className="mock-rows">
                  <div className="mock-row"><span className="nm">M. Okafor</span><span className="meta">· 214 lines matched</span><span className="amt">€1,842</span></div>
                  <div className="mock-row"><span className="nm">S. Byrne</span><span className="meta">· 187 lines matched</span><span className="amt">€1,610</span></div>
                  <div className="mock-row"><span className="nm">1 unmatched line</span><span className="meta">· needs a quick look</span><span className="st idle">Review</span></div>
                </div>
              </ShotFrame>
            }
          />

          <SplitRow
            icon="send"
            title="Ask your fleet anything"
            body="“Which car cost me the most last month?” “Who hasn't done a pre-shift check this week?” Ask in plain English and get the answer from your own data — with the numbers to back it up, linked to the records behind them."
            bullets={[
              'Answers come from your fleet’s live data, not the internet',
              'Costs, drivers, services, documents — one question away',
              'Every answer linked to the underlying records',
            ]}
            visual={
              <ShotFrame path="ai/assistant" tight>
                <div className="mock-top">
                  <span className="mock-title">Fleet assistant</span>
                  <span className="mock-pill">● Coming soon</span>
                </div>
                <div className="mock-rows">
                  <div className="mock-row"><span className="nm">You</span><span className="meta">· which car cost the most in June?</span></div>
                  <div className="mock-row"><span className="nm">Rovora AI</span><span className="meta">· 12-D-4471 — €840 (brakes, tyres, valet)</span><span className="st">Answered</span></div>
                  <div className="mock-row"><span className="nm">Sources</span><span className="meta">· 3 service records · bookkeeping</span></div>
                </div>
              </ShotFrame>
            }
          />

          <SplitRow
            icon="wrench"
            flip
            title="A second opinion on every repair"
            body="Before you approve a quote, Rovora AI checks it against your own history — the same job on your other cars and the last time this vehicle was in. Fair quotes sail through; the odd ones get flagged before you pay."
            bullets={[
              'Flags quotes well above your usual price',
              'Spots duplicate or too-soon repeat work',
              'Ranks open defects so you fix the risky ones first',
            ]}
            visual={
              <ShotFrame path="services" tight>
                <div className="mock-top">
                  <span className="mock-title">This week’s quotes</span>
                  <span className="mock-pill">● Coming soon</span>
                </div>
                <div className="mock-rows">
                  <div className="mock-row"><span className="nm">Brake pads — 21-C-9920</span><span className="meta">· in line with fleet history</span><span className="st">Looks fair</span></div>
                  <div className="mock-row"><span className="nm">Clutch — 19-L-1183</span><span className="meta">· 38% above your usual</span><span className="st idle">Check quote</span></div>
                  <div className="mock-row"><span className="nm">Oil change — 12-D-4471</span><span className="meta">· done 900 km ago</span><span className="st idle">Duplicate?</span></div>
                </div>
              </ShotFrame>
            }
          />
        </div>
      </section>

      <section
        className="sec-pad"
        id="roadmap"
        style={{ background: 'var(--bg-1)', borderTop: '1px solid var(--line-1)', borderBottom: '1px solid var(--line-1)' }}
      >
        <div className="container">
          <SecHead
            kicker="Also on the drawing board"
            title="Where Rovora AI goes next"
            desc="Further out, but already sketched. Early-access fleets vote on the order."
          />
          <IconGrid
            items={[
              { icon: 'shield', title: 'Damage photo checks', body: 'Handover photos compared automatically — new scratches and dents logged before the next shift.' },
              { icon: 'chart', title: 'Earnings forecasts', body: 'Next week’s revenue predicted per driver and per vehicle, so surprises show up early.' },
              { icon: 'file', title: 'Vehicle history summaries', body: 'A car’s whole service and cost story in three sentences — handy at resale time.' },
              { icon: 'pulse', title: 'Anomaly alerts', body: 'Odd fuel spend, missing takings or unusual hours flagged the moment they happen.' },
              { icon: 'users', title: 'Driver insights', body: 'Who’s earning, who’s idling and who needs a chat — spotted from the numbers, not gut feel.' },
              { icon: 'bell', title: 'Smarter reminders', body: 'Alerts triaged by urgency, so the one that matters today is at the top.' },
            ]}
          />
        </div>
      </section>

      <section style={{ padding: '20px 0 0' }}>
        <div className="container">
          <div className="cta-band reveal">
            <h2>Be first in when Rovora AI lands.</h2>
            <p>
              We&rsquo;re building these features with a handful of early fleets on real data.
              Join the list, tell us which one you need first, and you&rsquo;ll get it before anyone else.
            </p>
            <div className="hero-cta">
              <a className="btn btn-primary btn-lg" href={EARLY_ACCESS_MAILTO}>Get early access</a>
              <Link className="btn btn-ghost btn-lg" href={START_TRIAL}>Start free trial</Link>
            </div>
          </div>
          <p className="integ-note">
            Running a fleet and have an AI idea we haven&rsquo;t listed?{' '}
            <a href={EARLY_ACCESS_MAILTO}>Tell us</a> — the early-access list decides what ships first.
          </p>
        </div>
      </section>
    </FeatureShell>
  );
}
