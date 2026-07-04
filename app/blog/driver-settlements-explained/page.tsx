import Link from 'next/link';
import BlogLayout from '@/components/marketing/blog/BlogLayout';
import { getPost, postMetadata } from '@/components/marketing/blog/posts';

const post = getPost('driver-settlements-explained');
export const metadata = postMetadata(post);

export default function Page() {
  return (
    <BlogLayout
      post={post}
      sections={[
        {
          id: 'what-is-a-settlement',
          heading: 'What a driver settlement actually is',
          body: (
            <>
              <p>
                A settlement is the weekly reconciliation of everything a driver earned and owes,
                reduced to one number: what you pay them (or occasionally, what they owe you). In a
                fleet running on Uber, Bolt or FreeNow, that means merging money that arrives in
                three different shapes:
              </p>
              <ul>
                <li><strong>Platform money</strong> — gross fares, minus each platform&rsquo;s commission, plus tips and bonus campaigns, per platform.</li>
                <li><strong>Cash</strong> — street fares and cash trips the driver already has in their pocket.</li>
                <li><strong>Fleet-side items</strong> — car rent, fuel cards, damage deductions, advances, bonuses.</li>
              </ul>
              <p>
                Every fleet computes some version of this. The difference between professional and
                chaotic fleets is whether it&rsquo;s computed <strong>systematically</strong> — same
                rules, every driver, every week — or reinvented each Monday in a spreadsheet.
              </p>
            </>
          ),
        },
        {
          id: 'the-inputs',
          heading: 'The inputs: where the numbers come from',
          body: (
            <>
              <p>A clean settlement starts with clean inputs, gathered per driver per week:</p>
              <ul>
                <li>
                  <strong>Platform statements.</strong> Uber, Bolt and FreeNow each report gross
                  fares, their commission, tips and campaign bonuses — on their own schedules, in
                  their own formats. Keep them separated by platform in your records; blended
                  totals make errors undiscoverable.
                </li>
                <li>
                  <strong>Shift data.</strong> Hours worked and kilometres driven, from clock-in to
                  clock-out. This is what makes per-hour and per-km sanity checks possible — and
                  it&rsquo;s free if drivers already clock in through an app (
                  <Link href="/features/live-tracking">live tracking</Link>).
                </li>
                <li>
                  <strong>Cash declared.</strong> The driver&rsquo;s cash takings, declared per
                  shift, not reconstructed from memory a week later.
                </li>
                <li>
                  <strong>Standing items.</strong> Weekly car rent, fuel card bills, repayment
                  instalments — the recurring lines that should never depend on anyone remembering
                  them (<Link href="/features/adjustments">adjustments</Link>).
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'pay-schemes',
          heading: 'Pay schemes: the rules of the split',
          body: (
            <>
              <p>
                On top of the inputs sits the <strong>pay scheme</strong> — the agreement that says
                how the pot divides. Common shapes in taxi and rideshare fleets:
              </p>
              <ul>
                <li><strong>Percentage split</strong> — driver keeps, say, 40–60% of net fares; the split may differ for tips (often 100% to the driver) and campaigns.</li>
                <li><strong>Rent model</strong> — driver keeps everything but pays a fixed weekly rent for the car.</li>
                <li><strong>Hybrids</strong> — a lower split plus reduced rent, guarantees for new drivers, different rates per platform.</li>
              </ul>
              <p>
                Two rules keep schemes from becoming a source of warfare. First,{' '}
                <strong>write the scheme down per driver</strong> — &ldquo;the usual deal&rdquo; is
                not a contract. Second, <strong>apply it mechanically</strong>. The moment a split
                is negotiated per-week, every week becomes a negotiation. In Rovora, schemes are
                saved as presets and assigned per driver, so the same rules run every settlement
                automatically (<Link href="/features/flexible-pay">flexible pay</Link>).
              </p>
            </>
          ),
        },
        {
          id: 'worked-example',
          heading: 'A worked example',
          body: (
            <>
              <p>Take a driver on a 50% net-fare split, 100% of tips, €0 rent, one week:</p>
              <ul>
                <li>Uber: €820 gross fares, €205 commission, €38 tips → net fares €615</li>
                <li>Bolt: €540 gross fares, €135 commission, €22 tips → net fares €405</li>
                <li>Cash trips: €180 (already in the driver&rsquo;s pocket)</li>
                <li>Fuel card: €95 · Damage deduction agreed: €40</li>
              </ul>
              <p>
                Driver&rsquo;s share: 50% × (615 + 405 + 180) = €600, plus €60 tips = <strong>€660
                earned</strong>. They already hold €180 cash, and owe €95 fuel + €40 damage. Payout:
                660 − 180 − 95 − 40 = <strong>€345</strong>.
              </p>
              <p>
                Nothing here is hard maths. It&rsquo;s <em>bookkeeping under time pressure, ×15
                drivers, ×52 weeks</em> — which is why it&rsquo;s where fleets most often leak money
                and goodwill. The payslip should show every line above, so the driver can verify it
                in thirty seconds (<Link href="/features/settlements">weekly settlements</Link>).
              </p>
            </>
          ),
        },
        {
          id: 'common-mistakes',
          heading: 'The five classic mistakes',
          body: (
            <>
              <ul>
                <li><strong>Splitting gross instead of net</strong> (or vice versa) — be explicit about whether commission comes out before the split; this is the #1 source of disputes.</li>
                <li><strong>Blending platforms</strong> — one merged total means a platform&rsquo;s reporting error silently becomes your error.</li>
                <li><strong>Forgetting standing deductions</strong> — un-invoiced fuel weeks and skipped rent, discovered months later, are unrecoverable in practice.</li>
                <li><strong>Settling from memory-cash</strong> — cash declared at shift end is data; cash recalled on Friday is fiction.</li>
                <li><strong>Paying without a payslip</strong> — a bank transfer with no breakdown converts every rounding doubt into a dispute.</li>
              </ul>
              <p>
                If reading that list felt uncomfortably familiar, the fix isn&rsquo;t more
                discipline — it&rsquo;s a system where the discipline is built in. That&rsquo;s the
                case we make in{' '}
                <Link href="/blog/spreadsheets-vs-fleet-management-software">
                  spreadsheets vs fleet management software
                </Link>.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
