import Link from 'next/link';
import BlogLayout from '@/components/marketing/blog/BlogLayout';
import { getPost, postMetadata } from '@/components/marketing/blog/posts';

const post = getPost('fleet-management-software-malta');
export const metadata = postMetadata(post);

export default function Page() {
  return (
    <BlogLayout
      post={post}
      sections={[
        {
          id: 'malta-market',
          heading: 'The Maltese fleet business has changed shape',
          body: (
            <>
              <p>
                Ten years ago a Maltese cab operation was a family garage with a phone number.
                Then ride-hailing arrived — Bolt, Uber and local players competing for the same
                riders — and the economics flipped. Today a typical operator runs 5 to 50 Y-plate
                vehicles with drivers working across multiple platforms at once, often around the
                clock in season.
              </p>
              <p>
                That shift quietly turned garage owners into fleet managers: multi-platform
                settlements every week, insurance and licensing paperwork per vehicle, drivers on
                rotating shifts, and cars that never cool down between them. The tooling most
                operators use — a spreadsheet and WhatsApp — hasn&rsquo;t caught up with the
                business they now actually run.
              </p>
            </>
          ),
        },
        {
          id: 'what-matters-locally',
          heading: 'What matters in software, seen from Malta',
          body: (
            <>
              <p>
                Most fleet software is built for American trucking or UK van fleets. Evaluating it
                from a Maltese ride-hailing operation, the priorities look different:
              </p>
              <ul>
                <li>
                  <strong>Multi-platform driver settlements.</strong> Your drivers earn on Bolt and
                  Uber in the same week, plus cash. If the software can&rsquo;t split fares, tips
                  and campaigns per platform and fold in car rent or fuel cards, you&rsquo;ll still
                  be doing payroll in a spreadsheet — see{' '}
                  <Link href="/features/settlements">weekly settlements</Link> and our{' '}
                  <Link href="/blog/driver-settlements-explained">settlements guide</Link>.
                </li>
                <li>
                  <strong>Document expiry alerts.</strong> Insurance, licences and inspections per
                  vehicle, with warnings weeks ahead — not a diary entry (
                  <Link href="/features/vehicles">vehicle management</Link>).
                </li>
                <li>
                  <strong>Tracking without hardware.</strong> On an island of short trips, wiring
                  GPS boxes into every car is money down the drain. Phone-based{' '}
                  <Link href="/features/live-tracking">shift tracking</Link> answers the real
                  question — who&rsquo;s working right now — with zero installation. More in{' '}
                  <Link href="/blog/fleet-tracking-without-gps-hardware">
                    fleet tracking without GPS hardware
                  </Link>.
                </li>
                <li>
                  <strong>Damage evidence.</strong> When one car is shared by three drivers across a
                  week, a photo check-in at every handover is the only fair way to assign a new
                  scratch (<Link href="/features/damage">damage &amp; repairs</Link>).
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'gdpr-eu',
          heading: 'GDPR, data residency and the EU question',
          body: (
            <>
              <p>
                Tracking drivers and processing their pay is personal-data processing, full stop. As
                a Maltese business you answer to the GDPR and Malta&rsquo;s Data Protection Act, so
                two questions belong in every software evaluation:
              </p>
              <ul>
                <li><strong>Where is the data hosted?</strong> EU hosting keeps you clear of cross-border transfer complications.</li>
                <li><strong>Is tracking tied to work?</strong> Location sharing should run during shifts only — tracking employees around the clock is a compliance problem waiting for a complaint.</li>
              </ul>
              <p>
                Rovora is EU-hosted, encrypted in transit and at rest, and tracks drivers only while
                they&rsquo;re clocked in — the details are on our{' '}
                <Link href="/security">security page</Link>.
              </p>
            </>
          ),
        },
        {
          id: 'cost',
          heading: 'What it should cost',
          body: (
            <>
              <p>
                For a small fleet, pricing should scale with vehicles — not seats, not modules, not
                a &ldquo;contact sales&rdquo; form. As a sanity check: if software saves you four
                hours of settlement work a week and catches one missed renewal a year, it has paid
                for a per-vehicle subscription several times over. Rovora&rsquo;s{' '}
                <Link href="/#pricing">per-vehicle pricing</Link> is public, and the trial is free
                with no card.
              </p>
            </>
          ),
        },
        {
          id: 'checklist',
          heading: 'The 10-minute evaluation checklist',
          body: (
            <>
              <p>Shortlisting tools? Put each one through these questions:</p>
              <ul>
                <li>Can it settle a driver who worked Bolt <em>and</em> Uber <em>and</em> took cash, in one payslip?</li>
                <li>Will it alert me three weeks before any insurance, licence or inspection expires?</li>
                <li>Can drivers clock in from a free app, with a photo of the car?</li>
                <li>Can I see who&rsquo;s on shift right now, without installing hardware?</li>
                <li>Is my data hosted in the EU, and can I export it if I leave?</li>
                <li>Can I set a different pay deal per driver and have it apply automatically?</li>
              </ul>
              <p>
                Six yeses and you&rsquo;ve found your system. Rovora answers yes to all six — it was
                built for exactly this kind of fleet. Start with the free trial, or read{' '}
                <Link href="/blog/how-to-run-a-taxi-fleet">how to run a taxi fleet</Link> for the
                full operational playbook.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
