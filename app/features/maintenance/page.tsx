import FeatureShell from '@/components/marketing/feature/FeatureShell';
import ShotFrame from '@/components/marketing/feature/ShotFrame';
import { FeatureHero, SecHead, SplitRow, IconGrid, Stats, CtaBand } from '@/components/marketing/feature/Sections';
import { TRIAL_DAYS } from '@/lib/billing/plans';
import { marketingMetadata } from '@/lib/seo';

export const metadata = marketingMetadata({
  title: 'Maintenance & services — Rovora',
  description:
    'Schedule servicing by mileage and let Rovora predict what’s next. Get an alert the moment a vehicle hits its threshold at check-in, and keep a full cost and service history per car.',
  path: '/features/maintenance',
  keywords: ['fleet maintenance software', 'vehicle service tracking', 'mileage-based servicing', 'fleet service history'],
});

export default function MaintenanceFeaturePage() {
  return (
    <FeatureShell>
      <FeatureHero
        eyebrow="Vehicle care"
        title="Never miss a service —"
        accent="the mileage tells you."
        sub="Set a service interval and Rovora predicts when each car is due. The moment a driver checks in over the threshold, you get an alert — so a missed oil change never becomes a blown engine."
        visual={
          <ShotFrame path="services">
            <div className="mock-top">
              <span className="mock-title">Servicing</span>
              <span className="mock-pill">● 2 due soon</span>
            </div>
            <div className="mock-cards">
              <div className="mock-card"><div className="k">In service</div><div className="v">1</div></div>
              <div className="mock-card"><div className="k">Due soon</div><div className="v accent">2</div></div>
              <div className="mock-card"><div className="k">Overdue</div><div className="v">0</div></div>
              <div className="mock-card"><div className="k">Spend / mo</div><div className="v pos">€1.2k</div></div>
            </div>
            <div className="mock-rows">
              <div className="mock-row"><span className="nm mono">12-D-4471</span><span className="meta">· oil · in 320 km</span><span className="st idle">Due soon</span></div>
              <div className="mock-row"><span className="nm mono">21-C-9920</span><span className="meta">· tyres · in 1,100 km</span><span className="st">Scheduled</span></div>
              <div className="mock-row"><span className="nm mono">19-L-1183</span><span className="meta">· NCT · 12 Jun</span><span className="st">Scheduled</span></div>
            </div>
          </ShotFrame>
        }
      />

      <Stats
        items={[
          { num: '0', label: 'services slipping through the cracks' },
          { num: 'km', label: 'triggers, not just calendar dates' },
          { num: '1', label: 'history per vehicle, fully costed' },
          { num: '24/7', label: 'watching every odometer reading' },
        ]}
      />

      <section className="sec-pad" id="how">
        <div className="container">
          <SecHead
            kicker="Maintenance on autopilot"
            title="Let the mileage do the remembering"
            desc="Rovora watches every check-in odometer reading and tells you what’s coming due — before it becomes a breakdown or a failed inspection."
          />

          <SplitRow
            icon="gauge"
            title="Mileage-triggered servicing"
            body="Set an interval — every 10,000 km, say — and Rovora tracks each car against its live odometer to predict the next service date, instead of relying on a sticky note on the dashboard."
            bullets={[
              'Service intervals by mileage, not guesswork',
              'Next-due predicted from live odometer readings',
              'Calendar items (NCT, tax) tracked alongside',
            ]}
            visual={
              <ShotFrame path="services/schedule" tight>
                <div className="mock-rows">
                  <div className="mock-row"><span className="nm">Oil change</span><span className="meta">· every 10,000 km</span><span className="amt">in 320 km</span></div>
                  <div className="mock-row"><span className="nm">Tyre rotation</span><span className="meta">· every 20,000 km</span><span className="amt">in 1,100 km</span></div>
                  <div className="mock-row"><span className="nm">Brake check</span><span className="meta">· every 30,000 km</span><span className="amt">in 4,800 km</span></div>
                </div>
              </ShotFrame>
            }
          />

          <SplitRow
            icon="bell"
            flip
            title="Alerts before it’s due"
            body="When a driver clocks in and the odometer crosses a service threshold, Rovora fires an alert automatically. You hear about it the day it matters — not at the next breakdown."
            bullets={[
              'Auto-alert the moment a threshold is crossed',
              'Triggered on driver check-in, in real time',
              'In-app, push and email so it never gets missed',
            ]}
            visual={
              <ShotFrame path="notifications" tight>
                <div className="mock-rows">
                  <div className="mock-row"><span className="nm">Service due</span><span className="meta">· 12-D-4471 · oil</span><span className="st idle">Now</span></div>
                  <div className="mock-row"><span className="nm">Inspection soon</span><span className="meta">· 19-L-1183 · NCT</span><span className="st">3 days</span></div>
                  <div className="mock-row"><span className="nm">Tyres approaching</span><span className="meta">· 21-C-9920</span><span className="st">1,100 km</span></div>
                </div>
              </ShotFrame>
            }
          />

          <SplitRow
            icon="file"
            title="Costs and history, per car"
            body="Log each service with the provider, the work done and what it cost. Over time you get a complete, costed maintenance history for every vehicle — handy at resale and at tax time."
            bullets={[
              'Provider, work and cost on every record',
              'Full service history for each vehicle',
              'Maintenance spend rolled into your financials',
            ]}
            visual={
              <ShotFrame path="services/12-d-4471" tight>
                <div className="mock-rows">
                  <div className="mock-row"><span className="nm">Oil & filter</span><span className="meta">· 12 May · QuickLube</span><span className="amt">€95</span></div>
                  <div className="mock-row"><span className="nm">Front brakes</span><span className="meta">· 2 Apr · Murphys</span><span className="amt">€240</span></div>
                  <div className="mock-row"><span className="nm">NCT pass</span><span className="meta">· 18 Mar</span><span className="amt">€55</span></div>
                </div>
              </ShotFrame>
            }
          />
        </div>
      </section>

      <section className="sec-pad" id="more" style={{ background: 'var(--bg-1)', borderTop: '1px solid var(--line-1)', borderBottom: '1px solid var(--line-1)' }}>
        <div className="container">
          <SecHead kicker="Keep every car road-ready" title="Maintenance that looks after itself" />
          <IconGrid
            items={[
              { icon: 'calendar', title: 'Service scheduling', body: 'Plan oil changes, tyres, brakes and inspections per vehicle.' },
              { icon: 'gauge', title: 'Mileage triggers', body: 'Due dates driven by live odometer readings, not the calendar alone.' },
              { icon: 'bell', title: 'Automatic alerts', body: 'Fired on check-in the instant a car crosses its threshold.' },
              { icon: 'coins', title: 'Cost tracking', body: 'Every job costed, rolled into your fleet financials.' },
              { icon: 'file', title: 'Service history', body: 'A complete, dated record for every vehicle you run.' },
              { icon: 'shield', title: 'Damage log', body: 'Record incidents and repairs against any car, with photos.' },
            ]}
          />
        </div>
      </section>

      <CtaBand
        title="Keep every car serviced and on the road."
        body={`Start your ${TRIAL_DAYS}-day free trial and let the mileage tell you what’s due — no card required.`}
      />
    </FeatureShell>
  );
}
