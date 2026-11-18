'use client';

// =============================================================================
// EMAIL CAMPAIGNS (platform-admin) — HTML newsletters & product updates
// =============================================================================
// Three views:
//   Compose    pick a template, edit subject / preview text / HTML with a live
//              preview, choose who gets it, send a test to yourself, send.
//   Templates  built-in starters + templates saved from the editor.
//   Sent       every campaign that went out, with its results.
//
// The preview runs the same merge-tag + footer functions the server uses per
// recipient (lib/email/campaign-shared), so what you see is what they get.
// =============================================================================

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import FleetIcon from '@/components/fleet/FleetIcon';
import { STARTER_TEMPLATES, type StarterTemplate } from '@/lib/email/campaign-templates';
import {
  GMAIL_CLIP_BYTES,
  MERGE_TAGS,
  byteLength,
  findUnknownMergeTags,
  parseEmailList,
  prepareCampaignHtml,
  renderMergeTags,
  type CampaignAudience,
  type MergeVars,
} from '@/lib/email/campaign-shared';
import {
  deleteEmailTemplateAction,
  getEmailCampaignAction,
  getEmailCampaignSetupAction,
  listEmailCampaignsAction,
  listEmailTemplatesAction,
  previewEmailAudienceAction,
  saveEmailTemplateAction,
  sendEmailCampaignAction,
  sendEmailCampaignTestAction,
  type AudiencePreview,
  type CampaignDetail,
  type CampaignSetup,
  type CampaignSummary,
  type SavedTemplate,
} from '@/lib/actions/email-campaigns';

const Icon = FleetIcon;

// ─── styles (same vocabulary as BroadcastCenter) ─────────────────────────────

const inp: CSSProperties = {
  padding: '9px 11px', borderRadius: 8, border: '1px solid var(--line-2)', background: 'var(--bg-2)',
  color: 'var(--text-1)', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box',
};
const lbl: CSSProperties = { fontSize: 11.5, color: 'var(--text-3)', marginBottom: 6, display: 'block' };
const card: CSSProperties = { background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--radius-lg)', padding: 18, minWidth: 0 };
const sectionTitle: CSSProperties = { fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 12 };
const btn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', background: 'var(--accent)',
  border: '1px solid var(--accent)', color: '#fff', borderRadius: 9, fontSize: 13.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
};
const ghostBtn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px', background: 'var(--bg-2)',
  border: '1px solid var(--line-2)', color: 'var(--text-1)', borderRadius: 8, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
};
const seg = (on: boolean): CSSProperties => ({
  padding: '7px 13px', borderRadius: 8, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
  background: on ? 'var(--accent-soft)' : 'var(--bg-1)',
  border: `1px solid ${on ? 'var(--accent-line)' : 'var(--line-2)'}`,
  color: on ? 'var(--accent)' : 'var(--text-2)',
});
const chip = (on: boolean): CSSProperties => ({
  padding: '5px 10px', borderRadius: 7, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
  background: on ? 'var(--accent)' : 'var(--bg-2)',
  border: `1px solid ${on ? 'var(--accent)' : 'var(--line-2)'}`,
  color: on ? '#fff' : 'var(--text-2)',
});
const tagChip: CSSProperties = {
  padding: '3px 8px', borderRadius: 6, fontSize: 11.5, cursor: 'pointer', fontFamily: 'Geist Mono, ui-monospace, monospace',
  background: 'var(--bg-2)', border: '1px solid var(--line-2)', color: 'var(--text-2)',
};
const notice = (tone: 'warn' | 'neg' | 'pos' | 'info'): CSSProperties => ({
  display: 'flex', gap: 9, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 9, fontSize: 12.5, lineHeight: 1.5,
  background: tone === 'warn' ? 'var(--warn-soft)' : tone === 'neg' ? 'rgba(240,100,100,0.12)' : tone === 'pos' ? 'var(--pos-soft)' : 'var(--bg-2)',
  color: tone === 'warn' ? 'var(--warn)' : tone === 'neg' ? 'var(--neg)' : tone === 'pos' ? 'var(--pos)' : 'var(--text-2)',
  border: `1px solid ${tone === 'info' ? 'var(--line-1)' : 'transparent'}`,
});

// ─── state shapes ────────────────────────────────────────────────────────────

type View = 'compose' | 'templates' | 'sent';

interface Draft {
  subject: string;
  preheader: string;
  html: string;
  fromName: string;
  replyTo: string;
  marketing: boolean;
  /** Saved template this draft was opened from (enables "Update template"). */
  templateId: string | null;
  templateName: string;
  /** Where the content came from, for the "Start from" line. */
  source: string;
}

interface AudState {
  kind: 'everyone' | 'operators' | 'drivers' | 'custom';
  opScope: 'all' | 'plan' | 'operators';
  drvScope: 'all' | 'operators';
  planKeys: string[];
  operatorIds: string[];
  activeOnly: boolean;
  customText: string;
}

const DEFAULT_AUD: AudState = {
  kind: 'operators', opScope: 'all', drvScope: 'all', planKeys: [], operatorIds: [], activeOnly: true, customText: '',
};

const DRAFT_KEY = 'rovora.admin.email-draft.v1';

function readStoredDraft(): { draft?: Draft; aud?: AudState; baseline?: string } {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { draft?: Partial<Draft>; aud?: Partial<AudState>; baseline?: string };
    return {
      draft: parsed.draft?.html ? { ...fromStarter(STARTER_TEMPLATES[0]), ...parsed.draft } : undefined,
      baseline: parsed.draft?.html ? parsed.baseline : undefined,
      aud: parsed.aud ? { ...DEFAULT_AUD, ...parsed.aud } : undefined,
    };
  } catch {
    return {}; // storage blocked or corrupt — start fresh
  }
}

const fromStarter = (t: StarterTemplate): Draft => ({
  subject: t.subject, preheader: t.preheader, html: t.html, fromName: '', replyTo: '', marketing: t.marketing,
  templateId: null, templateName: '', source: `Starter · ${t.name}`,
});

const fromSaved = (t: SavedTemplate): Draft => ({
  subject: t.subject, preheader: t.preheader, html: t.html, fromName: '', replyTo: '', marketing: true,
  templateId: t.id, templateName: t.name, source: `Template · ${t.name}`,
});

