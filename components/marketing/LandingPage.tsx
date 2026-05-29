import Link from 'next/link';
import { spotFontVars } from '@/lib/spotFonts';
import SpotThemeToggle from './SpotThemeToggle';

const Check = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const Lock = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

/** Browser-frame mock used in place of product screenshots. */
function ShotBar({ path }: { path: string }) {
  return (
    <div className="shot-bar">
      <div className="dots">
        <i /><i /><i />
      </div>
      <div className="shot-url">
        <Lock />
        app.spotfleet.io/<b>{path}</b>
      </div>
    </div>
  );
}

const SIGN_IN = '/login';
const START_TRIAL = '/login?mode=signup';

/** Ride-hail & payout platforms we're building native integrations for. */
const INTEGRATIONS: {
  name: string;
  mark: string;
  bg: string;
  fg: string;
  desc: string;
}[] = [
  { name: 'Uber', mark: 'U', bg: '#000000', fg: '#ffffff', desc: 'Auto-import trips & weekly earnings.' },
  { name: 'Bolt', mark: 'b', bg: '#34d186', fg: '#06231a', desc: 'Sync driver payouts straight into settlements.' },
  { name: 'FreeNow', mark: 'F', bg: '#00b9b0', fg: '#04211f', desc: 'Pull trip data across your whole fleet.' },
  { name: 'Stripe', mark: 'S', bg: '#635bff', fg: '#ffffff', desc: 'Pay drivers out in one click, reconciled.' },
];

