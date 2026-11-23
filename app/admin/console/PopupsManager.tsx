'use client';

// =============================================================================
// WEBSITE POP-UPS (platform-admin) — what pops up on rovora.eu, where and when
// =============================================================================
// List: every pop-up with its state (Live / Scheduled / Ended / Off), where and
// when it shows, and how it's doing (shown, button pressed, closed). Switch
// one on or off in a click, preview it on the real website, duplicate it, or
// show it again to people who already saw it.
//
// Editor: content (tag, title, text, image, button, "No thanks"), style
// (centred or corner card), pages, devices, trigger, how often, dates — with
// a live preview built from the same card the website uses.
//
// Saved via lib/actions/site-popups; shown by components/marketing/popups.
// =============================================================================

import { useCallback, useEffect, useRef, useState, useTransition, type CSSProperties, type ReactNode } from 'react';
import FleetIcon from '@/components/fleet/FleetIcon';
import PopupCard from '@/components/marketing/popups/PopupCard';
import popupStyles from '@/components/marketing/popups/SitePopups.module.css';
import { rovoraFontVars } from '@/lib/rovoraFonts';
import { formatOfferDay, todayForOffers } from '@/lib/billing/trial-offer';
import {
  EMPTY_POPUP,
  POPUP_LIMITS,
  POPUP_PREVIEW_PARAM,
  cleanPagePattern,
  type PopupInput,
  type PopupStats,
  type SitePopup,
} from '@/lib/popups/types';
import {
  deleteSitePopupAction,
  duplicateSitePopupAction,
  listSitePopupsAction,
  resetSitePopupSeenAction,
  saveSitePopupAction,
  setSitePopupEnabledAction,
  uploadSitePopupImageAction,
} from '@/lib/actions/site-popups';

const Icon = FleetIcon;
type Row = SitePopup & { stats: PopupStats; recent: PopupStats };

// ── styles (same vocabulary as the other admin tools) ──
const card: CSSProperties = { background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--radius-lg)' };
const inp: CSSProperties = {
  padding: '9px 11px', borderRadius: 8, border: '1px solid var(--line-2)', background: 'var(--bg-2)',
  color: 'var(--text-1)', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%',
};
const lbl: CSSProperties = { fontSize: 11.5, color: 'var(--text-3)', marginBottom: 6, display: 'block' };
const hint: CSSProperties = { fontSize: 11.5, color: 'var(--text-4)', marginTop: 6, lineHeight: 1.45 };
const sectionTitle: CSSProperties = { fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 12 };
const primaryBtn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', background: 'var(--accent)',
  border: '1px solid var(--accent)', color: '#fff', borderRadius: 9, fontSize: 13.5, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer',
};
const ghostBtn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px', background: 'var(--bg-1)', border: '1px solid var(--line-2)',
  borderRadius: 8, color: 'var(--text-2)', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer', textDecoration: 'none',
};
const iconBtn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, background: 'transparent',
  border: '1px solid var(--line-1)', borderRadius: 8, color: 'var(--text-2)', cursor: 'pointer', textDecoration: 'none',
};
const seg = (on: boolean): CSSProperties => ({
  padding: '7px 12px', borderRadius: 8, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
  background: on ? 'var(--accent-soft)' : 'var(--bg-1)',
  border: `1px solid ${on ? 'var(--accent-line)' : 'var(--line-2)'}`,
  color: on ? 'var(--accent)' : 'var(--text-2)',
});

// ── wording ──
const QUICK_PAGES: { label: string; pattern: string }[] = [
  { label: 'Homepage', pattern: '/' },
  { label: 'Pricing', pattern: '/pricing' },
  { label: 'Feature pages', pattern: '/features/*' },
  { label: '“For” pages', pattern: '/for/*' },
  { label: 'Blog', pattern: '/blog/*' },
  { label: 'Integrations', pattern: '/integrations' },
  { label: 'Contact', pattern: '/contact' },
  { label: 'About', pattern: '/about' },
];

