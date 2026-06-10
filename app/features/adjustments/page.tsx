import type { Metadata } from 'next';
import FeatureShell from '@/components/marketing/feature/FeatureShell';
import ShotFrame from '@/components/marketing/feature/ShotFrame';
import { FeatureHero, SecHead, SplitRow, IconGrid, Stats, CtaBand } from '@/components/marketing/feature/Sections';

export const metadata: Metadata = {
  title: 'Adjustments, bonuses & deductions — Rovora',
  description:
    'Add bonuses, expenses, reimbursements and deductions to any driver’s week. Rovora folds them straight into the settlement balance and onto the payslip — no manual maths.',
};

export default function AdjustmentsFeaturePage() {
  return (
    <FeatureShell>
      <FeatureHero
        eyebrow="Adjustments"
        title="Bonuses and deductions,"
        accent="without the maths."
        sub="Real weeks are never clean. Add a fuel bonus, recover a damage excess, reimburse a car wash or apply a deduction — Rovora folds every adjustment straight into the driver’s settlement and onto their statement."
        visual={
          <ShotFrame path="adjustments">
            <div className="mock-top">
              <span className="mock-title">Adjustments · week 22</span>
              <span className="mock-pill">● Applied</span>
            </div>
            <div className="mock-rows">
              <div className="mock-row"><span className="av" /><span className="nm">A. Murphy</span><span className="meta">· fuel bonus</span><span className="amt pos">+€40</span></div>
              <div className="mock-row"><span className="av" /><span className="nm">A. Murphy</span><span className="meta">· damage excess</span><span className="amt">−€40</span></div>
              <div className="mock-row"><span className="av" /><span className="nm">J. Byrne</span><span className="meta">· car wash reimb.</span><span className="amt pos">+€15</span></div>
              <div className="mock-row"><span className="av" /><span className="nm">S. Doyle</span><span className="meta">· uniform</span><span className="amt">−€25</span></div>
            </div>
          </ShotFrame>
        }
      />

      <Stats
        items={[
          { num: '4', label: 'types: bonus, expense, reimbursement, deduction' },
          { num: '1', label: 'place every change lives' },
          { num: '0', label: 'side calculations to track' },
          { num: '100', unit: '%', label: 'reflected on the payslip' },
        ]}
      />

      <section className="sec-pad" id="how">
        <div className="container">
          <SecHead
            kicker="Anything the week throws up"
            title="Add it once, it lands everywhere"
            desc="Log an adjustment against a driver and a week, and Rovora does the rest — applying it to the balance and recording it on the statement and the audit trail."
          />

          <SplitRow
            icon="plusCircle"
            title="Add anything to the week"
            body="Bonuses for a big shift, an expense to reimburse, a deduction for a deposit or fine — capture it in seconds against the right driver and week. Positive or negative, Rovora handles both."
            bullets={[
              'Bonuses & reimbursements that add to pay',
              'Deductions for excesses, deposits and fines',
              'Notes on every line so the reason is never lost',
            ]}
            visual={
              <ShotFrame path="adjustments/new" tight>
                <div className="mock-cards">
                  <div className="mock-card"><div className="k">Bonuses</div><div className="v pos">+€120</div></div>
                  <div className="mock-card"><div className="k">Reimbursements</div><div className="v pos">+€55</div></div>
                  <div className="mock-card"><div className="k">Deductions</div><div className="v">−€80</div></div>
                </div>
              </ShotFrame>
            }
          />

          <SplitRow
            icon="repeat"
            flip
            title="Flows straight into the settlement"
            body="No re-keying, no separate sheet. Every adjustment is netted into the driver’s final balance the moment you save it, so the payable figure is always right."
            bullets={[
              'Applied to the settlement balance instantly',
              'The payable number always reflects reality',
              'Edit or remove an adjustment and the total follows',
            ]}
            visual={
              <ShotFrame path="settlements/murphy" tight>
                <div className="mock-rows">
                  <div className="mock-row"><span className="nm">Net earnings</span><span className="amt">€1,284</span></div>
                  <div className="mock-row"><span className="nm">Fuel bonus</span><span className="meta">· adjustment</span><span className="amt pos">+€40</span></div>
                  <div className="mock-row"><span className="nm">Damage excess</span><span className="meta">· adjustment</span><span className="amt">−€40</span></div>
                  <div className="mock-row"><span className="nm">Final balance</span><span className="amt">€1,284</span><span className="st">Payable</span></div>
                </div>
              </ShotFrame>
            }
          />

          <SplitRow
            icon="file"
            title="A clear trail, every time"
            body="Each adjustment shows on the driver’s PDF statement and in the audit log — so there are no surprises at payout and no awkward questions later."
            bullets={[
              'Itemised on the driver’s payslip',
              'Recorded in the audit log with who and when',
              'Drivers see exactly why their pay changed',
            ]}
            visual={
              <ShotFrame path="audit-log" tight>
                <div className="mock-rows">
                  <div className="mock-row"><span className="nm">Adjustment added</span><span className="meta">· Murphy · fuel bonus</span><span className="st">+€40</span></div>
                  <div className="mock-row"><span className="nm">Adjustment added</span><span className="meta">· Doyle · uniform</span><span className="st idle">−€25</span></div>
                  <div className="mock-row"><span className="nm">Settlement finalised</span><span className="meta">· week 22</span><span className="st">Done</span></div>
                </div>
              </ShotFrame>
            }
          />
        </div>
      </section>

      <section className="sec-pad" id="more" style={{ background: 'var(--bg-1)', borderTop: '1px solid var(--line-1)', borderBottom: '1px solid var(--line-1)' }}>
        <div className="container">
          <SecHead kicker="Small things, handled" title="Every line of the week, accounted for" />
          <IconGrid
            items={[
              { icon: 'plusCircle', title: 'Bonuses', body: 'Reward a big week or a tough shift — added straight to pay.' },
              { icon: 'coins', title: 'Expenses', body: 'Log costs a driver covered so they’re paid back correctly.' },
              { icon: 'repeat', title: 'Reimbursements', body: 'Car washes, tolls, sundries — returned without a spreadsheet.' },
              { icon: 'minusCircle', title: 'Deductions', body: 'Deposits, excesses and fines recovered cleanly over time.' },
              { icon: 'check', title: 'Auto-applied', body: 'Netted into the settlement the second you save it.' },
              { icon: 'shield', title: 'On the record', body: 'Itemised on the payslip and logged in the audit trail.' },
            ]}
          />
        </div>
      </section>

      <CtaBand
        title="Never chase a missing €40 again."
        body="Start your 14-day free trial and keep every bonus and deduction where it belongs — in the settlement."
      />
    </FeatureShell>
  );
}
