import type { Metadata } from 'next';
import FeatureShell from '@/components/marketing/feature/FeatureShell';
import ShotFrame from '@/components/marketing/feature/ShotFrame';
import { FeatureHero, SecHead, SplitRow, IconGrid, Stats, CtaBand } from '@/components/marketing/feature/Sections';
import { TRIAL_DAYS } from '@/lib/billing/plans';

export const metadata: Metadata = {
  title: 'Live driver & shift tracking — Rovora',
  description:
    'See who’s on shift, their hours and earnings as the day unfolds. Drivers clock in with a photo check-in that updates mileage automatically — no phone calls, no guesswork.',
};

export default function LiveTrackingFeaturePage() {
  return (
    <FeatureShell>
      <FeatureHero
        eyebrow="Live operations"
        title="See who’s on the road,"
        accent="as it happens."
        sub="Every clock-in, shift hour and euro earned, streaming in live. Know exactly who’s driving, who’s available and who’s running behind — without making a single call."
        visual={
          <ShotFrame path="dashboard">
            <div className="mock-top">
              <span className="mock-title">Fleet overview</span>
              <span className="mock-pill">● Live</span>
            </div>
            <div className="mock-cards">
              <div className="mock-card"><div className="k">On shift</div><div className="v accent">14</div></div>
              <div className="mock-card"><div className="k">Available</div><div className="v">5</div></div>
              <div className="mock-card"><div className="k">Hours today</div><div className="v">92</div></div>
              <div className="mock-card"><div className="k">Revenue today</div><div className="v pos">€3.1k</div></div>
            </div>
            <div className="mock-rows">
              <div className="mock-row"><span className="av" /><span className="nm">A. Murphy</span><span className="meta">· 6h 12m</span><span className="amt">€412</span><span className="st">On shift</span></div>
              <div className="mock-row"><span className="av" /><span className="nm">J. Byrne</span><span className="meta">· 5h 03m</span><span className="amt">€388</span><span className="st">On shift</span></div>
              <div className="mock-row"><span className="av" /><span className="nm">K. Walsh</span><span className="meta">· off duty</span><span className="amt">€0</span><span className="st idle">Off duty</span></div>
            </div>
          </ShotFrame>
        }
      />

      <Stats
        items={[
          { num: '24/7', label: 'live view of the fleet' },
          { num: '0', label: 'phone calls to check in' },
          { num: '4', label: 'angles photographed each shift' },
          { num: '1', label: 'tap for a driver to go online' },
        ]}
      />

      <section className="sec-pad" id="how">
        <div className="container">
          <SecHead
            kicker="The day, as it happens"
            title="Your whole operation, on one screen"
            desc="Rovora turns every driver’s clock-in into a live picture of the fleet — who’s working, for how long, earning what, in which car."
          />

          <SplitRow
            icon="pulse"
            title="Live shift status"
            body="See who’s on shift, who’s off and who’s running late at a glance. Hours tick up in real time, so you always know your available capacity without asking."
            bullets={[
              'On shift, off duty and running-late states',
              'Live hours per driver, updated as they work',
              'Available capacity visible at a glance',
            ]}
            visual={
              <ShotFrame path="shifts" tight>
                <div className="mock-rows">
                  <div className="mock-row"><span className="av" /><span className="nm">A. Murphy</span><span className="meta">· 12-D-4471 · 6h 12m</span><span className="st">On shift</span></div>
                  <div className="mock-row"><span className="av" /><span className="nm">S. Doyle</span><span className="meta">· 21-C-9920 · 3h 40m</span><span className="st">On shift</span></div>
                  <div className="mock-row"><span className="av" /><span className="nm">K. Walsh</span><span className="meta">· not started</span><span className="st idle">Late</span></div>
                </div>
              </ShotFrame>
            }
          />

          <SplitRow
            icon="chart"
            flip
            title="Earnings as the day unfolds"
            body="Per-driver earnings build up live across the shift, so you can catch a slow day early and see your best performers without waiting for the weekly settlement."
            bullets={[
              'Live euros earned per driver',
              'Fleet revenue for the day in one number',
              'Catch a quiet shift while there’s still time to act',
            ]}
            visual={
              <ShotFrame path="dashboard" tight>
                <div className="mock-cards">
                  <div className="mock-card"><div className="k">Top earner</div><div className="v">€412</div></div>
                  <div className="mock-card"><div className="k">Fleet avg</div><div className="v">€221</div></div>
                  <div className="mock-card"><div className="k">Revenue / wk</div><div className="v pos">€18.4k</div></div>
                </div>
              </ShotFrame>
            }
          />

          <SplitRow
            icon="camera"
            title="Photo check-in, every shift"
            body="Drivers go online from the free app with a four-angle photo of the car and a quick pre-shift checklist. Mileage updates itself, and you get a dated photographic record."
            bullets={[
              'Front, left, right and back photos at clock-in',
              'Pre-shift checklist — dashcam, interior, condition',
              'Odometer captured and the vehicle updated automatically',
            ]}
            visual={
              <ShotFrame path="go-online" tight>
                <div className="mock-rows">
                  <div className="mock-row"><span className="nm">Vehicle photos</span><span className="meta">· 4 of 4</span><span className="st">Done</span></div>
                  <div className="mock-row"><span className="nm">Dashcam working</span><span className="st">Yes</span></div>
                  <div className="mock-row"><span className="nm">Interior clean</span><span className="st">Yes</span></div>
                  <div className="mock-row"><span className="nm">Odometer</span><span className="meta">· auto-updated</span><span className="amt">148,204</span></div>
                </div>
              </ShotFrame>
            }
          />
        </div>
      </section>

      <section className="sec-pad" id="more" style={{ background: 'var(--bg-1)', borderTop: '1px solid var(--line-1)', borderBottom: '1px solid var(--line-1)' }}>
        <div className="container">
          <SecHead kicker="Always in the loop" title="Everything you’d otherwise phone to find out" />
          <IconGrid
            items={[
              { icon: 'pulse', title: 'Live status', body: 'On shift, off duty or late — for every driver, right now.' },
              { icon: 'clock', title: 'Hours tracked', body: 'Shift hours accrue automatically from clock-in to clock-out.' },
              { icon: 'chart', title: 'Earnings live', body: 'Per-driver and fleet revenue update through the day.' },
              { icon: 'gauge', title: 'Mileage captured', body: 'Odometer logged at check-in and the vehicle kept current.' },
              { icon: 'check', title: 'Pre-shift checklist', body: 'Dashcam and condition checks before a car goes out.' },
              { icon: 'camera', title: 'Photo record', body: 'A dated, four-angle photo set for every shift, stored safely.' },
            ]}
          />
        </div>
      </section>

      <CtaBand
        title="Stop calling round to find your drivers."
        body={`Start your ${TRIAL_DAYS}-day free trial and watch your fleet come to life on one screen.`}
      />
    </FeatureShell>
  );
}