const signature = (d: Pick<Draft, 'subject' | 'preheader' | 'html' | 'marketing'>) =>
  `${d.subject}\u0000${d.preheader}\u0000${d.html}\u0000${d.marketing}`;

function toAudience(a: AudState): CampaignAudience {
  switch (a.kind) {
    case 'everyone':
      return { kind: 'everyone' };
    case 'operators':
      return {
        kind: 'operators', scope: a.opScope,
        planKeys: a.opScope === 'plan' ? a.planKeys : undefined,
        operatorIds: a.opScope === 'operators' ? a.operatorIds : undefined,
      };
    case 'drivers':
      return {
        kind: 'drivers', scope: a.drvScope, activeOnly: a.activeOnly,
        operatorIds: a.drvScope === 'operators' ? a.operatorIds : undefined,
      };
    case 'custom':
      return { kind: 'custom', emails: parseEmailList(a.customText).valid };
  }
}

/** Preview-only: stop links navigating the sandboxed iframe away from the email. */
const PREVIEW_GUARD = '<style>a{pointer-events:none!important;cursor:default!important}</style>';
function withPreviewGuard(html: string): string {
  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${PREVIEW_GUARD}</head>`) : PREVIEW_GUARD + html;
}

function renderForPreview(
  d: Pick<Draft, 'html' | 'preheader' | 'marketing'>,
  base: MergeVars,
): string {
  const prepared = prepareCampaignHtml(d.html, { preheader: d.preheader, marketing: d.marketing });
  const vars: MergeVars = { ...base };
  vars.preheader = renderMergeTags(d.preheader, vars, 'text');
  return withPreviewGuard(renderMergeTags(prepared, vars, 'html'));
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

// ─── component ───────────────────────────────────────────────────────────────

export default function EmailCampaigns() {
  const [view, setView] = useState<View>('compose');
  const [setup, setSetup] = useState<CampaignSetup | null>(null);
  const [setupError, setSetupError] = useState('');
  const [saved, setSaved] = useState<SavedTemplate[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignSummary[] | null>(null);

  // The tab only ever mounts in the browser (the console opens on Overview),
  // so the unsent draft can be read straight from storage on first render.
  const [stored] = useState(readStoredDraft);
  const [draft, setDraft] = useState<Draft>(() => stored.draft ?? fromStarter(STARTER_TEMPLATES[0]));
  const [baseline, setBaseline] = useState(() => stored.baseline ?? signature(fromStarter(STARTER_TEMPLATES[0])));
  const [aud, setAud] = useState<AudState>(() => stored.aud ?? DEFAULT_AUD);

  /** Latest audience count, tagged with the request it answers. */
  const [previewResult, setPreviewResult] = useState<{ key: string; data: AudiencePreview } | null>(null);

  const [busy, setBusy] = useState<'' | 'test' | 'send' | 'save'>('');
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [testedSig, setTestedSig] = useState('');
  const [testTo, setTestTo] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lastSend, setLastSend] = useState<{ sent: number; failed: number; skipped: number; errors: string[] } | null>(null);
  const [savingName, setSavingName] = useState<string | null>(null);
  const [openCampaign, setOpenCampaign] = useState<CampaignDetail | null>(null);

  // ── load ──
  useEffect(() => {
    getEmailCampaignSetupAction()
      .then(setSetup)
      .catch(() => setSetupError('Could not load the email setup. Refresh to try again.'));
    listEmailTemplatesAction().then((r) => setSaved(r.templates)).catch(() => {});
  }, []);

  const loadCampaigns = useCallback(() => {
    listEmailCampaignsAction().then((r) => setCampaigns(r.campaigns)).catch(() => setCampaigns([]));
  }, []);
  useEffect(() => {
    if (view === 'sent' && campaigns === null) loadCampaigns();
  }, [view, campaigns, loadCampaigns]);

  // ── persist the unsent draft (per browser, best-effort) ──
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ draft, aud, baseline }));
      } catch {
        /* quota / private mode — the draft just won't survive a reload */
      }
    }, 500);
    return () => window.clearTimeout(t);
  }, [draft, aud, baseline]);

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const dirty = signature(draft) !== baseline;

  // ── audience count (debounced, latest request wins) ──
  const audience = useMemo(() => toAudience(aud), [aud]);
  const audienceKey = JSON.stringify(audience);
  const previewKey = `${audienceKey}|${draft.marketing}`;
  useEffect(() => {
    let live = true;
    const t = window.setTimeout(() => {
      previewEmailAudienceAction(JSON.parse(audienceKey) as CampaignAudience, draft.marketing)
        .catch((): AudiencePreview => ({ total: 0, excluded: 0, sample: [], summary: '', error: 'Could not load that audience.' }))
        .then((data) => { if (live) setPreviewResult({ key: previewKey, data }); });
    }, 400);
    return () => { live = false; window.clearTimeout(t); };
  }, [audienceKey, draft.marketing, previewKey]);
  // Keep showing the last count (dimmed) while the new one loads.
  const preview = previewResult?.data ?? null;
  const previewLoading = previewResult?.key !== previewKey;

  // ── live preview ──
  const baseVars: MergeVars = useMemo(() => {
    const p = setup?.preview;
    return {
      first_name: p?.firstName ?? 'Alex',
      full_name: p?.fullName ?? 'Alex Borg',
      email: setup?.adminEmail ?? 'you@example.com',
      fleet_name: p?.fleetName ?? 'Harbour Cabs',
      app_url: p?.appUrl ?? 'https://rovora.eu',
      logo_url: p?.logoUrl ?? 'https://rovora.eu/logo-full.png',
      app_name: p?.appName ?? 'Rovora',
      unsubscribe_url: '#unsubscribe',
      year: String(new Date().getFullYear()),
    };
  }, [setup]);

  const deferredHtml = useDeferredValue(draft.html);
  const deferredPreheader = useDeferredValue(draft.preheader);
  const previewHtml = useMemo(
    () => renderForPreview({ html: deferredHtml, preheader: deferredPreheader, marketing: draft.marketing }, baseVars),
    [deferredHtml, deferredPreheader, draft.marketing, baseVars],
  );
  const previewSubject = renderMergeTags(draft.subject, baseVars, 'text');
  const previewPreheader = renderMergeTags(draft.preheader, baseVars, 'text');
  const unknownTags = useMemo(
    () => findUnknownMergeTags(`${draft.subject}\n${draft.preheader}\n${deferredHtml}`),
    [draft.subject, draft.preheader, deferredHtml],
  );
  const htmlBytes = useMemo(() => byteLength(previewHtml), [previewHtml]);
  const customParsed = useMemo(() => parseEmailList(aud.customText), [aud.customText]);

  // ── template loading ──
  const loadDraft = (next: Draft) => {
    if (dirty && !window.confirm('Replace the email you are editing? Unsaved changes will be lost.')) return false;
    setDraft((d) => ({ ...next, fromName: d.fromName, replyTo: d.replyTo }));
    setBaseline(signature(next));
    setError('');
    setFlash('');
    setLastSend(null);
    return true;
  };

  const chooseTemplate = (value: string) => {
    if (value.startsWith('starter:')) {
      const t = STARTER_TEMPLATES.find((s) => `starter:${s.id}` === value);
      if (t) loadDraft(fromStarter(t));
    } else if (value.startsWith('saved:')) {
      const t = saved.find((s) => `saved:${s.id}` === value);
      if (t) loadDraft(fromSaved(t));
    }
  };

  // ── saving templates ──
  const saveTemplate = async (asNew: boolean, name: string) => {
    setError('');
    setBusy('save');
    try {
      const r = await saveEmailTemplateAction({
        id: asNew ? null : draft.templateId,
        name,
        subject: draft.subject,
        preheader: draft.preheader,
        html: draft.html,
      });
      if (r.error || !r.template) { setError(r.error ?? 'Could not save the template.'); return; }
      const t = r.template;
      setSaved((list) => [t, ...list.filter((x) => x.id !== t.id)]);
      update({ templateId: t.id, templateName: t.name, source: `Template · ${t.name}` });
      setBaseline(signature(draft));
      setSavingName(null);
      setFlash(asNew ? `Saved as “${t.name}”.` : `Updated “${t.name}”.`);
    } finally {
      setBusy('');
    }
  };

  const deleteTemplate = async (t: SavedTemplate) => {
    if (!window.confirm(`Delete the template “${t.name}”? This can't be undone.`)) return;
    const r = await deleteEmailTemplateAction(t.id);
    if (r.error) { setError(r.error); return; }
    setSaved((list) => list.filter((x) => x.id !== t.id));
    if (draft.templateId === t.id) update({ templateId: null, source: `${draft.source} (deleted)` });
  };

  // ── inserting merge tags at the cursor of the last-focused field ──
  const subjectRef = useRef<HTMLInputElement>(null);
  const preheaderRef = useRef<HTMLInputElement>(null);
  const htmlRef = useRef<HTMLTextAreaElement>(null);
  const lastField = useRef<'subject' | 'preheader' | 'html'>('html');

  const insertTag = (tag: string) => {
    const field = lastField.current;
    const el = field === 'subject' ? subjectRef.current : field === 'preheader' ? preheaderRef.current : htmlRef.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    el.setRangeText(`{{${tag}}}`, start, end, 'end');
    update({ [field]: el.value } as Partial<Draft>);
    el.focus();
  };

  const onHtmlKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab' || e.shiftKey) return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setRangeText('  ', el.selectionStart, el.selectionEnd, 'end');
    update({ html: el.value });
  };

  const importFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 600_000) { setError('That file is over 600 KB — host big images instead of embedding them.'); return; }
    file.text().then((text) => {
      if (dirty && !window.confirm('Replace the current HTML with this file?')) return;
      update({ html: text, templateId: null, source: `File · ${file.name}` });
    });
  };

  // ── sending ──
  const content = () => ({
    subject: draft.subject,
    preheader: draft.preheader,
    html: draft.html,
    fromName: draft.fromName,
    replyTo: draft.replyTo,
    marketing: draft.marketing,
    templateId: draft.templateId,
  });

  const sendTest = async () => {
    setError(''); setFlash('');
    setBusy('test');
    try {
      const r = await sendEmailCampaignTestAction({ ...content(), to: testTo || undefined });
      if (r.error) { setError(r.error); return; }
      setTestedSig(signature(draft));
      setFlash(`Test sent to ${r.to}. Check your inbox (and spam folder).`);
    } catch {
      setError('The test could not be sent. Try again.');
    } finally {
      setBusy('');
    }
  };

  const blockers: string[] = [];
  if (setup && !setup.configured) blockers.push('Email is not configured on the server (RESEND_API_KEY).');
  if (setup?.setupMissing) blockers.push('Run the email-campaigns database migration first.');
  if (!draft.subject.trim()) blockers.push('Add a subject line.');
  if (!draft.html.trim()) blockers.push('The email has no content.');
  if (unknownTags.length) blockers.push('Fix the unknown merge tags.');
  if (preview?.error) blockers.push(preview.error);
  else if (preview && preview.total === 0) blockers.push('No one is in this audience.');

  const send = async () => {
    setError(''); setFlash('');
    setBusy('send');
    try {
      const r = await sendEmailCampaignAction({ ...content(), audience });
      setConfirmOpen(false);
      if (r.error) { setError(r.error); return; }
      setLastSend({ sent: r.sent ?? 0, failed: r.failed ?? 0, skipped: r.skipped ?? 0, errors: r.errors ?? [] });
      setBaseline(signature(draft));
      setCampaigns(null); // refresh history next time it's opened
    } catch {
      setConfirmOpen(false);
      setError('The send was interrupted before we heard back. Check the Sent tab before trying again — some emails may have gone out.');
      setCampaigns(null);
    } finally {
      setBusy('');
    }
  };

  const reuseCampaign = (c: CampaignDetail) => {
    const ok = loadDraft({
      subject: c.subject, preheader: c.preheader ?? '', html: c.html, fromName: '', replyTo: '',
      marketing: c.marketing, templateId: null, templateName: '', source: `Sent · ${c.subject}`,
    });
    if (!ok) return;
    setDraft((d) => ({ ...d, fromName: c.from_name ?? '', replyTo: c.reply_to ?? '' }));
    setOpenCampaign(null);
    setView('compose');
  };

  const fromLine = `${draft.fromName.trim() || setup?.defaultFromName || 'Rovora'} <${setup?.fromAddress ?? 'noreply@rovora.eu'}>`;
  const operators = setup?.operators ?? [];
  const toggle = (arr: string[], id: string) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* sub-navigation */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {([
          ['compose', 'Compose', 'pencil'],
          ['templates', `Templates · ${STARTER_TEMPLATES.length + saved.length}`, 'doc'],
          ['sent', 'Sent', 'send'],
        ] as [View, string, string][]).map(([id, label, icon]) => (
          <button key={id} style={{ ...seg(view === id), display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setView(id)}>
            <Icon name={icon} size={13} />{label}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)' }}>
          Sends from <span style={{ color: 'var(--text-2)', fontFamily: 'Geist Mono, ui-monospace, monospace' }}>{setup?.fromAddress ?? '…'}</span>
        </span>
      </div>

      {setupError && <div style={notice('neg')}><Icon name="warning" size={14} />{setupError}</div>}
      {setup && !setup.configured && (
        <div style={notice('warn')}>
          <Icon name="warning" size={14} />
          <span><b>Email isn&rsquo;t configured.</b> Set <code>RESEND_API_KEY</code> (and <code>EMAIL_FROM</code> on your verified Resend domain) on the server — until then nothing can be sent.</span>
        </div>
      )}
      {setup?.setupMissing && (
        <div style={notice('warn')}>
          <Icon name="warning" size={14} />
          <span>Run <code>supabase/migrations/20261118_email_campaigns.sql</code> in the Supabase SQL editor to enable saved templates, send history and unsubscribes.</span>
        </div>
      )}

      {view === 'compose' && (
        <>
          {/* ── 1. Message ── */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
              <div style={{ ...sectionTitle, marginBottom: 0 }}>Message</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  {draft.source}{dirty ? ' · edited' : ''}
                </span>
                <select
                  aria-label="Start from a template"
                  style={{ ...inp, width: 'auto', padding: '7px 10px', cursor: 'pointer' }}
                  value=""
                  onChange={(e) => { chooseTemplate(e.target.value); e.target.value = ''; }}
                >
                  <option value="">Start from a template…</option>
                  <optgroup label="Starter templates">
                    {STARTER_TEMPLATES.map((t) => <option key={t.id} value={`starter:${t.id}`}>{t.name}</option>)}
                  </optgroup>
                  {saved.length > 0 && (
                    <optgroup label="Your templates">
                      {saved.map((t) => <option key={t.id} value={`saved:${t.id}`}>{t.name}</option>)}
                    </optgroup>
                  )}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: 12 }}>
              <div>
                <label style={lbl} htmlFor="ec-from">Sender name</label>
                <input id="ec-from" style={inp} value={draft.fromName} maxLength={60}
                  placeholder={setup?.defaultFromName ?? 'Rovora'} onChange={(e) => update({ fromName: e.target.value })} />
              </div>
              <div>
                <label style={lbl} htmlFor="ec-reply">Reply-to (optional)</label>
                <input id="ec-reply" style={inp} value={draft.replyTo} type="email"
                  placeholder="hello@rovora.eu — so replies reach a person" onChange={(e) => update({ replyTo: e.target.value })} />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={lbl} htmlFor="ec-subject">Subject</label>
              <input id="ec-subject" ref={subjectRef} style={inp} value={draft.subject} maxLength={200}
                placeholder="e.g. What's new in Rovora this month"
                onFocus={() => { lastField.current = 'subject'; }} onChange={(e) => update({ subject: e.target.value })} />
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={lbl} htmlFor="ec-pre">Preview text <span style={{ color: 'var(--text-4)' }}>— the grey line after the subject in the inbox</span></label>
              <input id="ec-pre" ref={preheaderRef} style={inp} value={draft.preheader} maxLength={300}
                placeholder="One sentence that makes people open it"
                onFocus={() => { lastField.current = 'preheader'; }} onChange={(e) => update({ preheader: e.target.value })} />
            </div>

            <div style={{ marginTop: 14 }}>
              <label style={lbl}>Type</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button style={seg(draft.marketing)} onClick={() => update({ marketing: true })}>Newsletter / update</button>
                <button style={seg(!draft.marketing)} onClick={() => update({ marketing: false })}>Service notice</button>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 7, lineHeight: 1.5 }}>
                {draft.marketing
                  ? 'Skips people who unsubscribed, and every email gets a personal unsubscribe link plus the one-click unsubscribe header Gmail and Yahoo require.'
                  : 'Goes to everyone in the audience, including people who unsubscribed from newsletters. Only for important account or service information — outages, security, terms changes.'}
              </div>
            </div>
          </div>

          {/* ── 2. Content: editor + preview ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(440px, 100%), 1fr))', gap: 16 }}>
            <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <div style={{ ...sectionTitle, marginBottom: 0 }}>HTML</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <label style={{ ...ghostBtn, padding: '6px 10px' }}>
                    <Icon name="upload" size={13} />Import .html
                    <input type="file" accept=".html,.htm,text/html" style={{ display: 'none' }}
                      onChange={(e) => { importFile(e.target.files?.[0]); e.target.value = ''; }} />
                  </label>
                  {draft.templateId && savingName === null && (
                    <button style={{ ...ghostBtn, padding: '6px 10px' }} disabled={busy === 'save'} onClick={() => saveTemplate(false, draft.templateName)}>
                      <Icon name="check" size={13} />Update “{draft.templateName}”
                    </button>
                  )}
                  {savingName === null && (
                    <button style={{ ...ghostBtn, padding: '6px 10px' }} disabled={setup?.setupMissing}
                      onClick={() => setSavingName(draft.templateId ? `${draft.templateName} (copy)` : draft.subject.slice(0, 80))}>
                      <Icon name="plus" size={13} />{draft.templateId ? 'Save as new' : 'Save as template'}
                    </button>
                  )}
                </div>
              </div>

              {savingName !== null && (
                <form
                  style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}
                  onSubmit={(e) => { e.preventDefault(); if (savingName.trim()) saveTemplate(true, savingName.trim()); }}
                >
                  <input autoFocus style={{ ...inp, flex: '1 1 200px' }} value={savingName} maxLength={120}
                    placeholder="Template name" onChange={(e) => setSavingName(e.target.value)} />
                  <button type="submit" style={{ ...btn, padding: '7px 13px', fontSize: 12.5 }} disabled={busy === 'save' || !savingName.trim()}>
                    {busy === 'save' ? 'Saving…' : 'Save'}
                  </button>
                  <button type="button" style={{ ...ghostBtn, padding: '7px 12px' }} onClick={() => setSavingName(null)}>Cancel</button>
                </form>
              )}

              <textarea
                ref={htmlRef}
                aria-label="Email HTML"
                spellCheck={false}
                value={draft.html}
                onFocus={() => { lastField.current = 'html'; }}
                onKeyDown={onHtmlKeyDown}
                onChange={(e) => update({ html: e.target.value })}
                placeholder="Paste or write your email HTML here…"
                style={{
                  ...inp, flex: 1, minHeight: 520, resize: 'vertical', whiteSpace: 'pre', overflowWrap: 'normal', overflow: 'auto',
                  fontFamily: 'Geist Mono, ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, lineHeight: 1.55, tabSize: 2,
                }}
              />

              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 6 }}>
                  Merge tags — click to insert where your cursor is. Add a fallback with a pipe: <code style={{ color: 'var(--text-2)' }}>{'{{first_name|there}}'}</code>
                </div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {MERGE_TAGS.map((t) => (
                    <button key={t.tag} type="button" style={tagChip} title={t.hint}
                      onMouseDown={(e) => e.preventDefault() /* keep the caret in the field */}
                      onClick={() => insertTag(t.tag)}>
                      {`{{${t.tag}}}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <PreviewPane
                html={previewHtml}
                fromName={draft.fromName.trim() || setup?.defaultFromName || 'Rovora'}
                subject={previewSubject}
                preheader={previewPreheader}
                sampleName={baseVars.full_name ?? ''}
              />
              {unknownTags.length > 0 && (
                <div style={notice('neg')}>
                  <Icon name="warning" size={14} />
                  <span>Unknown merge tag{unknownTags.length === 1 ? '' : 's'}: {unknownTags.map((t) => `{{${t}}}`).join(', ')}. The email can&rsquo;t be sent until {unknownTags.length === 1 ? 'it is' : 'they are'} fixed.</span>
                </div>
              )}
              {htmlBytes > GMAIL_CLIP_BYTES && (
                <div style={notice('warn')}>
                  <Icon name="warning" size={14} />
                  <span>This email is {Math.round(htmlBytes / 1024)} KB. Gmail clips anything over 102 KB behind a &ldquo;View entire message&rdquo; link — and the unsubscribe footer with it.</span>
                </div>
              )}
            </div>
          </div>

          {/* ── 3. Audience ── */}
          <div style={card}>
            <div style={sectionTitle}>Audience</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <button style={seg(aud.kind === 'operators')} onClick={() => setAud((a) => ({ ...a, kind: 'operators' }))}>Operators (fleet admins &amp; staff)</button>
              <button style={seg(aud.kind === 'drivers')} onClick={() => setAud((a) => ({ ...a, kind: 'drivers' }))}>Drivers</button>
              <button style={seg(aud.kind === 'everyone')} onClick={() => setAud((a) => ({ ...a, kind: 'everyone' }))}>Everyone</button>
              <button style={seg(aud.kind === 'custom')} onClick={() => setAud((a) => ({ ...a, kind: 'custom' }))}>Specific emails</button>
            </div>

            {aud.kind === 'operators' && (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                  <button style={seg(aud.opScope === 'all')} onClick={() => setAud((a) => ({ ...a, opScope: 'all' }))}>All operators</button>
                  <button style={seg(aud.opScope === 'plan')} onClick={() => setAud((a) => ({ ...a, opScope: 'plan' }))}>By plan</button>
                  <button style={seg(aud.opScope === 'operators')} onClick={() => setAud((a) => ({ ...a, opScope: 'operators' }))}>Specific fleets</button>
                </div>
                {aud.opScope === 'plan' && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(setup?.plans ?? []).map((p) => (
                      <button key={p.key} style={chip(aud.planKeys.includes(p.key))}
                        onClick={() => setAud((a) => ({ ...a, planKeys: toggle(a.planKeys, p.key) }))}>{p.name}</button>
                    ))}
                  </div>
                )}
                {aud.opScope === 'operators' && (
                  <FleetPicker operators={operators} selected={aud.operatorIds} countOf={(o) => o.managerCount} countLabel="managers"
                    onToggle={(id) => setAud((a) => ({ ...a, operatorIds: toggle(a.operatorIds, id) }))} />
                )}
              </>
            )}

            {aud.kind === 'drivers' && (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button style={seg(aud.drvScope === 'all')} onClick={() => setAud((a) => ({ ...a, drvScope: 'all' }))}>All drivers</button>
                  <button style={seg(aud.drvScope === 'operators')} onClick={() => setAud((a) => ({ ...a, drvScope: 'operators' }))}>By fleet</button>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--text-2)', marginLeft: 6, cursor: 'pointer' }}>
                    <input type="checkbox" checked={aud.activeOnly} onChange={(e) => setAud((a) => ({ ...a, activeOnly: e.target.checked }))} />
                    Active drivers only
                  </label>
                </div>
                {aud.drvScope === 'operators' && (
                  <FleetPicker operators={operators} selected={aud.operatorIds} countOf={(o) => o.driverCount} countLabel="drivers"
                    onToggle={(id) => setAud((a) => ({ ...a, operatorIds: toggle(a.operatorIds, id) }))} />
                )}
              </>
            )}

            {aud.kind === 'everyone' && (
              <div style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
                Every account on Rovora — operators, staff and drivers{setup ? ` (${plural(setup.totals.users, 'account')})` : ''}. Each address gets one email, even if it belongs to several fleets.
              </div>
            )}

            {aud.kind === 'custom' && (
              <div>
                <textarea
                  aria-label="Email addresses"
                  style={{ ...inp, minHeight: 96, resize: 'vertical', fontFamily: 'Geist Mono, ui-monospace, monospace', fontSize: 12 }}
                  value={aud.customText}
                  placeholder={'one@example.com, two@example.com\nor one per line'}
                  onChange={(e) => setAud((a) => ({ ...a, customText: e.target.value }))}
                />
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6 }}>
                  {plural(customParsed.valid.length, 'valid address', 'valid addresses')}
                  {customParsed.invalid.length > 0 && (
                    <span style={{ color: 'var(--warn)' }}> · ignoring {customParsed.invalid.slice(0, 3).join(', ')}{customParsed.invalid.length > 3 ? ` and ${customParsed.invalid.length - 3} more` : ''}</span>
                  )}
                </div>
              </div>
            )}

            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line-1)', fontSize: 12.5, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Icon name="staff" size={14} />
              {previewLoading && !preview ? (
                <span style={{ color: 'var(--text-3)' }}>Counting recipients…</span>
              ) : preview?.error ? (
                <span style={{ color: 'var(--warn)' }}>{preview.error}</span>
              ) : preview ? (
                <span style={{ opacity: previewLoading ? 0.6 : 1 }}>
                  <b style={{ color: 'var(--text-1)' }}>{plural(preview.total, 'recipient')}</b>
                  {preview.excluded > 0 && <span style={{ color: 'var(--text-3)' }}> · {preview.excluded} unsubscribed, skipped</span>}
                  {preview.sample.length > 0 && (
                    <span style={{ color: 'var(--text-4)' }}> · {preview.sample.slice(0, 3).join(', ')}{preview.total > 3 ? ', …' : ''}</span>
                  )}
                </span>
              ) : null}
            </div>
          </div>

          {/* ── 4. Send ── */}
          <div style={card}>
            <div style={sectionTitle}>Send</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input style={{ ...inp, flex: '1 1 220px', maxWidth: 320 }} type="email" value={testTo}
                placeholder={setup?.adminEmail ?? 'your@email'} aria-label="Send the test to"
                onChange={(e) => setTestTo(e.target.value)} />
              <button style={{ ...ghostBtn, opacity: busy ? 0.6 : 1 }} disabled={!!busy} onClick={sendTest}>
                <Icon name="eye" size={14} />{busy === 'test' ? 'Sending test…' : 'Send test to me'}
              </button>
              <div style={{ flex: 1 }} />
              <button
                style={{ ...btn, opacity: busy || blockers.length || !preview ? 0.55 : 1, cursor: busy || blockers.length || !preview ? 'not-allowed' : 'pointer' }}
                disabled={!!busy || blockers.length > 0 || !preview || previewLoading}
                onClick={() => { setError(''); setFlash(''); setConfirmOpen(true); }}
              >
                <Icon name="send" size={14} />
                {preview && !preview.error ? `Review & send to ${plural(preview.total, 'person', 'people')}` : 'Review & send'}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              {blockers.length > 0 && !previewLoading && (
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Before sending: {blockers.join(' ')}</div>
              )}
              {testedSig !== signature(draft) && blockers.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Tip: send yourself a test first — it uses your real name and a working unsubscribe link.</div>
              )}
              {error && <div style={notice('neg')}><Icon name="warning" size={14} /><span>{error}</span></div>}
              {flash && <div style={notice('pos')}><Icon name="check" size={14} /><span>{flash}</span></div>}
              {lastSend && (
                <div style={notice(lastSend.failed ? 'warn' : 'pos')}>
                  <Icon name={lastSend.failed ? 'warning' : 'check'} size={14} />
                  <span>
                    Sent to <b>{plural(lastSend.sent, 'person', 'people')}</b>
                    {lastSend.failed > 0 && <> · {lastSend.failed} failed</>}
                    {lastSend.skipped > 0 && <> · {lastSend.skipped} unsubscribed, skipped</>}.
                    {lastSend.errors.length > 0 && <> First error: {lastSend.errors[0]}</>}{' '}
                    <button style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}
                      onClick={() => setView('sent')}>See it in Sent</button>
                  </span>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {view === 'templates' && (
        <TemplatesView
          saved={saved}
          baseVars={baseVars}
          setupMissing={!!setup?.setupMissing}
          onUseStarter={(t) => { if (loadDraft(fromStarter(t))) setView('compose'); }}
          onUseSaved={(t) => { if (loadDraft(fromSaved(t))) setView('compose'); }}
          onDelete={deleteTemplate}
        />
      )}

      {view === 'sent' && (
        <SentView
          campaigns={campaigns}
          onRefresh={() => { setCampaigns(null); loadCampaigns(); }}
          onOpen={async (id) => {
            const r = await getEmailCampaignAction(id);
            if (r.campaign) setOpenCampaign(r.campaign);
            else setError(r.error ?? 'Could not load that campaign.');
          }}
        />
      )}

      {confirmOpen && preview && (
        <Modal onClose={() => { if (busy !== 'send') setConfirmOpen(false); }}>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>Send this email?</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 16 }}>Emails can&rsquo;t be recalled once they&rsquo;re sent.</div>
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 14px', margin: '0 0 16px', fontSize: 13 }}>
            {/* As written, tags and all — each recipient gets their own values. */}
            <dt style={{ color: 'var(--text-3)' }}>Subject</dt><dd style={{ margin: 0, color: 'var(--text-1)', overflowWrap: 'anywhere' }}>{draft.subject}</dd>
            <dt style={{ color: 'var(--text-3)' }}>From</dt><dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{fromLine}</dd>
            {draft.replyTo.trim() && <><dt style={{ color: 'var(--text-3)' }}>Replies</dt><dd style={{ margin: 0 }}>{draft.replyTo.trim()}</dd></>}
            <dt style={{ color: 'var(--text-3)' }}>To</dt>
            <dd style={{ margin: 0 }}>
              <b>{plural(preview.total, 'person', 'people')}</b> — {preview.summary}
              {preview.excluded > 0 && <span style={{ color: 'var(--text-3)' }}> ({preview.excluded} unsubscribed, skipped)</span>}
            </dd>
            <dt style={{ color: 'var(--text-3)' }}>Type</dt><dd style={{ margin: 0 }}>{draft.marketing ? 'Newsletter / update (with unsubscribe)' : 'Service notice'}</dd>
          </dl>
          {testedSig !== signature(draft) && (
            <div style={{ ...notice('warn'), marginBottom: 14 }}>
              <Icon name="warning" size={14} /><span>You haven&rsquo;t sent yourself a test of this version.</span>
            </div>
          )}
          {busy === 'send' && (
            <div style={{ ...notice('info'), marginBottom: 14 }}>
              <Icon name="refresh" size={14} /><span>Sending… keep this tab open. Large audiences take a little while (about a second per 100 people).</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button style={ghostBtn} disabled={busy === 'send'} onClick={() => setConfirmOpen(false)}>Cancel</button>
            <button style={{ ...btn, opacity: busy === 'send' ? 0.6 : 1 }} disabled={busy === 'send'} onClick={send}>
              <Icon name="send" size={14} />{busy === 'send' ? 'Sending…' : `Send to ${plural(preview.total, 'person', 'people')}`}
            </button>
          </div>
        </Modal>
      )}

      {openCampaign && (
        <CampaignModal campaign={openCampaign} baseVars={baseVars} onClose={() => setOpenCampaign(null)} onReuse={() => reuseCampaign(openCampaign)} />
      )}
    </div>
  );
}

// ─── pieces ──────────────────────────────────────────────────────────────────

function PreviewPane({ html, fromName, subject, preheader, sampleName }: {
  html: string; fromName: string; subject: string; preheader: string; sampleName: string;
}) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ ...sectionTitle, marginBottom: 0 }}>Preview <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--text-4)' }}>· as {sampleName || 'a recipient'}</span></div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={seg(device === 'desktop')} onClick={() => setDevice('desktop')}>Desktop</button>
          <button style={seg(device === 'mobile')} onClick={() => setDevice('mobile')}>Mobile</button>
        </div>
      </div>

      {/* How it looks in the inbox list */}
      <div style={{ display: 'flex', gap: 10, padding: '10px 12px', background: 'var(--bg-2)', border: '1px solid var(--line-1)', borderRadius: 9, minWidth: 0 }}>
        <div style={{ width: 32, height: 32, borderRadius: 16, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
          {(fromName[0] ?? 'R').toUpperCase()}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{fromName}</span>
            <span style={{ fontSize: 11, color: 'var(--text-4)' }}>now</span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {subject || <span style={{ color: 'var(--text-4)' }}>(no subject)</span>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {preheader || <span style={{ color: 'var(--text-4)' }}>No preview text — clients will show the first words of the email.</span>}
          </div>
        </div>
      </div>

      <div style={{ background: '#e9ecf1', borderRadius: 9, padding: device === 'mobile' ? '14px 0' : 0, display: 'flex', justifyContent: 'center', overflow: 'hidden', flex: 1 }}>
        <iframe
          title="Email preview"
          sandbox=""
          srcDoc={html}
          style={{
            width: device === 'mobile' ? 375 : '100%', maxWidth: '100%', height: 640, minHeight: 520, border: 0,
            background: '#fff', borderRadius: device === 'mobile' ? 14 : 9,
            boxShadow: device === 'mobile' ? '0 6px 24px rgba(0,0,0,0.18)' : 'none',
          }}
        />
      </div>
    </>
  );
}

function FleetPicker({ operators, selected, countOf, countLabel, onToggle }: {
  operators: CampaignSetup['operators']; selected: string[]; countOf: (o: CampaignSetup['operators'][number]) => number;
  countLabel: string; onToggle: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const shown = operators.filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase()));
  if (operators.length === 0) return <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>No fleets yet.</span>;
  return (
    <div>
      {operators.length > 12 && (
        <input style={{ ...inp, marginBottom: 10, maxWidth: 320 }} value={q} placeholder="Filter fleets…" onChange={(e) => setQ(e.target.value)} />
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxHeight: 180, overflowY: 'auto' }}>
        {shown.map((o) => (
          <button key={o.id} style={chip(selected.includes(o.id))} onClick={() => onToggle(o.id)} title={`${countOf(o)} ${countLabel}`}>
            {o.name} <span style={{ opacity: 0.7 }}>· {countOf(o)}</span>
          </button>
        ))}
      </div>
      {selected.length > 0 && (
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 8 }}>{selected.length} selected</div>
      )}
    </div>
  );
}

function Thumbnail({ html }: { html: string }) {
  return (
    <div style={{ height: 200, overflow: 'hidden', borderRadius: 8, background: '#f6f7f9', border: '1px solid var(--line-1)', position: 'relative' }}>
      <iframe
        title="Template thumbnail"
        sandbox=""
        loading="lazy"
        srcDoc={html}
        tabIndex={-1}
        aria-hidden="true"
        style={{ width: '200%', height: 400, border: 0, transform: 'scale(0.5)', transformOrigin: 'top left', pointerEvents: 'none' }}
      />
    </div>
  );
}

function TemplatesView({ saved, baseVars, setupMissing, onUseStarter, onUseSaved, onDelete }: {
  saved: SavedTemplate[]; baseVars: MergeVars; setupMissing: boolean;
  onUseStarter: (t: StarterTemplate) => void; onUseSaved: (t: SavedTemplate) => void; onDelete: (t: SavedTemplate) => void;
}) {
  const grid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(250px, 100%), 1fr))', gap: 14 };
  const tile = (key: string, thumb: string, title: string, sub: ReactNode, actions: ReactNode) => (
    <div key={key} style={{ ...card, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Thumbnail html={thumb} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3, lineHeight: 1.45 }}>{sub}</div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>{actions}</div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={sectionTitle}>Your templates</div>
        {setupMissing ? (
          <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Saving templates needs the email-campaigns migration.</div>
        ) : saved.length === 0 ? (
          <div style={{ ...card, fontSize: 13, color: 'var(--text-3)', textAlign: 'center', padding: '28px 18px' }}>
            No saved templates yet. Write an email in Compose and click <b>Save as template</b> — it&rsquo;ll appear here for next time.
          </div>
        ) : (
          <div style={grid}>
            {saved.map((t) =>
              tile(
                t.id,
                renderForPreview({ html: t.html, preheader: t.preheader, marketing: false }, baseVars),
                t.name,
                <>{t.subject || 'No subject'} · updated {new Date(t.updated_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</>,
                <>
                  <button style={{ ...btn, padding: '7px 12px', fontSize: 12.5 }} onClick={() => onUseSaved(t)}><Icon name="pencil" size={13} />Use</button>
                  <button style={{ ...ghostBtn, padding: '7px 10px' }} onClick={() => onDelete(t)} aria-label={`Delete ${t.name}`}><Icon name="trash" size={13} /></button>
                </>,
              ),
            )}
          </div>
        )}
      </div>

      <div>
        <div style={sectionTitle}>Starter templates</div>
        <div style={grid}>
          {STARTER_TEMPLATES.map((t) =>
            tile(
              t.id,
              renderForPreview({ html: t.html, preheader: t.preheader, marketing: false }, baseVars),
              t.name,
              t.description,
              <button style={{ ...btn, padding: '7px 12px', fontSize: 12.5 }} onClick={() => onUseStarter(t)}><Icon name="pencil" size={13} />Use</button>,
            ),
          )}
        </div>
      </div>
    </div>
  );
}

const STATUS: Record<CampaignSummary['status'] | 'interrupted', { label: string; color: string; bg: string }> = {
  sent: { label: 'Sent', color: 'var(--pos)', bg: 'var(--pos-soft)' },
  partial: { label: 'Partly sent', color: 'var(--warn)', bg: 'var(--warn-soft)' },
  failed: { label: 'Failed', color: 'var(--neg)', bg: 'rgba(240,100,100,0.12)' },
  sending: { label: 'Sending', color: 'var(--accent)', bg: 'var(--accent-soft)' },
  interrupted: { label: 'Interrupted', color: 'var(--warn)', bg: 'var(--warn-soft)' },
};

/** A 'sending' row that never finished (tab closed, server restarted). */
const statusOf = (c: CampaignSummary) =>
  c.status === 'sending' && Date.now() - new Date(c.created_at).getTime() > 30 * 60_000 ? 'interrupted' : c.status;

function StatusPill({ c }: { c: CampaignSummary }) {
  const s = STATUS[statusOf(c)];
  return <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 100, color: s.color, background: s.bg, whiteSpace: 'nowrap' }}>{s.label}</span>;
}

function SentView({ campaigns, onRefresh, onOpen }: {
  campaigns: CampaignSummary[] | null; onRefresh: () => void; onOpen: (id: string) => void;
}) {
  return (
    <div style={card}>
      <style>{'.ec-row { transition: background 120ms ease; } .ec-row:hover { background: var(--bg-2) !important; }'}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ ...sectionTitle, marginBottom: 0 }}>Sent campaigns</div>
        <button style={{ ...ghostBtn, padding: '6px 10px' }} onClick={onRefresh}><Icon name="refresh" size={13} />Refresh</button>
      </div>
      {campaigns === null ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-3)', padding: '18px 0' }}>Loading…</div>
      ) : campaigns.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-3)', padding: '18px 0' }}>Nothing sent yet.</div>
      ) : (
        <div>
          {campaigns.map((c, i) => (
            <button
              key={c.id}
              onClick={() => onOpen(c.id)}
              className="ec-row"
              style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 8px', background: 'transparent',
                border: 'none', borderBottom: i < campaigns.length - 1 ? '1px solid var(--line-1)' : 'none', textAlign: 'left',
                cursor: 'pointer', fontFamily: 'inherit', color: 'inherit', borderRadius: 0,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.subject}</span>
                  <StatusPill c={c} />
                  {!c.marketing && <span style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>Service notice</span>}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3 }}>
                  {c.target_summary ?? 'Audience'} · {c.sent_count.toLocaleString('en-GB')} sent
                  {c.failed_count > 0 && <> · <span style={{ color: 'var(--warn)' }}>{c.failed_count} failed</span></>}
                  {c.skipped_count > 0 && <> · {c.skipped_count} unsubscribed</>}
                </div>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-4)', whiteSpace: 'nowrap' }}>{fmtDate(c.created_at)}</div>
              <Icon name="chevron-right" size={14} style={{ color: 'var(--text-4)', flexShrink: 0 }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CampaignModal({ campaign: c, baseVars, onClose, onReuse }: {
  campaign: CampaignDetail; baseVars: MergeVars; onClose: () => void; onReuse: () => void;
}) {
  const html = useMemo(() => renderForPreview({ html: c.html, preheader: c.preheader ?? '', marketing: c.marketing }, baseVars), [c, baseVars]);
  return (
    <Modal onClose={onClose} wide>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 500, overflowWrap: 'anywhere' }}>{c.subject}</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>{fmtDate(c.created_at)} · {c.target_summary}</div>
        </div>
        <button style={{ ...ghostBtn, padding: 6 }} onClick={onClose} aria-label="Close"><Icon name="close" size={15} /></button>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--text-2)', marginBottom: 12, alignItems: 'center' }}>
        <StatusPill c={c} />
        <span><b>{c.sent_count}</b> accepted by Resend</span>
        {c.failed_count > 0 && <span style={{ color: 'var(--warn)' }}><b>{c.failed_count}</b> failed</span>}
        {c.skipped_count > 0 && <span><b>{c.skipped_count}</b> skipped (unsubscribed)</span>}
        <span>{c.marketing ? 'Newsletter / update' : 'Service notice'}</span>
        {c.from_name && <span>From “{c.from_name}”</span>}
        {c.reply_to && <span>Replies to {c.reply_to}</span>}
      </div>
      {c.errors && c.errors.length > 0 && (
        <div style={{ ...notice('warn'), marginBottom: 12, flexDirection: 'column', gap: 3 }}>
          {c.errors.slice(0, 5).map((e, i) => <div key={i} style={{ overflowWrap: 'anywhere' }}>{e}</div>)}
        </div>
      )}
      <iframe title="Sent email" sandbox="" srcDoc={html} style={{ width: '100%', height: '55vh', border: 0, borderRadius: 9, background: '#fff' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, color: 'var(--text-4)' }}>Delivery, opens and bounces are in your Resend dashboard (tagged campaign_id).</span>
        <button style={btn} onClick={onReuse}><Icon name="copy" size={14} />Reuse this email</button>
      </div>
    </Modal>
  );
}

function Modal({ children, onClose, wide = false }: { children: ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div style={{ width: '100%', maxWidth: wide ? 860 : 500, maxHeight: '92vh', overflowY: 'auto', background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 14, padding: 20, boxShadow: '0 20px 60px rgba(0,0,0,0.45)', color: 'var(--text-1)' }}>
        {children}
      </div>
    </div>
  );
}
