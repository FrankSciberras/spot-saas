'use client';

// =============================================================================
// SETTLEMENT SETUP WIZARD
// =============================================================================
// A guided Q&A for fleet operators: pick platforms, describe how drivers are
// paid, tips/campaigns/fee handling, tax withholding and standing weekly
// charges — then everything is created in one go via the existing server
// actions (platforms, settlement preset + fleet default, recurring rules).
// Nothing is saved until the final "Finish" click, except that retries after a
// partial failure skip the parts that already succeeded.
// =============================================================================

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { OrgPlatform } from '@/lib/types/database';
import { createPresetAction, setDefaultPresetAction, type PresetInput } from '@/lib/actions/settlement-presets';
import {
  createPlatformAction,
  updatePlatformAction,
  setPlatformActiveAction,
} from '@/lib/actions/platforms';
import { createRecurringAdjustmentAction } from '@/lib/actions/recurring-adjustments';
import styles from './setup-wizard.module.css';

interface Props {
  platforms: OrgPlatform[];
  /** Whether the fleet already has a default preset (affects the checkbox). */
  hasDefault: boolean;
  driverCount: number;
}

type StepId = 'welcome' | 'platforms' | 'pay' | 'extras' | 'tax' | 'charges' | 'review' | 'done';

const QUESTION_STEPS: { id: StepId; label: string }[] = [
  { id: 'platforms', label: 'Platforms' },
  { id: 'pay', label: 'Pay model' },
  { id: 'extras', label: 'Tips & fees' },
  { id: 'tax', label: 'Tax' },
  { id: 'charges', label: 'Weekly charges' },
  { id: 'review', label: 'Review' },
];

type PayModel = 'split' | 'rent' | 'split_rent';
type FeeWho = 'driver' | 'fleet' | 'split';
type TaxChoice = 'flat' | 'percent' | 'none';

interface PlatformDraft {
  /** Existing org_platforms id, or null for a platform added in the wizard. */
  id: string | null;
  name: string;
  feePct: string;
  icon: string;
  color: string;
  active: boolean;
}

interface ChargeDraft {
  description: string;
  kind: 'charge' | 'bonus';
  amount: string;
}

