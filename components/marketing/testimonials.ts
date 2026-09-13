// =============================================================================
// HOMEPAGE TESTIMONIALS — real customer quotes only.
// =============================================================================
// The carousel on the homepage renders ONLY entries with `live: true`, and the
// whole section is hidden while there are none. Keep it that way: invented
// reviews are illegal to publish in the EU (Unfair Commercial Practices rules,
// which Malta follows) and a prospect who checks one name and finds nothing
// stops trusting the rest of the page.
//
// To add a quote:
//   1. Get the customer's written OK (an email reply saying "yes, you can use
//      this on your website" is enough — keep it).
//   2. Fill in the entry below, set live: true.
//   3. Stars: only what THEY gave, in whole or half stars.
//
// The three entries below are PLACEHOLDERS so the layout can be previewed
// locally — they never render on the live site.
// =============================================================================

export interface Testimonial {
  /** Customer's name as they want it shown (first name + initial is fine). */
  name: string;
  /** Their role and fleet, e.g. "Owner, 12-car fleet, Sliema". */
  role: string;
  /** The quote, in their words. 2–4 sentences reads best. */
  quote: string;
  /** 1–5 in half-star steps, exactly as the customer rated. */
  stars: 1 | 1.5 | 2 | 2.5 | 3 | 3.5 | 4 | 4.5 | 5;
  /** Set to true only for real, approved quotes. */
  live: boolean;
}

export const TESTIMONIALS: Testimonial[] = [
  {
    name: 'PLACEHOLDER — customer name',
    role: 'PLACEHOLDER — role, fleet size, town',
    quote:
      'PLACEHOLDER — a real customer quote goes here. Something specific beats something glowing: what they used to do, what changed, how long it takes now.',
    stars: 5,
    live: false,
  },
  {
    name: 'PLACEHOLDER — customer name',
    role: 'PLACEHOLDER — role, fleet size, town',
    quote: 'PLACEHOLDER — second quote.',
    stars: 4.5,
    live: false,
  },
  {
    name: 'PLACEHOLDER — customer name',
    role: 'PLACEHOLDER — role, fleet size, town',
    quote: 'PLACEHOLDER — third quote.',
    stars: 4,
    live: false,
  },
];

/** What the homepage actually shows. Set NEXT_PUBLIC_SHOW_PLACEHOLDER_TESTIMONIALS=1 locally to preview the layout. */
export function liveTestimonials(): Testimonial[] {
  const preview = process.env.NEXT_PUBLIC_SHOW_PLACEHOLDER_TESTIMONIALS === '1' && process.env.NODE_ENV !== 'production';
  return TESTIMONIALS.filter((t) => t.live || preview);
}
