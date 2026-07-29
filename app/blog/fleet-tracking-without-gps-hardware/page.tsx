import Link from 'next/link';
import BlogLayout from '@/components/marketing/blog/BlogLayout';
import { getPost, postMetadata } from '@/components/marketing/blog/posts';

const post = getPost('fleet-tracking-without-gps-hardware');
export const metadata = postMetadata(post);

export default function Page() {
  return (
    <BlogLayout
      post={post}
      sections={[
        {
          id: 'why-hardware-ruled',
          heading: 'Why fleet GPS tracking meant a device in every car',
          body: (
            <>
              <p>
                For two decades, <strong>fleet tracking</strong> meant one thing: a{' '}
                <strong>fleet tracking device</strong> hardwired behind every dashboard, a SIM card in
                each one, and a monthly fee per vehicle to see dots on a map. For haulage companies
                with 40-tonne trucks crossing borders, that made sense — the asset is expensive, the
                routes are long, and theft is a real risk.
              </p>
              <p>
                But most taxi and rideshare fleets copied that model without asking whether it fits.
                A 15-car cab fleet doesn&rsquo;t have a theft problem — it has a{' '}
                <strong>visibility problem</strong>: who is on shift right now, which car are they
                in, how long have they been out, and what did the car&rsquo;s mileage do this week?
                That is fleet monitoring in the sense operators actually need it, and a dot on a map
                answers only the first half of it.
              </p>
              <p>
                Answering those questions with conventional <strong>fleet GPS tracking</strong> is
                expensive overkill:
              </p>
              <ul>
                <li><strong>Purchase cost</strong> — €80–€250 per tracker, per car.</li>
                <li><strong>Installation</strong> — €50–€100 per vehicle, plus a morning off the road.</li>
                <li><strong>Subscriptions</strong> — €8–€25 per vehicle per month, forever.</li>
                <li><strong>Maintenance</strong> — failed units, flat batteries, re-installs when you change cars.</li>
              </ul>
              <p>
                For a 15-vehicle fleet that&rsquo;s easily €2,000–€4,000 up front and another
                €1,500–€4,500 every year — to answer questions your drivers&rsquo; phones could
                already answer.
              </p>
            </>
          ),
        },
        {
          id: 'how-hardware-free-works',
          heading: 'How hardware-free fleet tracking works',
          body: (
            <>
              <p>
                Hardware-free tracking uses the one device every driver already carries: their phone.
                Instead of wiring a box into the car, the driver runs an app tied to their shift.
                The flow looks like this:
              </p>
              <ul>
                <li>
                  <strong>Clock-in starts the trail.</strong> The driver starts their shift in the
                  app — in Rovora&rsquo;s case with a photo check-in that also captures the
                  odometer, so mileage updates itself. See{' '}
                  <Link href="/features/live-tracking">live driver tracking</Link>.
                </li>
                <li>
                  <strong>Location follows the shift, not the person.</strong> While on shift, the
                  app shares position so the operator sees every active driver on one live map. Off
                  shift, tracking stops — which drivers strongly prefer, and which keeps you on the
                  right side of GDPR.
                </li>
                <li>
                  <strong>The shift record does the paperwork.</strong> Hours, mileage and earnings
                  attach to the shift automatically, feeding{' '}
                  <Link href="/features/settlements">weekly settlements</Link> without anyone
                  retyping numbers.
                </li>
              </ul>
              <p>
                The mental shift is from <em>tracking vehicles</em> to <em>tracking work</em>. A dot
                on a map is only useful because of what it tells you about the shift — and a
                shift-based system captures that context natively.
              </p>
            </>
          ),
        },
        {
          id: 'cost-comparison',
          heading: 'The cost comparison, honestly',
          body: (
            <>
              <p>Take a typical 15-vehicle cab fleet over three years:</p>
              <ul>
                <li>
                  <strong>Hardware trackers:</strong> ~€2,500 purchase + ~€1,000 installation +
                  ~€2,700/year in subscriptions ≈ <strong>€11,600 over three years</strong> — and
                  that buys location only. Driver pay, maintenance and compliance still live
                  somewhere else.
                </li>
                <li>
                  <strong>Phone-based tracking inside fleet software:</strong> €0 hardware, €0
                  installation, and the tracking is bundled with the tools you actually run the
                  business on — settlements, rosters, maintenance and document alerts.
                </li>
              </ul>
              <p>
                The honest caveat: phone tracking depends on the driver&rsquo;s phone being on and
                the app running. For a workforce you pay weekly, that&rsquo;s a manageable policy
                question — clocking in is how drivers get paid, so adoption takes care of itself.
              </p>
            </>
          ),
        },
        {
          id: 'when-hardware-still-wins',
          heading: 'When a hardwired tracker still makes sense',
          body: (
            <>
              <p>Hardware-free isn&rsquo;t a religion. A wired GPS unit is still the right call when:</p>
              <ul>
                <li><strong>Theft recovery is the goal</strong> — a hidden unit works when the phone left with the thief.</li>
                <li><strong>Vehicles run unmanned</strong> — trailers, plant, rental cars between hires.</li>
                <li><strong>You need engine-level telematics</strong> — CAN-bus data like fuel burn and fault codes.</li>
              </ul>
              <p>
                If you run taxis, chauffeur cars or rideshare vehicles with drivers you pay every
                week, none of those usually apply. You&rsquo;re paying hardware prices for a software
                problem.
              </p>
            </>
          ),
        },
        {
          id: 'solutions-compared',
          heading: 'The three fleet tracking solutions, compared',
          body: (
            <>
              <p>
                Strip the marketing away and there are only three <strong>fleet tracking solutions</strong>{' '}
                on the market. Picking between them is mostly a question of what you need to know, not
                how much you want to spend.
              </p>
              <ul>
                <li>
                  <strong>Hardwired trackers.</strong> A unit spliced into the loom, hidden and always
                  on. Best-in-class for theft recovery and the only option for unmanned assets. Costs
                  most, takes each car off the road to fit, and tells you nothing about who was
                  driving or what they earned.
                </li>
                <li>
                  <strong>OBD plug-in dongles.</strong> Cheaper and self-install, pulling engine data
                  from the diagnostic port. The catch is that they are trivially unplugged, and on
                  cars shared between drivers they often are. Good for engine diagnostics, weak as an
                  attendance record.
                </li>
                <li>
                  <strong>Shift-based tracking inside fleet tracking software.</strong> The driver
                  clocks in on their phone and location follows the shift. No device to buy, and the
                  location data arrives already attached to a driver, a vehicle and a pay period —
                  which is what makes it useful on a Monday morning.
                </li>
              </ul>
              <p>
                For <strong>small fleet tracking</strong> — say 5 to 50 vehicles with drivers you pay
                weekly — the third option wins on both cost and usefulness, because the question you
                ask daily is &ldquo;who is working and what did they earn?&rdquo; rather than
                &ldquo;where is my asset?&rdquo;. The trap is buying a{' '}
                <strong>fleet tracking system</strong> that only answers the second question, then
                still doing pay and maintenance by hand.
              </p>
            </>
          ),
        },
        {
          id: 'getting-started',
          heading: 'Getting started without ripping anything out',
          body: (
            <>
              <p>
                You don&rsquo;t have to cancel tracker contracts on day one. Fleets usually switch in
                stages: start with shift tracking on phones, run both for a billing cycle, then let
                the hardware subscriptions lapse as they come up for renewal.
              </p>
              <p>
                Rovora&rsquo;s <Link href="/features/live-tracking">live tracking</Link> is included
                on every plan — no boxes, no installers, no per-tracker fees. Drivers get a free app,
                you get the live map, and the same shift data flows straight into{' '}
                <Link href="/features/settlements">driver settlements</Link>. If you&rsquo;re
                weighing it against spreadsheets, read{' '}
                <Link href="/blog/spreadsheets-vs-fleet-management-software">
                  spreadsheets vs fleet management software
                </Link>{' '}
                next.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
