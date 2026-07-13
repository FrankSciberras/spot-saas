import FeatureShell from '@/components/marketing/feature/FeatureShell';
import ShotFrame from '@/components/marketing/feature/ShotFrame';
import { FeatureHero, SecHead, SplitRow, IconGrid, Stats, CtaBand } from '@/components/marketing/feature/Sections';
import { TRIAL_DAYS } from '@/lib/billing/plans';
import { marketingMetadata } from '@/lib/seo';

export const metadata = marketingMetadata({
  title: 'Live Fleet Tracking Without Hardware — Rovora',
  description:
    'Live GPS fleet tracking with no hardware to install — a live map of every driver, trip and stop history, driver safety scores and phone battery alerts, all from the free driver app.',
  path: '/features/live-tracking',
  keywords: ['fleet tracking', 'fleet tracking software', 'live fleet tracking', 'GPS fleet tracking without hardware', 'driver tracking app', 'taxi fleet tracking', 'trip history', 'driver safety scores', 'driver behaviour monitoring'],
});

export default function LiveTrackingFeaturePage() {
  return (
    <FeatureShell>
      <FeatureHero
        eyebrow="Live operations"
        title="See who’s on the road,"
        accent="as it happens."
        sub="A live GPS map of the fleet, every trip and stop on the record, driver safety scores and phone-health alerts — all from the free driver app, with no hardware to install."
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

      <section className="sec-pad" id="gps">
        <div className="container">
          <SecHead
            kicker="GPS, without the hardware"
            title="The road, on the record"
            desc="The free driver app doubles as a GPS tracker — one tap at shift start puts every car on a live map and builds a permanent history of trips, stops and driving style."
          />

          <SplitRow
            icon="gauge"
            title="A live map of every car"
            body="Live positions, speed and top speed per driver, streamed straight from the driver's phone. Draw zones around ranks, depots or the airport and get alerted the moment a driver enters or leaves — plus automatic speeding alerts against your own limit."
            bullets={[
              'Live speed and top speed per driver',
              'Zone alerts — know when a car reaches the airport or leaves the depot',
              'Speeding alerts against a fleet-wide limit you set',
            ]}
            visual={
              <ShotFrame path="fleet/tracking" tight>
                <div className="mock-rows">
                  <div className="mock-row"><span className="av" /><span className="nm">M. Vella</span><span className="meta">· Live · 1.2 km away</span><span className="amt">62 km/h</span></div>
                  <div className="mock-row"><span className="av" /><span className="nm">J. Borg</span><span className="meta">· Live · Airport zone</span><span className="amt">48 km/h</span></div>
                  <div className="mock-row"><span className="nm">Zone alert</span><span className="meta">· M. Vella entered “Airport”</span><span className="st">Now</span></div>
                </div>
              </ShotFrame>
            }
          />

          <SplitRow
            icon="car"
            flip
            title="Every trip and stop, recorded"
            body="Rovora turns the GPS trail into a clean timeline: each journey with its distance, duration and top speed, and each stop with where and how long. Verify completed jobs, calculate mileage, and spot unnecessary journeys or excessive waiting at a glance."
            bullets={[
              'Journey times, distances and routes for every shift',
              'Stops and waiting time — named when they happen inside your zones',
              'Day-by-day history per driver, kept long after the shift',
            ]}
            visual={
              <ShotFrame path="fleet/trips" tight>
                <div className="mock-rows">
                  <div className="mock-row"><span className="nm">09:12–09:41</span><span className="meta">· Drove 12.4 km in 29 min</span><span className="amt">68 km/h</span></div>
                  <div className="mock-row"><span className="nm">09:41–10:03</span><span className="meta">· Waited 22 min at Airport</span><span className="st idle">Stop</span></div>
                  <div className="mock-row"><span className="nm">10:03–10:26</span><span className="meta">· Drove 9.8 km in 23 min</span><span className="amt">54 km/h</span></div>
                </div>
              </ShotFrame>
            }
          />

          <SplitRow
            icon="shield"
            title="Safety scores and healthy phones"
            body="The app's motion sensor spots harsh braking and rapid acceleration on the phone itself, and Rovora rolls it up with speeding into a weekly 0–100 safety score per driver. Meanwhile device-health alerts warn you when a phone's battery runs low, GPS is switched off or tracking permission is removed — before you lose the signal."
            bullets={[
              'Harsh braking, rapid acceleration and speeding per driver',
              'Weekly safety scores and a Monday-morning report',
              'Low battery, GPS-off and permission alerts while on shift',
            ]}
            visual={
              <ShotFrame path="fleet/safety" tight>
                <div className="mock-rows">
                  <div className="mock-row"><span className="av" /><span className="nm">A. Murphy</span><span className="meta">· 412 km · clean week</span><span className="st">96</span></div>
                  <div className="mock-row"><span className="av" /><span className="nm">S. Doyle</span><span className="meta">· 2 sharp braking · 1 speeding</span><span className="st idle">71</span></div>
                  <div className="mock-row"><span className="nm">Battery low</span><span className="meta">· K. Walsh’s phone at 18%</span><span className="st idle">Alert</span></div>
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
              { icon: 'car', title: 'Trip history', body: 'Every journey, stop and km driven — verified against the GPS trail.' },
              { icon: 'shield', title: 'Safety scores', body: 'Speeding, harsh braking and acceleration rolled into a weekly score.' },
              { icon: 'bolt', title: 'Device health', body: 'Low battery, GPS-off and permission alerts before tracking drops.' },
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