const SHARE_QUICK_PICKS = ['40', '45', '50', '55', '60'];

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export default function SetupWizardClient({ platforms, hasDefault, driverCount }: Props) {
  const router = useRouter();

  const [step, setStep] = useState<StepId>('welcome');
  const [error, setError] = useState('');
  const [saving, startSaving] = useTransition();

  // ── Answers ───────────────────────────────────────────────────────────────
  const [platformDrafts, setPlatformDrafts] = useState<PlatformDraft[]>(
    platforms.map((p) => ({
      id: p.id,
      name: p.name,
      feePct: fmtNum(p.default_fee_pct),
      icon: p.icon,
      color: p.color,
      active: p.is_active,
    }))
  );
  const [newPlatformName, setNewPlatformName] = useState('');
  const [newPlatformFee, setNewPlatformFee] = useState('10');

  const [payModel, setPayModel] = useState<PayModel | null>(null);
  const [sharePct, setSharePct] = useState('50');
  const [rentWeekly, setRentWeekly] = useState('150');

  const [tipsAll, setTipsAll] = useState(true);
  const [tipsPct, setTipsPct] = useState('50');
  const [campaignsAll, setCampaignsAll] = useState(true);
  const [campaignsPct, setCampaignsPct] = useState('50');
  const [feeWho, setFeeWho] = useState<FeeWho>('driver');

  const [taxChoice, setTaxChoice] = useState<TaxChoice>('flat');
  const [taxValue, setTaxValue] = useState('22');

  const [charges, setCharges] = useState<ChargeDraft[]>([]);
  const [chargeDesc, setChargeDesc] = useState('');
  const [chargeKind, setChargeKind] = useState<'charge' | 'bonus'>('charge');
  const [chargeAmount, setChargeAmount] = useState('');

  const [presetName, setPresetName] = useState('');
  const nameTouched = useRef(false);
  const [makeDefault, setMakeDefault] = useState(!hasDefault);

  // Retry bookkeeping: if Finish partially fails, don't redo what succeeded.
  const platformsApplied = useRef(false);
  const presetIdRef = useRef<string | null>(null);
  const chargesCreated = useRef(0);

  // ── Derived ───────────────────────────────────────────────────────────────
  const stepIndex = QUESTION_STEPS.findIndex((s) => s.id === step);
  const activePlatformCount = platformDrafts.filter((d) => d.active).length;

  const effectiveShare = payModel === 'rent' ? 100 : Math.min(100, Math.max(0, parseFloat(sharePct) || 0));
  const effectiveRent = payModel === 'split' ? 0 : Math.max(0, parseFloat(rentWeekly) || 0);

  const suggestedName = (): string => {
    if (payModel === 'rent') return `Rent-a-car €${fmtNum(effectiveRent)}/wk`;
    const split = `${fmtNum(effectiveShare)}/${fmtNum(100 - effectiveShare)}`;
    if (payModel === 'split_rent') return `${split} + €${fmtNum(effectiveRent)} rent`;
    return `Standard ${split}`;
  };

  const presetInput = (): PresetInput => ({
    name: presetName.trim(),
    driver_share_pct: effectiveShare,
    tips_driver_pct: tipsAll ? 100 : Math.min(100, Math.max(0, parseFloat(tipsPct) || 0)),
    campaigns_driver_pct: campaignsAll ? 100 : Math.min(100, Math.max(0, parseFloat(campaignsPct) || 0)),
    fee_driver_pct: feeWho === 'driver' ? 100 : feeWho === 'fleet' ? 0 : 50,
    tax_type: taxChoice === 'percent' ? 'percent' : 'flat',
    tax_value: taxChoice === 'none' ? 0 : Math.max(0, parseFloat(taxValue) || 0),
    rent_weekly: effectiveRent,
  });

  // ── Navigation ────────────────────────────────────────────────────────────
  const goTo = (next: StepId) => {
    setError('');
    setStep(next);
  };

  const next = () => {
    if (step === 'welcome') return goTo('platforms');
    if (step === 'platforms') {
      if (activePlatformCount === 0) {
        setError('Keep at least one platform ticked — settlements need at least one.');
        return;
      }
      return goTo('pay');
    }
    if (step === 'pay') {
      if (!payModel) {
        setError('Pick the option that matches how you pay your drivers.');
        return;
      }
      if (payModel !== 'split' && effectiveRent <= 0) {
        setError('Enter the weekly rent amount (more than €0).');
        return;
      }
      if (payModel !== 'rent' && (effectiveShare <= 0 || effectiveShare > 100)) {
        setError('Enter a driver share between 1 and 100%.');
        return;
      }
      return goTo('extras');
    }
    if (step === 'extras') return goTo('tax');
    if (step === 'tax') {
      if (taxChoice !== 'none' && (parseFloat(taxValue) || 0) < 0) {
        setError('Enter a valid tax amount.');
        return;
      }
      return goTo('charges');
    }
    if (step === 'charges') {
      if (!nameTouched.current) setPresetName(suggestedName());
      return goTo('review');
    }
  };

  const back = () => {
    setError('');
    if (step === 'platforms') return setStep('welcome');
    if (step === 'pay') return setStep('platforms');
    if (step === 'extras') return setStep('pay');
    if (step === 'tax') return setStep('extras');
    if (step === 'charges') return setStep('tax');
    if (step === 'review') return setStep('charges');
  };

  // ── Platform step helpers ─────────────────────────────────────────────────
  const togglePlatform = (idx: number) => {
    setError('');
    setPlatformDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, active: !d.active } : d)));
  };

  const setPlatformFee = (idx: number, fee: string) => {
    setPlatformDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, feePct: fee } : d)));
  };

  const addPlatform = () => {
    const name = newPlatformName.trim();
    if (!name) return;
    setPlatformDrafts((prev) => [
      ...prev,
      { id: null, name, feePct: newPlatformFee || '10', icon: '🚗', color: '#2bbd7e', active: true },
    ]);
    setNewPlatformName('');
    setNewPlatformFee('10');
  };

  const removeNewPlatform = (idx: number) => {
    setPlatformDrafts((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Charges step helpers ──────────────────────────────────────────────────
  const addCharge = () => {
    const description = chargeDesc.trim();
    const amount = parseFloat(chargeAmount) || 0;
    if (!description) {
      setError('Give the charge a short description (e.g. "Weekly insurance").');
      return;
    }
    if (amount <= 0) {
      setError('Enter an amount greater than €0.');
      return;
    }
    setError('');
    setCharges((prev) => [...prev, { description, kind: chargeKind, amount: chargeAmount }]);
    setChargeDesc('');
    setChargeAmount('');
  };

  // ── Finish: apply everything via the existing server actions ─────────────
  const finish = () => {
    if (!presetName.trim()) {
      setError('Give the preset a name — it appears on settlements and driver payslips.');
      return;
    }
    setError('');
    startSaving(async () => {
      // 1. Platforms (idempotent on retry). Order matters for the server-side
      //    "at least one active" guard: create/enable first, disable last.
      if (!platformsApplied.current) {
        const fail = (msg: string) => setError(`Platforms: ${msg}`);

        for (const d of platformDrafts.filter((p) => !p.id)) {
          const res = await createPlatformAction({
            name: d.name,
            default_fee_pct: parseFloat(d.feePct) || 0,
            icon: d.icon,
            color: d.color,
          });
          if (res.error) return fail(res.error);
        }

        for (const d of platformDrafts.filter((p) => p.id)) {
          const orig = platforms.find((p) => p.id === d.id)!;
          if ((parseFloat(d.feePct) || 0) !== orig.default_fee_pct) {
            const res = await updatePlatformAction(d.id!, {
              name: d.name,
              default_fee_pct: parseFloat(d.feePct) || 0,
              icon: d.icon,
              color: d.color,
            });
            if (res.error) return fail(res.error);
          }
          if (d.active && !orig.is_active) {
            const res = await setPlatformActiveAction(d.id!, true);
            if (res.error) return fail(res.error);
          }
        }

        for (const d of platformDrafts.filter((p) => p.id && !p.active)) {
          const orig = platforms.find((p) => p.id === d.id)!;
          if (orig.is_active) {
            const res = await setPlatformActiveAction(d.id!, false);
            if (res.error) return fail(res.error);
          }
        }

        platformsApplied.current = true;
      }

      // 2. The preset itself.
      if (!presetIdRef.current) {
        const res = await createPresetAction(presetInput());
        if (res.error || !res.id) {
          setError(res.error || 'Could not create the preset.');
          return;
        }
        presetIdRef.current = res.id;
      }

      // 3. Fleet default.
      if (makeDefault) {
        const res = await setDefaultPresetAction(presetIdRef.current);
        if (res.error) {
          setError(res.error);
          return;
        }
      }

      // 4. Recurring weekly charges/bonuses for all drivers.
      const start = todayLocal();
      for (let i = chargesCreated.current; i < charges.length; i++) {
        const c = charges[i];
        const res = await createRecurringAdjustmentAction({
          driver_id: null,
          type: c.kind === 'bonus' ? 'bonus' : 'deduction',
          amount_type: 'fixed',
          amount: parseFloat(c.amount) || 0,
          description: c.description,
          start_date: start,
          end_date: null,
          active: true,
        });
        if (res.error) {
          setError(`Weekly charges: ${res.error}`);
          return;
        }
        chargesCreated.current = i + 1;
      }

      setStep('done');
      router.refresh();
    });
  };

  // ── Plain-English review lines ────────────────────────────────────────────
  const reviewLines = (): string[] => {
    const lines: string[] = [];
    const names = platformDrafts.filter((d) => d.active).map((d) => `${d.name} (${d.feePct || 0}% fee)`);
    lines.push(`Platforms: ${names.join(', ')}`);

    if (payModel === 'rent') {
      lines.push(`Drivers keep 100% of fares and pay €${fmtNum(effectiveRent)} vehicle rent per week`);
    } else if (payModel === 'split_rent') {
      lines.push(`Drivers keep ${fmtNum(effectiveShare)}% of fares, plus €${fmtNum(effectiveRent)} vehicle rent per week`);
    } else {
      lines.push(`Drivers keep ${fmtNum(effectiveShare)}% of fares (fleet keeps ${fmtNum(100 - effectiveShare)}%)`);
    }

    lines.push(tipsAll ? 'Drivers keep all their tips' : `Drivers keep ${tipsPct || 0}% of tips`);
    lines.push(campaignsAll ? 'Drivers keep all campaign bonuses' : `Drivers keep ${campaignsPct || 0}% of campaign bonuses`);
    lines.push(
      feeWho === 'driver'
        ? 'The driver absorbs the platform commission'
        : feeWho === 'fleet'
          ? 'The fleet absorbs the platform commission'
          : 'Platform commission is split 50/50'
    );

    if (taxChoice === 'none') lines.push('No tax withheld from payouts');
    else if (taxChoice === 'percent') lines.push(`Tax withheld: ${taxValue || 0}% of the weekly balance`);
    else lines.push(`Tax withheld: €${taxValue || 0} flat per week`);

    for (const c of charges) {
      lines.push(`${c.kind === 'bonus' ? 'Weekly bonus' : 'Weekly charge'}: ${c.description} — €${c.amount} (all drivers)`);
    }
    return lines;
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={styles.container}>
      <div className={styles.breadcrumb}>Settlements / Setup wizard</div>

      {stepIndex >= 0 && (
        <div className={styles.progress}>
          <div className={styles.progressMeta}>
            <span className={styles.progressStep}>
              Step {stepIndex + 1} of {QUESTION_STEPS.length} · {QUESTION_STEPS[stepIndex].label}
            </span>
            <span>{Math.round(((stepIndex + 1) / QUESTION_STEPS.length) * 100)}%</span>
          </div>
          <div className={styles.progressTrack}>
            <div
              className={styles.progressFill}
              style={{ width: `${((stepIndex + 1) / QUESTION_STEPS.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className={styles.stepCard}>
        {error && <div className={`${styles.message} ${styles.error}`}>{error}</div>}

        {/* ── Welcome ── */}
        {step === 'welcome' && (
          <>
            <h1 className={styles.stepTitle}>Set up your settlement rules</h1>
            <p className={styles.stepDesc}>
              Answer a few plain-English questions about how your fleet pays drivers, and this
              wizard configures everything for you. Takes about two minutes.
            </p>
            <ul className={styles.welcomeList}>
              <li className={styles.welcomeItem}>
                <span className={styles.welcomeNum}>1</span>
                <span>Confirm the <strong>ride platforms</strong> your drivers work on (Bolt, Uber, …) and their commission.</span>
              </li>
              <li className={styles.welcomeItem}>
                <span className={styles.welcomeNum}>2</span>
                <span>Describe <strong>how drivers are paid</strong> — commission split, rent-a-car, tips, tax.</span>
              </li>
              <li className={styles.welcomeItem}>
                <span className={styles.welcomeNum}>3</span>
                <span>We create a <strong>settlement preset</strong> from your answers and apply it to all{driverCount > 0 ? ` ${driverCount}` : ''} drivers.</span>
              </li>
            </ul>
            <p className={styles.welcomeNote}>
              Nothing is saved until the final step, and you can fine-tune everything later in
              Settlement Rules.
            </p>
          </>
        )}

        {/* ── Platforms ── */}
        {step === 'platforms' && (
          <>
            <h1 className={styles.stepTitle}>Which platforms do your drivers work on?</h1>
            <p className={styles.stepDesc}>
              Tick the ones you use — each becomes a row on the weekly settlement form. The fee is
              that platform&apos;s commission (you can still adjust it per settlement).
            </p>
            <div className={styles.platformList}>
              {platformDrafts.map((d, idx) => (
                <div key={d.id ?? `new-${idx}`} className={`${styles.platformRow} ${!d.active ? styles.platformRowOff : ''}`}>
                  <button type="button" className={styles.platformToggle} onClick={() => togglePlatform(idx)}>
                    <span className={`${styles.platformCheck} ${d.active ? styles.platformCheckOn : ''}`}>
                      {d.active ? '✓' : ''}
                    </span>
                    <span className={styles.platformName}>{d.icon} {d.name}</span>
                  </button>
                  <span className={styles.platformFee}>
                    <input
                      type="number" min={0} max={100} step="0.5"
                      className={styles.feeInput}
                      value={d.feePct}
                      disabled={!d.active}
                      onChange={(e) => setPlatformFee(idx, e.target.value)}
                      aria-label={`${d.name} fee percent`}
                    />
                    <span className={styles.suffix}>% fee</span>
                  </span>
                  {!d.id && (
                    <button type="button" className={styles.removeBtn} title="Remove" onClick={() => removeNewPlatform(idx)}>
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className={styles.addRow}>
              <input
                type="text"
                className={styles.addInput}
                placeholder="Another platform? Type its name…"
                value={newPlatformName}
                maxLength={40}
                onChange={(e) => setNewPlatformName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addPlatform(); }}
              />
              <span className={styles.inlineControl}>
                <input
                  type="number" min={0} max={100} step="0.5"
                  className={styles.feeInput}
                  value={newPlatformFee}
                  onChange={(e) => setNewPlatformFee(e.target.value)}
                  aria-label="New platform fee percent"
                />
                <span className={styles.suffix}>% fee</span>
              </span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={addPlatform} disabled={!newPlatformName.trim()}>
                + Add
              </button>
            </div>
          </>
        )}

        {/* ── Pay model ── */}
        {step === 'pay' && (
          <>
            <h1 className={styles.stepTitle}>How do you pay your drivers?</h1>
            <p className={styles.stepDesc}>Pick the option closest to your deal — you can fine-tune the numbers right after.</p>
            <div className={styles.optionGrid}>
              <button
                type="button"
                className={`${styles.optionCard} ${payModel === 'split' ? styles.optionCardActive : ''}`}
                onClick={() => { setPayModel('split'); setError(''); }}
              >
                <div className={styles.optionTitle}>Commission split</div>
                <div className={styles.optionDesc}>The driver keeps a percentage of what they earn; the fleet keeps the rest. The classic 50/50 deal.</div>
              </button>
              <button
                type="button"
                className={`${styles.optionCard} ${payModel === 'rent' ? styles.optionCardActive : ''}`}
                onClick={() => { setPayModel('rent'); setError(''); }}
              >
                <div className={styles.optionTitle}>Rent-a-car</div>
                <div className={styles.optionDesc}>The driver keeps 100% of earnings and pays you a fixed weekly rent for the vehicle.</div>
              </button>
              <button
                type="button"
                className={`${styles.optionCard} ${payModel === 'split_rent' ? styles.optionCardActive : ''}`}
                onClick={() => { setPayModel('split_rent'); setError(''); }}
              >
                <div className={styles.optionTitle}>Split + rent</div>
                <div className={styles.optionDesc}>A percentage split and a weekly vehicle rent on top.</div>
              </button>
            </div>

            {(payModel === 'split' || payModel === 'split_rent') && (
              <div className={styles.followUp}>
                <span className={styles.followUpLabel}>What percentage does the driver keep?</span>
                <div className={styles.quickPicks}>
                  {SHARE_QUICK_PICKS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`${styles.quickPick} ${sharePct === p ? styles.quickPickActive : ''}`}
                      onClick={() => setSharePct(p)}
                    >
                      {p}/{100 - Number(p)}
                    </button>
                  ))}
                  <span className={styles.inlineControl}>
                    <input
                      type="number" min={1} max={100} step="0.5"
                      className={styles.numInput}
                      value={sharePct}
                      onChange={(e) => setSharePct(e.target.value)}
                      aria-label="Driver share percent"
                    />
                    <span className={styles.suffix}>% to driver</span>
                  </span>
                </div>
              </div>
            )}

            {(payModel === 'rent' || payModel === 'split_rent') && (
              <div className={styles.followUp}>
                <span className={styles.followUpLabel}>How much is the weekly vehicle rent?</span>
                <span className={styles.inlineControl}>
                  <input
                    type="number" min={0} step="5"
                    className={styles.numInput}
                    value={rentWeekly}
                    onChange={(e) => setRentWeekly(e.target.value)}
                    aria-label="Weekly rent in euro"
                  />
                  <span className={styles.suffix}>€ / week — deducted from every settlement</span>
                </span>
              </div>
            )}
          </>
        )}

        {/* ── Tips, campaigns, platform fee ── */}
        {step === 'extras' && (
          <>
            <h1 className={styles.stepTitle}>Tips, bonuses &amp; platform fees</h1>
            <p className={styles.stepDesc}>Most fleets let drivers keep tips and bonuses in full — change it here if your deal differs.</p>

            <div className={styles.subQuestion}>
              <div className={styles.subQuestionLabel}>Do drivers keep 100% of their tips?</div>
              <div className={styles.pillRow}>
                <button type="button" className={`${styles.quickPick} ${tipsAll ? styles.quickPickActive : ''}`} onClick={() => setTipsAll(true)}>
                  Yes, all tips
                </button>
                <button type="button" className={`${styles.quickPick} ${!tipsAll ? styles.quickPickActive : ''}`} onClick={() => setTipsAll(false)}>
                  No, a share
                </button>
                {!tipsAll && (
                  <span className={styles.inlineControl}>
                    <input
                      type="number" min={0} max={100} step="0.5"
                      className={styles.numInput}
                      value={tipsPct}
                      onChange={(e) => setTipsPct(e.target.value)}
                      aria-label="Tips percent to driver"
                    />
                    <span className={styles.suffix}>% of tips go to the driver</span>
                  </span>
                )}
              </div>
            </div>

            <div className={styles.subQuestion}>
              <div className={styles.subQuestionLabel}>Do drivers keep 100% of campaign bonuses?</div>
              <div className={styles.subQuestionHint}>Campaigns are promo payouts from the platforms (quests, surge guarantees, referral bonuses).</div>
              <div className={styles.pillRow}>
                <button type="button" className={`${styles.quickPick} ${campaignsAll ? styles.quickPickActive : ''}`} onClick={() => setCampaignsAll(true)}>
                  Yes, all bonuses
                </button>
                <button type="button" className={`${styles.quickPick} ${!campaignsAll ? styles.quickPickActive : ''}`} onClick={() => setCampaignsAll(false)}>
                  No, a share
                </button>
                {!campaignsAll && (
                  <span className={styles.inlineControl}>
                    <input
                      type="number" min={0} max={100} step="0.5"
                      className={styles.numInput}
                      value={campaignsPct}
                      onChange={(e) => setCampaignsPct(e.target.value)}
                      aria-label="Campaigns percent to driver"
                    />
                    <span className={styles.suffix}>% of bonuses go to the driver</span>
                  </span>
                )}
              </div>
            </div>

            <div className={styles.subQuestion}>
              <div className={styles.subQuestionLabel}>Who absorbs the platform commission?</div>
              <div className={styles.subQuestionHint}>The cut Bolt/Uber take from each fare — someone has to carry it.</div>
              <div className={styles.pillRow}>
                <button type="button" className={`${styles.quickPick} ${feeWho === 'driver' ? styles.quickPickActive : ''}`} onClick={() => setFeeWho('driver')}>
                  The driver
                </button>
                <button type="button" className={`${styles.quickPick} ${feeWho === 'fleet' ? styles.quickPickActive : ''}`} onClick={() => setFeeWho('fleet')}>
                  The fleet
                </button>
                <button type="button" className={`${styles.quickPick} ${feeWho === 'split' ? styles.quickPickActive : ''}`} onClick={() => setFeeWho('split')}>
                  Split 50/50
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Tax ── */}
        {step === 'tax' && (
          <>
            <h1 className={styles.stepTitle}>Do you withhold tax from payouts?</h1>
            <p className={styles.stepDesc}>
              This prefills the tax field on every new settlement — you can still adjust it per
              settlement and per driver.
            </p>
            <div className={styles.optionGrid}>
              <button
                type="button"
                className={`${styles.optionCard} ${taxChoice === 'flat' ? styles.optionCardActive : ''}`}
                onClick={() => { setTaxChoice('flat'); setTaxValue('22'); setError(''); }}
              >
                <div className={styles.optionTitle}>Flat weekly amount</div>
                <div className={styles.optionDesc}>A fixed € per week — e.g. €22 FSS for full-time drivers.</div>
              </button>
              <button
                type="button"
                className={`${styles.optionCard} ${taxChoice === 'percent' ? styles.optionCardActive : ''}`}
                onClick={() => { setTaxChoice('percent'); setTaxValue('10'); setError(''); }}
              >
                <div className={styles.optionTitle}>Percentage of balance</div>
                <div className={styles.optionDesc}>A % of the driver&apos;s weekly balance before tax.</div>
              </button>
              <button
                type="button"
                className={`${styles.optionCard} ${taxChoice === 'none' ? styles.optionCardActive : ''}`}
                onClick={() => { setTaxChoice('none'); setError(''); }}
              >
                <div className={styles.optionTitle}>No withholding</div>
                <div className={styles.optionDesc}>Drivers handle their own tax — nothing is deducted.</div>
              </button>
            </div>

            {taxChoice !== 'none' && (
              <div className={styles.followUp}>
                <span className={styles.followUpLabel}>
                  {taxChoice === 'percent' ? 'What percentage?' : 'How much per week?'}
                </span>
                <span className={styles.inlineControl}>
                  <input
                    type="number" min={0} step="0.5"
                    max={taxChoice === 'percent' ? 100 : undefined}
                    className={styles.numInput}
                    value={taxValue}
                    onChange={(e) => setTaxValue(e.target.value)}
                    aria-label="Tax amount"
                  />
                  <span className={styles.suffix}>{taxChoice === 'percent' ? '% of the weekly balance' : '€ / week'}</span>
                </span>
              </div>
            )}
          </>
        )}

        {/* ── Weekly charges ── */}
        {step === 'charges' && (
          <>
            <h1 className={styles.stepTitle}>Any standing weekly charges or bonuses?</h1>
            <p className={styles.stepDesc}>
              Things every driver gets charged (or paid) automatically each week — insurance
              contribution, cleaning fee, loyalty bonus. Skip this if there are none; vehicle rent
              is already covered.
            </p>

            {charges.length > 0 && (
              <div className={styles.chargeList}>
                {charges.map((c, idx) => (
                  <div key={idx} className={styles.chargeRow}>
                    <span className={styles.chargeDesc}>{c.description}</span>
                    <span className={`${styles.chargeAmount} ${c.kind === 'bonus' ? styles.chargeBonus : ''}`}>
                      {c.kind === 'bonus' ? '+' : '−'} €{c.amount}/wk
                    </span>
                    <button
                      type="button"
                      className={styles.removeBtn}
                      title="Remove"
                      onClick={() => setCharges((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className={styles.addRow}>
              <input
                type="text"
                className={styles.addInput}
                placeholder="e.g. Weekly insurance contribution"
                value={chargeDesc}
                maxLength={120}
                onChange={(e) => setChargeDesc(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addCharge(); }}
              />
              <select
                className={styles.typeSelect}
                value={chargeKind}
                onChange={(e) => setChargeKind(e.target.value as 'charge' | 'bonus')}
                aria-label="Charge or bonus"
              >
                <option value="charge">Charge (−)</option>
                <option value="bonus">Bonus (+)</option>
              </select>
              <span className={styles.inlineControl}>
                <input
                  type="number" min={0} step="0.5"
                  className={styles.feeInput}
                  value={chargeAmount}
                  placeholder="0"
                  onChange={(e) => setChargeAmount(e.target.value)}
                  aria-label="Amount in euro"
                />
                <span className={styles.suffix}>€ / week</span>
              </span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={addCharge}>
                + Add
              </button>
            </div>
            <span className={styles.hint}>Applies to all drivers. Per-driver rules can be added later in Settlement Rules.</span>
          </>
        )}

        {/* ── Review ── */}
        {step === 'review' && (
          <>
            <h1 className={styles.stepTitle}>Does this look right?</h1>
            <p className={styles.stepDesc}>Here&apos;s your setup in plain English. Go back to change anything — nothing is saved yet.</p>

            <div className={styles.reviewSection}>
              <div className={styles.reviewLabel}>Your settlement rules</div>
              <div className={styles.reviewList}>
                {reviewLines().map((line) => (
                  <div key={line} className={styles.reviewItem}>
                    <span className={styles.reviewTick}>✓</span>
                    <span>{line}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.reviewSection}>
              <div className={styles.reviewLabel}>Preset name</div>
              <input
                type="text"
                className={styles.nameInput}
                value={presetName}
                maxLength={60}
                onChange={(e) => { nameTouched.current = true; setPresetName(e.target.value); }}
              />
            </div>

            <label className={styles.defaultCheck}>
              <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} />
              <span>
                Make this the fleet default — every driver follows it automatically
                {hasDefault ? ' (replaces your current default preset)' : ''}.
              </span>
            </label>
          </>
        )}

        {/* ── Done ── */}
        {step === 'done' && (
          <div className={styles.doneWrap}>
            <div className={styles.doneIcon}>✓</div>
            <h1 className={styles.doneTitle}>Your settlements are set up</h1>
            <p className={styles.doneDesc}>
              The <strong>{presetName.trim()}</strong> preset is ready
              {makeDefault
                ? driverCount > 0
                  ? ` and all ${driverCount} of your drivers now follow it.`
                  : ' and new drivers will follow it automatically.'
                : '.'}{' '}
              You can fine-tune everything — or assign a different preset to specific drivers — in
              Settlement Rules.
            </p>
            <div className={styles.doneActions}>
              <Link href="/fleet/settlements" className="btn btn-primary">Go to Settlements</Link>
              <Link href="/fleet/settlements/settings" className="btn btn-secondary">Review Settlement Rules</Link>
            </div>
          </div>
        )}

        {/* ── Footer navigation ── */}
        {step !== 'done' && (
          <div className={styles.footer}>
            <div>
              {step === 'welcome' ? (
                <Link href="/fleet/settlements/settings" className={styles.skipBtn} style={{ textDecoration: 'none', display: 'inline-block' }}>
                  ← Back to Settlement Rules
                </Link>
              ) : (
                <button type="button" className="btn btn-ghost" onClick={back} disabled={saving}>
                  ← Back
                </button>
              )}
            </div>
            <div className={styles.footerRight}>
              {step === 'review' ? (
                <button type="button" className="btn btn-primary" onClick={finish} disabled={saving}>
                  {saving ? 'Setting things up…' : 'Finish setup'}
                </button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={next}>
                  {step === 'welcome'
                    ? 'Start'
                    : step === 'charges' && charges.length === 0
                      ? 'Skip — none →'
                      : 'Continue →'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
