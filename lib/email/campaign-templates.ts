// =============================================================================
// EMAIL CAMPAIGNS — starter templates
// =============================================================================
// Built-in starting points for the admin console's email editor. Each one is a
// complete HTML email: tables + inline styles only, because email clients are
// not browsers (Outlook renders through Word, Gmail strips most <style>
// blocks, flexbox/grid/CSS variables collapse). Colours mirror the BRAND
// tokens in lib/email/index.ts.
//
// Pure data — safe to import on the client. Merge tags ({{first_name}},
// {{app_url}}, {{unsubscribe_url}}, …) are filled in per recipient at send time.
// =============================================================================

export interface StarterTemplate {
  id: string;
  name: string;
  description: string;
  subject: string;
  preheader: string;
  /** Marketing (respects unsubscribes) or a service notice. */
  marketing: boolean;
  html: string;
}

const C = {
  accent: '#1a8f5a',
  accentDark: '#14784a',
  accentSoft: '#eef8f2',
  accentLine: '#bfe3cf',
  pageBg: '#f6f7f9',
  cardBg: '#ffffff',
  panelBg: '#f1f3f7',
  line: '#e6e8ec',
  text1: '#0e1116',
  text2: '#4a5260',
  text3: '#7a8290',
  warnBg: '#fff7e8',
  warnLine: '#f3d9a4',
  warnText: '#8a5a00',
};

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const p = (text: string, extra = '') =>
  `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.65;color:${C.text2};${extra}">${text}</p>`;

const h1 = (text: string, extra = '') =>
  `<h1 style="margin:0 0 16px;font-family:${FONT};font-size:24px;line-height:1.3;font-weight:700;letter-spacing:-0.01em;color:${C.text1};${extra}">${text}</h1>`;

const h2 = (text: string) =>
  `<h2 style="margin:0 0 8px;font-family:${FONT};font-size:17px;line-height:1.4;font-weight:700;color:${C.text1};">${text}</h2>`;

const eyebrow = (text: string) =>
  `<p style="margin:0 0 10px;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.accent};">${text}</p>`;

// No align="left" on the table: in email HTML that floats it, and the next
// paragraph wraps up beside the button. align="center" centres without floating.
const button = (label: string, href: string, align: 'left' | 'center' = 'left') => `
              <table role="presentation" border="0" cellpadding="0" cellspacing="0"${align === 'center' ? ' align="center"' : ''} style="margin:8px ${align === 'center' ? 'auto' : '0'} 8px;">
                <tr>
                  <td align="center" bgcolor="${C.accent}" style="border-radius:10px;">
                    <a href="${href}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 30px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:10px;">${label}</a>
                  </td>
                </tr>
              </table>`;

const divider = `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr><td style="border-top:1px solid ${C.line};font-size:0;line-height:0;">&nbsp;</td></tr></table>`;

const checkRow = (title: string, text: string) => `
                <tr>
                  <td valign="top" width="36" style="padding:0 0 18px;">
                    <div style="width:24px;height:24px;border-radius:12px;background:${C.accentSoft};border:1px solid ${C.accentLine};color:${C.accent};font-family:${FONT};font-size:13px;font-weight:700;line-height:24px;text-align:center;">&#10003;</div>
                  </td>
                  <td valign="top" style="padding:1px 0 18px;">
                    <div style="font-family:${FONT};font-size:15px;font-weight:600;color:${C.text1};">${title}</div>
                    <div style="font-family:${FONT};font-size:14px;line-height:1.6;color:${C.text2};margin-top:3px;">${text}</div>
                  </td>
                </tr>`;

const numberRow = (n: number, title: string, text: string) => `
                <tr>
                  <td valign="top" width="38" style="padding:0 0 16px;">
                    <div style="width:26px;height:26px;border-radius:13px;background:${C.accent};color:#ffffff;font-family:${FONT};font-size:13px;font-weight:700;line-height:26px;text-align:center;">${n}</div>
                  </td>
                  <td valign="top" style="padding:2px 0 16px;">
                    <div style="font-family:${FONT};font-size:15px;font-weight:600;color:${C.text1};">${title}</div>
                    <div style="font-family:${FONT};font-size:14px;line-height:1.6;color:${C.text2};margin-top:2px;">${text}</div>
                  </td>
                </tr>`;

const rows = (inner: string) =>
  `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin:4px 0 8px;">${inner}
              </table>`;