export default function LandingPage() {
  return (
    <div className={`spot-site ${spotFontVars}`} data-theme="light">
      <div className="wrap">
        {/* NAV */}
        <header className="nav">
          <div className="container nav-inner">
            <a className="logo" href="#top">Spot<span className="dot" /></a>
            <nav className="nav-links">
              <a href="#features">Features</a>
              <a href="#integrations">Integrations</a>
              <a href="#pricing">Pricing</a>
              <a href="#faq">FAQ</a>
            </nav>
            <div className="nav-actions">
              <SpotThemeToggle />
              <Link className="signin" href={SIGN_IN}>Sign in</Link>
              <Link className="btn btn-primary" href={START_TRIAL}>Start free trial</Link>
            </div>
          </div>
        </header>

        {/* HERO */}
        <section className="hero" id="top">
          <div className="container">
            <span className="eyebrow"><span className="live" /> Built for taxi &amp; cab fleets of 5–50 vehicles</span>
            <h1 className="hero-title">Your whole fleet, <span className="pos">running smoothly</span>.</h1>
            <p className="hero-sub">Spot pulls drivers, vehicles, shifts, compliance and weekly settlements into one clean dashboard — so you spend less time in spreadsheets and more time keeping cars on the road.</p>
            <div className="hero-cta">
              <Link className="btn btn-primary btn-lg" href={START_TRIAL}>Start free trial</Link>
              <a className="btn btn-ghost btn-lg" href="#features">See how it works</a>
            </div>
            <div className="hero-micro">
              <span><span className="ck">✓</span> 14-day free trial</span>
              <span><span className="ck">✓</span> No card required</span>
              <span><span className="ck">✓</span> Set up in an afternoon</span>
            </div>
          </div>
          <div className="container hero-shot-wrap">
            <div className="shot">
              <ShotBar path="dashboard" />
              <div className="mock">
                <div className="mock-top">
                  <span className="mock-title">Fleet overview</span>
                  <span className="mock-pill">● Live</span>
                </div>
                <div className="mock-cards">
                  <div className="mock-card"><div className="k">Revenue / wk</div><div className="v">€18.4k</div></div>
                  <div className="mock-card"><div className="k">On shift</div><div className="v accent">14</div></div>
                  <div className="mock-card"><div className="k">Utilisation</div><div className="v pos">82%</div></div>
                  <div className="mock-card"><div className="k">Alerts</div><div className="v">3</div></div>
                </div>
                <div className="mock-rows">
                  <div className="mock-row"><span className="av" /><span className="nm">A. Murphy</span><span className="meta">· 12-D-4471</span><span className="amt">€412</span><span className="st">On shift</span></div>
                  <div className="mock-row"><span className="av" /><span className="nm">J. Byrne</span><span className="meta">· 21-C-9920</span><span className="amt">€388</span><span className="st">On shift</span></div>
                  <div className="mock-row"><span className="av" /><span className="nm">K. Walsh</span><span className="meta">· 19-L-1183</span><span className="amt">€0</span><span className="st idle">Off duty</span></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* STATS */}
        <section className="stats">
          <div className="container">
            <div className="stats-grid">
              <div className="stat"><div className="num mono">6<span style={{ fontSize: 24 }}> hrs</span></div><div className="lbl">saved on payroll every week</div></div>
              <div className="stat"><div className="num mono">100<span style={{ fontSize: 24 }}>%</span></div><div className="lbl">licence &amp; VRT compliance</div></div>
              <div className="stat"><div className="num mono">1</div><div className="lbl">click to run driver payouts</div></div>
              <div className="stat"><div className="num mono">0</div><div className="lbl">spreadsheets to maintain</div></div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section className="sec-pad" id="features">
          <div className="container">
            <div className="sec-head center" style={{ marginBottom: 72 }}>
              <span className="kicker">Everything in one place</span>
              <h2 className="sec-title">Run operations from a single screen</h2>
              <p className="sec-desc">No more jumping between WhatsApp, paper logs and three different spreadsheets. Spot keeps the whole operation — and every euro — in view.</p>
            </div>

            {/* Feature 1 */}
            <div className="frow">
              <div className="ftext">
                <div className="feat-ico">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a7 7 0 0 1 14 0v1" /></svg>
                </div>
                <h3>See who&apos;s on the road, live</h3>
                <p>Every clock-in, shift hour and euro earned, streaming in as it happens. Know exactly who&apos;s driving, who&apos;s available and who&apos;s running behind — without making a single call.</p>
                <ul className="feat-list">
                  <li><span className="tick"><Check /></span> Live shift status and hours <span className="t2">— on shift, off duty, running late</span></li>
                  <li><span className="tick"><Check /></span> Per-driver earnings as the day unfolds</li>
                  <li><span className="tick"><Check /></span> Document checks flagged before they expire</li>
                </ul>
              </div>
              <div className="shot tight">
                <ShotBar path="drivers" />
                <div className="mock">
                  <div className="mock-rows">
                    <div className="mock-row"><span className="av" /><span className="nm">A. Murphy</span><span className="amt">€412</span><span className="st">On shift</span></div>
                    <div className="mock-row"><span className="av" /><span className="nm">J. Byrne</span><span className="amt">€388</span><span className="st">On shift</span></div>
                    <div className="mock-row"><span className="av" /><span className="nm">S. Doyle</span><span className="amt">€201</span><span className="st">On shift</span></div>
                    <div className="mock-row"><span className="av" /><span className="nm">K. Walsh</span><span className="amt">€0</span><span className="st idle">Off duty</span></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="frow flip">
              <div className="ftext">
                <div className="feat-ico">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17h14M6.5 17l-1.2-4.8A2 2 0 0 1 7.2 9.7l.4-.1m0 0L9 6h6l1.4 3.6m-8.8 0h8.8m0 0 .4.1a2 2 0 0 1 1.9 2.5L17.5 17" /><circle cx="7.5" cy="17.5" r="1.5" /><circle cx="16.5" cy="17.5" r="1.5" /></svg>
                </div>
                <h3>Never miss a licence again</h3>
                <p>Every plate, odometer reading and document lives in one place — with utilisation tracking and expiry alerts that warn you weeks before a road licence, insurance or VRT lapses.</p>
                <ul className="feat-list">
                  <li><span className="tick"><Check /></span> Live utilisation per vehicle, 7-day average</li>
                  <li><span className="tick"><Check /></span> Service, idle and active status at a glance</li>
                  <li><span className="tick"><Check /></span> Tiered alerts for every expiring document</li>
                </ul>
              </div>
              <div className="shot tight">
                <ShotBar path="vehicles" />
                <div className="mock">
                  <div className="mock-cards">
                    <div className="mock-card"><div className="k">Active</div><div className="v pos">11</div></div>
                    <div className="mock-card"><div className="k">Idle</div><div className="v">2</div></div>
                    <div className="mock-card"><div className="k">Service</div><div className="v">1</div></div>
                    <div className="mock-card"><div className="k">Expiring</div><div className="v accent">3</div></div>
                  </div>
                  <div className="mock-rows">
                    <div className="mock-row"><span className="nm mono">12-D-4471</span><span className="meta">· 84% used</span><span className="st">Active</span></div>
                    <div className="mock-row"><span className="nm mono">21-C-9920</span><span className="meta">· 77% used</span><span className="st">Active</span></div>
                    <div className="mock-row"><span className="nm mono">19-L-1183</span><span className="meta">· idle 2d</span><span className="st idle">Idle</span></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="frow">
              <div className="ftext">
                <div className="feat-ico">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h18M3 7l2 12a2 2 0 0 0 2 1.7h10A2 2 0 0 0 19 19l2-12M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M12 11v5M9.5 13.5h5" /></svg>
                </div>
                <h3>Weekly driver pay, reconciled in minutes</h3>
                <p>Spot does the maths for every driver — gross splits, fees, cash drops, tips and adjustments — then hands you clean, payable settlements. Review, approve and run payouts in one pass.</p>
                <ul className="feat-list">
                  <li><span className="tick"><Check /></span> Automatic per-driver weekly reconciliation</li>
                  <li><span className="tick"><Check /></span> Adjustments, deductions and cash drops handled</li>
                  <li><span className="tick"><Check /></span> Month-end PDF statements, ready for the books</li>
                </ul>
              </div>
              <div className="shot tight">
                <ShotBar path="settlements" />
                <div className="mock">
                  <div className="mock-rows">
                    <div className="mock-row"><span className="nm">A. Murphy</span><span className="meta">· wk 22</span><span className="amt">€1,284</span><span className="st">Payable</span></div>
                    <div className="mock-row"><span className="nm">J. Byrne</span><span className="meta">· wk 22</span><span className="amt">€1,107</span><span className="st">Payable</span></div>
                    <div className="mock-row"><span className="nm">S. Doyle</span><span className="meta">· wk 22</span><span className="amt">€642</span><span className="st idle">Review</span></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Mini grid */}
            <div className="mini-grid">
              <div className="mini">
                <div className="mi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg></div>
                <h4>Rosters</h4>
                <p>Build weekly schedules, assign cars to drivers and spot clashes before the shift starts.</p>
              </div>
              <div className="mini">
                <div className="mi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M7 14l3-4 3 3 4-6" /></svg></div>
                <h4>Financials</h4>
                <p>Income, expenses and profit across the fleet — by day, week or month, always current.</p>
              </div>
              <div className="mini">
                <div className="mi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4h12a1 1 0 0 1 1 1v15l-3-2-2 2-2-2-2 2-2-2-2 2V5a1 1 0 0 1 1-1Z" /><path d="M9 8h6M9 12h6" /></svg></div>
                <h4>Bookkeeping</h4>
                <p>Every transaction categorised and VAT-ready, so month-end takes minutes, not days.</p>
              </div>
              <div className="mini">
                <div className="mi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 3.8 2.6 17a1.5 1.5 0 0 0 1.3 2.3h16.2a1.5 1.5 0 0 0 1.3-2.3L13.7 3.8a1.6 1.6 0 0 0-2.8 0Z" /><path d="M12 9v4M12 17h.01" /></svg></div>
                <h4>Damages</h4>
                <p>Log incidents against any vehicle, track repair costs and keep a full damage history.</p>
              </div>
              <div className="mini">
                <div className="mi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9Z" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg></div>
                <h4>Smart alerts</h4>
                <p>Expiring docs, idle cars, pending settlements — surfaced before they become a problem.</p>
              </div>
              <div className="mini">
                <div className="mi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2" width="12" height="20" rx="3" /><path d="M11 18h2" /></svg></div>
                <h4>Driver app</h4>
                <p>Drivers clock in, log shifts and see their earnings from a free app — no training needed.</p>
              </div>
            </div>
          </div>
        </section>

        {/* INTEGRATIONS */}
        <section className="sec-pad" id="integrations" style={{ background: 'var(--bg-1)', borderTop: '1px solid var(--line-1)', borderBottom: '1px solid var(--line-1)' }}>
          <div className="container">
            <div className="sec-head center" style={{ marginBottom: 56 }}>
              <span className="kicker">Integrations</span>
              <h2 className="sec-title">Plugs into the platforms you already use</h2>
              <p className="sec-desc">Stop copying trip data and payouts by hand. We&rsquo;re building native connections to the ride-hail and payment platforms your fleet runs on — earnings flow straight into Spot.</p>
            </div>

            <div className="integ-grid">
              {INTEGRATIONS.map((it) => (
                <div className="integ" key={it.name}>
                  <span className="integ-soon">Coming soon</span>
                  <div className="integ-logo" style={{ background: it.bg, color: it.fg }} aria-hidden>{it.mark}</div>
                  <div className="integ-name">{it.name}</div>
                  <p className="integ-desc">{it.desc}</p>
                </div>
              ))}
            </div>

            <p className="integ-note">
              Want a platform we haven&rsquo;t listed? <a href="mailto:hello@spotfleet.io?subject=Integration%20request">Tell us</a> and we&rsquo;ll prioritise it.
            </p>
          </div>
        </section>

        {/* PRICING */}
        <section className="sec-pad" id="pricing" style={{ background: 'var(--bg-1)', borderTop: '1px solid var(--line-1)', borderBottom: '1px solid var(--line-1)' }}>
          <div className="container">
            <div className="sec-head center">
              <span className="kicker">Pricing</span>
              <h2 className="sec-title">Simple, per-vehicle pricing</h2>
              <p className="sec-desc">Pay only for the cars you run. Every plan includes the full dashboard, the driver app and unlimited team members.</p>
            </div>
            <div className="price-grid">
              <div className="plan">
                <div className="pname">Starter</div>
                <div className="pdesc">For owner-operators getting off spreadsheets.</div>
                <div className="pprice"><span className="amt">€12</span><span className="per">/ vehicle / mo</span></div>
                <div className="pbill">Up to 10 vehicles · billed monthly</div>
                <ul className="pfeat">
                  <li><span className="tick"><Check /></span> Dashboard, drivers &amp; vehicles</li>
                  <li><span className="tick"><Check /></span> Shifts &amp; rosters</li>
                  <li><span className="tick"><Check /></span> Free driver app</li>
                  <li><span className="tick"><Check /></span> Email support</li>
                </ul>
                <Link className="btn btn-ghost" href={START_TRIAL}>Start free trial</Link>
              </div>

              <div className="plan feat">
                <div className="pop">Most popular</div>
                <div className="pname">Pro</div>
                <div className="pdesc">For growing fleets that pay drivers weekly.</div>
                <div className="pprice"><span className="amt">€9</span><span className="per">/ vehicle / mo</span></div>
                <div className="pbill">Up to 50 vehicles · billed monthly</div>
                <ul className="pfeat">
                  <li><span className="tick"><Check /></span> Everything in Starter</li>
                  <li><span className="tick"><Check /></span> Weekly settlements &amp; payouts</li>
                  <li><span className="tick"><Check /></span> Compliance alerts &amp; bookkeeping</li>
                  <li><span className="tick"><Check /></span> Priority support</li>
                </ul>
                <Link className="btn btn-primary" href={START_TRIAL}>Start free trial</Link>
              </div>

              <div className="plan">
                <div className="pname">Fleet</div>
                <div className="pdesc">For larger operators with custom needs.</div>
                <div className="pprice"><span className="amt">Let&apos;s talk</span></div>
                <div className="pbill">50+ vehicles · annual billing</div>
                <ul className="pfeat">
                  <li><span className="tick"><Check /></span> Everything in Pro</li>
                  <li><span className="tick"><Check /></span> Volume per-vehicle pricing</li>
                  <li><span className="tick"><Check /></span> Guided onboarding &amp; data import</li>
                  <li><span className="tick"><Check /></span> Dedicated account manager</li>
                </ul>
                <a className="btn btn-ghost" href="mailto:hello@spotfleet.io?subject=Spot%20Fleet%20demo">Book a demo</a>
              </div>
            </div>
            <p className="price-note">Prices in EUR, excl. VAT. Cancel anytime — no lock-in.</p>
          </div>
        </section>

        {/* FAQ */}
        <section className="sec-pad" id="faq">
          <div className="container">
            <div className="sec-head center">
              <span className="kicker">FAQ</span>
              <h2 className="sec-title">Questions, answered</h2>
            </div>
            <div className="faq-grid">
              <details className="faq" open>
                <summary><span className="q">How long does it take to get set up?</span><span className="pm" /></summary>
                <div className="ans">Most fleets are live in an afternoon. Add your vehicles and drivers, invite the team to the driver app, and you&apos;re running shifts the same day. On the Fleet plan we&apos;ll import your existing data for you.</div>
              </details>
              <details className="faq">
                <summary><span className="q">Do my drivers need to install anything?</span><span className="pm" /></summary>
                <div className="ans">Drivers use the free Spot driver app to clock in, log shifts and see their earnings. It takes a couple of minutes to set up and needs no training — if they can use a ride-hail app, they can use Spot.</div>
              </details>
              <details className="faq">
                <summary><span className="q">Can I move over my current vehicles and drivers?</span><span className="pm" /></summary>
                <div className="ans">Yes. You can add everything manually in minutes, or send us a spreadsheet and we&apos;ll import your vehicles, drivers and documents so nothing gets left behind.</div>
              </details>
              <details className="faq">
                <summary><span className="q">How do driver settlements and payouts work?</span><span className="pm" /></summary>
                <div className="ans">Spot reconciles each driver&apos;s week automatically — gross splits, fees, cash drops, tips and any adjustments — then produces a clean, payable amount. You review, approve and run payouts in a single pass, with a PDF statement for your records.</div>
              </details>
              <details className="faq">
                <summary><span className="q">Is my fleet data secure?</span><span className="pm" /></summary>
                <div className="ans">Your data is encrypted in transit and at rest, hosted in the EU, and only ever visible to your team. You can export everything at any time, and we never sell or share your data.</div>
              </details>
              <details className="faq">
                <summary><span className="q">What if I run more than 50 vehicles?</span><span className="pm" /></summary>
                <div className="ans">The Fleet plan is built for larger operators, with volume per-vehicle pricing, guided onboarding and a dedicated account manager. Book a demo and we&apos;ll tailor it to your operation.</div>
              </details>
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section style={{ padding: '20px 0 0' }}>
          <div className="container">
            <div className="cta-band">
              <h2>Ready to get your fleet on Spot?</h2>
              <p>Start your 14-day free trial today. No card, no lock-in — just your whole operation, finally in one place.</p>
              <div className="hero-cta">
                <Link className="btn btn-primary btn-lg" href={START_TRIAL}>Start free trial</Link>
                <a className="btn btn-ghost btn-lg" href="mailto:hello@spotfleet.io?subject=Spot%20Fleet%20demo">Book a demo</a>
              </div>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer>
          <div className="container">
            <div className="foot-grid">
              <div className="foot-brand">
                <a className="logo" href="#top">Spot<span className="dot" /></a>
                <p>Fleet management for small taxi &amp; cab operators. Drivers, vehicles, shifts and settlements — in one clean dashboard.</p>
              </div>
              <div className="foot-col">
                <h5>Product</h5>
                <a href="#features">Features</a>
                <a href="#pricing">Pricing</a>
                <a href="#features">Driver app</a>
                <a href="#faq">FAQ</a>
              </div>
              <div className="foot-col">
                <h5>Company</h5>
                <a href="mailto:hello@spotfleet.io">About</a>
                <a href="mailto:hello@spotfleet.io">Contact</a>
                <a href="mailto:hello@spotfleet.io">Careers</a>
              </div>
              <div className="foot-col">
                <h5>Legal</h5>
                <a href="#">Privacy</a>
                <a href="#">Terms</a>
                <a href="#">Security</a>
              </div>
            </div>
            <div className="foot-bottom">
              <span>© 2026 Spot Fleet. All rights reserved.</span>
              <span className="mono">Made for fleets that move.</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
