import LegalLayout, { legalStyles as s } from '@/components/marketing/legal/LegalLayout';
import { marketingMetadata } from '@/lib/seo';

export const metadata = marketingMetadata({
  title: 'Security — Rovora',
  description:
    'How Rovora keeps fleet data safe: EU hosting, encryption in transit and at rest, strict tenant isolation, role-based access, audit logging and responsible disclosure.',
  path: '/security',
});

const LAST_UPDATED = '8 June 2026';

export default function SecurityPage() {
  return (
    <LegalLayout
      eyebrow="Legal · Security"
      title="Security at Rovora"
      lede="Fleets trust Rovora with their drivers’ documents and their weekly money. Here is how we protect it — the practices we follow and the architecture behind them."
      lastUpdated={LAST_UPDATED}
      sections={[
        {
          id: 'overview',
          heading: 'Our approach',
          body: (
            <p>
              Security is built into how Rovora is designed, not bolted on. We host in the EU, encrypt data
              in transit and at rest, isolate every fleet’s data from every other fleet, and give operators
              fine-grained control over who can see what. Below is a plain-English summary of the controls
              we rely on.
            </p>
          ),
        },
        {
          id: 'hosting',
          heading: 'EU hosting and infrastructure',
          body: (
            <>
              <p>
                Rovora runs on managed cloud infrastructure located in the European Union, on providers
                that maintain recognised security certifications (such as ISO 27001 and SOC 2) for their
                platforms. Keeping data in the EU keeps it within the protections of the GDPR.
              </p>
              <p>
                Our database, authentication and file storage are provided by Supabase, hosted in the EU.
                We patch and update our dependencies and platform regularly.
              </p>
            </>
          ),
        },
        {
          id: 'encryption',
          heading: 'Encryption',
          body: (
            <ul>
              <li>
                <strong>In transit.</strong> All traffic between your browser or the driver app and Rovora
                is encrypted with TLS (HTTPS). We do not serve the application over unencrypted connections.
              </li>
              <li>
                <strong>At rest.</strong> Data stored in our database and document storage is encrypted at
                rest by our infrastructure providers.
              </li>
              <li>
                <strong>Passwords.</strong> Passwords are never stored in plain text. They are hashed and
                salted by our authentication layer, so even we cannot read them.
              </li>
            </ul>
          ),
        },
        {
          id: 'tenant-isolation',
          heading: 'Tenant isolation',
          body: (
            <p>
              Rovora is multi-tenant: many fleets share the platform, but each fleet’s data is logically
              isolated. Every record is tagged to its organisation, and database-level{' '}
              <strong>row-level security</strong> policies enforce that a user can only ever read or write
              data belonging to a fleet they are a member of. This is enforced in the database itself, not
              just in application code, so one fleet can never see another’s drivers, documents or finances.
            </p>
          ),
        },
        {
          id: 'access-control',
          heading: 'Access control',
          body: (
            <>
              <ul>
                <li>
                  <strong>Role-based access.</strong> Users are owners/admins, staff or drivers, and each
                  role sees only what it needs. Drivers see their own shifts, earnings and documents — not
                  the whole fleet.
                </li>
                <li>
                  <strong>Per-fleet permissions.</strong> Operators can fine-tune what staff members are
                  allowed to do within their fleet.
                </li>
                <li>
                  <strong>Least privilege internally.</strong> Access to production systems is limited to
                  the small number of staff who need it, and is used only to operate and support the
                  Service.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'monitoring',
          heading: 'Auditing and monitoring',
          body: (
            <ul>
              <li>
                <strong>Audit logs.</strong> Significant actions inside a fleet are recorded in an audit
                log, so operators can see who changed what and when.
              </li>
              <li>
                <strong>Abuse protection.</strong> Sensitive flows such as password resets are rate-limited
                to defend against brute-force and abuse.
              </li>
              <li>
                <strong>Error monitoring.</strong> We use Sentry to detect and diagnose faults quickly,
                configured to avoid capturing unnecessary personal data.
              </li>
            </ul>
          ),
        },
        {
          id: 'payments',
          heading: 'Payment security',
          body: (
            <p>
              All card payments are handled by <strong>Stripe</strong>, a PCI-DSS Level 1 certified payment
              provider. Card details are entered directly with Stripe and never touch Rovora’s servers — we
              only ever store a customer reference and your subscription status.
            </p>
          ),
        },
        {
          id: 'backups',
          heading: 'Backups and resilience',
          body: (
            <p>
              Our database is backed up regularly by our infrastructure provider so that data can be
              restored in the event of an incident. We rely on managed, highly-available infrastructure to
              keep the Service running.
            </p>
          ),
        },
        {
          id: 'your-part',
          heading: 'Your part in keeping data safe',
          body: (
            <>
              <p>Security is shared. We ask that you:</p>
              <ul>
                <li>use a strong, unique password and never share accounts;</li>
                <li>give each staff member and driver their own login, with the least access they need;</li>
                <li>remove access promptly when someone leaves; and</li>
                <li>
                  tell us straight away at <a href="mailto:security@rovora.eu">security@rovora.eu</a> if you
                  suspect a compromised account.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'breach',
          heading: 'Incident response',
          body: (
            <p>
              If a personal-data breach occurs that is likely to affect you, we will act promptly to contain
              it and will notify affected customers and, where required, the relevant supervisory authority
              (in Malta, the IDPC) within the timelines the GDPR requires.
            </p>
          ),
        },
        {
          id: 'disclosure',
          heading: 'Responsible disclosure',
          body: (
            <div className={s.callout}>
              <p>
                Found a vulnerability? We welcome reports from security researchers. Please email{' '}
                <a href="mailto:security@rovora.eu">security@rovora.eu</a> with the details and steps to
                reproduce, and give us a reasonable time to investigate and fix before disclosing publicly.
                We will not pursue good-faith research that respects our users’ privacy and avoids data
                destruction or service disruption.
              </p>
            </div>
          ),
        },
      ]}
    />
  );
}