function pageLabel(pattern: string): string {
  const quick = QUICK_PAGES.find((q) => q.pattern === pattern);
  if (quick) return quick.label;
  if (pattern === '/*') return 'Every page';
  return pattern;
}

function whereText(p: Pick<SitePopup, 'pages' | 'devices'>): string {
  const pages = p.pages.length ? p.pages.map(pageLabel).join(', ') : 'Every page';
  const devices = p.devices === 'all' ? '' : p.devices === 'desktop' ? ' · desktop only' : ' · phones only';
  return pages + devices;
}

function whenText(p: Pick<SitePopup, 'trigger' | 'triggerValue' | 'frequency' | 'frequencyDays'>): string {
  const when =
    p.trigger === 'delay'
      ? p.triggerValue <= 1 ? 'Right away' : `After ${p.triggerValue} s`
      : p.trigger === 'scroll'
        ? `After ${p.triggerValue}% scrolled`
        : 'When leaving the page';
  const often =
    p.frequency === 'once' ? 'once per visitor' : p.frequency === 'visit' ? 'once per visit' : `every ${p.frequencyDays} days`;
  return `${when} · ${often}`;
}

type Tone = 'live' | 'scheduled' | 'ended' | 'off';
function statusOf(p: SitePopup, today: string): { label: string; tone: Tone } {
  if (!p.enabled) return { label: 'Off', tone: 'off' };
  if (p.endsOn && today > p.endsOn) return { label: 'Ended', tone: 'ended' };
  if (p.startsOn && today < p.startsOn) return { label: `Starts ${formatOfferDay(p.startsOn)}`, tone: 'scheduled' };
  return { label: p.endsOn ? `Live · until ${formatOfferDay(p.endsOn)}` : 'Live', tone: 'live' };
}
const TONE: Record<Tone, { color: string; bg: string }> = {
  live: { color: 'var(--pos)', bg: 'var(--pos-soft)' },
  scheduled: { color: 'var(--accent)', bg: 'var(--accent-soft)' },
  ended: { color: 'var(--warn)', bg: 'var(--warn-soft)' },
  off: { color: 'var(--text-3)', bg: 'var(--bg-3)' },
};

/** Sections without an index page of their own — preview on one of their pages. */
const SECTION_LANDING: Record<string, string> = { '/features/*': '/features/settlements', '/for/*': '/for/bolt-uber-fleets' };

/** A page the pop-up can appear on, to open its preview there. */
function previewHref(p: Pick<SitePopup, 'id' | 'pages'>): string {
  const exact = p.pages.find((x) => !x.endsWith('/*'));
  const section = p.pages.find((x) => x.endsWith('/*') && x !== '/*');
  const path = exact ?? (section ? SECTION_LANDING[section] ?? section.slice(0, -2) : '/');
  return `${path || '/'}?${POPUP_PREVIEW_PARAM}=${p.id}`;
}

const fmt = (n: number) => n.toLocaleString('en-GB');
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : '—');

function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      style={{
        position: 'relative', width: 38, height: 22, borderRadius: 999, border: 'none', flexShrink: 0,
        background: on ? 'var(--accent)' : 'var(--bg-3)', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1,
        transition: 'background .15s',
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: on ? 19 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,.3)', transition: 'left .15s',
      }} />
    </button>
  );
}

