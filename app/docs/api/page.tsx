import Link from 'next/link';
import FeatureShell from '@/components/marketing/feature/FeatureShell';
import CodeBlock from '@/components/marketing/docs/CodeBlock';
import DocsNav from '@/components/marketing/docs/DocsNav';
import EndpointCard from '@/components/marketing/docs/EndpointCard';
import styles from '@/components/marketing/docs/docs.module.css';
import { getPublicPlans } from '@/lib/billing/plans-data';
import { API_BASE_PATH, DOC_ERRORS, DOC_SECTIONS } from '@/lib/api/docs';
import { SCOPE_GROUPS } from '@/lib/api/scopes';
import { SITE_URL, marketingMetadata } from '@/lib/seo';

export const metadata = marketingMetadata({
  title: 'Fleet Management API Documentation — Rovora',
  description:
    'REST API reference for Rovora: read and write drivers, vehicles and financials with scoped API keys, per-minute and per-day rate limits, and a full OpenAPI spec.',
  path: '/docs/api',
  keywords: [
    'fleet management API',
    'fleet API documentation',
    'vehicle management REST API',
    'driver management API',
    'fleet data integration API',
    'fleet software API keys',
    'fleet accounting API',
  ],
});

// Rebuilt hourly — the only live data is the plan allowance table.
export const revalidate = 3600;

const BASE_URL = `${SITE_URL}${API_BASE_PATH}`;

const QUICKSTART = `# 1. Check your key works
curl ${BASE_URL}/me \\
  -H "Authorization: Bearer $ROVORA_API_KEY"

# 2. List your vehicles
curl "${BASE_URL}/vehicles?limit=10" \\
  -H "Authorization: Bearer $ROVORA_API_KEY"

# 3. Record an expense against one of them
curl -X POST ${BASE_URL}/financials/transactions \\
  -H "Authorization: Bearer $ROVORA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "category_id": "a11f…", "amount": 68.40, "description": "Diesel" }'`;

const NODE_EXAMPLE = `const ROVORA = '${BASE_URL}';

async function rovora(path, init = {}) {
  const res = await fetch(ROVORA + path, {
    ...init,
    headers: {
      Authorization: \`Bearer \${process.env.ROVORA_API_KEY}\`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  if (res.status === 429) {
    // Wait the number of seconds we're told, then try again.
    const wait = Number(res.headers.get('Retry-After') ?? 5);
    await new Promise((r) => setTimeout(r, wait * 1000));
    return rovora(path, init);
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.code ?? \`HTTP \${res.status}\`);
  return body;
}

const { data: drivers, meta } = await rovora('/drivers?status=active&limit=100');
console.log(\`\${meta.total} active drivers\`);`;

const PAGINATION_EXAMPLE = `{
  "data": [ /* … up to 200 records … */ ],
  "meta": {
    "limit": 50,
    "offset": 0,
    "total": 1284,
    "has_more": true
  }
}`;

const ERROR_EXAMPLE = `{
  "error": {
    "code": "validation_failed",
    "message": "One or more fields are invalid.",
    "details": {
      "fields": {
        "driving_license_expiry_date": "must be a date in YYYY-MM-DD format"
      }
    }
  }
}`;

const RATE_HEADERS = `X-RateLimit-Limit: 120
X-RateLimit-Remaining: 117
X-RateLimit-Reset: 1790000160
X-RateLimit-Limit-Day: 50000
X-RateLimit-Remaining-Day: 48211
X-RateLimit-Reset-Day: 1790035200`;