const callout = (lead: string, text: string, tone: 'green' | 'amber' = 'green') => {
  const bg = tone === 'green' ? C.accentSoft : C.warnBg;
  const line = tone === 'green' ? C.accentLine : C.warnLine;
  const leadColor = tone === 'green' ? C.accentDark : C.warnText;
  return `
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin:4px 0 22px;">
                <tr>
                  <td style="background:${bg};border:1px solid ${line};border-radius:12px;padding:16px 18px;">
                    <div style="font-family:${FONT};font-size:14px;font-weight:700;color:${leadColor};margin-bottom:4px;">${lead}</div>
                    <div style="font-family:${FONT};font-size:14px;line-height:1.6;color:${C.text2};">${text}</div>
                  </td>
                </tr>
              </table>`;
};

interface ShellOptions {
  title: string;
  /** Rendered inside the white card. */
  body: string;
  /** Optional block above the card (e.g. a newsletter masthead). */
  masthead?: string;
  /** Include the unsubscribe link in the footer (marketing templates). */
  unsubscribe: boolean;
}

function shell({ title, body, masthead = '', unsubscribe }: ShellOptions): string {
  const optOut = unsubscribe
    ? `You're receiving this because you have a {{app_name}} account.<br />
                <a href="{{unsubscribe_url}}" target="_blank" rel="noopener" style="color:${C.text3};text-decoration:underline;">Unsubscribe</a>
                &nbsp;·&nbsp;
                <a href="{{app_url}}" target="_blank" rel="noopener" style="color:${C.text3};text-decoration:underline;">Open {{app_name}}</a>`
    : `You're receiving this service notice because you have a {{app_name}} account.`;

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${title}</title>
  <style>
    @media only screen and (max-width: 620px) {
      .rv-card { padding: 26px 22px !important; }
      .rv-wrap { padding: 20px 12px !important; }
    }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
  </style>
</head>
<body style="margin:0;padding:0;background:${C.pageBg};-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">{{preheader}}</div>
  <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background:${C.pageBg};">
    <tr>
      <td align="center" class="rv-wrap" style="padding:32px 16px;">
        <table role="presentation" width="600" border="0" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">

          <tr>
            <td align="center" style="padding:0 0 22px;">
              <a href="{{app_url}}" target="_blank" rel="noopener" style="text-decoration:none;">
                <img src="{{logo_url}}" width="132" alt="{{app_name}}" style="display:block;width:132px;max-width:132px;height:auto;border:0;outline:none;font-family:${FONT};font-size:19px;font-weight:700;color:${C.accent};" />
              </a>
            </td>
          </tr>
${masthead}
          <tr>
            <td class="rv-card" style="background:${C.cardBg};border:1px solid ${C.line};border-radius:${masthead ? '0 0 14px 14px' : '14px'};${masthead ? 'border-top:0;' : ''}padding:34px 36px;">
${body}
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:22px 12px 0;">
              <p style="margin:0 0 8px;font-family:${FONT};font-size:12px;line-height:1.7;color:${C.text3};">
                ${optOut}
              </p>
              <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.text3};">&copy; {{year}} {{app_name}} &nbsp;·&nbsp; Fleet management for taxi &amp; rideshare operators</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── The templates ───────────────────────────────────────────────────────────

const productUpdate: StarterTemplate = {
  id: 'starter-product-update',
  name: 'Product update',
  description: 'Three highlights of what shipped, with a button into the app.',
  subject: "What's new in Rovora this month",
  preheader: 'Three improvements that save you time on the road and in the office.',
  marketing: true,
  html: shell({
    title: "What's new in Rovora",
    unsubscribe: true,
    body: `
              ${eyebrow('Product update')}
              ${h1("Here's what's new in {{app_name}}")}
              ${p('Hi {{first_name|there}},', `color:${C.text1};font-weight:600;`)}
              ${p("We've been busy. Here are the improvements that landed for {{fleet_name|your fleet}} this month:")}
              ${rows(
                checkRow('In-app chat with your drivers', 'Message drivers one-to-one or in groups, right inside Rovora — no more WhatsApp groups to manage.') +
                  checkRow('Faster settlements', 'Weekly driver settlements now calculate in seconds, even for large fleets.') +
                  checkRow('Smarter service reminders', 'Get nudged before a vehicle is due for a service, based on real mileage.'),
              )}
              ${button('See what’s new', '{{app_url}}/fleet')}
              ${p('Questions or feedback? Just reply to this email — a real person reads every one.', 'margin-top:22px;')}
              ${p('— The {{app_name}} team', `margin:0;color:${C.text1};`)}`,
  }),
};

