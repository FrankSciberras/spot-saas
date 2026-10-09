'use client';

// =============================================================================
// FREE-TRIAL OFFER (platform-admin) — how long new sign-ups get for free
// =============================================================================
// Two settings: the standard trial length, and an optional limited-time
// campaign ("3 months free if you sign up by Friday") that takes over until its
// last day, then hands back to the standard trial on its own. Saved to
// app_settings via saveTrialOfferAction; the website, onboarding, the chat
// assistant and the signup itself all read it (lib/billing/trial-offer).
// =============================================================================

import { useState, useTransition, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { saveTrialOfferAction } from '@/lib/actions/trial-offer';
import {
  MAX_TRIAL_DAYS,
  MIN_TRIAL_DAYS,
  formatOfferDay,
  isPromoLive,
  promoHeadline,
  todayForOffers,
  trialCopy,
  trialSpan,
  type TrialOffer,
} from '@/lib/billing/trial-offer';

const PRESETS: { label: string; days: number }[] = [
  { label: '14 days', days: 14 },
  { label: '1 month', days: 30 },
  { label: '2 months', days: 60 },
  { label: '3 months', days: 90 },
  { label: '6 months', days: 180 },
  { label: '1 year', days: 365 },
];

const card: CSSProperties = { background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' };
const inp: CSSProperties = {
  padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line-2)', background: 'var(--bg-2)',
  color: 'var(--text-1)', fontSize: 13, fontFamily: 'inherit', outline: 'none',
};
const lbl: CSSProperties = { fontSize: 11.5, color: 'var(--text-3)', marginBottom: 7, display: 'block' };
const sectionTitle: CSSProperties = { fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 12 };
const chip = (on: boolean): CSSProperties => ({
  padding: '6px 11px', borderRadius: 7, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
  background: on ? 'var(--accent-soft)' : 'var(--bg-1)',
  border: `1px solid ${on ? 'var(--accent-line)' : 'var(--line-2)'}`,
  color: on ? 'var(--accent)' : 'var(--text-2)',
});
const smallBtn: CSSProperties = {
  padding: '5px 9px', background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 6,
  color: 'var(--text-1)', fontSize: 11.5, fontFamily: 'inherit', cursor: 'pointer',
};
const saveBtn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--accent)',
  border: '1px solid var(--accent)', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer',
};

/** 'YYYY-MM-DD' + n days. */
function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Last day of the month `day` falls in. */
function endOfMonth(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)).toISOString().slice(0, 10);
}

function parseDays(value: string): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= MIN_TRIAL_DAYS && n <= MAX_TRIAL_DAYS ? n : null;
}

function DaysPicker({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
      {PRESETS.map((p) => (
        <button key={p.days} type="button" disabled={disabled} style={chip(Number(value) === p.days)} onClick={() => onChange(String(p.days))}>
          {p.label}
        </button>
      ))}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 4, fontSize: 12.5, color: 'var(--text-3)' }}>
        or
        <input
          type="number"
          min={MIN_TRIAL_DAYS}
          max={MAX_TRIAL_DAYS}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...inp, width: 76 }}
          aria-label="Trial length in days"
        />
        days
      </span>
    </div>
  );
}

