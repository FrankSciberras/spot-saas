'use client';

import { useEffect, useState, useTransition } from 'react';
import { completeOnboardingAction } from '@/lib/actions/org';
import { promoHeadline, type TrialCopy } from '@/lib/billing/trial-offer';
import { rovoraFontVars } from '@/lib/rovoraFonts';
import { HEARD_ABOUT_OPTIONS, RIDE_PLATFORM_OPTIONS, type RidePlatform } from '@/lib/analytics/constants';
import { ONBOARDING_PROGRESS_PATH } from '@/lib/analytics/signup-funnel';
import styles from './onboarding.module.css';

/**
 * Tell the server this account opened the set-up screen, so the admin funnel
 * can tell "verified but never saw it" from "saw it and left". Fire-and-forget:
 * it never delays the page, and a failure is simply a step that goes uncounted.
 */
function reportOpened() {
  // fetch rather than sendBeacon: the request passes through the session
  // refresh in proxy.ts, and a refreshed session cookie must be kept.
  fetch(ONBOARDING_PROGRESS_PATH, {
    method: 'POST',
    body: JSON.stringify({ step: 1 }),
    keepalive: true,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'text/plain' },
  }).catch(() => {});
}

/**
 * Self-serve set-up: ONE screen, then straight into the dashboard.
 *
 * This used to be five screens — name, driver count, vehicle count, tools,
 * plan — before anything existed. Only the name is needed to create a fleet:
 * the counts only fed a plan suggestion (Billing recommends one from the real
 * fleet), every tool starts switched on (Integrations turns them off), and
 * every fleet starts on the free trial (Billing picks a plan). Each extra
 * screen was another place to give up, and the last one showed price cards
 * straight after promising "no card".
 *
 * What to do next lives in the dashboard's getting-started checklist. The one
 * extra tap — which ride apps the drivers work on — is optional and costs no
 * screen: a Bolt fleet is sent to the Bolt page, where connecting brings every
 * driver and car in at once, instead of an empty dashboard.
 */
export default function OnboardingForm({ trial }: { trial: TrialCopy }) {
  const promo = promoHeadline(trial);
  const [name, setName] = useState('');
  // Optional "How did you hear about Rovora?" — feeds Admin → Analytics.
  const [heardAbout, setHeardAbout] = useState('');
  // Optional "Which apps do your drivers work on?" — Bolt fleets go straight to the import.
  const [platforms, setPlatforms] = useState<RidePlatform[]>([]);
  const togglePlatform = (id: RidePlatform) =>
    setPlatforms((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id);
      // "Other or none" and a named app don't go together.
      if (id === 'other') return ['other'];
      return [...prev.filter((p) => p !== 'other'), id];
    });
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    reportOpened();
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter a name for your fleet.');
      return;
    }
    setError('');
    startTransition(async () => {
      // On success the action redirects into the app; only an error comes back.
      const result = await completeOnboardingAction(name, 'trial', [], heardAbout || null, platforms);
      if (result && 'error' in result && result.error) setError(result.error);
    });
  };

  return (
    <div className={`${styles.page} ${rovoraFontVars}`}>
      <div className={styles.inner}>
        <div className={styles.head}>
          <div className={styles.brand}>
            <img src="/logo-full.png" alt="Rovora" className={styles.brandLogo} />
          </div>
          <h1>Name your fleet</h1>
          <p>
            That’s all we need — you’ll be in your dashboard in a few seconds.{' '}
            <strong>{trial.freeLabel}, no card required.</strong>
          </p>
          {promo && (
            <p className={styles.promo}>
              <strong>{promo.tag}:</strong> {promo.text}
            </p>
          )}
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <form className={styles.formWrap} onSubmit={submit}>
          <label htmlFor="fleet-name" className={styles.fieldLabel}>Fleet or company name</label>
          <input
            id="fleet-name"
            type="text"
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Acme Cabs"
            autoComplete="organization"
            maxLength={120}
            autoFocus
          />
          <p className={styles.fieldHint}>You can change it later in Settings.</p>

          <div className={styles.fieldLabel} id="platforms-label" style={{ marginTop: 18 }}>
            Which apps do your drivers work on? <span className={styles.optional}>(optional)</span>
          </div>
          <div className={styles.chips} role="group" aria-labelledby="platforms-label">
            {RIDE_PLATFORM_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                className={styles.chip}
                aria-pressed={platforms.includes(o.id)}
                onClick={() => togglePlatform(o.id)}
              >
                {o.label}
              </button>
            ))}
          </div>
          {platforms.includes('bolt') && (
            <p className={styles.fieldHint}>
              Great — next you&rsquo;ll connect Bolt and bring all your drivers and cars across in one go.
            </p>
          )}

          <label htmlFor="heard-about" className={styles.fieldLabel} style={{ marginTop: 18 }}>
            How did you hear about Rovora? <span className={styles.optional}>(optional)</span>
          </label>
          <select
            id="heard-about"
            className={`${styles.input} ${styles.select}`}
            value={heardAbout}
            onChange={(e) => setHeardAbout(e.target.value)}
          >
            <option value="">Choose one…</option>
            {HEARD_ABOUT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>

          <button
            type="submit"
            className={`${styles.btn} ${styles.btnPrimary} ${styles.btnFull} ${styles.btnLg}`}
            style={{ marginTop: 22 }}
            disabled={isPending || !name.trim()}
          >
            {isPending ? (
              <>
                <span className={styles.spinner} />
                Creating your fleet…
              </>
            ) : (
              'Create my fleet'
            )}
          </button>

          <ul className={styles.perks}>
            <li>Every feature switched on — turn tools off any time from Integrations</li>
            <li>Add vehicles and drivers from your dashboard, at your own pace</li>
            <li>Nothing is charged when the free period ends — you choose a plan only if you want to keep going</li>
          </ul>
        </form>

        <p className={styles.foot}>
          Want us to set it up with you? <a href="/contact?topic=onboarding#form">Book a 15-minute walkthrough</a>
        </p>
      </div>
    </div>
  );
}
