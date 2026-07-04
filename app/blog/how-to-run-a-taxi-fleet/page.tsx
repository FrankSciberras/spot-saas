import Link from 'next/link';
import BlogLayout from '@/components/marketing/blog/BlogLayout';
import { getPost, postMetadata } from '@/components/marketing/blog/posts';

const post = getPost('how-to-run-a-taxi-fleet');
export const metadata = postMetadata(post);

export default function Page() {
  return (
    <BlogLayout
      post={post}
      sections={[
        {
          id: 'five-businesses',
          heading: 'You’re running five businesses at once',
          body: (
            <>
              <p>
                A taxi or rideshare fleet looks simple from the outside — cars pick people up, money
                comes in. From the inside, an operator with 15 cars is simultaneously running:
              </p>
              <ul>
                <li>a <strong>vehicle business</strong> — buying, insuring, maintaining and eventually replacing cars;</li>
                <li>a <strong>staffing business</strong> — recruiting drivers, planning shifts, covering no-shows;</li>
                <li>a <strong>compliance business</strong> — licences, permits, insurance and inspections that all expire on different dates;</li>
                <li>a <strong>payroll business</strong> — turning platform statements, cash and tips into correct weekly pay;</li>
                <li>a <strong>data business</strong> — knowing which cars and drivers actually make money.</li>
              </ul>
              <p>
                Most operators are excellent at one or two of these and improvise the rest. The guide
                below goes through each, with the habits that separate calm fleets from chaotic ones.
              </p>
            </>
          ),
        },
        {
          id: 'vehicles-compliance',
          heading: 'Vehicles & compliance: one profile per car',
          body: (
            <>
              <p>
                The foundational habit is boring: <strong>every vehicle gets one complete record</strong> —
                registration, insurance policy and renewal date, permit or licence numbers, inspection
                dates, current mileage, assigned drivers and open defects. Not spread across a
                glovebox, a folder and three group chats. One record.
              </p>
              <p>
                Why it matters: the most expensive failures in this business are silent. An expired
                permit doesn&rsquo;t make a noise — it just voids your insurance the day something
                else goes wrong. Fleets that get this right set{' '}
                <strong>alerts weeks before every expiry</strong>, so renewals become a to-do list
                instead of an emergency. (This is exactly what{' '}
                <Link href="/features/vehicles">vehicle management</Link> in Rovora does — with
                expiry alerts built in.)
              </p>
              <p>
                Maintenance follows the same logic: service by <strong>mileage, not memory</strong>.
                If you know each car&rsquo;s live mileage, the system can tell you a service is due
                before the engine does. Track every job and its cost per car and you&rsquo;ll also
                know — with numbers, not feelings — when a car costs more to keep than to replace.
                See <Link href="/features/maintenance">maintenance &amp; services</Link>.
              </p>
            </>
          ),
        },
        {
          id: 'drivers-shifts',
          heading: 'Drivers & shifts: publish the week, don’t whisper it',
          body: (
            <>
              <p>
                Driver drama usually isn&rsquo;t about personalities — it&rsquo;s about ambiguity.
                Who has the car on Saturday? Was I supposed to start at 6 or at 14? Ambiguity breeds
                arguments, and arguments breed turnover.
              </p>
              <p>The fix is a published roster:</p>
              <ul>
                <li>Plan the week in advance — every driver, every car, every day.</li>
                <li>Publish it somewhere drivers can&rsquo;t claim they didn&rsquo;t see — push notification and email, not a message lost in a group chat.</li>
                <li>When it changes, republish with a visible trail.</li>
              </ul>
              <p>
                Pair the roster with clean shift records — clock-in, clock-out, mileage at each end —
                and you get a second prize: the data that makes payroll and per-driver profitability
                automatic. <Link href="/features/rosters">Rosters &amp; shifts</Link> plus a photo
                check-in (which doubles as a{' '}
                <Link href="/features/damage">damage record</Link>) covers both.
              </p>
            </>
          ),
        },
        {
          id: 'money',
          heading: 'Money: the settlement is the business',
          body: (
            <>
              <p>
                Every week, each driver&rsquo;s work becomes a pile of numbers: gross fares per
                platform, platform commissions, tips, bonus campaigns, cash collected, fuel card
                spend, car rent, deductions. Reconciling that pile into one payable figure is called
                a <strong>settlement</strong> — and doing it fast and correctly is the single
                strongest predictor of whether a fleet feels professional.
              </p>
              <p>
                Done in a spreadsheet, settlements consume most of an operator&rsquo;s Monday and
                still produce disputes. Done in software, the platform statements, shift data and
                pay scheme meet automatically, and the driver gets a payslip that explains itself.
                We wrote a full guide:{' '}
                <Link href="/blog/driver-settlements-explained">driver settlements explained</Link>.
              </p>
            </>
          ),
        },
        {
          id: 'kpis',
          heading: 'The five numbers to watch',
          body: (
            <>
              <p>You don&rsquo;t need a BI team. Five numbers, weekly, per car and per driver:</p>
              <ul>
                <li><strong>Revenue per vehicle</strong> — your league table; it exposes underused cars instantly.</li>
                <li><strong>Utilisation</strong> — hours on shift vs hours available. An idle car still costs insurance and depreciation.</li>
                <li><strong>Maintenance cost per km</strong> — the early-warning light for cars due replacement.</li>
                <li><strong>Driver earnings per hour</strong> — low earners churn; spot them before they quit.</li>
                <li><strong>Settlement turnaround</strong> — days from week-end to driver paid. Under two is professional.</li>
              </ul>
              <p>
                If your current setup can&rsquo;t produce these without an evening of copy-paste,
                that&rsquo;s the clearest sign you&rsquo;ve outgrown it — see{' '}
                <Link href="/blog/spreadsheets-vs-fleet-management-software">
                  spreadsheets vs fleet software
                </Link>.
              </p>
            </>
          ),
        },
        {
          id: 'tooling',
          heading: 'Tooling: one system beats five apps',
          body: (
            <>
              <p>
                The failure mode isn&rsquo;t having no tools — it&rsquo;s having six that don&rsquo;t
                talk to each other: a tracking app, a spreadsheet for pay, a calendar for services, a
                drawer for documents and WhatsApp for everything else. Every gap between tools is a
                place where money leaks and facts get disputed.
              </p>
              <p>
                Whatever software you choose, insist that vehicles, drivers, shifts,{' '}
                <Link href="/features/live-tracking">tracking</Link> and{' '}
                <Link href="/features/settlements">pay</Link> live in <strong>one system</strong>,
                that drivers get their own app, and that you can leave with your data. Rovora was
                built for exactly this shape of business — fleets of 5 to 50 vehicles that want one
                calm dashboard instead of five apps. The free trial takes an afternoon to set up.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