export default function TrialOfferCard({ offer }: { offer: TrialOffer }) {
  const router = useRouter();
  const today = todayForOffers();
  const savedPromoLive = isPromoLive(offer.promo);
  // A campaign whose last day has passed shows as "off", with its length and
  // name kept so it's one click to run it again.
  const endedPromo = offer.promo && !savedPromoLive ? offer.promo : null;

  const [standard, setStandard] = useState(String(offer.standardDays));
  const [promoOn, setPromoOn] = useState(savedPromoLive);
  const [promoDays, setPromoDays] = useState(String(offer.promo?.days ?? 90));
  const [endsOn, setEndsOn] = useState(savedPromoLive ? offer.promo?.endsOn ?? '' : '');
  const [label, setLabel] = useState(offer.promo?.label ?? '');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const standardDays = parseDays(standard);
  const campaignDays = parseDays(promoDays);
  const draft: TrialOffer | null =
    standardDays === null || (promoOn && campaignDays === null)
      ? null
      : {
          standardDays,
          promo: promoOn ? { days: campaignDays as number, endsOn: endsOn || null, label: label.trim() || null } : null,
        };
  const preview = draft ? trialCopy(draft) : null;
  const badge = preview ? promoHeadline(preview) : null;

  const touch = () => { setSaved(false); setError(''); };

  const save = () => {
    if (!draft) { setError(`Trial lengths must be whole days between ${MIN_TRIAL_DAYS} and ${MAX_TRIAL_DAYS}.`); return; }
    if (draft.promo?.endsOn && draft.promo.endsOn < today) { setError('That end date has already passed — pick today or a later day.'); return; }
    setError('');
    startTransition(async () => {
      const r = await saveTrialOfferAction(draft);
      if (r.error) { setError(r.error); return; }
      setSaved(true);
      router.refresh();
    });
  };

  // What's live right now (as saved), in one sentence.
  const live = trialCopy(offer);
  const nowLine = live.promo
    ? `New sign-ups get ${live.span} free${live.promo.label ? ` (${live.promo.label})` : ''}${live.promo.endsToday ? ' until the end of today' : live.promo.endsLabel ? ` until the end of ${live.promo.endsLabel}` : ''}, then back to ${live.promo.usualSpan}.`
    : `New sign-ups get ${live.span} free.`;

  return (
    <div style={card}>
      <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>Free trial offer</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
            How long new fleets get for free. Fleets that already signed up keep the trial they have.
          </div>
        </div>
        <span style={{ fontSize: 12, color: live.promo ? 'var(--accent)' : 'var(--text-2)', background: live.promo ? 'var(--accent-soft)' : 'var(--bg-2)', padding: '5px 10px', borderRadius: 7, maxWidth: '100%' }}>
          <strong style={{ fontWeight: 600 }}>Right now:</strong> {nowLine}
        </span>
      </div>

      <div style={{ borderTop: '1px solid var(--line-1)', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <div style={sectionTitle}>Standard trial</div>
          <DaysPicker value={standard} disabled={isPending} onChange={(v) => { setStandard(v); touch(); }} />
        </div>

        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>
            <input
              type="checkbox"
              checked={promoOn}
              disabled={isPending}
              onChange={(e) => { setPromoOn(e.target.checked); touch(); }}
              style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
            />
            Run a limited-time campaign
          </label>
          <div style={{ fontSize: 12, color: 'var(--text-3)', margin: '4px 0 0 25px', lineHeight: 1.5 }}>
            e.g. &ldquo;3 months free if you sign up today&rdquo;. While it runs, new sign-ups get the campaign length and the website
            shows an offer badge. After its last day everything goes back to the standard trial by itself.
            {endedPromo && !promoOn && (
              <> Your last campaign ended{endedPromo.endsOn ? ` on ${formatOfferDay(endedPromo.endsOn)}` : ''}.</>
            )}
          </div>

          {promoOn && (
            <div style={{ margin: '14px 0 0 25px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <span style={lbl}>Campaign trial length</span>
                <DaysPicker value={promoDays} disabled={isPending} onChange={(v) => { setPromoDays(v); touch(); }} />
              </div>

              <div>
                <span style={lbl}>Last day to sign up (Malta time)</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                  <input type="date" min={today} value={endsOn} disabled={isPending} onChange={(e) => { setEndsOn(e.target.value); touch(); }} style={inp} aria-label="Last day of the campaign" />
                  <button type="button" disabled={isPending} style={smallBtn} onClick={() => { setEndsOn(today); touch(); }}>Today only</button>
                  <button type="button" disabled={isPending} style={smallBtn} onClick={() => { setEndsOn(addDays(today, 6)); touch(); }}>7 days</button>
                  <button type="button" disabled={isPending} style={smallBtn} onClick={() => { setEndsOn(endOfMonth(today)); touch(); }}>End of month</button>
                  {endsOn && (
                    <button type="button" disabled={isPending} style={{ ...smallBtn, background: 'transparent', color: 'var(--text-3)' }} onClick={() => { setEndsOn(''); touch(); }}>No end date</button>
                  )}
                </div>
                {!endsOn && (
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6 }}>No end date — it runs until you switch it off here.</div>
                )}
              </div>

              <div>
                <span style={lbl}>Name on the website (optional)</span>
                <input
                  type="text"
                  value={label}
                  maxLength={40}
                  disabled={isPending}
                  placeholder="e.g. Autumn offer"
                  onChange={(e) => { setLabel(e.target.value); touch(); }}
                  style={{ ...inp, width: '100%', maxWidth: 320 }}
                />
              </div>

              {badge && (
                <div>
                  <span style={lbl}>Website badge preview</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 10px', fontSize: 13, fontWeight: 500, color: 'var(--text-1)', background: 'var(--pos-soft)', padding: '6px 14px 6px 6px', borderRadius: 100 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#fff', background: 'var(--pos)', padding: '3px 9px', borderRadius: 100 }}>{badge.tag}</span>
                    {badge.text}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--line-1)', padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12.5, color: error ? 'var(--neg)' : saved ? 'var(--pos)' : 'var(--text-3)' }}>
          {error
            ? error
            : saved
              ? 'Saved — the website and sign-up now use this.'
              : preview && draft
                ? `After saving, new sign-ups get ${preview.span} free${preview.promo ? ` (then ${trialSpan(draft.standardDays)} once the campaign ends)` : ''}.`
                : `Enter whole days between ${MIN_TRIAL_DAYS} and ${MAX_TRIAL_DAYS}.`}
        </div>
        <button type="button" onClick={save} disabled={isPending || !draft} style={{ ...saveBtn, opacity: isPending || !draft ? 0.55 : 1 }}>
          {isPending ? 'Saving…' : 'Save trial offer'}
        </button>
      </div>
    </div>
  );
}