const newsletter: StarterTemplate = {
  id: 'starter-newsletter',
  name: 'Monthly newsletter',
  description: 'Masthead, a featured story, a tip of the month and a link list.',
  subject: 'The Rovora Monthly — fleet tips & product news',
  preheader: 'This month: cutting fuel costs, a new reporting view, and an operator playbook.',
  marketing: true,
  html: shell({
    title: 'The Rovora Monthly',
    unsubscribe: true,
    masthead: `
          <tr>
            <td style="background:${C.accent};border-radius:14px 14px 0 0;padding:28px 36px;">
              <p style="margin:0 0 6px;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#cdeedc;">Newsletter</p>
              <p style="margin:0;font-family:${FONT};font-size:26px;line-height:1.25;font-weight:700;letter-spacing:-0.01em;color:#ffffff;">The {{app_name}} Monthly</p>
            </td>
          </tr>`,
    body: `
              ${p('Hi {{first_name|there}},', `color:${C.text1};font-weight:600;`)}
              ${p("Welcome to this month's round-up of product news and practical tips for running a tighter fleet.")}
              ${divider}
              ${eyebrow('Featured')}
              ${h2('How operators are cutting fuel costs by 12%')}
              ${p('We looked at what the most efficient fleets on Rovora do differently — from idle-time alerts to smarter shift planning. Here are the three habits that made the biggest difference.')}
              <p style="margin:0 0 24px;"><a href="{{app_url}}/blog" target="_blank" rel="noopener" style="font-family:${FONT};font-size:15px;font-weight:600;color:${C.accent};text-decoration:none;">Read the full story &rarr;</a></p>
              ${callout('Tip of the month', 'Set a document-expiry reminder 30 days ahead so insurance and licence renewals never catch you out.')}
              ${eyebrow('Also this month')}
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin:0 0 22px;background:${C.panelBg};border:1px solid ${C.line};border-radius:12px;">
                <tr>
                  <td style="padding:13px 16px;">
                    <a href="{{app_url}}/changelog" target="_blank" rel="noopener" style="font-family:${FONT};font-size:14.5px;font-weight:600;color:${C.accent};text-decoration:none;">Changelog &rarr;</a>
                    <div style="font-family:${FONT};font-size:13px;line-height:1.5;color:${C.text2};margin-top:2px;">Every improvement we shipped, in one place.</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:13px 16px;border-top:1px solid ${C.line};">
                    <a href="{{app_url}}/docs" target="_blank" rel="noopener" style="font-family:${FONT};font-size:14.5px;font-weight:600;color:${C.accent};text-decoration:none;">Help centre &rarr;</a>
                    <div style="font-family:${FONT};font-size:13px;line-height:1.5;color:${C.text2};margin-top:2px;">Step-by-step guides for every part of Rovora.</div>
                  </td>
                </tr>
              </table>
              ${button('Open your fleet', '{{app_url}}/fleet')}
              ${p('See you next month,', 'margin:22px 0 0;')}
              ${p('— The {{app_name}} team', `margin:0;color:${C.text1};`)}`,
  }),
};

const featureLaunch: StarterTemplate = {
  id: 'starter-feature-launch',
  name: 'Feature launch',
  description: 'Big centred announcement with a three-step "how it works".',
  subject: 'Introducing: in-app chat for your fleet',
  preheader: 'Message your drivers right inside Rovora — available today on every plan.',
  marketing: true,
  html: shell({
    title: 'Introducing in-app chat',
    unsubscribe: true,
    body: `
              <div style="text-align:center;">
                <span style="display:inline-block;margin:0 0 14px;padding:5px 12px;border-radius:100px;background:${C.accentSoft};border:1px solid ${C.accentLine};font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${C.accent};">New</span>
                ${h1('Introducing in-app chat', 'font-size:28px;text-align:center;')}
                ${p('Talk to your drivers one-to-one or in groups — right where the rest of your fleet lives. No more personal WhatsApp numbers.', 'text-align:center;font-size:16px;')}
              </div>
              ${divider}
              ${eyebrow('How it works')}
              ${rows(
                numberRow(1, 'Open Messages', 'Find the new Messages tab in the sidebar of your fleet dashboard.') +
                  numberRow(2, 'Start a chat or a group', 'Pick a driver, or create a group and choose who’s in it.') +
                  numberRow(3, 'Drivers reply from the app', 'Messages arrive as push notifications in the Rovora driver app.'),
              )}
              <div style="text-align:center;">
                ${button('Try it now', '{{app_url}}/fleet/messages', 'center')}
              </div>
              ${p('Available today on every plan, at no extra cost.', `text-align:center;font-size:13px;color:${C.text3};margin:14px 0 0;`)}`,
  }),
};

