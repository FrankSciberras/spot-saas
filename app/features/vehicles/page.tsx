import type { Metadata } from 'next';
import FeatureShell from '@/components/marketing/feature/FeatureShell';
import ShotFrame from '@/components/marketing/feature/ShotFrame';
import { FeatureHero, SecHead, SplitRow, IconGrid, Stats, CtaBand } from '@/components/marketing/feature/Sections';
import { TRIAL_DAYS } from '@/lib/billing/plans';

export const metadata: Metadata = {
  title: 'Vehicle management — Rovora',
  description:
    'Keep every vehicle you run in check — one profile per car for documents, live mileage, driver assignment and utilisation, with expiry alerts weeks before any licence, insurance or inspection lapses.',
};

export default function VehiclesFeaturePage() {
  return (
    <FeatureShell>
      <FeatureHero
        eyebrow="Vehicle management"
        title="Every vehicle you run,"
        accent="in check."
        sub="One profile per car holds its documents, live mileage, assigned drivers and condition — so you always know what you own, where it is and what it needs next."
        visual={
          <ShotFrame path="vehicles">
            <div className="mock-top">
              <span className="mock-title">Fleet vehicles</span>
              <span className="mock-pill">● 14 active</span>
            </div>
            <div className="mock-cards">
              <div className="mock-card"><div className="k">Active</div><div className="v pos">11</div></div>
              <div className="mock-card"><div className="k">Idle</div><div className="v">2</div></div>
              <div className="mock-card"><div className="k">Service</div><div className="v">1</div></div>
              <div className="mock-card"><div className="k">Expiring</div><div className="v accent">3</div></div>
            </div>
            <div className="mock-rows">
              <div className="mock-row"><span className="nm mono">12-D-4471</span><span className="meta">· A. Murphy · 84% used</span><span className="st">Active</span></div>
              <div className="mock-row"><span className="nm mono">21-C-9920</span><span className="meta">· J. Byrne · 77% used</span><span className="st">Active</span></div>
              <div className="mock-row"><span className="nm mono">19-L-1183</span><span className="meta">· unassigned · idle 2d</span><span className="st idle">Idle</span></div>
            </div>
          </ShotFrame>
        }
      />

      <Stats
        items={[
          { num: '1', label: 'profile per car — docs, mileage & driver' },
          { num: 'km', label: 'live mileage from every check-in' },
          { num: '0', label: 'expired licences slipping past you' },
          { num: '360°', label: 'view of utilisation across the fleet' },
        ]}
      />

      <section className="sec-pad" id="how">
        <div className="container">
          <SecHead
            kicker="Your fleet, on one screen"
            title="Everything about a car, in one record"
            desc="Stop hunting through folders, glove boxes and group chats. Every vehicle in Rovora carries its own complete, always-current profile."
          />

          <SplitRow
            icon="car"
            title="One profile for every vehicle"
            body="Registration, make, model and year, the documents on file, the drivers assigned to it and its current mileage — all in a single record you can open in a tap."
            bullets={[
              'Registration, make/model/year and status at a glance',
              'Assign one or more drivers to each vehicle',
              'Documents and photos attached to the car',
            ]}
            visual={
              <ShotFrame path="vehicles/12-d-4471" tight>
                <div className="mock-rows">
                  <div className="mock-row"><span className="nm">Make &amp; model</span><span className="meta">· Toyota Prius · 2021</span></div>
                  <div className="mock-row"><span className="nm">Assigned driver</span><span className="meta">· A. Murphy</span></div>
                  <div className="mock-row"><span className="nm">Odometer</span><span className="amt">142,380 km</span></div>
                  <div className="mock-row"><span className="nm">Status</span><span className="st">Active</span></div>
                </div>
              </ShotFrame>
            }
          />

          <SplitRow
            icon="gauge"
            flip
            title="Live mileage &amp; utilisation"
            body="Every driver check-in captures the odometer, so each car's mileage is always current. See 7-day utilisation and whether a vehicle is earning, idle or in for service."
            bullets={[
              'Odometer captured automatically at clock-in',
              '7-day utilisation per vehicle',
              'Active, idle and in-service status at a glance',
            ]}
            visual={
              <ShotFrame path="vehicles" tight>
                <div className="mock-cards">
                  <div className="mock-card"><div className="k">Active</div><div className="v pos">11</div></div>
                  <div className="mock-card"><div className="k">Idle</div><div className="v">2</div></div>
                  <div className="mock-card"><div className="k">Service</div><div className="v">1</div></div>
                  <div className="mock-card"><div className="k">Avg use</div><div className="v pos">81%</div></div>
                </div>
                <div className="mock-rows">
                  <div className="mock-row"><span className="nm mono">12-D-4471</span><span className="meta">· 84% used</span><span className="st">Active</span></div>
                  <div className="mock-row"><span className="nm mono">19-L-1183</span><span className="meta">· idle 2d</span><span className="st idle">Idle</span></div>
                </div>
              </ShotFrame>
            }
          />

          <SplitRow
            icon="file"
            title="Documents that never lapse"
            body="Keep the road licence, insurance and VRT/NCT on every car, each with an expiry date. Rovora warns you with tiered alerts weeks ahead — so nothing on the road is ever uninsured or untaxed."
            bullets={[
              'Road licence, insurance and inspection on file per car',
              'Expiry dates tracked with tiered early warnings',
              'Alerts in-app, by push and email so none slip',
            ]}
            visual={
              <ShotFrame path="vehicles/12-d-4471/documents" tight>
                <div className="mock-rows">
                  <div className="mock-row"><span className="nm">Insurance</span><span className="meta">· expires 30 Jun</span><span className="st idle">Soon</span></div>
                  <div className="mock-row"><span className="nm">Road licence</span><span className="meta">· expires 14 Sep</span><span className="st">Valid</span></div>
                  <div className="mock-row"><span className="nm">NCT / VRT</span><span className="meta">· expires 2 Aug</span><span className="st">Valid</span></div>
                </div>
              </ShotFrame>
            }
          />
        </div>
      </section>

      <section className="sec-pad" id="more" style={{ background: 'var(--bg-1)', borderTop: '1px solid var(--line-1)', borderBottom: '1px solid var(--line-1)' }}>
        <div className="container">
          <SecHead kicker="Everything about your cars" title="A full picture of every vehicle" />
          <IconGrid
            items={[
              { icon: 'car', title: 'Vehicle profiles', body: 'One record per car — details, status, drivers and documents.' },
              { icon: 'gauge', title: 'Mileage tracking', body: 'Odometer captured at every check-in, always current.' },
              { icon: 'file', title: 'Document vault', body: 'Licence, insurance and inspection with expiry alerts.' },
              { icon: 'user', title: 'Driver assignment', body: 'Assign cars to drivers and see who is in what.' },
              { icon: 'wrench', title: 'Service & damage', body: 'Maintenance and damage history linked to each vehicle.' },
              { icon: 'chart', title: 'Utilisation', body: 'See which cars earn and which sit idle.' },
            ]}
          />
        </div>
      </section>

      <CtaBand
        title="Know every vehicle, inside out."
        body={`Start your ${TRIAL_DAYS}-day free trial and get your whole fleet on one screen — no card required.`}
      />
    </FeatureShell>
  );
}
