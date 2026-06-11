import type { Metadata } from 'next';
import LegalLayout, { legalStyles as s } from '@/components/marketing/legal/LegalLayout';

export const metadata: Metadata = {
  title: 'Privacy Policy — Rovora',
  description:
    'How Rovora collects, uses, stores and protects personal data for fleet operators and their drivers. EU-hosted and aligned with the GDPR and Malta’s Data Protection Act.',
};

const LAST_UPDATED = '11 June 2026';

export default function PrivacyPage() {
  return (
    <LegalLayout
      eyebrow="Legal · Privacy"
      title="Privacy Policy"
      lede="Rovora is fleet-management software for taxi and cab operators. This policy explains what personal data we handle, why, how long we keep it, and the rights you have over it."
      lastUpdated={LAST_UPDATED}
      sections={[
        {
          id: 'who-we-are',
          heading: 'Who we are',
          body: (
            <>
              <p>
                “Rovora”, “we”, “us” means the operator of the Rovora platform at{' '}
                <a href="https://rovora.eu">rovora.eu</a>. Rovora provides a dashboard and driver app
                that taxi and cab fleets use to manage drivers, vehicles, shifts, rosters and weekly
                settlements.
              </p>
              <p>
                We are based in the European Union and our service is hosted in the EU. For any
                privacy matter you can reach our team at{' '}
                <a href="mailto:privacy@rovora.eu">privacy@rovora.eu</a>, or by post at{' '}
                <span className={s.placeholder}>[registered business address — to be filled in]</span>.
              </p>
            </>
          ),
        },
        {
          id: 'roles',
          heading: 'Controller vs. processor — who is responsible',
          body: (
            <>
              <p>
                Rovora is used in two distinct ways, and the law treats them differently:
              </p>
              <ul>
                <li>
                  <strong>Data about a fleet’s drivers, vehicles and operations.</strong> When a fleet
                  operator (our customer) adds their drivers, uploads documents, records shifts or runs
                  settlements, <strong>the fleet operator is the data controller</strong> and Rovora acts
                  as a <strong>data processor</strong> — we process that data only on the operator’s
                  instructions, to provide the service.
                </li>
                <li>
                  <strong>Account holders and website visitors.</strong> For the personal data of the
                  people who sign up for and administer a Rovora account, and for visitors to our
                  marketing site, <strong>Rovora is the data controller</strong>.
                </li>
              </ul>
              <p>
                If you are a driver and want to know how your data is used, your employer or fleet
                operator is the first point of contact, as they decide what is collected and why.
              </p>
            </>
          ),
        },
        {
          id: 'what-we-collect',
          heading: 'What data we collect',
          body: (
            <>
              <p>
                We only collect data needed to run a fleet. Depending on how Rovora is used, this can
                include:
              </p>
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Examples</th>
                      <th>Why we hold it</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Account &amp; identity</td>
                      <td>Name, email address, password (stored only as a salted hash), role and fleet membership</td>
                      <td>To create accounts, authenticate users and control access</td>
                    </tr>
                    <tr>
                      <td>Driver records</td>
                      <td>Full name, phone number, email, employment type, vehicle assignments</td>
                      <td>So operators can manage and contact their drivers</td>
                    </tr>
                    <tr>
                      <td>Driver documents</td>
                      <td>Driving licence, ID card, insurance, logbook and roadworthiness/NCT documents (including front/back images and the identifiers shown on them)</td>
                      <td>To track validity and expiry of legally-required documents</td>
                    </tr>
                    <tr>
                      <td>Vehicle data</td>
                      <td>Registration, make/model, odometer/mileage readings, service and maintenance history, damage records and diagrams</td>
                      <td>To schedule servicing and keep a per-vehicle history</td>
                    </tr>
                    <tr>
                      <td>Location data</td>
                      <td>GPS position (latitude/longitude), speed, heading, accuracy and timestamps, collected while a driver has location sharing switched on</td>
                      <td>So the fleet operator can see live driver positions and shift routes (see <a href="#location">Location data</a>)</td>
                    </tr>
                    <tr>
                      <td>Operational &amp; financial</td>
                      <td>Shifts, rosters, check-in mileage, earnings, settlements (fares, tips, campaigns, fees and tax deductions such as FSS), adjustments and weekly bookkeeping</td>
                      <td>To run rosters and reconcile each driver’s weekly pay</td>
                    </tr>
                    <tr>
                      <td>Billing</td>
                      <td>Subscription plan, billing status and a Stripe customer reference. Card details are entered directly with Stripe — Rovora never sees or stores card numbers.</td>
                      <td>To manage subscriptions and process payments</td>
                    </tr>
                    <tr>
                      <td>Communications</td>
                      <td>Notification preferences and the in-app, push and email alerts we send you</td>
                      <td>To deliver document-expiry, shift and platform notices</td>
                    </tr>
                    <tr>
                      <td>Technical &amp; security</td>
                      <td>Session cookies, audit-log entries, IP address and device/browser information, error diagnostics, and password-reset rate-limit records</td>
                      <td>To keep accounts secure, prevent abuse and diagnose faults</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p>
                Some driver documents may reveal information that the GDPR treats as sensitive (for
                example, a date of birth or a photograph on an ID). We only hold these because they are
                necessary to comply with transport-licensing and employment obligations, and we restrict
                access to them tightly (see <a href="#security">Security</a>).
              </p>
            </>
          ),
        },
        {
          id: 'location',
          heading: 'Location data and the driver app',
          body: (
            <>
              <p>
                The Rovora driver app (and the “Share Location” feature of the driver web portal) can
                collect a driver’s device location — GPS position, speed, heading and accuracy — and
                share it with their fleet operator. This is how it works:
              </p>
              <ul>
                <li>
                  <strong>Sharing is always started by the driver.</strong> Nothing is collected until
                  the driver taps “Start sharing”, and the driver can stop at any time. The app shows a
                  clear disclosure before the first use and a visible indicator (including a persistent
                  notification on Android) while sharing is active.
                </li>
                <li>
                  <strong>Background collection.</strong> When the driver grants background location
                  permission, the app continues to collect location while it is closed or the screen is
                  off, so the fleet can see the driver’s position throughout the shift. Sharing ends when
                  the driver taps “Stop sharing”.
                </li>
                <li>
                  <strong>Who can see it.</strong> Live positions and route history are visible only to
                  the authorised staff of the driver’s own fleet, inside that fleet’s dashboard. Location
                  data is never sold, never used for advertising, and never shared with other fleets or
                  third parties.
                </li>
                <li>
                  <strong>Controller and purpose.</strong> The fleet operator decides whether and why to
                  use location sharing (typically live operations and duty-of-care during shifts) and is
                  the data controller for it; Rovora processes the data on the operator’s behalf.
                </li>
                <li>
                  <strong>Retention.</strong> The latest position is overwritten continuously; route
                  history is retained as operational data under the fleet’s account (see{' '}
                  <a href="#retention">How long we keep it</a>) and is deleted with it.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'why-and-legal-basis',
          heading: 'Why we use it, and our legal basis',
          body: (
            <>
              <p>Under the GDPR we rely on the following legal bases:</p>
              <ul>
                <li>
                  <strong>Performance of a contract</strong> — to provide the platform to the fleet that
                  has subscribed, and to give drivers and staff their accounts.
                </li>
                <li>
                  <strong>Legitimate interests</strong> — to secure the service, prevent fraud and abuse,
                  diagnose errors, and improve the product. We balance these against your rights.
                </li>
                <li>
                  <strong>Legal obligation</strong> — to retain tax, payroll and licensing records where
                  the law requires it, and to respond to lawful requests.
                </li>
                <li>
                  <strong>Consent</strong> — for optional marketing emails, which you can withdraw at any
                  time. Withdrawing consent does not affect the lawfulness of earlier processing.
                </li>
              </ul>
              <p>
                We do <strong>not</strong> sell personal data, and we do <strong>not</strong> use it for
                advertising or automated decision-making that produces legal effects.
              </p>
            </>
          ),
        },
        {
          id: 'sub-processors',
          heading: 'Who we share it with',
          body: (
            <>
              <p>
                We share data only with the service providers (sub-processors) that help us run Rovora.
                Each is bound by a data-processing agreement and may only use the data to provide their
                service to us:
              </p>
              <ul>
                <li>
                  <strong>Supabase</strong> — our database, authentication and document storage, hosted in
                  the EU.
                </li>
                <li>
                  <strong>Stripe</strong> — subscription billing and card payment processing.
                </li>
                <li>
                  <strong>Resend</strong> — delivery of transactional and notification emails.
                </li>
                <li>
                  <strong>Sentry</strong> — error and performance monitoring so we can find and fix faults.
                </li>
              </ul>
              <p>
                We may also disclose data where we are legally required to (for example, to a court or
                regulator), or to a successor entity in the event of a merger or acquisition, in which case
                we will notify affected customers.
              </p>
            </>
          ),
        },
        {
          id: 'transfers',
          heading: 'International transfers',
          body: (
            <p>
              Rovora and its primary database are hosted in the European Union. Where a sub-processor
              processes data outside the EU/EEA, that transfer is protected by an adequacy decision or by
              the European Commission’s Standard Contractual Clauses, together with additional safeguards
              where appropriate.
            </p>
          ),
        },
        {
          id: 'retention',
          heading: 'How long we keep it',
          body: (
            <>
              <p>
                We keep personal data only for as long as it is needed for the purpose it was collected:
              </p>
              <ul>
                <li>
                  <strong>While your fleet’s account is active</strong> — operational data is retained so
                  the fleet can run day to day.
                </li>
                <li>
                  <strong>Financial and tax records</strong> — retained for the period required by
                  applicable tax and accounting law, even after a driver leaves or an account closes.
                </li>
                <li>
                  <strong>After account closure</strong> — we delete or anonymise personal data within a
                  reasonable period once it is no longer needed, unless the law requires us to keep it
                  longer.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'your-rights',
          heading: 'Your rights',
          body: (
            <>
              <p>Under the GDPR you have the right to:</p>
              <ul>
                <li>access the personal data we hold about you;</li>
                <li>have inaccurate data corrected;</li>
                <li>have your data erased, where there is no overriding legal reason to keep it;</li>
                <li>restrict or object to certain processing;</li>
                <li>receive your data in a portable, machine-readable format; and</li>
                <li>withdraw consent at any time where processing is based on consent.</li>
              </ul>
              <div className={s.callout}>
                <p>
                  To exercise any of these rights, email{' '}
                  <a href="mailto:privacy@rovora.eu">privacy@rovora.eu</a>. If you are a driver, note that
                  much of your data is controlled by your fleet operator — we will help route your request
                  to them where needed. We respond within one month.
                </p>
              </div>
              <p>
                You also have the right to lodge a complaint with your data-protection authority. In Malta
                this is the <strong>Information and Data Protection Commissioner (IDPC)</strong> —{' '}
                <a href="https://idpc.org.mt">idpc.org.mt</a>.
              </p>
            </>
          ),
        },
        {
          id: 'cookies',
          heading: 'Cookies',
          body: (
            <p>
              We use a small number of strictly-necessary cookies to keep you signed in and to keep the
              service secure. These are essential to the platform and cannot be turned off without breaking
              sign-in. We do not use advertising or third-party tracking cookies.
            </p>
          ),
        },
        {
          id: 'children',
          heading: 'Children',
          body: (
            <p>
              Rovora is a business tool intended for licensed drivers and fleet staff. It is not directed
              at children and we do not knowingly collect data from anyone under 16.
            </p>
          ),
        },
        {
          id: 'changes',
          heading: 'Changes to this policy',
          body: (
            <p>
              We may update this policy as the product and the law evolve. We will revise the “last
              updated” date above and, for material changes, notify account administrators by email or
              in-app.
            </p>
          ),
        },
      ]}
    />
  );
}
