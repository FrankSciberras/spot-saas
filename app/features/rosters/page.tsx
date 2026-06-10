import type { Metadata } from 'next';
import FeatureShell from '@/components/marketing/feature/FeatureShell';
import ShotFrame from '@/components/marketing/feature/ShotFrame';
import { FeatureHero, SecHead, SplitRow, IconGrid, Stats, CtaBand } from '@/components/marketing/feature/Sections';

export const metadata: Metadata = {
  title: 'Rosters & shift scheduling — Rovora',
  description:
    'Build the week’s roster — drivers, vehicles and days — and publish it to every driver with push and email in a click. Republish changes with a clear trail and no clashes.',
};

export default function RostersFeaturePage() {
  return (
    <FeatureShell>
      <FeatureHero
        eyebrow="Scheduling"
        title="Plan the week,"
        accent="publish in a click."
        sub="Build a weekly roster across drivers, vehicles and days, then publish it to everyone at once with push and email. Drivers always know their shifts — and you always know your cover."
        visual={
          <ShotFrame path="rosters">
            <div className="mock-top">
              <span className="mock-title">Roster · week 23</span>
              <span className="mock-pill">● Published</span>
            </div>
            <div className="mock-cards">
              <div className="mock-card"><div className="k">Drivers</div><div className="v">16</div></div>
              <div className="mock-card"><div className="k">Shifts</div><div className="v accent">84</div></div>
              <div className="mock-card"><div className="k">Vehicles</div><div className="v">12</div></div>
              <div className="mock-card"><div className="k">Clashes</div><div className="v pos">0</div></div>
            </div>
            <div className="mock-rows">
              <div className="mock-row"><span className="av" /><span className="nm">A. Murphy</span><span className="meta">· Mon–Fri · 12-D-4471</span><span className="st">Day</span></div>
              <div className="mock-row"><span className="av" /><span className="nm">J. Byrne</span><span className="meta">· Tue–Sat · 21-C-9920</span><span className="st">Night</span></div>
              <div className="mock-row"><span className="av" /><span className="nm">S. Doyle</span><span className="meta">· Wed–Sun · 19-L-1183</span><span className="st">Day</span></div>
            </div>
          </ShotFrame>
        }
      />

      <Stats
        items={[
          { num: '1', label: 'week planned in one view' },
          { num: '1', label: 'click to publish to everyone' },
          { num: '2', label: 'channels: push + email' },
          { num: '0', label: 'double-booked cars' },
        ]}
      />

      <section className="sec-pad" id="how">
        <div className="container">
          <SecHead
            kicker="From plan to published"
            title="A week’s schedule, built in minutes"
            desc="Lay out who drives which car on which days, publish it to the whole team, and adjust with confidence when things change."
          />

          <SplitRow
            icon="calendar"
            title="Build the week fast"
            body="Assign drivers to vehicles across the days of the week in one grid. Batch-enter shifts for the whole fleet instead of one at a time, and save it as a draft until you’re ready."
            bullets={[
              'Driver × vehicle × day in a single view',
              'Batch shift entry across the whole fleet',
              'Save as a draft, publish when it’s ready',
            ]}
            visual={
              <ShotFrame path="rosters/new" tight>
                <div className="mock-rows">
                  <div className="mock-row"><span className="nm">Mon</span><span className="meta">· 11 drivers · 9 cars</span><span className="st">Set</span></div>
                  <div className="mock-row"><span className="nm">Tue</span><span className="meta">· 12 drivers · 10 cars</span><span className="st">Set</span></div>
                  <div className="mock-row"><span className="nm">Wed</span><span className="meta">· 12 drivers · 10 cars</span><span className="st">Set</span></div>
                  <div className="mock-row"><span className="nm">Thu</span><span className="meta">· draft</span><span className="st idle">Draft</span></div>
                </div>
              </ShotFrame>
            }
          />

          <SplitRow
            icon="send"
            flip
            title="Publish to every driver"
            body="One click sends the roster to everyone assigned, by push notification and email. Drivers see their shifts in the free app immediately — no group chats, no screenshots."
            bullets={[
              'Push + email to every assigned driver at once',
              'Drivers see their own shifts in the app instantly',
              'No more WhatsApp threads or printed sheets',
            ]}
            visual={
              <ShotFrame path="roster" tight>
                <div className="mock-top">
                  <span className="mock-title">Your week · A. Murphy</span>
                  <span className="mock-pill">● New</span>
                </div>
                <div className="mock-rows">
                  <div className="mock-row"><span className="nm">Mon 09:00</span><span className="meta">· 12-D-4471</span><span className="st">Day</span></div>
                  <div className="mock-row"><span className="nm">Tue 09:00</span><span className="meta">· 12-D-4471</span><span className="st">Day</span></div>
                  <div className="mock-row"><span className="nm">Wed</span><span className="meta">· rest day</span><span className="st idle">Off</span></div>
                </div>
              </ShotFrame>
            }
          />

          <SplitRow
            icon="repeat"
            title="Change with confidence"
            body="Plans move. Republish an updated roster and Rovora tracks what changed and re-notifies the affected drivers — while flagging any vehicle that’s been double-booked before it goes out."
            bullets={[
              'Republish with the changes tracked',
              'Only affected drivers get re-notified',
              'Vehicle clashes flagged before publishing',
            ]}
            visual={
              <ShotFrame path="rosters" tight>
                <div className="mock-rows">
                  <div className="mock-row"><span className="nm">Roster republished</span><span className="meta">· 3 shifts changed</span><span className="st">v2</span></div>
                  <div className="mock-row"><span className="nm">Drivers notified</span><span className="meta">· 3 affected</span><span className="st">Sent</span></div>
                  <div className="mock-row"><span className="nm">Clash check</span><span className="meta">· 21-C-9920</span><span className="st pos">Clear</span></div>
                </div>
              </ShotFrame>
            }
          />
        </div>
      </section>

      <section className="sec-pad" id="more" style={{ background: 'var(--bg-1)', borderTop: '1px solid var(--line-1)', borderBottom: '1px solid var(--line-1)' }}>
        <div className="container">
          <SecHead kicker="Scheduling that sticks" title="Everything the weekly plan needs" />
          <IconGrid
            items={[
              { icon: 'calendar', title: 'Weekly rosters', body: 'Plan a whole week at a time with draft, published and archived states.' },
              { icon: 'users', title: 'Batch entry', body: 'Assign many drivers and cars at once instead of one by one.' },
              { icon: 'car', title: 'Vehicle assignment', body: 'Tie each shift to a specific car and catch clashes early.' },
              { icon: 'send', title: 'Publish & notify', body: 'Push and email the roster to every assigned driver in a click.' },
              { icon: 'repeat', title: 'Republish tracking', body: 'Update the plan with changes tracked and drivers re-notified.' },
              { icon: 'phone', title: 'Driver visibility', body: 'Every driver sees their upcoming shifts in the free app.' },
            ]}
          />
        </div>
      </section>

      <CtaBand
        title="Plan the week once — everyone’s in the loop."
        body="Start your 14-day free trial and publish your first roster this afternoon. No card required."
      />
    </FeatureShell>
  );
}