function Field({ label, children, help, count }: { label: string; children: ReactNode; help?: ReactNode; count?: [number, number] }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <span style={{ ...lbl, display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span>
        {count && <span style={{ color: count[0] > count[1] ? 'var(--neg)' : 'var(--text-4)' }}>{count[0]}/{count[1]}</span>}
      </span>
      {children}
      {help && <div style={hint}>{help}</div>}
    </div>
  );
}

// =============================================================================
// Live preview — the website's own card, in a mock page.
// =============================================================================
function Preview({ draft }: { draft: PopupInput }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const modal = draft.layout === 'modal';
  const page = theme === 'dark' ? '#0b0d12' : '#f4f6f9';
  const line = theme === 'dark' ? 'rgba(255,255,255,.06)' : 'rgba(15,18,26,.07)';
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ ...sectionTitle, marginBottom: 0 }}>Preview</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" style={seg(theme === 'light')} onClick={() => setTheme('light')}>Light</button>
          <button type="button" style={seg(theme === 'dark')} onClick={() => setTheme('dark')}>Dark</button>
        </div>
      </div>
      <div style={{
        position: 'relative', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--line-1)', background: page,
        minHeight: 460, padding: modal ? '36px 22px' : '22px', display: 'flex',
        alignItems: modal ? 'center' : 'flex-end', justifyContent: modal ? 'center' : 'flex-end',
      }}>
        {/* the page behind */}
        <div aria-hidden style={{ position: 'absolute', inset: 0, padding: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ height: 14, width: '40%', borderRadius: 6, background: line }} />
          <div style={{ height: 28, width: '75%', borderRadius: 8, background: line, marginTop: 18 }} />
          <div style={{ height: 28, width: '60%', borderRadius: 8, background: line }} />
          <div style={{ height: 12, width: '85%', borderRadius: 6, background: line, marginTop: 10 }} />
          <div style={{ height: 12, width: '80%', borderRadius: 6, background: line }} />
          <div style={{ height: 120, borderRadius: 12, background: line, marginTop: 14 }} />
        </div>
        {modal && <div aria-hidden style={{ position: 'absolute', inset: 0, background: theme === 'dark' ? 'rgba(0,0,0,.62)' : 'rgba(10,14,22,.52)' }} />}
        <div
          data-theme={theme}
          className={`${popupStyles.root} ${popupStyles.inline} ${modal ? '' : popupStyles.compact} ${rovoraFontVars}`}
          style={{ width: modal ? 'min(440px, 100%)' : 'min(330px, 100%)' }}
        >
          <PopupCard popup={{ ...draft, name: draft.name || 'Pop-up' }} />
        </div>
      </div>
      <div style={hint}>
        {modal ? 'Centred over the page, which dims behind it.' : 'A card in the bottom-right corner, above the chat button. Full width on phones.'}{' '}
        Follows the website’s light/dark setting.
      </div>
    </div>
  );
}

