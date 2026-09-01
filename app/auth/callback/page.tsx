'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { rovoraFontVars } from '@/lib/rovoraFonts';
import { safeInternalPath } from '@/lib/utils/safeRedirect';

/**
 * Auth callback — password recovery, fleet invites, magic links, OAuth.
 *
 * This has to be a CLIENT page rather than a route handler. Supabase's /verify
 * endpoint hands the session back in the URL *fragment*
 * (`#access_token=…&refresh_token=…`), and a fragment is never transmitted to
 * the server. The route handler that used to live here only looked for
 * `?code=`, never found it, and bounced everyone to `/` with their tokens
 * stranded in the address bar — so no reset link ever reached the set-password
 * screen. `?code=` (PKCE) is still handled, for whenever a flow sends one.
 *
 * Shares the auth shell with /login so the hop between them is seamless.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    // Strict Mode double-invokes effects; consuming a single-use code twice
    // would fail the second time and show a bogus error.
    if (ran.current) return;
    ran.current = true;

    const finish = async () => {
      const supabase = createClient();
      const search = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));

      const hashError = hash.get('error_description') || hash.get('error');
      const searchError = search.get('error_description') || search.get('error');
      if (hashError || searchError) {
        setError(hashError || searchError);
        return;
      }

      const accessToken = hash.get('access_token');
      const refreshToken = hash.get('refresh_token');
      const code = search.get('code');

      if (accessToken && refreshToken) {
        const { error: setErr } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (setErr) {
          setError(setErr.message);
          return;
        }
      } else if (code) {
        const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeErr) {
          setError(exchangeErr.message);
          return;
        }
      } else {
        setError('This link is missing its sign-in details. Please request a new one.');
        return;
      }

      // Recovery and invites both need a password set — an invited user has
      // none yet. `type` rides in the query on our own links and in the hash on
      // Supabase's, so check both.
      const type = search.get('type') || hash.get('type');
      // `next` must be an internal path — never an absolute/protocol-relative
      // URL, or a tampered link could hand the fresh session straight to a
      // phishing page.
      const next = safeInternalPath(search.get('next'), '/');
      const destination =
        type === 'recovery' || type === 'invite' ? '/auth/reset-password' : next;

      // replace(), not push() — the URL still holds the tokens, and it should
      // not survive in history or the back button.
      router.replace(destination);
    };

    finish().catch((e) => setError(e instanceof Error ? e.message : 'Something went wrong.'));
  }, [router]);

  return (
    <div className={`rovora-site ${rovoraFontVars}`} data-theme="light">
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="auth-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <span className="logo"><img src="/logo-full.png" alt="Rovora" /></span>
          </div>

          <div className="auth-head">
            <h1>{error ? 'This link didn’t work' : 'Signing you in'}</h1>
            <p>{error ?? 'One moment while we verify your link…'}</p>
          </div>

          {error && (
            <button type="button" className="btn btn-primary btn-lg" onClick={() => router.push('/login')}>
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
