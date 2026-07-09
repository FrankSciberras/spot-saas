'use client';

// =============================================================================
// SETTLEMENT SETUP WIZARD — the "pay interview"
// =============================================================================
// A guided, plain-English Q&A for fleet operators. The headline question is
// "How do you pay your drivers?" and the follow-ups BRANCH from the answer:
//
//   • Share of earnings  → % split (+ optional weekly rent), tips, campaigns, fee
//   • Hourly wage        → €/hour (hours auto-fill from shifts) + tips
//   • Fixed weekly wage  → flat €/week + tips
//   • Wage + commission  → €/hour base AND a % of fares
//
// Each model sets the settlement COMPONENTS (which lines the settlement
// calculates) plus the wage rates, then everything is created in one go via the
// existing server actions. The review step shows a LIVE example settlement — run
// through the real calculateSettlement — so the owner can trust the maths before
// saving. Nothing is saved until "Finish"; retries after a partial failure skip
// the parts that already succeeded.
// =============================================================================

import { useMemo, useRef, useState, useTransition } from 'react';
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
import {
  DEFAULT_COMPONENTS,
  type SettlementComponents,
  type SettlementScheme,
} from '@/lib/config/settlements';
import { calculateSettlement, formatCurrency, round2 } from '@/lib/utils/settlementCalculations';
import styles from './setup-wizard.module.css';

interface Props {
  platforms: OrgPlatform[];
  /** Whether the fleet already has a default preset (affects the checkbox). */
  hasDefault: boolean;
  driverCount: number;
}

type StepId = 'welcome' | 'pay' | 'platforms' | 'extras' | 'tax' | 'charges' | 'review' | 'done';

/** The four pay models. Everything else branches from this choice. */
type PayModel = 'share' | 'hourly' | 'fixed' | 'wage_share';
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

// Figures used for the live example on the review step.
const SAMPLE_GROSS = 1000;
const SAMPLE_TIPS = 40;
const SAMPLE_HOURS = 40;

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

