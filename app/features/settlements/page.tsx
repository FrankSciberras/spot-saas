import FeatureShell from '@/components/marketing/feature/FeatureShell';
import ShotFrame from '@/components/marketing/feature/ShotFrame';
import { FeatureHero, SecHead, SplitRow, IconGrid, Stats, CtaBand } from '@/components/marketing/feature/Sections';
import { TRIAL_DAYS } from '@/lib/billing/plans';
import { marketingMetadata } from '@/lib/seo';

export const metadata = marketingMetadata({
  title: 'Weekly driver settlements — Rovora',
  description:
    'Rovora reconciles every driver’s week — gross fares, platform fees, tips, campaigns, cash and tax — into one clean, payable amount. Review, approve and pay in a single pass.',
  path: '/features/settlements',
  keywords: ['driver settlement software', 'taxi driver pay reconciliation', 'rideshare driver settlements', 'Uber Bolt driver pay'],
});

export default function SettlementsFeaturePage() {
  return (
    <FeatureShell>
      <FeatureHero
        eyebrow="Driver settlements"
        title="Weekly driver pay,"
        accent="reconciled in minutes."
        sub="Rovora does the maths for every driver — gross splits, platform fees, tips, campaigns, cash drops and tax — then hands you a clean, payable amount. Review, approve and run payouts in one pass."
        visual={
          <ShotFrame path="settlements">
            <div className="mock-top">
              <span className="mock-title">Settlements · week 22</span>
              <span className="mock-pill">● Ready to pay</span>
            </div>
            <div className="mock-cards">
              <div className="mock-card"><div className="k">Gross fares</div><div className="v">€9,420</div></div>
              <div className="mock-card"><div className="k">Platform fees</div><div className="v">€1,180</div></div>
              <div className="mock-card"><div className="k">Net to drivers</div><div className="v accent">€4,310</div></div>
              <div className="mock-card"><div className="k">Payable</div><div className="v pos">€4,118</div></div>
            </div>
            <div className="mock-rows">
              <div className="mock-row"><span className="av" /><span className="nm">A. Murphy</span><span className="meta">· wk 22</span><span className="amt">€1,284</span><span className="st">Payable</span></div>
              <div className="mock-row"><span className="av" /><span className="nm">J. Byrne</span><span className="meta">· wk 22</span><span className="amt">€1,107</span><span className="st">Payable</span></div>
              <div className="mock-row"><span className="av" /><span className="nm">S. Doyle</span><span className="meta">· wk 22</span><span className="amt">€642</span><span className="st idle">Review</span></div>
              <div className="mock-row"><span className="av" /><span className="nm">K. Walsh</span><span className="meta">· wk 22</span><span className="amt">€1,085</span><span className="st">Payable</span></div>
            </div>
          </ShotFrame>
        }
      />

      <Stats
        items={[
          { num: '6', unit: 'hrs', label: 'saved on payroll every week' },
          { num: '1', label: 'click to run driver payouts' },
          { num: '0', label: 'spreadsheets to maintain' },
          { num: '100', unit: '%', label: 'reconciled, every week' },
        ]}
      />

      <section className="sec-pad" id="how">
        <div className="container">
          <SecHead
            kicker="How settlements work"
            title="From raw earnings to a payable number"
            desc="Pull in the week’s earnings, let Rovora apply your split, add any adjustments, then approve. Every step is visible and editable — no black box."
          />

          <SplitRow
            icon="coins"
            title="Every euro accounted for"
            body="Rovora breaks down each driver’s week across every platform — gross fares, the fees Bolt and Uber take, tips, campaign bonuses and cash rides — and nets it to what you actually owe."
            bullets={[
              'Bolt, Uber and off-app earnings tracked separately',
              'Platform fees and tips handled per your scheme',
              'Cash drops netted against the balance automatically',
            ]}
            visual={
              <ShotFrame path="settlements/murphy" tight>
                <div className="mock-rows">
                  <div className="mock-row"><span className="nm">Gross fares</span><span className="meta">· Bolt + Uber</span><span className="amt">€1,640</span></div>
                  <div className="mock-row"><span className="nm">Platform fees</span><span className="meta">· −12%</span><span className="amt">−€197</span></div>
                  <div className="mock-row"><span className="nm">Tips</span><span className="meta">· kept 100%</span><span className="amt">€84</span></div>
                  <div className="mock-row"><span className="nm">Cash collected</span><span className="meta">· netted</span><span className="amt">−€240</span></div>
                  <div className="mock-row"><span className="nm">FSS tax</span><span className="meta">· deducted</span><span className="amt">−€71</span></div>
                </div>
              </ShotFrame>
            }
          />

          <SplitRow
            icon="check"
            flip
            title="Review, approve, pay — in one pass"
            body="Each settlement moves from draft to finalised to paid. Rovora flags anything that needs a second look, so you approve with confidence and run the whole week’s payouts together."
            bullets={[
              'Draft → finalised → paid, with a clear status on each',
              'Outliers flagged for review before you approve',
              'Approve the whole week in a single action',
            ]}
            visual={
              <ShotFrame path="settlements" tight>
                <div className="mock-rows">
                  <div className="mock-row"><span className="av" /><span className="nm">A. Murphy</span><span className="amt">€1,284</span><span className="st">Finalised</span></div>
                  <div className="mock-row"><span className="av" /><span className="nm">J. Byrne</span><span className="amt">€1,107</span><span className="st">Finalised</span></div>
                  <div className="mock-row"><span className="av" /><span className="nm">S. Doyle</span><span className="amt">€642</span><span className="st idle">Needs review</span></div>
                  <div className="mock-row"><span className="av" /><span className="nm">K. Walsh</span><span className="amt">€1,085</span><span className="st">Paid</span></div>
                </div>
              </ShotFrame>
            }
          />

          <SplitRow
            icon="file"
            title="Statements your accountant trusts"
            body="Every settlement exports to a clean, one-page-per-driver PDF — gross, fees, tips, adjustments, tax and final balance — ready for your records and the books."
            bullets={[
              'One-page-per-driver PDF, fully itemised',
              'Month-end summaries ready for bookkeeping',
              'A permanent, auditable record of every payout',
            ]}
            visual={
              <ShotFrame path="settlements/export" tight>
                <div className="mock-top">
                  <span className="mock-title">A. Murphy — week 22</span>
                  <span className="mock-pill">PDF</span>
                </div>
                <div className="mock-rows">
                  <div className="mock-row"><span className="nm">Net earnings</span><span className="amt">€1,355</span></div>
                  <div className="mock-row"><span className="nm">Adjustments</span><span className="meta">· fuel bonus</span><span className="amt">€40</span></div>
                  <div className="mock-row"><span className="nm">Deductions</span><span className="meta">· damage excess</span><span className="amt">−€40</span></div>
                  <div className="mock-row"><span className="nm">Final balance</span><span className="amt">€1,284</span><span className="st">Payable</span></div>
                </div>
              </ShotFrame>
            }
          />
        </div>
      </section>

      <section className="sec-pad" id="more" style={{ background: 'var(--bg-1)', borderTop: '1px solid var(--line-1)', borderBottom: '1px solid var(--line-1)' }}>
        <div className="container">
          <SecHead kicker="Built for the way fleets pay" title="Everything the weekly run needs" />
          <IconGrid
            items={[
              { icon: 'bolt', title: 'Multi-platform', body: 'Bolt, Uber and off-app earnings tracked and split independently — not lumped together.' },
              { icon: 'percent', title: 'Tax handled', body: 'FSS tax is deducted automatically so the payable figure is the real one.' },
              { icon: 'coins', title: 'Cash rides', body: 'Money collected in-car is netted against the driver’s balance, no manual maths.' },
              { icon: 'plusCircle', title: 'Adjustments-aware', body: 'Bonuses, expenses and deductions flow straight into the final balance.' },
              { icon: 'user', title: 'Per-driver splits', body: 'Each driver can run on their own share — Rovora applies the right scheme every time.' },
              { icon: 'shield', title: 'Fully auditable', body: 'Every settlement and change is recorded, so the numbers always add up.' },
            ]}
          />
        </div>
      </section>

      <CtaBand
        title="Give your weekly payroll back to the week."
        body={`Start your ${TRIAL_DAYS}-day free trial — no card, no lock-in. Run your first reconciled settlement this afternoon.`}
      />
    </FeatureShell>
  );
}
