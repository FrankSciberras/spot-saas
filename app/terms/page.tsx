import type { Metadata } from 'next';
import LegalLayout, { legalStyles as s } from '@/components/marketing/legal/LegalLayout';

export const metadata: Metadata = {
  title: 'Terms of Service — Rovora',
  description:
    'The terms that govern use of Rovora’s fleet-management platform: subscriptions, trials, acceptable use, billing, liability and termination.',
};

const LAST_UPDATED = '8 June 2026';

export default function TermsPage() {
  return (
    <LegalLayout
      eyebrow="Legal · Terms"
      title="Terms of Service"
      lede="These terms are the agreement between you and Rovora for use of our fleet-management platform. By creating an account or using the service, you agree to them."
      lastUpdated={LAST_UPDATED}
      sections={[
        {
          id: 'agreement',
          heading: '1. The agreement',
          body: (
            <>
              <p>
                These Terms of Service (“Terms”) govern your access to and use of the Rovora platform,
                websites and apps (the “Service”), provided by Rovora (“we”, “us”). By signing up, starting
                a trial, or using the Service, you confirm that you have read and accept these Terms. If
                you are agreeing on behalf of a company or fleet, you confirm you are authorised to bind
                that organisation.
              </p>
              <p>
                If you do not agree with these Terms, do not use the Service.
              </p>
            </>
          ),
        },
        {
          id: 'the-service',
          heading: '2. What Rovora provides',
          body: (
            <>
              <p>
                Rovora is software for taxi and cab fleet operators to manage drivers, vehicles, shifts,
                rosters, maintenance and weekly settlements, with a companion driver app. We provide the
                Service on a subscription basis and will use reasonable efforts to keep it available and
                functioning as described.
              </p>
              <p>
                Rovora is a management tool. It does not provide transport, employment, tax, accounting or
                legal advice, and it does not replace your own obligation to keep accurate records and to
                comply with licensing, employment and tax law. Figures the Service calculates — including
                settlements and tax deductions — are aids, and you remain responsible for verifying them.
              </p>
            </>
          ),
        },
        {
          id: 'accounts',
          heading: '3. Accounts and access',
          body: (
            <>
              <p>
                You are responsible for the accounts you create and for the activity that happens under
                them. You agree to:
              </p>
              <ul>
                <li>provide accurate account information and keep it up to date;</li>
                <li>keep login credentials confidential and not share accounts;</li>
                <li>
                  ensure that everyone you invite (staff and drivers) is authorised and uses the Service in
                  line with these Terms; and
                </li>
                <li>notify us promptly at <a href="mailto:security@rovora.eu">security@rovora.eu</a> if you suspect unauthorised access.</li>
              </ul>
              <p>
                As a fleet operator you are the controller of the data you enter about your drivers and
                vehicles, and you confirm you have the lawful basis to add it. See our{' '}
                <a href="/privacy">Privacy Policy</a> for how this works.
              </p>
            </>
          ),
        },
        {
          id: 'trials-billing',
          heading: '4. Trials, plans and billing',
          body: (
            <>
              <p>
                We offer subscription plans and may offer a free trial. The following apply:
              </p>
              <ul>
                <li>
                  <strong>Trials.</strong> A free trial runs for the stated period. Unless you subscribe
                  before it ends, access may be limited or suspended when the trial expires.
                </li>
                <li>
                  <strong>Fees.</strong> Subscription fees are shown at checkout and billed in advance on a
                  recurring basis. Payments are processed by Stripe; by subscribing you also agree to
                  Stripe’s terms.
                </li>
                <li>
                  <strong>Renewal.</strong> Subscriptions renew automatically for the same period unless
                  cancelled before the renewal date.
                </li>
                <li>
                  <strong>Cancellation.</strong> You can cancel at any time from your billing settings.
                  Cancellation takes effect at the end of the current billing period; except where required
                  by law, fees already paid are non-refundable.
                </li>
                <li>
                  <strong>Changes.</strong> We may change plan pricing on reasonable notice; changes apply
                  from your next renewal.
                </li>
                <li>
                  <strong>Taxes.</strong> Fees are exclusive of any applicable VAT or other taxes, which
                  are added where required.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'acceptable-use',
          heading: '5. Acceptable use',
          body: (
            <>
              <p>You agree not to:</p>
              <ul>
                <li>use the Service unlawfully, or to store or transmit unlawful content;</li>
                <li>upload data you have no right to share, or that infringes someone else’s rights;</li>
                <li>attempt to access accounts, data or systems that are not yours;</li>
                <li>
                  probe, scan, overload or attempt to breach the Service, or circumvent its security or
                  usage limits;
                </li>
                <li>reverse-engineer, copy or resell the Service except as permitted by law; or</li>
                <li>use the Service to build a competing product.</li>
              </ul>
              <p>
                We may suspend or limit access if we reasonably believe these Terms are being breached or
                that the Service, its users or others are at risk.
              </p>
            </>
          ),
        },
        {
          id: 'your-data',
          heading: '6. Your data',
          body: (
            <>
              <p>
                You retain all rights to the data you and your team put into Rovora (“Customer Data”). You
                grant us the limited rights needed to host, process and display that data in order to
                provide the Service, and to make backups. We handle personal data as described in our{' '}
                <a href="/privacy">Privacy Policy</a> and protect it as described on our{' '}
                <a href="/security">Security</a> page.
              </p>
              <p>
                On request before, or within a reasonable window after, account closure, you can export
                your Customer Data. After that window we may delete it, subject to any retention the law
                requires.
              </p>
            </>
          ),
        },
        {
          id: 'ip',
          heading: '7. Intellectual property',
          body: (
            <p>
              The Service, including its software, design, branding and the Rovora name and logo, is owned
              by Rovora and its licensors and is protected by intellectual-property law. These Terms grant
              you a non-exclusive, non-transferable right to use the Service during your subscription —
              nothing more. You must not use our branding without written permission.
            </p>
          ),
        },
        {
          id: 'third-parties',
          heading: '8. Third-party services',
          body: (
            <p>
              The Service integrates with third-party services (for example, ride-hailing platforms,
              payment providers and email delivery). We are not responsible for those services, their
              availability, or their terms, and your use of them is governed by their own agreements.
            </p>
          ),
        },
        {
          id: 'availability',
          heading: '9. Availability and changes',
          body: (
            <p>
              We work hard to keep Rovora available, but we provide the Service on an “as available” basis
              and may carry out maintenance, updates or changes. We may add, modify or discontinue features
              over time. Where a change is material and adverse, we will give reasonable notice.
            </p>
          ),
        },
        {
          id: 'warranties-liability',
          heading: '10. Warranties and liability',
          body: (
            <>
              <p>
                To the fullest extent permitted by law, the Service is provided “as is” and “as available”
                without warranties of any kind, whether express or implied, including fitness for a
                particular purpose and non-infringement. We do not warrant that the Service will be
                uninterrupted or error-free.
              </p>
              <p>
                Nothing in these Terms excludes liability that cannot be excluded by law (such as for death
                or personal injury caused by negligence, or for fraud). Subject to that:
              </p>
              <ul>
                <li>
                  we are not liable for indirect, incidental, special or consequential loss, or for loss of
                  profits, revenue, goodwill or data; and
                </li>
                <li>
                  our total aggregate liability arising out of or in connection with the Service is limited
                  to the fees you paid us in the twelve months before the event giving rise to the claim.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'indemnity',
          heading: '11. Indemnity',
          body: (
            <p>
              You agree to indemnify Rovora against claims, losses and costs arising from your unlawful use
              of the Service, your breach of these Terms, or your Customer Data infringing the rights of a
              third party.
            </p>
          ),
        },
        {
          id: 'termination',
          heading: '12. Suspension and termination',
          body: (
            <>
              <p>
                You may stop using the Service and close your account at any time. We may suspend or
                terminate access if you materially breach these Terms, fail to pay, or use the Service in a
                way that creates legal or security risk. We will give notice where it is reasonable to do
                so.
              </p>
              <p>
                On termination, your right to use the Service ends. Sections that by their nature should
                survive — including data ownership, intellectual property, liability, indemnity and
                governing law — continue to apply.
              </p>
            </>
          ),
        },
        {
          id: 'governing-law',
          heading: '13. Governing law',
          body: (
            <p>
              These Terms are governed by the laws of <strong>Malta</strong>, and the courts of Malta have
              exclusive jurisdiction over any dispute, without prejudice to any mandatory consumer-protection
              rights you may have in your country of residence.
            </p>
          ),
        },
        {
          id: 'contact-terms',
          heading: '14. Contact',
          body: (
            <div className={s.callout}>
              <p>
                Questions about these Terms? Email{' '}
                <a href="mailto:hello@rovora.eu">hello@rovora.eu</a>. For privacy matters see our{' '}
                <a href="/privacy">Privacy Policy</a>; for security, see our{' '}
                <a href="/security">Security</a> page.
              </p>
            </div>
          ),
        },
      ]}
    />
  );
}
