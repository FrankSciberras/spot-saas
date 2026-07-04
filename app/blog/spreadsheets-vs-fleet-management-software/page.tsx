import Link from 'next/link';
import BlogLayout from '@/components/marketing/blog/BlogLayout';
import { getPost, postMetadata } from '@/components/marketing/blog/posts';

const post = getPost('spreadsheets-vs-fleet-management-software');
export const metadata = postMetadata(post);

export default function Page() {
  return (
    <BlogLayout
      post={post}
      sections={[
        {
          id: 'in-defence',
          heading: 'In defence of the spreadsheet',
          body: (
            <>
              <p>
                Let&rsquo;s be fair: the spreadsheet got you here. With three cars, a sheet with a
                tab per driver is genuinely the right tool — free, flexible, and you understand
                every cell because you built it. Anyone who tells a three-car operator to buy
                software is selling something.
              </p>
              <p>
                The problem is that fleets grow gradually, and spreadsheets fail gradually. There
                was no day the sheet broke — just a slow slide into Monday evenings that run to
                midnight, formulas only you understand, and numbers nobody fully trusts.
              </p>
            </>
          ),
        },
        {
          id: 'warning-signs',
          heading: 'Six signs the spreadsheet is now costing you money',
          body: (
            <>
              <ul>
                <li>
                  <strong>Payroll takes more than two hours.</strong> Copying platform statements
                  into cells and chasing cash figures across 10+ drivers eats half a working day,
                  every week — that&rsquo;s a part-time salary spent on typing.
                </li>
                <li>
                  <strong>Drivers dispute their pay.</strong> When pay comes from a formula nobody
                  can inspect, every payday is a negotiation. Disputes aren&rsquo;t a driver
                  problem; they&rsquo;re a transparency problem.
                </li>
                <li>
                  <strong>An expiry caught you by surprise.</strong> A conditional-format cell
                  can&rsquo;t call you. If an insurance renewal, permit or inspection has ever
                  slipped past the sheet, you&rsquo;ve already paid the software subscription — as a
                  fine, or worse.
                </li>
                <li>
                  <strong>You learn about damage at resale time.</strong> Scratches and kerbed wheels
                  that nobody logged become your cost by default, because there&rsquo;s no
                  photo trail tying the car&rsquo;s condition to a shift.
                </li>
                <li>
                  <strong>Only one person can operate the sheet.</strong> If pay stops when
                  you&rsquo;re on holiday, you don&rsquo;t have a system — you have a hostage
                  situation with yourself as the hostage.
                </li>
                <li>
                  <strong>You can&rsquo;t answer &ldquo;which car makes money?&rdquo;</strong> The
                  data exists, scattered across tabs — but assembling revenue minus maintenance per
                  vehicle would take an evening, so the answer is really &ldquo;no&rdquo;.
                </li>
              </ul>
              <p>Two or more of those, and the free tool is the most expensive one you own.</p>
            </>
          ),
        },
        {
          id: 'what-changes',
          heading: 'What actually changes with fleet software',
          body: (
            <>
              <p>
                Fleet management software is not a prettier spreadsheet. The difference is that data
                enters the system <strong>once, at the source, with context</strong>:
              </p>
              <ul>
                <li>
                  A driver&rsquo;s clock-in creates the shift, updates the car&rsquo;s mileage and
                  captures its condition — via a photo check-in, not an honesty box (
                  <Link href="/features/live-tracking">live tracking</Link>,{' '}
                  <Link href="/features/damage">damage &amp; repairs</Link>).
                </li>
                <li>
                  Documents carry their own expiry dates and{' '}
                  <strong>alert you weeks ahead</strong> (
                  <Link href="/features/vehicles">vehicle management</Link>).
                </li>
                <li>
                  Services trigger by mileage, automatically (
                  <Link href="/features/maintenance">maintenance</Link>).
                </li>
                <li>
                  Weekly pay assembles itself from shifts, platform data and each driver&rsquo;s pay
                  scheme — you review and approve instead of computing (
                  <Link href="/features/settlements">settlements</Link>,{' '}
                  <Link href="/features/flexible-pay">flexible pay</Link>).
                </li>
              </ul>
              <p>
                The output isn&rsquo;t just saved hours. It&rsquo;s that the numbers become{' '}
                <strong>defensible</strong> — a driver questioning their payslip can see the same
                shift data you can, which is why disputes mostly evaporate.
              </p>
            </>
          ),
        },
        {
          id: 'switching',
          heading: 'Switching without the drama',
          body: (
            <>
              <p>
                The switch fails when operators try to migrate three years of history first.
                Don&rsquo;t. Pick a Monday, start the new week in the new system, and keep the old
                sheet as read-only archive. You need four things entered: vehicles with their
                document dates, drivers, this week&rsquo;s roster, and each driver&rsquo;s pay
                scheme. For a 15-car fleet that&rsquo;s an afternoon.
              </p>
              <p>
                Run one settlement cycle in parallel with the sheet if it calms your nerves — most
                operators don&rsquo;t bother after seeing the first week reconcile itself. Rovora&rsquo;s
                free trial needs no card, and there&rsquo;s a guided setup that walks you through
                exactly the four lists above. If you want the bigger picture first, start with{' '}
                <Link href="/blog/how-to-run-a-taxi-fleet">how to run a taxi fleet</Link>.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