// Sent to fleets that signed up but never added anyone (admin console →
// audience "Not set up yet"), once the Bolt fleet import shipped.
const boltImport: StarterTemplate = {
  id: 'starter-bolt-import',
  name: 'Bolt fleet import',
  description: 'For fleets that never added their drivers & cars: bring the whole Bolt fleet in with one click.',
  subject: 'Your Bolt fleet, in Rovora in one click',
  preheader: 'No more typing drivers and cars in one by one — connect Bolt and import everyone at once.',
  marketing: true,
  html: shell({
    title: 'Bring your Bolt fleet into Rovora',
    unsubscribe: true,
    body: `
              <span style="display:inline-block;margin:0 0 14px;padding:5px 12px;border-radius:100px;background:${C.accentSoft};border:1px solid ${C.accentLine};font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${C.accent};">New</span>
              ${h1('Bring your whole Bolt fleet into Rovora in one click')}
              ${p('Hi {{first_name|there}},', `color:${C.text1};font-weight:600;`)}
              ${p('You set up {{fleet_name|your fleet}} on {{app_name}}, but your drivers and cars aren’t in yet. We know typing everyone in one by one is the slow part, so if you work with Bolt you no longer have to.')}
              ${eyebrow('How it works')}
              ${rows(
                numberRow(1, 'Create a key in the Bolt Fleet Portal', 'In Bolt, open Settings → Fleet API keys (v2) and press Create API key. It takes a few seconds.') +
                  numberRow(2, 'Paste it into Rovora', 'Open Bolt in your Rovora dashboard and paste the Client ID and secret.') +
                  numberRow(3, 'Press Import everything', 'Every driver and car on your Bolt account is added, each driver with the car they drive. Or tick exactly who to add.'),
              )}
              ${button('Import my Bolt fleet', '{{app_url}}/fleet/bolt')}
              ${callout('Safe to try', 'Rovora only reads from Bolt and can’t change anything in your Bolt account. Changed your mind? Undo the import for 24 hours. When someone new joins your Bolt fleet later, we’ll ask before adding them.')}
              ${p(`Want a hand? <a href="{{app_url}}/contact?topic=onboarding#form" target="_blank" rel="noopener" style="color:${C.accent};font-weight:600;text-decoration:none;">Book a 15-minute walkthrough</a> and we’ll set it up with you. Not on Bolt? You can add drivers and cars from your dashboard.`)}
              ${p('— The {{app_name}} team', `margin:0;color:${C.text1};`)}`,
  }),
};

const serviceNotice: StarterTemplate = {
  id: 'starter-service-notice',
  name: 'Service notice',
  description: 'Planned maintenance or an important account notice. Not marketing.',
  subject: 'Scheduled maintenance this Sunday',
  preheader: 'Rovora will be briefly unavailable on Sunday between 02:00 and 04:00 CET.',
  marketing: false,
  html: shell({
    title: 'Scheduled maintenance',
    unsubscribe: false,
    body: `
              ${eyebrow('Service notice')}
              ${h1('Scheduled maintenance')}
              ${p('Hi {{first_name|there}},', `color:${C.text1};font-weight:600;`)}
              ${p("We're upgrading our infrastructure to keep {{app_name}} fast and reliable. During this window the dashboard and driver app will be briefly unavailable.")}
              ${callout('When', 'Sunday, 02:00 – 04:00 CET. Most of the work will finish well before then.', 'amber')}
              ${h2('What to expect')}
              <ul style="margin:0 0 18px;padding:0 0 0 20px;font-family:${FONT};font-size:15px;line-height:1.7;color:${C.text2};">
                <li>Drivers already on shift stay on shift — their trips are saved when we're back.</li>
                <li>Location tracking resumes automatically.</li>
                <li>No data will be lost, and there's nothing you need to do.</li>
              </ul>
              ${p('If anything looks off afterwards, reply to this email and we’ll jump on it.')}
              ${p('— The {{app_name}} team', `margin:0;color:${C.text1};`)}`,
  }),
};

const blank: StarterTemplate = {
  id: 'starter-blank',
  name: 'Blank (branded)',
  description: 'Logo, a heading, a paragraph and a button. Start from scratch.',
  subject: '',
  preheader: '',
  marketing: true,
  html: shell({
    title: '{{app_name}}',
    unsubscribe: true,
    body: `
              ${h1('Your heading here')}
              ${p('Hi {{first_name|there}},', `color:${C.text1};font-weight:600;`)}
              ${p('Write your message here. Keep it short and give people one clear next step.')}
              ${button('Open Rovora', '{{app_url}}')}
              ${p('— The {{app_name}} team', `margin:22px 0 0;color:${C.text1};`)}`,
  }),
};

export const STARTER_TEMPLATES: StarterTemplate[] = [productUpdate, newsletter, featureLaunch, boltImport, serviceNotice, blank];
