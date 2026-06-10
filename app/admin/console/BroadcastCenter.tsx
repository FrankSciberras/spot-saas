'use client';

// =============================================================================
// BROADCAST CENTER (platform-admin) — send notifications to operators / drivers.
// =============================================================================
// Compose a message, pick a flexible audience (all / specific / by plan), choose
// channels (in-app / push / email) and send. Recipients receive it tagged as
// "Rovora HQ". Recent sends are listed for reference.
// =============================================================================

import { useCallback, useEffect, useState, useTransition, type CSSProperties } from 'react';
import FleetIcon from '@/components/fleet/FleetIcon';
import {
  sendPlatformBroadcastAction,
  getBroadcastAudienceAction,
  getOperatorDriversAction,
  getPlatformBroadcastsAction,
  type BroadcastChannel,
  type BroadcastAudience,
  type AudienceOperator,
  type PlatformBroadcastRow,
} from '@/lib/actions/platform-notifications';

const Icon = FleetIcon;

const inp: CSSProperties = {
  padding: '9px 11px', borderRadius: 8, border: '1px solid var(--line-2)', background: 'var(--bg-2)',
  color: 'var(--text-1)', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%',
};
const lbl: CSSProperties = { fontSize: 11.5, color: 'var(--text-3)', marginBottom: 6, display: 'block' };
const card: CSSProperties = { background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--radius-lg)', padding: 18 };
const sectionTitle: CSSProperties = { fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 10 };
const btn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', background: 'var(--accent)',
  border: '1px solid var(--accent)', color: '#fff', borderRadius: 9, fontSize: 13.5, fontWeight: 500, cursor: 'pointer',
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

type AudType = 'operators' | 'drivers';

