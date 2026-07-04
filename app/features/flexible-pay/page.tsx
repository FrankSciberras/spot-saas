import FeatureShell from '@/components/marketing/feature/FeatureShell';
import ShotFrame from '@/components/marketing/feature/ShotFrame';
import { FeatureHero, SecHead, SplitRow, IconGrid, Stats, CtaBand } from '@/components/marketing/feature/Sections';
import { TRIAL_DAYS } from '@/lib/billing/plans';
import { marketingMetadata } from '@/lib/seo';

export const metadata = marketingMetadata({
  title: 'Flexible driver pay — Rovora',
  description:
    'Set how each driver is paid — the split on fares, tips, campaigns and platform fees — fleet-wide or per driver. Rovora applies the right scheme to every settlement automatically.',
  path: '/features/flexible-pay',
  keywords: ['driver pay splits', 'driver commission software', 'fleet driver pay schemes', 'rideshare fleet payroll'],
});

export default function FlexiblePayFeaturePage() {
  return (
    <FeatureShell>
      <FeatureHero
        eyebrow="Flexible pay"
        title="Pay every driver"
        accent="on their own terms."
        sub="No two arrangements are the same. Set the split on fares, tips, campaigns and platform fees — fleet-wide or per driver — and Rovora applies the right scheme to every weekly settlement, automatically."
        visual={
          <ShotFrame path="settings/pay-scheme">
            <div className="mock-top">
              <span className="mock-title">Pay scheme · A. Murphy</span>
              <span className="mock-pill">● Active</span>
            </div>
            <div className="mock-rows">
              <div className="mock-row"><span className="nm">Driver share of fares</span><span className="meta">· gross</span><span className="amt accent">60%</span></div>
              <div className="mock-row"><span className="nm">Tips to driver</span><span className="meta">· passthrough</span><span className="amt pos">100%</span></div>
              <div className="mock-row"><span className="nm">Campaign bonuses to driver</span><span className="amt">80%</span></div>
              <div className="mock-row"><span className="nm">Platform fees driver bears</span><span className="meta">· Bolt/Uber</span><span className="amt">100%</span></div>
            </div>
          </ShotFrame>
        }
      />

      <Stats
        items={[
          { num: '4', label: 'income streams split independently' },
          { num: '∞', label: 'per-driver pay schemes' },
          { num: '0', label: 'formulas to memorise' },
          { num: '100', unit: '%', label: 'applied automatically each week' },
        ]}
      />

      <section className="sec-pad" id="how">
        <div className="container">
          <SecHead
            kicker="Your splits, your rules"
            title="Four levers, set once"
            desc="Decide how the money divides across fares, tips, campaigns and fees. Set a sensible fleet default, then override it for the drivers who are on a different deal."
          />

          <SplitRow
            icon="split"
            title="Set the fare split once"
            body="Choose the driver’s share of gross fares as your fleet default — 50/50, 60/40, whatever you run — and Rovora uses it on every settlement until you say otherwise."
            bullets={[
              'Fleet-wide default that just works',
              'Any split you like, not a fixed 50/50',
              'Changes apply from the next settlement on',
            ]}
            visual={
              <ShotFrame path="settings/pay-scheme" tight>
                <div className="mock-cards">
                  <div className="mock-card"><div className="k">Fleet default</div><div className="v accent">55%</div></div>
                  <div className="mock-card"><div className="k">Drivers on default</div><div className="v">12</div></div>
                  <div className="mock-card"><div className="k">Custom schemes</div><div className="v pos">3</div></div>
                </div>
              </ShotFrame>
            }
          />

          <SplitRow
            icon="percent"
            flip
            title="Tips and campaigns — your call"
            body="Pass tips straight through to drivers, keep a cut, or split campaign bonuses however you’ve agreed. Each stream has its own percentage, separate from the fare split."
            bullets={[
              'Tips passed through 100% — or split your way',
              'Campaign bonuses divided on their own terms',
              'Every stream tracked separately, never lumped',
            ]}
            visual={
              <ShotFrame path="settings/pay-scheme" tight>
                <div className="mock-rows">
                  <div className="mock-row"><span className="nm">Tips</span><span className="meta">· to driver</span><span className="amt pos">100%</span></div>
                  <div className="mock-row"><span className="nm">Campaigns</span><span className="meta">· to driver</span><span className="amt">80%</span></div>
                  <div className="mock-row"><span className="nm">Cash rides</span><span className="meta">· netted</span><span className="amt">100%</span></div>
                </div>
              </ShotFrame>
            }
          />

          <SplitRow
            icon="user"
            title="Override it per driver"
            body="Got a driver on a different arrangement? Give them their own scheme in a couple of clicks. Rovora keeps everyone’s deal straight and applies it every single week."
            bullets={[
              'Per-driver overrides for any stream',
              'New hires inherit the fleet default automatically',
              'No risk of paying last month’s deal by mistake',
            ]}
            visual={
              <ShotFrame path="drivers" tight>
                <div className="mock-rows">
                  <div className="mock-row"><span className="av" /><span className="nm">A. Murphy</span><span className="meta">· custom 60/40</span><span className="st">Override</span></div>
                  <div className="mock-row"><span className="av" /><span className="nm">J. Byrne</span><span className="meta">· fleet default</span><span className="st idle">Default</span></div>
                  <div className="mock-row"><span className="av" /><span className="nm">S. Doyle</span><span className="meta">· custom fees</span><span className="st">Override</span></div>
                </div>
              </ShotFrame>
            }
          />
        </div>
      </section>

      <section className="sec-pad" id="more" style={{ background: 'var(--bg-1)', borderTop: '1px solid var(--line-1)', borderBottom: '1px solid var(--line-1)' }}>
        <div className="container">
          <SecHead kicker="Every angle covered" title="Pay that fits your fleet, not the other way round" />
          <IconGrid
            items={[
              { icon: 'sliders', title: 'Fleet default', body: 'One scheme that covers most drivers — set it and forget it.' },
              { icon: 'user', title: 'Per-driver overrides', body: 'Bespoke deals for the drivers who need them, with no extra admin.' },
              { icon: 'split', title: 'Fare split', body: 'Any driver share of gross fares, applied to every settlement.' },
              { icon: 'coins', title: 'Tips passthrough', body: 'Send tips straight to drivers or keep a share — your choice.' },
              { icon: 'bolt', title: 'Campaign bonuses', body: 'Divide platform incentives on their own percentage.' },
              { icon: 'percent', title: 'Fee absorption', body: 'Decide how much of Bolt/Uber fees the driver carries.' },
            ]}
          />
        </div>
      </section>

      <CtaBand
        title="Run the pay deals you actually have."
        body={`Start free for ${TRIAL_DAYS} days and set up your fleet’s pay schemes in minutes — no card required.`}
      />
    </FeatureShell>
  );
}
