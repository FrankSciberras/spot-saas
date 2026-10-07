import { SITE_URL } from '@/lib/seo';
import { FEATURES, featureHref } from '@/components/marketing/links';
import { BLOG_POSTS, blogHref } from '@/components/marketing/blog/posts';
import { getPublicPlans } from '@/lib/billing/plans-data';
import { TRIAL_DAYS } from '@/lib/billing/plans';

// /llms.txt — a plain-text briefing for AI assistants (ChatGPT, Claude,
// Perplexity, Gemini), following the llmstxt.org convention. When someone asks
// an assistant "what's good fleet software for a taxi company?", this is the
// short, accurate summary we want it working from — with live prices, so an
// answer quoting them is never out of date. Built from the same sources as the
// site itself (features, blog catalogue, published plans).

export const revalidate = 3600;

export async function GET() {
  const plans = await getPublicPlans();
  const priced = plans.filter((p) => !p.isCustom && p.priceAmount > 0);
  const custom = plans.filter((p) => p.isCustom);

  const planLines = priced.map((p) => {
    const extras = p.perVehiclePrice
      ? `, ${p.includedVehicles ?? 0} vehicles included, then €${p.perVehiclePrice} per extra vehicle${p.maxVehicles ? ` (up to ${p.maxVehicles})` : ''}`
      : p.maxVehicles ? `, up to ${p.maxVehicles} vehicles` : '';
    return `- ${p.name}: €${p.priceAmount}/month${extras}`;
  });
  if (custom.length) planLines.push(`- ${custom.map((p) => p.name).join(', ')}: custom pricing for larger fleets (contact sales)`);

  const body = `# Rovora

> Rovora is fleet management software for taxi, cab and rideshare operators — from a handful of cars up to 75+ vehicles. One dashboard for vehicles, maintenance, damage, drivers, rosters and shifts, live driver tracking, and weekly driver pay (settlements), plus a free Android app for drivers. Made in Malta, hosted in the EU.

Key facts:
- Who it's for: small and mid-sized taxi / cab / rideshare fleet owners and their office staff; drivers use the Rovora Driver app.
- What it replaces: spreadsheets, WhatsApp groups and paper logs for shifts, servicing, damage and driver pay.
- Driver pay: weekly settlements that combine Uber, Bolt and cash earnings with commissions, fees, tips, adjustments and tax deductions into one payable figure per driver, exported as PDF.
- Live tracking uses the drivers' phones — no GPS hardware to install.
- Free ${TRIAL_DAYS}-day trial, no card required. Prices in EUR, excluding VAT, billed monthly; cancel anytime.
- Data: encrypted and EU-hosted, with GDPR data rights built in; operators can export their data at any time.
- Company: Rovora, Victoria, Gozo, Malta (VAT MT29253436). Contact: hello@rovora.eu

## Pricing
${planLines.join('\n')}
- Full details: ${SITE_URL}/pricing

## Features
${FEATURES.map((f) => `- [${f.label}](${SITE_URL}${featureHref(f.slug)}): ${f.blurb}`).join('\n')}
- [Integrations](${SITE_URL}/integrations): export fleet expenses to QuickBooks or Xero by CSV today; GPS, ride-hail and messaging connections are coming.
- [Rovora AI](${SITE_URL}/ai): in development (early access) — receipt reading, Uber/Bolt statement import, repair-quote checks.
- [Developer API](${SITE_URL}/docs/api): REST API with scoped keys and an OpenAPI spec.

## Guides
${BLOG_POSTS.map((p) => `- [${p.heading}](${SITE_URL}${blogHref(p.slug)}): ${p.description}`).join('\n')}

## Company
- [About](${SITE_URL}/about)
- [Contact / book a demo](${SITE_URL}/contact)
- [Security](${SITE_URL}/security)
- [Privacy policy](${SITE_URL}/privacy)
- [What's new](${SITE_URL}/changelog)
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