// =============================================================================
// Editor
// =============================================================================
function PagesPicker({ pages, onChange }: { pages: string[]; onChange: (p: string[]) => void }) {
  const [custom, setCustom] = useState('');
  const [err, setErr] = useState('');
  const everywhere = pages.length === 0;
  const toggle = (pattern: string) => onChange(pages.includes(pattern) ? pages.filter((p) => p !== pattern) : [...pages, pattern]);
  const add = () => {
    const p = cleanPagePattern(custom);
    if (!p) {
      setErr('Use a path like /pricing, or /blog/* for a whole section.');
      return;
    }
    setErr('');
    setCustom('');
    if (!pages.includes(p)) onChange([...pages, p]);
  };
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button type="button" style={seg(everywhere)} onClick={() => onChange([])}>Every page</button>
        <button type="button" style={seg(!everywhere)} onClick={() => everywhere && onChange(['/'])}>Only some pages</button>
      </div>
      {!everywhere && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {QUICK_PAGES.map((q) => (
              <button key={q.pattern} type="button" style={seg(pages.includes(q.pattern))} onClick={() => toggle(q.pattern)}>
                {pages.includes(q.pattern) ? '✓ ' : ''}{q.label}
              </button>
            ))}
          </div>
          {pages.filter((p) => !QUICK_PAGES.some((q) => q.pattern === p)).map((p) => (
            <span key={p} style={{ ...seg(true), display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 6, marginBottom: 6 }}>
              {p}
              <button type="button" aria-label={`Remove ${p}`} onClick={() => toggle(p)}
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'inline-flex' }}>
                <Icon name="close" size={12} stroke={2} />
              </button>
            </span>
          ))}
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <input style={inp} value={custom} placeholder="Another page, e.g. /features/bolt or /blog/*" onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
            <button type="button" style={ghostBtn} onClick={add}>Add</button>
          </div>
          {err && <div style={{ ...hint, color: 'var(--neg)' }}>{err}</div>}
          <div style={hint}>/blog/* means the blog and every post. Sign-in pages never show pop-ups.</div>
        </>
      )}
    </div>
  );
}

function Editor({ initial, onCancel, onSaved }: { initial: PopupInput; onCancel: () => void; onSaved: (p: SitePopup) => void }) {
  const [d, setD] = useState<PopupInput>(initial);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof PopupInput>(k: K, v: PopupInput[K]) => setD((cur) => ({ ...cur, [k]: v }));
  const str = (v: string) => (v === '' ? null : v);

  const upload = async (file: File) => {
    setUploading(true);
    setError('');
    const fd = new FormData();
    fd.set('image', file);
    const res = await uploadSitePopupImageAction(fd);
    setUploading(false);
    if (res.error || !res.url) setError(res.error ?? 'Upload failed.');
    else set('imageUrl', res.url);
  };

  const save = () => {
    setError('');
    startTransition(async () => {
      const res = await saveSitePopupAction(d);
      if (res.error || !res.popup) setError(res.error ?? 'Couldn’t save.');
      else onSaved(res.popup);
    });
  };

  const busy = isPending || uploading;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <button type="button" style={ghostBtn} onClick={onCancel}><Icon name="chevron-left" size={13} />All pop-ups</button>
        <div style={{ fontSize: 17, fontWeight: 500, flex: 1, minWidth: 160 }}>{initial.id ? 'Edit pop-up' : 'New pop-up'}</div>
        {initial.id && (
          <a style={ghostBtn} href={previewHref({ id: initial.id, pages: initial.pages })} target="_blank" rel="noopener">
            <Icon name="eye" size={13} />Preview on the website
          </a>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 18, alignItems: 'start' }}>
        <div style={{ ...card, padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '2px 0 16px', borderBottom: '1px solid var(--line-1)', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>{d.enabled ? 'On — shows on the website' : 'Off — a draft only you can see'}</div>
              <div style={{ ...hint, marginTop: 2 }}>Saved changes reach the website within a minute.</div>
            </div>
            <Switch on={d.enabled} onChange={(v) => set('enabled', v)} label="Show on the website" />
          </div>

          <Field label="Name (only you see this)" count={[d.name.length, POPUP_LIMITS.name]}>
            <input style={inp} value={d.name} maxLength={POPUP_LIMITS.name} placeholder="e.g. Autumn offer — homepage" onChange={(e) => set('name', e.target.value)} />
          </Field>

          <div style={{ ...sectionTitle, marginTop: 20 }}>Content</div>
          <Field label="Label above the title (optional)" count={[d.tag?.length ?? 0, POPUP_LIMITS.tag]}>
            <input style={inp} value={d.tag ?? ''} maxLength={POPUP_LIMITS.tag} placeholder="e.g. Autumn offer" onChange={(e) => set('tag', str(e.target.value))} />
          </Field>
          <Field label="Title" count={[d.title.length, POPUP_LIMITS.title]}>
            <input style={inp} value={d.title} maxLength={POPUP_LIMITS.title} placeholder="e.g. 3 months free for new fleets" onChange={(e) => set('title', e.target.value)} />
          </Field>
          <Field label="Text (optional)" count={[d.body?.length ?? 0, POPUP_LIMITS.body]}>
            <textarea style={{ ...inp, minHeight: 84, resize: 'vertical', lineHeight: 1.5 }} value={d.body ?? ''} maxLength={POPUP_LIMITS.body}
              placeholder="One or two short sentences." onChange={(e) => set('body', str(e.target.value))} />
          </Field>
          <Field label="Image (optional)" help="Shown across the top. A wide picture works best (about 880 × 400). Up to 3 MB.">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
              <button type="button" style={ghostBtn} disabled={busy} onClick={() => fileRef.current?.click()}>
                <Icon name="upload" size={13} />{uploading ? 'Uploading…' : d.imageUrl ? 'Replace image' : 'Upload image'}
              </button>
              {d.imageUrl && (
                <button type="button" style={ghostBtn} onClick={() => set('imageUrl', null)}><Icon name="trash" size={13} />Remove</button>
              )}
            </div>
            <input style={{ ...inp, marginTop: 8 }} value={d.imageUrl ?? ''} placeholder="…or paste an image link (https://…)" onChange={(e) => set('imageUrl', str(e.target.value.trim()))} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Button text" count={[d.ctaLabel?.length ?? 0, POPUP_LIMITS.ctaLabel]}>
              <input style={inp} value={d.ctaLabel ?? ''} maxLength={POPUP_LIMITS.ctaLabel} placeholder="Get started free" onChange={(e) => set('ctaLabel', str(e.target.value))} />
            </Field>
            <Field label="Button link">
              <input style={inp} value={d.ctaUrl ?? ''} placeholder="/login?mode=signup" onChange={(e) => set('ctaUrl', str(e.target.value.trim()))} />
            </Field>
          </div>
          <div style={{ ...hint, marginTop: -8, marginBottom: 14 }}>
            A page on the site (/pricing, /contact, /login?mode=signup for sign-up) or a full https:// link, which opens in a new tab. Leave both empty for no button.
          </div>
          <Field label="Second button that just closes it (optional)" count={[d.dismissLabel?.length ?? 0, POPUP_LIMITS.dismissLabel]}>
            <input style={inp} value={d.dismissLabel ?? ''} maxLength={POPUP_LIMITS.dismissLabel} placeholder="e.g. No thanks" onChange={(e) => set('dismissLabel', str(e.target.value))} />
          </Field>

          <div style={{ ...sectionTitle, marginTop: 20 }}>Style</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            <button type="button" style={seg(d.layout === 'modal')} onClick={() => set('layout', 'modal')}>Centre of the screen</button>
            <button type="button" style={seg(d.layout === 'slide')} onClick={() => set('layout', 'slide')}>Corner card</button>
          </div>

          <div style={{ ...sectionTitle, marginTop: 20 }}>Where</div>
          <Field label="Pages">
            <PagesPicker pages={d.pages} onChange={(p) => set('pages', p)} />
          </Field>
          <Field label="Screens">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" style={seg(d.devices === 'all')} onClick={() => set('devices', 'all')}>Phones & desktop</button>
              <button type="button" style={seg(d.devices === 'desktop')} onClick={() => set('devices', 'desktop')}>Desktop only</button>
              <button type="button" style={seg(d.devices === 'mobile')} onClick={() => set('devices', 'mobile')}>Phones only</button>
            </div>
          </Field>

          <div style={{ ...sectionTitle, marginTop: 20 }}>When</div>
          <Field
            label="Opens"
            help={d.trigger === 'exit' ? 'On desktop: when the mouse heads for the tabs or address bar. On phones (no mouse): halfway down the page.' : undefined}
          >
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" style={seg(d.trigger === 'delay')} onClick={() => setD((c) => ({ ...c, trigger: 'delay', triggerValue: 5 }))}>After a few seconds</button>
              <button type="button" style={seg(d.trigger === 'scroll')} onClick={() => setD((c) => ({ ...c, trigger: 'scroll', triggerValue: 50 }))}>After scrolling</button>
              <button type="button" style={seg(d.trigger === 'exit')} onClick={() => set('trigger', 'exit')}>When leaving</button>
            </div>
            {d.trigger !== 'exit' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12.5, color: 'var(--text-3)' }}>
                {d.trigger === 'delay' ? 'After' : 'Once'}
                <input type="number" style={{ ...inp, width: 80 }} min={d.trigger === 'scroll' ? 5 : 0} max={d.trigger === 'scroll' ? 100 : 600}
                  value={d.triggerValue} onChange={(e) => set('triggerValue', Number(e.target.value))} />
                {d.trigger === 'delay' ? 'seconds on the page' : '% of the page is scrolled'}
              </div>
            )}
          </Field>
          <Field label="How often one visitor sees it" help="Never more than one pop-up per visit, whatever the settings, and never while the cookie banner is still waiting for an answer.">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" style={seg(d.frequency === 'once')} onClick={() => set('frequency', 'once')}>Only once</button>
              <button type="button" style={seg(d.frequency === 'visit')} onClick={() => set('frequency', 'visit')}>Once per visit</button>
              <button type="button" style={seg(d.frequency === 'days')} onClick={() => set('frequency', 'days')}>Every few days</button>
              {d.frequency === 'days' && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-3)' }}>
                  every
                  <input type="number" style={{ ...inp, width: 70 }} min={1} max={365} value={d.frequencyDays} onChange={(e) => set('frequencyDays', Number(e.target.value))} />
                  days
                </span>
              )}
            </div>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="From (optional)">
              <input type="date" style={inp} value={d.startsOn ?? ''} onChange={(e) => set('startsOn', str(e.target.value))} />
            </Field>
            <Field label="Until (optional)">
              <input type="date" style={inp} value={d.endsOn ?? ''} min={d.startsOn ?? undefined} onChange={(e) => set('endsOn', str(e.target.value))} />
            </Field>
          </div>
          <div style={{ ...hint, marginTop: -8, marginBottom: 14 }}>Whole days, Malta time; the last day counts. Leave empty to run until you switch it off.</div>
          <Field label="Priority" help="When two pop-ups could show on the same page, the higher number wins.">
            <input type="number" style={{ ...inp, width: 100 }} min={-1000} max={1000} value={d.priority} onChange={(e) => set('priority', Number(e.target.value))} />
          </Field>

          {error && <div style={{ fontSize: 12.5, color: 'var(--neg)', margin: '6px 0 12px' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, paddingTop: 14, borderTop: '1px solid var(--line-1)' }}>
            <button type="button" style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={save}>
              <Icon name="check" size={14} stroke={2} />{isPending ? 'Saving…' : 'Save'}
            </button>
            <button type="button" style={ghostBtn} onClick={onCancel} disabled={isPending}>Cancel</button>
          </div>
        </div>

        <div style={{ ...card, padding: 18, position: 'sticky', top: 'calc(var(--topbar-h, 56px) + 12px)' }}>
          <Preview draft={d} />
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// List
// =============================================================================
function PopupRow({ p, today, onEdit, onChanged }: { p: Row; today: string; onEdit: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const status = statusOf(p, today);
  const run = async (fn: () => Promise<{ error?: string }>) => {
    setBusy(true);
    setError('');
    const res = await fn();
    setBusy(false);
    if (res.error) setError(res.error);
    else onChanged();
  };

  return (
    <div style={{ ...card, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <Switch on={p.enabled} disabled={busy} label={p.enabled ? 'Switch off' : 'Switch on'} onChange={(v) => void run(() => setSitePopupEnabledAction(p.id, v))} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={onEdit} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-1)', fontSize: 14, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
              {p.name}
            </button>
            <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 999, color: TONE[status.tone].color, background: TONE[status.tone].bg }}>
              {status.label}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{p.layout === 'modal' ? 'Centred' : 'Corner card'}</span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>“{p.title}”</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{whereText(p)} · {whenText(p)}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button type="button" style={iconBtn} title="Edit" aria-label="Edit" onClick={onEdit}><Icon name="pencil" size={14} /></button>
          <a style={iconBtn} title="Preview on the website" aria-label="Preview on the website" href={previewHref(p)} target="_blank" rel="noopener"><Icon name="eye" size={14} /></a>
          <button type="button" style={iconBtn} title="Duplicate" aria-label="Duplicate" disabled={busy} onClick={() => void run(() => duplicateSitePopupAction(p.id))}><Icon name="copy" size={14} /></button>
          <button type="button" style={iconBtn} title="Show again to everyone" aria-label="Show again to everyone" disabled={busy}
            onClick={() => { if (window.confirm(`Show “${p.name}” again to visitors who already saw or closed it?`)) void run(() => resetSitePopupSeenAction(p.id)); }}>
            <Icon name="refresh" size={14} />
          </button>
          <button type="button" style={{ ...iconBtn, color: 'var(--neg)' }} title="Delete" aria-label="Delete" disabled={busy}
            onClick={() => { if (window.confirm(`Delete “${p.name}”? Its numbers go with it.`)) void run(() => deleteSitePopupAction(p.id)); }}>
            <Icon name="trash" size={14} />
          </button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, paddingTop: 12, borderTop: '1px solid var(--line-1)' }}>
        {[
          { label: 'Shown', value: fmt(p.recent.views), all: fmt(p.stats.views) },
          { label: 'Button pressed', value: fmt(p.recent.clicks), all: fmt(p.stats.clicks) },
          { label: 'Press rate', value: pct(p.recent.clicks, p.recent.views), all: pct(p.stats.clicks, p.stats.views) },
          { label: 'Closed', value: fmt(p.recent.closes), all: fmt(p.stats.closes) },
        ].map((s) => (
          <div key={s.label} title={`All time: ${s.all}`}>
            <div style={{ fontSize: 10.5, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
            <div style={{ fontSize: 16, fontWeight: 500, marginTop: 2 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-4)' }}>all time {s.all}</div>
          </div>
        ))}
      </div>
      {error && <div style={{ fontSize: 12.5, color: 'var(--neg)' }}>{error}</div>}
    </div>
  );
}

export default function PopupsManager() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState<PopupInput | null>(null);
  const today = todayForOffers();

  const load = useCallback(
    () =>
      listSitePopupsAction().then(
        (res) => {
          setRows(res.popups);
          setLoadError(res.error ?? '');
        },
        () => setLoadError('Couldn’t load pop-ups.'),
      ),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);

  if (editing) {
    return (
      <Editor
        key={editing.id ?? 'new'}
        initial={editing}
        onCancel={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void load();
        }}
      />
    );
  }

  const live = rows?.filter((p) => statusOf(p, today).tone === 'live').length ?? 0;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          {rows === null ? 'Loading…' : rows.length ? `${rows.length} pop-up${rows.length === 1 ? '' : 's'} · ${live} live now · numbers are the last 30 days` : ''}
        </div>
        <button type="button" style={primaryBtn} onClick={() => setEditing({ ...EMPTY_POPUP })}>
          <Icon name="plus" size={14} stroke={2} />New pop-up
        </button>
      </div>
      {loadError && <div style={{ ...card, padding: 16, fontSize: 13, color: 'var(--warn)', marginBottom: 12 }}>{loadError}</div>}
      {rows && !rows.length && !loadError && (
        <div style={{ ...card, padding: '44px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 500 }}>No pop-ups yet</div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 6, maxWidth: 440, marginInline: 'auto', lineHeight: 1.5 }}>
            Announce an offer, a new feature or an event to website visitors. Pick the pages, the moment it opens and how often, and switch it off whenever you like.
          </div>
          <button type="button" style={{ ...primaryBtn, marginTop: 16 }} onClick={() => setEditing({ ...EMPTY_POPUP })}>
            <Icon name="plus" size={14} stroke={2} />Create your first pop-up
          </button>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows?.map((p) => (
          <PopupRow
            key={p.id}
            p={p}
            today={today}
            onChanged={() => void load()}
            onEdit={() => {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { stats, recent, version, createdAt, updatedAt, ...input } = p;
              setEditing(input);
            }}
          />
        ))}
      </div>
    </div>
  );
}
