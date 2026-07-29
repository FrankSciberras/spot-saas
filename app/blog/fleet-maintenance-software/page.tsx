import Link from 'next/link';
import BlogLayout from '@/components/marketing/blog/BlogLayout';
import { getPost, postMetadata } from '@/components/marketing/blog/posts';

const post = getPost('fleet-maintenance-software');
export const metadata = postMetadata(post);

export default function Page() {
  return (
    <BlogLayout
      post={post}
      sections={[
        {
          id: 'what-it-does',
          heading: 'What fleet maintenance software actually does',
          body: (
            <>
              <p>
                Strip away the brochures and <strong>fleet maintenance software</strong> does four
                unglamorous things: it remembers every service each vehicle is due, it warns you
                before the due date rather than after, it stores what was done and what it cost, and
                it turns that history into a cost-per-vehicle number you can act on.
              </p>
              <p>
                That sounds like a calendar with reminders. The difference is that a calendar has no
                idea your Passat did 4,000 km last month while your Corolla did 900. A proper{' '}
                <strong>fleet maintenance system</strong> triggers on the thing that actually wears a
                car out — distance — and only falls back to dates for the jobs that genuinely are
                time-based, like an annual inspection.
              </p>
              <p>
                Most tools sold as <strong>vehicle maintenance software</strong> were built for
                workshops managing customer cars, or for haulage firms with 200 trucks and a
                full-time fleet engineer. Neither shape fits a 15-car cab fleet where the
                &ldquo;maintenance department&rdquo; is the owner and a WhatsApp thread with a
                trusted garage.
              </p>
            </>
          ),
        },
        {
          id: 'reactive-vs-preventive',
          heading: 'Reactive vs preventive: where the money actually goes',
          body: (
            <>
              <p>
                Most small fleets run reactive maintenance without ever deciding to. The car makes a
                noise, the driver reports it, the car goes in. It feels cheap because you only spend
                when something is wrong. The bill arrives elsewhere:
              </p>
              <ul>
                <li>
                  <strong>Downtime.</strong> An unplanned repair takes a car off the road on a day
                  you had a driver rostered. A vehicle earning €120 a day that sits in a workshop for
                  three days costs €360 in lost revenue before the invoice.
                </li>
                <li>
                  <strong>Escalation.</strong> A €60 oil service skipped twice becomes a €1,400
                  engine job. Brake pads left to grind take the discs with them.
                </li>
                <li>
                  <strong>Emergency pricing.</strong> Booked work gets the garage&rsquo;s normal
                  rate. &ldquo;Can you look at it today?&rdquo; does not.
                </li>
                <li>
                  <strong>Resale.</strong> A car with a complete, dated service history sells for
                  meaningfully more than an identical car with a shoebox of receipts.
                </li>
              </ul>
              <p>
                Preventive maintenance is not about servicing more often — it&rsquo;s about servicing{' '}
                <em>on schedule instead of on symptom</em>. The schedule is the whole product. Software
                just makes the schedule impossible to forget.
              </p>
              <p>
                The honest caveat: preventive maintenance does not reduce your annual servicing spend.
                It usually raises it slightly, while cutting the unplanned repairs and downtime that
                cost multiples more. If a vendor promises lower total maintenance costs in year one,
                read that claim carefully.
              </p>
            </>
          ),
        },
        {
          id: 'mileage-not-memory',
          heading: 'Service by mileage, not by memory',
          body: (
            <>
              <p>
                The reason most maintenance schedules quietly fail is that nobody knows current
                mileage. The odometer reading lives in the car, and the car is out with a driver. So
                the schedule drifts to &ldquo;roughly every six months&rdquo;, which under-services
                the busy cars and over-services the quiet ones.
              </p>
              <p>
                The fix is to capture mileage as a by-product of work that already happens. When a
                driver clocks in for a shift with a photo check-in that captures the odometer, the
                car&rsquo;s mileage updates itself several times a week without anybody being asked to
                do admin. From there the maths is trivial: if the car is at 138,400 km and the next
                service is due at 140,000, you know it is roughly two weeks away and can book it on a
                day the roster can absorb.
              </p>
              <p>
                That is the whole trick, and it is why maintenance works best inside the same{' '}
                <strong>fleet management system</strong> as your shifts and tracking rather than as a
                standalone app. Rovora ties{' '}
                <Link href="/features/maintenance">maintenance &amp; services</Link> to the mileage
                coming off <Link href="/features/live-tracking">shift check-ins</Link>, so due dates
                keep themselves current. See{' '}
                <Link href="/blog/fleet-tracking-without-gps-hardware">
                  fleet tracking without GPS hardware
                </Link>{' '}
                for how that mileage gets captured without fitting a device.
              </p>
            </>
          ),
        },
        {
          id: 'cost-per-km',
          heading: 'The number that tells you when to sell a car',
          body: (
            <>
              <p>
                Every operator has an opinion about which car is the money pit. Very few can prove
                it, because the evidence is spread across two years of garage invoices.
              </p>
              <p>
                Log every job against the vehicle with its cost and the mileage at the time, and one
                number falls out: <strong>maintenance cost per kilometre</strong>. Run it per car and
                the fleet sorts itself into a league table. A car creeping from €0.04/km to €0.11/km
                over eighteen months is telling you something a gut feeling cannot.
              </p>
              <p>
                Put next to revenue per vehicle, this is the replacement decision made with numbers
                instead of feelings — and it is the single report that justifies the software on its
                own. A car kept twelve months too long can burn more than a year of subscription
                costs in repairs alone.
              </p>
            </>
          ),
        },
        {
          id: 'choosing',
          heading: 'Choosing a system you’ll still be using in month three',
          body: (
            <>
              <p>
                Small fleets abandon maintenance tools for predictable reasons. The tool demanded
                data entry nobody had time for, or it was priced and designed for a fleet ten times
                the size. Things worth checking:
              </p>
              <ul>
                <li>
                  <strong>Does mileage update itself?</strong> If someone must type odometer readings
                  weekly, the schedule will be wrong within a month. This is the question that
                  actually predicts whether you keep using it.
                </li>
                <li>
                  <strong>Does it alert before, not after?</strong> Alerts should arrive weeks ahead,
                  by push and email — early enough to book the work into a gap in the roster.
                </li>
                <li>
                  <strong>Do services and documents live together?</strong> Insurance renewals,
                  permits and inspections expire on their own dates. One expiry system for all of it
                  beats a second tool (see <Link href="/features/vehicles">vehicle management</Link>).
                </li>
                <li>
                  <strong>Is damage part of the record?</strong> Kerbed wheels and scratches logged
                  against a shift stop becoming your cost at resale (
                  <Link href="/features/damage">damage &amp; repairs</Link>).
                </li>
                <li>
                  <strong>Can you export and leave?</strong> Service history is your asset. If it
                  cannot leave in a spreadsheet, it is not really yours.
                </li>
                <li>
                  <strong>Is it priced for your size?</strong> Enterprise fleet software assumes a
                  fleet engineer, a workshop module and parts inventory. Useful at 200 vehicles,
                  dead weight at 15.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'getting-started',
          heading: 'Starting without a data-entry marathon',
          body: (
            <>
              <p>
                Do not back-fill years of history — it is the most common reason a rollout stalls.
                Enter each vehicle with its current mileage, its next service interval, and the
                expiry dates already on your documents. For a 15-car fleet that is an afternoon, and
                from that point the record builds itself as jobs happen.
              </p>
              <p>
                Rovora includes maintenance on every plan rather than as a paid add-on, with service
                triggers by both kilometres and date, and alerts that reach you before the due date.
                If you are still running services off a spreadsheet and a calendar, the honest next
                read is{' '}
                <Link href="/blog/spreadsheets-vs-fleet-management-software">
                  spreadsheets vs fleet management software
                </Link>{' '}
                — maintenance is usually the first thing a sheet stops being able to do safely.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