function clampPct(value: string): number {
  return Math.min(100, Math.max(0, parseFloat(value) || 0));
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
  const [hourlyRate, setHourlyRate] = useState('10');
  const [fixedWage, setFixedWage] = useState('500');
  const [hasRent, setHasRent] = useState(false);
  const [rentWeekly, setRentWeekly] = useState('150');
  // "The share isn't the same for every driver" — drives guidance at the end.
  const [splitVaries, setSplitVaries] = useState(false);

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

  // ── Derived pay-model facts ────────────────────────────────────────────────
  const shareBased = payModel === 'share' || payModel === 'wage_share';
  const usesHours = payModel === 'hourly' || payModel === 'wage_share';
  const usesFixed = payModel === 'fixed';
  const isWageOnly = payModel === 'hourly' || payModel === 'fixed';

  const effectiveShare = shareBased ? clampPct(sharePct) : 0;
  const effectiveRent = hasRent && shareBased ? Math.max(0, parseFloat(rentWeekly) || 0) : 0;
  const effectiveHourly = usesHours ? Math.max(0, parseFloat(hourlyRate) || 0) : 0;
  const effectiveFixed = usesFixed ? Math.max(0, parseFloat(fixedWage) || 0) : 0;

  // The steps shown depend on the pay model: pure-wage fleets skip the
  // platforms step (no fares to split) and get a slimmed "tips only" extras step.
  const questionSteps = useMemo(() => {
    const steps: { id: StepId; label: string }[] = [{ id: 'pay', label: 'Pay model' }];
    if (shareBased) steps.push({ id: 'platforms', label: 'Platforms' });
    steps.push({ id: 'extras', label: shareBased ? 'Tips & fees' : 'Tips' });
    steps.push({ id: 'tax', label: 'Tax' });
    steps.push({ id: 'charges', label: 'Weekly charges' });
    steps.push({ id: 'review', label: 'Review' });
    return steps;
  }, [shareBased]);

  const flow = questionSteps.map((s) => s.id);
  const stepIndex = questionSteps.findIndex((s) => s.id === step);
  const activePlatformCount = platformDrafts.filter((d) => d.active).length;

  // ── The settlement components + scheme this wizard will produce ─────────────
  const components: SettlementComponents = useMemo(
    () => ({
      share: shareBased,
      fee: shareBased,
      cash: shareBased,
      // Share models always have a tips line (split by tipsPct); wage models
      // include it only when the driver keeps their tips.
      tips: shareBased ? true : tipsAll,
      campaigns: shareBased,
      hours: usesHours,
      fixed: usesFixed,
      tax: taxChoice !== 'none',
      rent: effectiveRent > 0,
    }),
    [shareBased, usesHours, usesFixed, taxChoice, tipsAll, effectiveRent]
  );

  const scheme: SettlementScheme = useMemo(
    () => ({
      driverSharePct: effectiveShare,
      tipsDriverPct: tipsAll ? 100 : clampPct(tipsPct),
      campaignsDriverPct: campaignsAll ? 100 : clampPct(campaignsPct),
      feeDriverPct: feeWho === 'driver' ? 100 : feeWho === 'fleet' ? 0 : 50,
    }),
    [effectiveShare, tipsAll, tipsPct, campaignsAll, campaignsPct, feeWho]
  );

  const suggestedName = (): string => {
    if (payModel === 'hourly') return `Hourly €${fmtNum(effectiveHourly)}/h`;
    if (payModel === 'fixed') return `Fixed €${fmtNum(effectiveFixed)}/wk`;
    if (payModel === 'wage_share') return `€${fmtNum(effectiveHourly)}/h + ${fmtNum(effectiveShare)}%`;
    const split = `${fmtNum(effectiveShare)}/${fmtNum(100 - effectiveShare)}`;
    if (effectiveRent > 0) return effectiveShare >= 100 ? `Rent-a-car €${fmtNum(effectiveRent)}/wk` : `${split} + €${fmtNum(effectiveRent)} rent`;
    return `Standard ${split}`;
  };

  const presetInput = (): PresetInput => ({
    name: presetName.trim(),
    driver_share_pct: effectiveShare,
    tips_driver_pct: tipsAll ? 100 : clampPct(tipsPct),
    campaigns_driver_pct: campaignsAll ? 100 : clampPct(campaignsPct),
    fee_driver_pct: feeWho === 'driver' ? 100 : feeWho === 'fleet' ? 0 : 50,
    tax_type: taxChoice === 'percent' ? 'percent' : 'flat',
    tax_value: taxChoice === 'none' ? 0 : Math.max(0, parseFloat(taxValue) || 0),
    rent_weekly: effectiveRent,
    hourly_rate: effectiveHourly,
    fixed_wage_weekly: effectiveFixed,
    components,
  });

  // ── Live example settlement (uses the real engine) ─────────────────────────
  const example = useMemo(() => {
    const activePlatforms = platformDrafts.filter((d) => d.active);
    const avgFee =
      activePlatforms.length > 0
        ? activePlatforms.reduce((s, d) => s + (parseFloat(d.feePct) || 0), 0) / activePlatforms.length
        : 10;

    const calc = calculateSettlement(
      [
        {
          platformId: 'example',
          grossFare: shareBased ? SAMPLE_GROSS : 0,
          platformFeePercent: avgFee,
          cashRide: 0,
          tips: SAMPLE_TIPS,
          campaigns: 0,
        },
      ],
      0,
      scheme,
      effectiveRent,
      {
        components,
        hoursWorked: SAMPLE_HOURS,
        hourlyRate: effectiveHourly,
        fixedWageWeekly: effectiveFixed,
      }
    );

    const taxVal =
      taxChoice === 'none'
        ? 0
        : taxChoice === 'percent'
          ? round2(Math.max(0, calc.totalBalanceBeforeTax) * (Math.max(0, parseFloat(taxValue) || 0) / 100))
          : Math.max(0, parseFloat(taxValue) || 0);

    const final = round2(calc.totalBalanceBeforeTax - taxVal - calc.rent);
    return { calc, taxVal, final };
  }, [platformDrafts, shareBased, scheme, effectiveRent, components, effectiveHourly, effectiveFixed, taxChoice, taxValue]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const goTo = (next: StepId) => {
    setError('');
    setStep(next);
  };

  const next = () => {
    if (step === 'welcome') return goTo(flow[0]);

    if (step === 'pay') {
      if (!payModel) {
        setError('Pick the option that matches how you pay your drivers.');
        return;
      }
      if (shareBased && (effectiveShare <= 0 || effectiveShare > 100)) {
        setError('Enter a driver share between 1 and 100%.');
        return;
      }
      if (usesHours && effectiveHourly <= 0) {
        setError('Enter an hourly rate greater than €0.');
        return;
      }
      if (usesFixed && effectiveFixed <= 0) {
        setError('Enter a weekly wage greater than €0.');
        return;
      }
      if (hasRent && shareBased && effectiveRent <= 0) {
        setError('Enter the weekly rent amount (more than €0), or untick vehicle rent.');
        return;
      }
    }

    if (step === 'platforms' && activePlatformCount === 0) {
      setError('Keep at least one platform ticked — settlements need at least one.');
      return;
    }

    if (step === 'tax' && taxChoice !== 'none' && (parseFloat(taxValue) || 0) < 0) {
      setError('Enter a valid tax amount.');
      return;
    }

    if (step === 'charges' && !nameTouched.current) {
      setPresetName(suggestedName());
    }

    const nextId = flow[stepIndex + 1];
    if (nextId) goTo(nextId);
  };

  const back = () => {
    setError('');
    if (step === flow[0]) return setStep('welcome');
    const prevId = flow[stepIndex - 1];
    setStep(prevId ?? 'welcome');
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
      // 1. Platforms (idempotent on retry). Only relevant for share-based
      //    models, but harmless to apply otherwise. Order matters for the
      //    server-side "at least one active" guard: create/enable, then disable.
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

      // 2. The preset itself (components + wage rates included).
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

    if (payModel === 'hourly') {
      lines.push(`Drivers are paid €${fmtNum(effectiveHourly)} per hour worked (hours fill in automatically from their shifts)`);
    } else if (payModel === 'fixed') {
      lines.push(`Drivers are paid a fixed €${fmtNum(effectiveFixed)} per week`);
    } else if (payModel === 'wage_share') {
      lines.push(`Drivers earn €${fmtNum(effectiveHourly)} per hour PLUS ${fmtNum(effectiveShare)}% of their fares`);
    } else if (effectiveRent > 0 && effectiveShare >= 100) {
      lines.push(`Drivers keep 100% of fares and pay €${fmtNum(effectiveRent)} vehicle rent per week`);
    } else if (effectiveRent > 0) {
      lines.push(`Drivers keep ${fmtNum(effectiveShare)}% of fares, plus €${fmtNum(effectiveRent)} vehicle rent per week`);
    } else {
      lines.push(`Drivers keep ${fmtNum(effectiveShare)}% of fares (fleet keeps ${fmtNum(100 - effectiveShare)}%)`);
    }

    if (shareBased) {
      const names = platformDrafts.filter((d) => d.active).map((d) => `${d.name} (${d.feePct || 0}% fee)`);
      lines.push(`Platforms: ${names.join(', ')}`);
      lines.push(tipsAll ? 'Drivers keep all their tips' : `Drivers keep ${tipsPct || 0}% of tips`);
      lines.push(campaignsAll ? 'Drivers keep all campaign bonuses' : `Drivers keep ${campaignsPct || 0}% of campaign bonuses`);
      lines.push(
        feeWho === 'driver'
          ? 'The driver absorbs the platform commission'
          : feeWho === 'fleet'
            ? 'The fleet absorbs the platform commission'
            : 'Platform commission is split 50/50'
      );
    } else {
      lines.push(tipsAll ? 'Drivers keep their tips' : 'Tips are not tracked in settlements');
    }

    if (taxChoice === 'none') lines.push('No tax withheld from payouts');
    else if (taxChoice === 'percent') lines.push(`Tax withheld: ${taxValue || 0}% of the weekly balance`);
    else lines.push(`Tax withheld: €${taxValue || 0} flat per week`);

    for (const c of charges) {
      lines.push(`${c.kind === 'bonus' ? 'Weekly bonus' : 'Weekly charge'}: ${c.description} — €${c.amount} (all drivers)`);
    }

    if (splitVaries) {
      lines.push('This is your standard deal — you’ll set different presets for specific drivers afterwards');
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
              Step {stepIndex + 1} of {questionSteps.length} · {questionSteps[stepIndex].label}
            </span>
            <span>{Math.round(((stepIndex + 1) / questionSteps.length) * 100)}%</span>
          </div>
          <div className={styles.progressTrack}>
            <div
              className={styles.progressFill}
              style={{ width: `${((stepIndex + 1) / questionSteps.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className={styles.stepCard}>
        {error && <div className={`${styles.message} ${styles.error}`}>{error}</div>}

        {/* ── Welcome ── */}
        {step === 'welcome' && (
          <>
            <h1 className={styles.stepTitle}>Set up how you pay your drivers</h1>
            <p className={styles.stepDesc}>
              Answer a few plain-English questions and this wizard configures your whole settlement
              system — however you pay: a share of earnings, an hourly or fixed wage, or a mix.
              Takes about two minutes.
            </p>
            <ul className={styles.welcomeList}>
              <li className={styles.welcomeItem}>
                <span className={styles.welcomeNum}>1</span>
                <span>Tell us <strong>how drivers are paid</strong> — we adapt every question to your answer.</span>
              </li>
              <li className={styles.welcomeItem}>
                <span className={styles.welcomeNum}>2</span>
                <span>Fine-tune <strong>tips, tax and any weekly charges</strong> in plain English.</span>
              </li>
              <li className={styles.welcomeItem}>
                <span className={styles.welcomeNum}>3</span>
                <span>See a <strong>live example payslip</strong>, then we apply it to all{driverCount > 0 ? ` ${driverCount}` : ''} drivers.</span>
              </li>
            </ul>
            <p className={styles.welcomeNote}>
              Nothing is saved until the final step, and you can fine-tune everything later in
              Settlement Rules.
            </p>
          </>
        )}

        {/* ── Pay model (the headline question) ── */}
        {step === 'pay' && (
          <>
            <h1 className={styles.stepTitle}>How do you pay your drivers?</h1>
            <p className={styles.stepDesc}>Pick the option closest to your deal — the next questions adapt to your choice.</p>
            <div className={styles.optionGrid}>
              <button
                type="button"
                className={`${styles.optionCard} ${payModel === 'share' ? styles.optionCardActive : ''}`}
                onClick={() => { setPayModel('share'); setError(''); }}
              >
                <div className={styles.optionTitle}>💶 Share of earnings</div>
                <div className={styles.optionDesc}>The driver keeps a percentage of what they earn; the fleet keeps the rest. The classic split (and rent-a-car).</div>
              </button>
              <button
                type="button"
                className={`${styles.optionCard} ${payModel === 'hourly' ? styles.optionCardActive : ''}`}
                onClick={() => { setPayModel('hourly'); setError(''); }}
              >
                <div className={styles.optionTitle}>⏱️ Hourly wage</div>
                <div className={styles.optionDesc}>Paid for the hours they work. Hours fill in automatically from their clocked shifts.</div>
              </button>
              <button
                type="button"
                className={`${styles.optionCard} ${payModel === 'fixed' ? styles.optionCardActive : ''}`}
                onClick={() => { setPayModel('fixed'); setError(''); }}
              >
                <div className={styles.optionTitle}>📅 Fixed weekly wage</div>
                <div className={styles.optionDesc}>A flat amount every week, whatever they earn on the road.</div>
              </button>
              <button
                type="button"
                className={`${styles.optionCard} ${payModel === 'wage_share' ? styles.optionCardActive : ''}`}
                onClick={() => { setPayModel('wage_share'); setError(''); }}
              >
                <div className={styles.optionTitle}>➕ Wage + commission</div>
                <div className={styles.optionDesc}>An hourly base wage plus a percentage of the fares they bring in.</div>
              </button>
            </div>

            {/* Follow-ups for share of earnings */}
            {shareBased && (
              <div className={styles.followUp}>
                <span className={styles.followUpLabel}>
                  {payModel === 'wage_share' ? 'What percentage of fares does the driver keep (on top of the wage)?' : 'What percentage does the driver keep?'}
                </span>
                <div className={styles.quickPicks}>
                  {SHARE_QUICK_PICKS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`${styles.quickPick} ${sharePct === p ? styles.quickPickActive : ''}`}
                      onClick={() => setSharePct(p)}
                    >
                      {payModel === 'wage_share' ? `${p}%` : `${p}/${100 - Number(p)}`}
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

            {/* Hourly rate (hourly + wage+commission) */}
            {usesHours && (
              <div className={styles.followUp}>
                <span className={styles.followUpLabel}>
                  {payModel === 'wage_share' ? 'What is the hourly base wage?' : 'What is the hourly rate?'}
                </span>
                <span className={styles.inlineControl}>
                  <input
                    type="number" min={0} step="0.25"
                    className={styles.numInput}
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(e.target.value)}
                    aria-label="Hourly rate in euro"
                  />
                  <span className={styles.suffix}>€ / hour — hours come from each driver&apos;s shifts</span>
                </span>
              </div>
            )}

            {/* Fixed weekly wage */}
            {usesFixed && (
              <div className={styles.followUp}>
                <span className={styles.followUpLabel}>How much is the fixed weekly wage?</span>
                <span className={styles.inlineControl}>
                  <input
                    type="number" min={0} step="10"
                    className={styles.numInput}
                    value={fixedWage}
                    onChange={(e) => setFixedWage(e.target.value)}
                    aria-label="Fixed weekly wage in euro"
                  />
                  <span className={styles.suffix}>€ / week</span>
                </span>
              </div>
            )}

            {/* Weekly rent (share model only) */}
            {payModel === 'share' && (
              <div className={styles.followUp}>
                <label className={styles.defaultCheck}>
                  <input type="checkbox" checked={hasRent} onChange={(e) => setHasRent(e.target.checked)} />
                  <span>Drivers also pay a weekly vehicle rent</span>
                </label>
                {hasRent && (
                  <span className={styles.inlineControl} style={{ marginTop: 8 }}>
                    <input
                      type="number" min={0} step="5"
                      className={styles.numInput}
                      value={rentWeekly}
                      onChange={(e) => setRentWeekly(e.target.value)}
                      aria-label="Weekly rent in euro"
                    />
                    <span className={styles.suffix}>€ / week — deducted from every settlement</span>
                  </span>
                )}
              </div>
            )}

            {/* Per-driver variation (share-based) */}
            {shareBased && (
              <div className={styles.followUp}>
                <label className={styles.defaultCheck}>
                  <input type="checkbox" checked={splitVaries} onChange={(e) => setSplitVaries(e.target.checked)} />
                  <span>The deal isn&apos;t the same for every driver</span>
                </label>
                {splitVaries && (
                  <span className={styles.hint}>
                    No problem — set your most common deal here as the default, then we&apos;ll show you how to
                    give specific drivers their own preset at the end.
                  </span>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Platforms (share-based only) ── */}
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

        {/* ── Extras: tips (all models) + campaigns/fee (share-based) ── */}
        {step === 'extras' && (
          <>
            <h1 className={styles.stepTitle}>{shareBased ? 'Tips, bonuses & platform fees' : 'What about tips?'}</h1>
            <p className={styles.stepDesc}>
              {shareBased
                ? 'Most fleets let drivers keep tips and bonuses in full — change it here if your deal differs.'
                : 'Your drivers are on a wage. Do they also keep any tips logged in the app?'}
            </p>

            <div className={styles.subQuestion}>
              <div className={styles.subQuestionLabel}>
                {shareBased ? 'Do drivers keep 100% of their tips?' : 'Do drivers keep their tips?'}
              </div>
              <div className={styles.pillRow}>
                <button type="button" className={`${styles.quickPick} ${tipsAll ? styles.quickPickActive : ''}`} onClick={() => setTipsAll(true)}>
                  {shareBased ? 'Yes, all tips' : 'Yes, they keep tips'}
                </button>
                <button type="button" className={`${styles.quickPick} ${!tipsAll ? styles.quickPickActive : ''}`} onClick={() => setTipsAll(false)}>
                  {shareBased ? 'No, a share' : 'No tips line'}
                </button>
                {shareBased && !tipsAll && (
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

            {shareBased && (
              <>
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
              contribution, cleaning fee, loyalty bonus. Skip this if there are none{payModel === 'share' && hasRent ? '; vehicle rent is already covered' : ''}.
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

        {/* ── Review (with live example) ── */}
        {step === 'review' && (
          <>
            <h1 className={styles.stepTitle}>Does this look right?</h1>
            <p className={styles.stepDesc}>Here&apos;s your setup in plain English, with a worked example. Go back to change anything — nothing is saved yet.</p>

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

            {/* Live example — run through the real settlement engine */}
            <div className={styles.reviewSection}>
              <div className={styles.reviewLabel}>Example payslip</div>
              <div className={styles.exampleCard}>
                <div className={styles.exampleIntro}>
                  A driver who{shareBased ? ` earned ${formatCurrency(SAMPLE_GROSS)} in fares` : ''}
                  {usesHours ? `${shareBased ? ',' : ''} worked ${SAMPLE_HOURS} hours` : ''}
                  {' '}and got {formatCurrency(SAMPLE_TIPS)} in tips this week would take home:
                </div>
                <div className={styles.exampleRows}>
                  {components.share && (
                    <div className={styles.exampleRow}>
                      <span>Share of fares ({fmtNum(effectiveShare)}%)</span>
                      <span>{formatCurrency(example.calc.totalFiftyPercent)}</span>
                    </div>
                  )}
                  {components.fee && (
                    <div className={styles.exampleRow}>
                      <span>Platform fee</span>
                      <span className={styles.exampleNeg}>-{formatCurrency(example.calc.totalFee)}</span>
                    </div>
                  )}
                  {components.hours && (
                    <div className={styles.exampleRow}>
                      <span>Hourly wage ({SAMPLE_HOURS}h × {formatCurrency(effectiveHourly)})</span>
                      <span className={styles.examplePos}>+{formatCurrency(round2(SAMPLE_HOURS * effectiveHourly))}</span>
                    </div>
                  )}
                  {components.fixed && (
                    <div className={styles.exampleRow}>
                      <span>Fixed weekly wage</span>
                      <span className={styles.examplePos}>+{formatCurrency(effectiveFixed)}</span>
                    </div>
                  )}
                  {components.tips && (
                    <div className={styles.exampleRow}>
                      <span>Tips{shareBased && !tipsAll ? ` (${tipsPct}%)` : ''}</span>
                      <span className={styles.examplePos}>+{formatCurrency(example.calc.totalTips > 0 ? round2(SAMPLE_TIPS * (scheme.tipsDriverPct / 100)) : 0)}</span>
                    </div>
                  )}
                  {components.rent && (
                    <div className={styles.exampleRow}>
                      <span>Vehicle rent</span>
                      <span className={styles.exampleNeg}>-{formatCurrency(example.calc.rent)}</span>
                    </div>
                  )}
                  {components.tax && (
                    <div className={styles.exampleRow}>
                      <span>FSS / Tax{taxChoice === 'percent' ? ` (${taxValue}%)` : ''}</span>
                      <span className={styles.exampleNeg}>-{formatCurrency(example.taxVal)}</span>
                    </div>
                  )}
                  <div className={`${styles.exampleRow} ${styles.exampleFinal}`}>
                    <span>Driver takes home</span>
                    <span className={example.final >= 0 ? styles.examplePos : styles.exampleNeg}>{formatCurrency(example.final)}</span>
                  </div>
                </div>
                <div className={styles.exampleHint}>Illustrative figures — real settlements use each driver&apos;s actual earnings, hours and tips.</div>
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
              {splitVaries
                ? 'For drivers on a different deal, create another preset and assign it to them in Settlement Rules.'
                : 'You can fine-tune everything — or assign a different preset to specific drivers — in Settlement Rules.'}
            </p>
            <div className={styles.doneActions}>
              <Link href="/fleet/settlements" className="btn btn-primary">Go to Settlements</Link>
              <Link href="/fleet/settlements/settings" className="btn btn-secondary">
                {splitVaries ? 'Set per-driver presets' : 'Review Settlement Rules'}
              </Link>
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
