import { promoHeadline, type TrialCopy } from '@/lib/billing/trial-offer';
import type { Testimonial } from '@/components/marketing/testimonials';

/**
 * Beside the sign-up form: what you get, and a way out for people who aren't
 * ready to create an account yet. Beside the card on wide screens, under it on
 * phones (the form always comes first).
 *
 * Every line here is a claim the homepage already makes. Only real, approved
 * customer quotes are shown — none until one is added to testimonials.ts.
 */
export default function SignupAside({ trial, testimonial }: { trial: TrialCopy; testimonial: Testimonial | null }) {
  const promo = promoHeadline(trial);
  const perks = [
    `${trial.freeLabel} with every feature — no card, nothing charged when it ends`,
    'Live in an afternoon: add vehicles and drivers, or send us a spreadsheet and we’ll import it',
    'Works with earnings from Uber, Bolt and eCabs',
    'Your data is encrypted, hosted in the EU, and exportable any time',
  ];
  return (
    <aside className="auth-aside" aria-label="What you get with Rovora">
      {promo && (
        <p className="auth-aside-promo">
          <strong>{promo.tag}:</strong> {promo.text}
        </p>
      )}
      <h2 className="auth-aside-title">What you get</h2>
      <ul className="auth-aside-list">
        {perks.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>

      {testimonial && (
        <figure className="auth-aside-quote">
          <blockquote>“{testimonial.quote}”</blockquote>
          <figcaption>
            {testimonial.name.trim() ? <><strong>{testimonial.name}</strong> · {testimonial.role}</> : testimonial.role}
          </figcaption>
        </figure>
      )}

      <div className="auth-aside-demo">
        <p>
          <strong>Not ready to sign up?</strong> We’ll show you Rovora on a 15-minute call, with your own fleet in mind.
        </p>
        <a className="btn btn-ghost" href="/contact?topic=demo#form" data-track="Book demo click" data-track-label="Sign-up page">
          Book a 15-minute demo
        </a>
      </div>
    </aside>
  );
}
