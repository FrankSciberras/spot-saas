'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { acceptInviteAction, declineInviteAction } from '@/lib/actions/invites';
import { rovoraFontVars } from '@/lib/rovoraFonts';

interface Invite {
  id: string;
  organizationName: string;
  role: string;
  createdAt: string;
}

const ROLE_LABEL: Record<string, string> = { driver: 'a driver', staff: 'a staff member', admin: 'an admin' };

export default function InvitesClient({
  invites: initial,
  email,
  hasFleet,
}: {
  invites: Invite[];
  email: string;
  hasFleet: boolean;
}) {
  const [invites, setInvites] = useState(initial);
  const [busy, setBusy] = useState<{ id: string; kind: 'accept' | 'decline' } | null>(null);
  const [error, setError] = useState('');
  const [declinedName, setDeclinedName] = useState('');

  const accept = async (inv: Invite) => {
    setError('');
    setBusy({ id: inv.id, kind: 'accept' });
    const res = await acceptInviteAction(inv.id);
    if (!res.ok) {
      setError(res.error);
      setBusy(null);
      return;
    }
    // Hard navigation: the active fleet cookie just changed, so the server
    // should route them into the fleet they joined.
    window.location.assign('/dashboard');
  };

  const decline = async (inv: Invite) => {
    setError('');
    setBusy({ id: inv.id, kind: 'decline' });
    const res = await declineInviteAction(inv.id);
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDeclinedName(inv.organizationName);
    setInvites((list) => list.filter((i) => i.id !== inv.id));
  };

  const signOut = async () => {
    await createClient().auth.signOut();
    window.location.assign('/login?redirectTo=/invites');
  };

  return (
    <div className={`rovora-site ${rovoraFontVars}`} data-theme="light">
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="auth-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <span className="logo"><img src="/logo-full.png" alt="Rovora" /></span>
          </div>

          <div className="auth-head">
            <h1>{invites.length ? 'You’ve been invited' : 'No invitations'}</h1>
            <p>
              {invites.length
                ? 'Accepting adds the fleet to your account. Each fleet only sees the work you do for them.'
                : 'There’s nothing waiting for you right now.'}
            </p>
          </div>

          {error && <div className="auth-alert err">{error}</div>}
          {declinedName && !error && (
            <div className="auth-alert ok">Declined — {declinedName} gets no access to your account.</div>
          )}

          {invites.map((inv) => (
            <div key={inv.id} className="invite-item">
              <p className="invite-title">
                <strong>{inv.organizationName}</strong> wants to add you as {ROLE_LABEL[inv.role] ?? 'a member'}.
              </p>
              <p className="auth-note">
                Invited {new Date(inv.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.
                {hasFleet && ' You’ll be able to switch between your fleets from the menu.'}
              </p>
              <div className="invite-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-lg"
                  onClick={() => decline(inv)}
                  disabled={!!busy}
                >
                  {busy?.id === inv.id && busy.kind === 'decline' ? 'Declining…' : 'Decline'}
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-lg"
                  onClick={() => accept(inv)}
                  disabled={!!busy}
                >
                  {busy?.id === inv.id && busy.kind === 'accept' ? 'Joining…' : 'Accept'}
                </button>
              </div>
            </div>
          ))}

          {!invites.length && (
            <Link className="btn btn-primary btn-lg" href={hasFleet ? '/dashboard' : '/onboarding'}>
              {hasFleet ? 'Go to my dashboard' : 'Set up my own fleet'}
            </Link>
          )}

          {invites.length > 0 && (
            <p className="auth-foot">
              <Link className="auth-link" href={hasFleet ? '/dashboard' : '/onboarding'}>
                {hasFleet ? 'Decide later — go to my dashboard' : 'Decide later — set up my own fleet'}
              </Link>
            </p>
          )}

          <p className="auth-foot" style={{ fontSize: 13 }}>
            Signed in as {email}.{' '}
            <button type="button" className="auth-link" onClick={signOut}>
              Not you?
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