export default function BroadcastCenter() {
  const [operators, setOperators] = useState<AudienceOperator[]>([]);
  const [plans, setPlans] = useState<{ key: string; name: string }[]>([]);
  const [history, setHistory] = useState<PlatformBroadcastRow[]>([]);

  const [audType, setAudType] = useState<AudType>('operators');
  const [opScope, setOpScope] = useState<'all' | 'operators' | 'plan'>('all');
  const [drvScope, setDrvScope] = useState<'all' | 'operators' | 'drivers'>('all');
  const [selOps, setSelOps] = useState<string[]>([]);
  const [selPlans, setSelPlans] = useState<string[]>([]);
  const [selDrivers, setSelDrivers] = useState<{ id: string; label: string }[]>([]);

  // Driver picker (for "specific drivers").
  const [pickOrg, setPickOrg] = useState('');
  const [pickList, setPickList] = useState<{ id: string; full_name: string; status: string }[]>([]);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [actionUrl, setActionUrl] = useState('');
  const [channels, setChannels] = useState<Record<BroadcastChannel, boolean>>({ app: true, push: true, email: false });

  const [error, setError] = useState('');
  const [done, setDone] = useState<{ count: number } | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadHistory = useCallback(async () => {
    const h = await getPlatformBroadcastsAction();
    setHistory(h.broadcasts);
  }, []);

  useEffect(() => {
    getBroadcastAudienceAction().then((a) => { setOperators(a.operators); setPlans(a.plans); });
    loadHistory();
  }, [loadHistory]);

  const toggle = (arr: string[], id: string) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  const loadDriversFor = (orgId: string) => {
    setPickOrg(orgId);
    setPickList([]);
    if (!orgId) return;
    getOperatorDriversAction(orgId).then((r) => setPickList(r.drivers));
  };

  // Rough recipient estimate for the helper line.
  const estimate = (() => {
    if (audType === 'operators') {
      if (opScope === 'all') return `${operators.length} operators`;
      if (opScope === 'operators') return `${selOps.length} operator${selOps.length === 1 ? '' : 's'}`;
      const n = operators.filter((o) => selPlans.includes(o.plan)).length;
      return `${n} operator${n === 1 ? '' : 's'} on ${selPlans.length} plan${selPlans.length === 1 ? '' : 's'}`;
    }
    if (drvScope === 'all') return `${operators.reduce((s, o) => s + o.driverCount, 0)} drivers`;
    if (drvScope === 'operators') {
      const n = operators.filter((o) => selOps.includes(o.id)).reduce((s, o) => s + o.driverCount, 0);
      return `${n} driver${n === 1 ? '' : 's'} across ${selOps.length} operator${selOps.length === 1 ? '' : 's'}`;
    }
    return `${selDrivers.length} driver${selDrivers.length === 1 ? '' : 's'}`;
  })();

  const send = () => {
    setError(''); setDone(null);
    const chs = (Object.keys(channels) as BroadcastChannel[]).filter((c) => channels[c]);
    if (!title.trim() || !body.trim()) { setError('Title and message are required.'); return; }
    if (chs.length === 0) { setError('Pick at least one channel.'); return; }

    let audience: BroadcastAudience;
    if (audType === 'operators') {
      audience = { type: 'operators', scope: opScope, operatorIds: opScope === 'operators' ? selOps : undefined, planKeys: opScope === 'plan' ? selPlans : undefined };
    } else {
      audience = { type: 'drivers', scope: drvScope, operatorIds: drvScope === 'operators' ? selOps : undefined, driverIds: drvScope === 'drivers' ? selDrivers.map((d) => d.id) : undefined };
    }

    startTransition(async () => {
      const r = await sendPlatformBroadcastAction({ title, body, actionUrl: actionUrl || undefined, channels: chs, audience });
      if (r.error) { setError(r.error); return; }
      setDone({ count: r.recipientCount ?? 0 });
      setTitle(''); setBody(''); setActionUrl('');
      loadHistory();
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={card}>
        {/* Audience */}
        <div style={sectionTitle}>Audience</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button style={seg(audType === 'operators')} onClick={() => setAudType('operators')}>Operators (fleet admins)</button>
          <button style={seg(audType === 'drivers')} onClick={() => setAudType('drivers')}>Drivers</button>
        </div>

        {audType === 'operators' ? (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <button style={seg(opScope === 'all')} onClick={() => setOpScope('all')}>All operators</button>
              <button style={seg(opScope === 'operators')} onClick={() => setOpScope('operators')}>Specific operators</button>
              <button style={seg(opScope === 'plan')} onClick={() => setOpScope('plan')}>By plan</button>
            </div>
            {opScope === 'operators' && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                {operators.map((o) => (
                  <button key={o.id} style={chip(selOps.includes(o.id))} onClick={() => setSelOps((a) => toggle(a, o.id))}>{o.name}</button>
                ))}
                {operators.length === 0 && <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>No operators yet.</span>}
              </div>
            )}
            {opScope === 'plan' && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                {plans.map((p) => (
                  <button key={p.key} style={chip(selPlans.includes(p.key))} onClick={() => setSelPlans((a) => toggle(a, p.key))}>{p.name}</button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <button style={seg(drvScope === 'all')} onClick={() => setDrvScope('all')}>All drivers</button>
              <button style={seg(drvScope === 'operators')} onClick={() => setDrvScope('operators')}>By operator</button>
              <button style={seg(drvScope === 'drivers')} onClick={() => setDrvScope('drivers')}>Specific drivers</button>
            </div>
            {drvScope === 'operators' && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                {operators.map((o) => (
                  <button key={o.id} style={chip(selOps.includes(o.id))} onClick={() => setSelOps((a) => toggle(a, o.id))}>{o.name} <span style={{ opacity: 0.7 }}>· {o.driverCount}</span></button>
                ))}
              </div>
            )}
            {drvScope === 'drivers' && (
              <div>
                <select style={{ ...inp, cursor: 'pointer', marginBottom: 10 }} value={pickOrg} onChange={(e) => loadDriversFor(e.target.value)}>
                  <option value="">Choose an operator to list its drivers…</option>
                  {operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                {pickOrg && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    {pickList.map((d) => {
                      const on = selDrivers.some((x) => x.id === d.id);
                      return (
                        <button
                          key={d.id}
                          style={chip(on)}
                          onClick={() => setSelDrivers((a) => (on ? a.filter((x) => x.id !== d.id) : [...a, { id: d.id, label: d.full_name }]))}
                        >{d.full_name}</button>
                      );
                    })}
                    {pickList.length === 0 && <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>No drivers in this operator.</span>}
                  </div>
                )}
                {selDrivers.length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    Selected: {selDrivers.map((d) => d.label).join(', ')}{' '}
                    <button style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12 }} onClick={() => setSelDrivers([])}>clear</button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <div style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 8 }}>≈ {estimate}</div>
      </div>

      {/* Message */}
      <div style={card}>
        <div style={sectionTitle}>Message</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={lbl}>Title</label>
            <input style={inp} value={title} placeholder="e.g. Scheduled maintenance Sunday" disabled={isPending} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Message</label>
            <textarea style={{ ...inp, minHeight: 96, resize: 'vertical' }} value={body} placeholder="What do you want to tell them?" disabled={isPending} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Link (optional)</label>
            <input style={inp} value={actionUrl} placeholder="/fleet/billing or https://…" disabled={isPending} onChange={(e) => setActionUrl(e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Channels</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['app', 'push', 'email'] as BroadcastChannel[]).map((c) => (
                <button key={c} style={chip(channels[c])} onClick={() => setChannels((s) => ({ ...s, [c]: !s[c] }))}>
                  {c === 'app' ? 'In-app' : c === 'push' ? 'Push' : 'Email'}
                </button>
              ))}
            </div>
          </div>

          {error && <div style={{ fontSize: 12.5, color: 'var(--neg)' }}>{error}</div>}
          {done && <div style={{ fontSize: 12.5, color: 'var(--pos)' }}>Sent to {done.count} recipient{done.count === 1 ? '' : 's'}.</div>}

          <div>
            <button style={{ ...btn, opacity: isPending ? 0.6 : 1 }} disabled={isPending} onClick={send}>
              <Icon name="bell" size={14} />{isPending ? 'Sending…' : 'Send notification'}
            </button>
          </div>
        </div>
      </div>

      {/* History */}
      <div style={card}>
        <div style={sectionTitle}>Recent broadcasts</div>
        {history.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>No broadcasts sent yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {history.map((h, i) => (
              <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: i < history.length - 1 ? '1px solid var(--line-1)' : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.title}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                    {h.target_summary} · {h.channels.join(', ')} · {h.recipient_count} recipient{h.recipient_count === 1 ? '' : 's'}
                  </div>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-4)', whiteSpace: 'nowrap' }}>
                  {new Date(h.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
