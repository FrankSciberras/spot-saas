'use client';

import { useState, useTransition } from 'react';
import { runRulesNowAction } from '@/lib/actions/notification-run';

/**
 * Manually evaluate this fleet's active notification rules (document expiry +
 * shift reminders) right now — handy for testing rule config. The scheduled
 * sweep does the same across all fleets.
 */
export default function RunRulesButton() {
  const [msg, setMsg] = useState('');
  const [isPending, startTransition] = useTransition();

  const run = () => {
    setMsg('');
    startTransition(async () => {
      const r = await runRulesNowAction();
      if (r.error) { setMsg(r.error); return; }
      const rep = r.report!;
      setMsg(
        rep.created === 0 && rep.skippedDuplicates === 0
          ? 'No alerts due right now.'
          : `Sent ${rep.created} alert${rep.created === 1 ? '' : 's'}` +
              (rep.skippedDuplicates ? ` · ${rep.skippedDuplicates} already sent` : '') +
              (rep.push ? ` · ${rep.push} push` : '') +
              (rep.email ? ` · ${rep.email} email` : '')
      );
    });
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <button
        type="button"
        onClick={run}
        disabled={isPending}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px',
          background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 9,
          color: 'var(--text-1)', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer',
          opacity: isPending ? 0.6 : 1,
        }}
      >
        {isPending ? 'Checking…' : 'Run checks now'}
      </button>
      {msg && <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{msg}</span>}
    </div>
  );
}
