import FeatureShell from '@/components/marketing/feature/FeatureShell';
import ShotFrame from '@/components/marketing/feature/ShotFrame';
import { FeatureHero, SecHead, SplitRow, IconGrid, Stats, CtaBand } from '@/components/marketing/feature/Sections';
import { TRIAL_DAYS } from '@/lib/billing/plans';
import { marketingMetadata } from '@/lib/seo';

export const metadata = marketingMetadata({
  title: 'Damage & repairs — Rovora',
  description:
    'Log damage against any vehicle with photos and zones, track repair cost and status, and capture a four-side photo check at every clock-in — so unreported damage is on the driver, not you.',
  path: '/features/damage',
  keywords: ['vehicle damage reporting software', 'fleet damage tracking', 'vehicle condition photo check', 'repair cost tracking'],
});

export default function DamageFeaturePage() {
  return (
    <FeatureShell>
      <FeatureHero
        eyebrow="Damage & repairs"
        title="Every dent and scratch,"
        accent="on the record."
        sub="Log damage against any car with photos and a pinpointed zone, track the repair from open to closed, and let pre-shift checks put unreported damage squarely on the driver."
        visual={
          <ShotFrame path="damages">
            <div className="mock-top">
              <span className="mock-title">Damage log</span>
              <span className="mock-pill">● 3 open</span>
            </div>
            <div className="mock-cards">
              <div className="mock-card"><div className="k">Open</div><div className="v accent">3</div></div>
              <div className="mock-card"><div className="k">Repairing</div><div className="v">1</div></div>
              <div className="mock-card"><div className="k">Closed</div><div className="v pos">28</div></div>
              <div className="mock-card"><div className="k">Repairs / mo</div><div className="v">€940</div></div>
            </div>
            <div className="mock-rows">
              <div className="mock-row"><span className="nm mono">12-D-4471</span><span className="meta">· front bumper · major</span><span className="st idle">Open</span></div>
              <div className="mock-row"><span className="nm mono">21-C-9920</span><span className="meta">· rear door · minor</span><span className="st">Repairing</span></div>
              <div className="mock-row"><span className="nm mono">19-L-1183</span><span className="meta">· wing mirror · minor</span><span className="st">Closed</span></div>
            </div>
          </ShotFrame>
        }
      />

      <Stats
        items={[
          { num: '1', label: 'damage log per vehicle, fully costed' },
          { num: '4-side', label: 'vehicle photos at every clock-in' },
          { num: '€', label: 'repair costs tracked to the cent' },
          { num: '0', label: 'he-said-she-said damage disputes' },
        ]}
      />

      <section className="sec-pad" id="how">
        <div className="container">
          <SecHead
            kicker="Nothing slips by"
            title="From the first scratch to the final repair"
            desc="Capture damage the moment it's spotted, prove who was driving, and follow every incident through to a closed, costed repair."
          />

          <SplitRow
            icon="camera"
            title="Log damage with photos &amp; zones"
            body="Tap the exact spot on a vehicle diagram, set the severity, describe what happened and attach photos. Each incident is tied to the car — and to the shift it appeared on."
            bullets={[
              'Pinpoint the damage on a car-zone diagram',
              'Severity, description and photo evidence on every report',
              'Linked to the vehicle and the shift it surfaced in',
            ]}
            visual={
              <ShotFrame path="damages/new" tight>
                <div className="mock-rows">
                  <div className="mock-row"><span className="nm">Zone</span><span className="meta">· Front bumper, left</span></div>
                  <div className="mock-row"><span className="nm">Severity</span><span className="st idle">Major</span></div>
                  <div className="mock-row"><span className="nm">Photos</span><span className="meta">· 3 attached</span></div>
                  <div className="mock-row"><span className="nm">Vehicle</span><span className="meta">· 12-D-4471</span></div>
                </div>
              </ShotFrame>
            }
          />

          <SplitRow
            icon="coins"
            flip
            title="Track repair cost &amp; status"
            body="Move each incident from open to repairing to closed, record what the fix cost and when it was done. Repair spend rolls straight into your fleet financials."
            bullets={[
              'Open → repairing → closed status on every incident',
              'Repair cost and repaired date captured',
              'Damage spend rolled into your financials',
            ]}
            visual={
              <ShotFrame path="damages/12-d-4471" tight>
                <div className="mock-rows">
                  <div className="mock-row"><span className="nm">Front bumper</span><span className="meta">· major</span><span className="st idle">Open</span></div>
                  <div className="mock-row"><span className="nm">Rear door</span><span className="meta">· repaired 9 May</span><span className="amt">€320</span></div>
                  <div className="mock-row"><span className="nm">Wing mirror</span><span className="meta">· repaired 2 Apr</span><span className="amt">€85</span></div>
                </div>
              </ShotFrame>
            }
          />

          <SplitRow
            icon="shield"
            title="Pre-shift checks at clock-in"
            body="Before a driver can go online they photograph all four sides of the car and confirm its condition. So if damage turns up unreported, the record shows it wasn't there at handover — and whose shift it was."
            bullets={[
              'Four-side photo check required before going online',
              'Driver confirms condition and flags any existing damage',
              'A clear handover trail for every shift',
            ]}
            visual={
              <ShotFrame path="driver/go-online" tight>
                <div className="mock-rows">
                  <div className="mock-row"><span className="nm">Front</span><span className="meta">· photo taken</span><span className="st pos">✓</span></div>
                  <div className="mock-row"><span className="nm">Rear</span><span className="meta">· photo taken</span><span className="st pos">✓</span></div>
                  <div className="mock-row"><span className="nm">Left &amp; right</span><span className="meta">· photo taken</span><span className="st pos">✓</span></div>
                  <div className="mock-row"><span className="nm">Condition</span><span className="meta">· confirmed OK</span><span className="st">Online</span></div>
                </div>
              </ShotFrame>
            }
          />
        </div>
      </section>

      <section className="sec-pad" id="more" style={{ background: 'var(--bg-1)', borderTop: '1px solid var(--line-1)', borderBottom: '1px solid var(--line-1)' }}>
        <div className="container">
          <SecHead kicker="Damage, handled" title="A full repair history for every car" />
          <IconGrid
            items={[
              { icon: 'camera', title: 'Photo evidence', body: 'Every report backed by photos of the actual damage.' },
              { icon: 'car', title: 'Zone logging', body: 'Pinpoint damage on a per-vehicle car diagram.' },
              { icon: 'coins', title: 'Repair costs', body: 'Track what each fix cost, rolled into financials.' },
              { icon: 'shield', title: 'Driver accountability', body: 'Pre-shift checks tie damage to the right handover.' },
              { icon: 'file', title: 'Full history', body: 'A complete, dated damage record per vehicle.' },
              { icon: 'bell', title: 'Status alerts', body: 'Know what is open, repairing or overdue to close.' },
            ]}
          />
        </div>
      </section>

      <CtaBand
        title="Catch every knock before it costs you."
        body={`Start your ${TRIAL_DAYS}-day free trial and keep a full, photo-backed damage history on every car — no card required.`}
      />
    </FeatureShell>
  );
}