export default async function ApiDocsPage() {
  // The allowance table is driven by the same DB catalogue as the pricing page,
  // so changing a limit in /admin changes the documentation too.
  const plans = await getPublicPlans();
  const apiPlans = plans.filter((p) => p.apiEnabled);
  const lowestApiPlan = apiPlans[0] ?? null;

  return (
    <FeatureShell breadcrumb={[{ name: 'Developers', path: '/docs/api' }]}>
      <div className={styles.page}>
        <div className={styles.shell}>
          <DocsNav />

          <main className={styles.content}>
            {/* ── Overview ─────────────────────────────────────────── */}
            <header className={styles.hero} id="overview">
              <span className={styles.eyebrow}>Developers · REST API v1</span>
              <h1 className={styles.h1}>Rovora API</h1>
              <p className={styles.lede}>
                Read and write your fleet&rsquo;s <strong>drivers</strong>, <strong>vehicles</strong>{' '}
                and <strong>financials</strong> from your own systems. Sync drivers from your HR
                tool, push mileage from a tracker every night, post fuel-card spend straight into
                the books, or pull a month&rsquo;s profit and loss into a spreadsheet.
              </p>

              <div className={styles.heroFacts}>
                <div className={styles.fact}>
                  <span className={styles.factLabel}>Base URL</span>
                  <code className={styles.factValue}>{BASE_URL}</code>
                </div>
                <div className={styles.fact}>
                  <span className={styles.factLabel}>Auth</span>
                  <span className={styles.factValue}>Bearer API key</span>
                </div>
                <div className={styles.fact}>
                  <span className={styles.factLabel}>Format</span>
                  <span className={styles.factValue}>JSON over HTTPS</span>
                </div>
                <div className={styles.fact}>
                  <span className={styles.factLabel}>Available on</span>
                  <span className={styles.factValue}>
                    {lowestApiPlan ? `${lowestApiPlan.name} plan and above` : 'Larger plans'}
                  </span>
                </div>
              </div>

              <div className={styles.heroActions}>
                <Link className={styles.primaryBtn} href="/fleet/api">
                  Get an API key
                </Link>
                <a className={styles.ghostBtn} href="/api/v1/openapi.json">
                  OpenAPI spec
                </a>
                <Link className={styles.ghostBtn} href="/contact">
                  Talk to us
                </Link>
              </div>

              <p className={styles.note}>
                The API is server-to-server. It sends no CORS headers on purpose, so a browser page
                cannot call it &mdash; an API key does not belong in front-end code where anyone can
                read it.
              </p>
            </header>

            {/* ── Quickstart ───────────────────────────────────────── */}
            <section className={styles.section} id="quickstart">
              <h2 className={styles.h2}>Quickstart</h2>
              <ol className={styles.steps}>
                <li>
                  In Rovora, go to <strong>Admin &rarr; API</strong> and create a key. Pick only the
                  permissions your integration needs.
                </li>
                <li>
                  Copy the key when it is shown. We store only a one-way hash of it, so that screen
                  is genuinely the only time you can see it.
                </li>
                <li>
                  Send it on every request as{' '}
                  <code className={styles.inline}>Authorization: Bearer &lt;key&gt;</code>.
                </li>
              </ol>
              <CodeBlock code={QUICKSTART} label="cURL" />
              <h3 className={styles.h3}>A small client</h3>
              <p className={styles.p}>
                Everything you need is one <code className={styles.inline}>fetch</code> wrapper: set
                the header, honour <code className={styles.inline}>Retry-After</code> on a 429, and
                branch on <code className={styles.inline}>error.code</code>.
              </p>
              <CodeBlock code={NODE_EXAMPLE} label="Node.js" />
            </section>

            {/* ── Authentication ───────────────────────────────────── */}
            <section className={styles.section} id="authentication">
              <h2 className={styles.h2}>Authentication</h2>
              <p className={styles.p}>
                Every request carries an API key created by a fleet admin. A key belongs to exactly
                one fleet and can only ever see that fleet&rsquo;s data &mdash; there is no
                parameter, header or id that widens it.
              </p>
              <CodeBlock
                label="Header"
                code={`Authorization: Bearer rvk_live_7f2a9c31d4e8b60a5c1f93ab27de4051f6c8b3a9e2d7401c5b8f6a3d9e0c2b14`}
              />
              <p className={styles.p}>
                If your client cannot set an <code className={styles.inline}>Authorization</code>{' '}
                header, <code className={styles.inline}>X-API-Key: &lt;key&gt;</code> works too.
              </p>

              <h3 className={styles.h3}>Scopes</h3>
              <p className={styles.p}>
                Keys are least-privilege. Choose read, write, or both, per resource &mdash; a write
                scope implies its read scope. A key missing the scope an endpoint needs gets{' '}
                <code className={styles.inline}>403 insufficient_scope</code> with the required
                scope named in the response.
              </p>
              <div className={styles.table}>
                <div className={styles.tHead}>
                  <span>Scope</span>
                  <span>Grants</span>
                </div>
                {SCOPE_GROUPS.map((g) => (
                  <div className={styles.tRow} key={g.resource}>
                    <span>
                      <code className={styles.scopeChip}>{g.read}</code>
                      <br />
                      <code className={styles.scopeChip}>{g.write}</code>
                    </span>
                    <span>{g.blurb}</span>
                  </div>
                ))}
              </div>

              <h3 className={styles.h3}>Expiry, revocation and IP allow-lists</h3>
              <ul className={styles.list}>
                <li>
                  <strong>Expiry.</strong> Give a key an end date and it stops working on its own.
                  Rotating keys yearly is a habit worth having.
                </li>
                <li>
                  <strong>Revocation.</strong> Revoking a key takes effect on the very next request.
                  There is no cache to wait for.
                </li>
                <li>
                  <strong>IP allow-list.</strong> If your integration calls from fixed servers, list
                  their addresses on the key. Calls from anywhere else are refused with{' '}
                  <code className={styles.inline}>403 ip_not_allowed</code>, so a stolen key is
                  useless off your network.
                </li>
              </ul>
            </section>

            {/* ── Rate limits ──────────────────────────────────────── */}
            <section className={styles.section} id="rate-limits">
              <h2 className={styles.h2}>Rate limits</h2>
              <p className={styles.p}>
                Limits are counted <strong>per key</strong>, in two windows: a per-minute burst
                ceiling and a per-day total. Both are enforced in the database, so they hold no
                matter how many of our servers answer your calls.
              </p>

              {apiPlans.length > 0 ? (
                <div className={styles.table}>
                  <div className={styles.tHead3}>
                    <span>Plan</span>
                    <span>Per minute</span>
                    <span>Per day</span>
                    <span>Keys</span>
                  </div>
                  {apiPlans.map((p) => (
                    <div className={styles.tRow3} key={p.id}>
                      <span>
                        <strong>{p.name}</strong>
                      </span>
                      <span>
                        {p.apiRateLimitPerMin === null
                          ? 'Unlimited'
                          : p.apiRateLimitPerMin.toLocaleString()}
                      </span>
                      <span>
                        {p.apiRateLimitPerDay === null
                          ? 'Unlimited'
                          : p.apiRateLimitPerDay.toLocaleString()}
                      </span>
                      <span>{p.apiMaxKeys}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.p}>
                  API access is sold with our larger plans. <Link href="/contact">Get in touch</Link>{' '}
                  and we&rsquo;ll sort out the right tier for your volume.
                </p>
              )}

              <p className={styles.p}>
                The API is a paid-plan feature and is not part of the free trial. If you want to
                build against it before you commit, <Link href="/contact">tell us</Link> and
                we&rsquo;ll open it up for you.
              </p>

              <h3 className={styles.h3}>Every response tells you where you stand</h3>
              <CodeBlock code={RATE_HEADERS} label="Response headers" />
              <p className={styles.p}>
                Go over and you get <code className={styles.inline}>429 rate_limited</code> with a{' '}
                <code className={styles.inline}>Retry-After</code> header in seconds. Wait that long
                and carry on &mdash; retrying immediately just burns the rest of the window.
              </p>
              <div className={styles.callout}>
                <strong>Sync efficiently.</strong> Instead of re-reading everything on a schedule,
                pass <code className={styles.inline}>updated_since</code> with the timestamp of your
                last successful sync. Most fleets go from thousands of calls a day to a handful.
              </div>
            </section>

            {/* ── Conventions ──────────────────────────────────────── */}
            <section className={styles.section} id="conventions">
              <h2 className={styles.h2}>Requests &amp; responses</h2>

              <h3 className={styles.h3}>One envelope, always</h3>
              <p className={styles.p}>
                Success puts the payload under <code className={styles.inline}>data</code>. Failure
                puts a stable code and a human message under{' '}
                <code className={styles.inline}>error</code>. That is the whole contract, so one
                handler covers every endpoint.
              </p>
              <CodeBlock code={PAGINATION_EXAMPLE} label="List response" />

              <h3 className={styles.h3}>Pagination</h3>
              <p className={styles.p}>
                List endpoints take <code className={styles.inline}>limit</code> (1&ndash;200,
                default 50) and <code className={styles.inline}>offset</code>, and report{' '}
                <code className={styles.inline}>total</code> and{' '}
                <code className={styles.inline}>has_more</code> in{' '}
                <code className={styles.inline}>meta</code>.
              </p>

              <h3 className={styles.h3}>Sorting &amp; filtering</h3>
              <p className={styles.p}>
                Pass <code className={styles.inline}>sort=field</code>, or{' '}
                <code className={styles.inline}>sort=-field</code> to reverse. Each endpoint&rsquo;s
                filters are listed in the reference below. An unknown sort field is rejected rather
                than ignored, so a typo shows up straight away instead of quietly returning the
                wrong order.
              </p>

              <h3 className={styles.h3}>Writing</h3>
              <ul className={styles.list}>
                <li>
                  <strong>POST</strong> creates and answers <code className={styles.inline}>201</code>{' '}
                  with the new record.
                </li>
                <li>
                  <strong>PATCH</strong> updates only the fields you send. There is no PUT: a full
                  replacement invites an integration to blank out fields it does not know about.
                </li>
                <li>
                  <strong>DELETE</strong> answers <code className={styles.inline}>204</code> with no
                  body.
                </li>
                <li>
                  Unknown fields are <em>rejected</em>, not ignored, so a misspelled key never
                  silently does nothing.
                </li>
                <li>Bodies are JSON objects, up to 256&nbsp;KB.</li>
              </ul>

              <h3 className={styles.h3}>Dates, money and ids</h3>
              <ul className={styles.list}>
                <li>
                  Calendar dates are <code className={styles.inline}>YYYY-MM-DD</code>. Timestamps
                  are ISO 8601 in UTC.
                </li>
                <li>
                  Money is a decimal number with up to 2 places, always positive. Direction comes
                  from the category, never from a minus sign.
                </li>
                <li>Every id is a UUID. Ids from another fleet return 404, never 403.</li>
              </ul>
            </section>

            {/* ── Errors ───────────────────────────────────────────── */}
            <section className={styles.section} id="errors">
              <h2 className={styles.h2}>Errors</h2>
              <p className={styles.p}>
                Branch on <code className={styles.inline}>error.code</code>, never on the message
                &mdash; messages get reworded, codes do not. Validation failures name every bad
                field at once so you can fix them in one pass.
              </p>
              <CodeBlock code={ERROR_EXAMPLE} label="422 Unprocessable" />
              <div className={styles.table}>
                <div className={styles.tHead3}>
                  <span>Status</span>
                  <span>Code</span>
                  <span>What it means</span>
                  <span />
                </div>
                {DOC_ERRORS.map((e) => (
                  <div className={styles.tRowErr} key={e.code}>
                    <span className={styles.statusCell}>{e.status}</span>
                    <span>
                      <code className={styles.scopeChip}>{e.code}</code>
                    </span>
                    <span>{e.meaning}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* ── Reference ────────────────────────────────────────── */}
            {DOC_SECTIONS.map((section) => (
              <section className={styles.section} id={section.id} key={section.id}>
                <h2 className={styles.h2}>{section.title}</h2>
                <p className={styles.p}>{section.blurb}</p>
                {section.endpoints.map((ep) => (
                  <EndpointCard endpoint={ep} key={ep.id} />
                ))}
              </section>
            ))}

            {/* ── Security ─────────────────────────────────────────── */}
            <section className={styles.section} id="security">
              <h2 className={styles.h2}>Keeping keys safe</h2>
              <p className={styles.p}>
                An API key is a password to your fleet&rsquo;s data. Treat it like one.
              </p>
              <ul className={styles.list}>
                <li>
                  <strong>Server-side only.</strong> Never put a key in a browser, a mobile app or
                  anything a customer can open. We send no CORS headers, which stops the easiest
                  version of this mistake.
                </li>
                <li>
                  <strong>Environment variables, not source control.</strong> A key committed to a
                  repository is a key that will eventually be public.
                </li>
                <li>
                  <strong>One key per integration.</strong> Then revoking the one that leaked
                  doesn&rsquo;t take down everything else you run.
                </li>
                <li>
                  <strong>Least privilege.</strong> A reporting job needs{' '}
                  <code className={styles.inline}>financials:read</code>, not{' '}
                  <code className={styles.inline}>financials:write</code>.
                </li>
                <li>
                  <strong>Lock it to your servers.</strong> Add their IP addresses to the key.
                </li>
                <li>
                  <strong>Rotate.</strong> Set an expiry. Create the replacement, move your
                  integration across, then revoke the old one.
                </li>
              </ul>
              <h3 className={styles.h3}>What we do on our side</h3>
              <ul className={styles.list}>
                <li>
                  <strong>HTTPS only.</strong> Plain HTTP is refused outright rather than answered
                  &mdash; a key sent in the clear has already leaked, and we would rather tell you
                  than quietly serve the request.
                </li>
                <li>
                  <strong>Your fleet, and only your fleet.</strong> The fleet a request can touch is
                  taken from the key itself, never from the URL, a header or the body. Every single
                  query is filtered by it, and ids belonging to another fleet come back as{' '}
                  <code className={styles.inline}>404</code> &mdash; you cannot even confirm they
                  exist.
                </li>
                <li>
                  <strong>Nothing internal is writable.</strong> Write endpoints accept an explicit
                  list of fields and reject anything else, so there is no request body that can
                  reassign a record to a different fleet.
                </li>
                <li>
                  <strong>Keys can&rsquo;t be guessed.</strong> Each one is 256 bits of
                  cryptographically random data, and we store only a one-way hash &mdash; a database
                  leak would not hand anyone a working key. Repeated failed attempts from one
                  address are blocked outright.
                </li>
                <li>
                  <strong>Checked every time.</strong> Scope, expiry, revocation, IP allow-list and
                  plan are all re-checked on every request. Revoking a key takes effect on the next
                  call.
                </li>
                <li>
                  <strong>Logged.</strong> Every call is recorded with its key, status, timing and
                  source address &mdash; never any of your data &mdash; and fleet admins can see the
                  recent ones in Rovora.
                </li>
              </ul>
              <p className={styles.p}>
                More in our <Link href="/security">security overview</Link>.
              </p>
              <p className={styles.p}>
                Found a vulnerability? Email{' '}
                <a href="mailto:security@rovora.eu">security@rovora.eu</a> and we&rsquo;ll respond
                quickly.
              </p>
            </section>

            {/* ── Versioning ───────────────────────────────────────── */}
            <section className={styles.section} id="versioning">
              <h2 className={styles.h2}>Versioning</h2>
              <p className={styles.p}>
                The version is in the path: <code className={styles.inline}>{API_BASE_PATH}</code>.
                Inside v1 we only make additive changes &mdash; new endpoints, new optional
                parameters, new fields on existing responses. Write your client so unknown fields
                are ignored and it will keep working.
              </p>
              <p className={styles.p}>
                Anything that would break an existing client gets a new version, and we will email
                every fleet with a live API key well before v1 stops being supported.
              </p>

              <div className={styles.ctaBand}>
                <h3 className={styles.ctaTitle}>Ready to build?</h3>
                <p className={styles.ctaBody}>
                  Create a key in Rovora and make your first call in under five minutes. Stuck on
                  something, or need an endpoint we haven&rsquo;t built yet? Tell us &mdash; we
                  prioritise what operators actually ask for.
                </p>
                <div className={styles.heroActions}>
                  <Link className={styles.primaryBtn} href="/fleet/api">
                    Get an API key
                  </Link>
                  <a className={styles.ghostBtn} href="mailto:support@rovora.eu?subject=Rovora%20API">
                    Email the team
                  </a>
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>
    </FeatureShell>
  );
}
