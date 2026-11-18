'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { connectGpsAction } from '@/lib/actions/gps';
import FleetIcon from '@/components/fleet/FleetIcon';
import type { GpsCredentialField } from '@/lib/gps/types';
import styles from './gps.module.css';
import IntegrationMark, { integrationTileStyle } from '@/components/shared/IntegrationMark';

export interface ConnectableProvider {
  key: string;
  name: string;
  mark: string;
  bg: string;
  fg: string;
  desc: string;
  fields: GpsCredentialField[];
  steps: string[];
}

/**
 * Pick a GPS platform → its fields → Connect. Also used to RECONNECT an
 * account whose login was refused (`reconnect`), which keeps its trackers and
 * their vehicle links.
 */
export default function GpsConnect({
  providers,
  initialProvider,
  reconnect,
  onCancel,
}: {
  providers: ConnectableProvider[];
  initialProvider?: string | null;
  reconnect?: { connectionId: string; provider: string } | null;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [providerKey, setProviderKey] = useState<string | null>(
    reconnect?.provider ?? (providers.some((p) => p.key === initialProvider) ? initialProvider! : null),
  );
  const provider = useMemo(() => providers.find((p) => p.key === providerKey) ?? null, [providers, providerKey]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Back from "Sign in with Wialon": Wialon appends access_token (or
  // svc_error) to our address. Read it from the raw URL — Wialon may add a
  // second "?" — fill the form, then strip the token from the address bar.
  useEffect(() => {
    if (reconnect) return;
    const href = window.location.href;
    const token = /[?&#]access_token=([^&#?]+)/.exec(href)?.[1];
    const failed = /[?&#]svc_error=([^&#?]+)/.exec(href)?.[1];
    if (!token && !failed) return;
    const region = /[?&#]region=([a-z]+)/.exec(href)?.[1];
    const server = /[?&#]server=([^&#?]+)/.exec(href)?.[1];
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the URL only works after mount
    setProviderKey('wialon');
    if (token) {
      setValues({
        token: decodeURIComponent(token),
        ...(region ? { region } : {}),
        ...(server ? { server_url: decodeURIComponent(server) } : {}),
      });
      setDone('Signed in to Wialon — press Connect Wialon to finish.');
    } else if (failed && failed !== '0') {
      setError('Wialon sign-in was cancelled or didn’t work. Try again.');
    }
    window.history.replaceState(null, '', '/fleet/gps?provider=wialon');
  }, [reconnect]);

  /** Opens Wialon's own sign-in page; it sends the user back with a token. */
  const signInWithWialon = () => {
    const region = values.region ?? 'hosting';
    const loginHost: Record<string, string> = {
      hosting: 'https://hosting.wialon.com',
      eu: 'https://hosting.wialon.eu',
      us: 'https://hosting.wialon.us',
      org: 'https://hosting.wialon.org',
    };
    let host = loginHost[region];
    if (region === 'local') {
      const raw = (values.server_url ?? '').trim();
      if (!raw) {
        setError('Enter your Wialon Local address first.');
        return;
      }
      try {
        host = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).origin;
      } catch {
        setError('That Wialon Local address doesn’t look right.');
        return;
      }
    }
    const back = new URL('/fleet/gps', window.location.origin);
    back.searchParams.set('provider', 'wialon');
    back.searchParams.set('region', region);
    if (region === 'local') back.searchParams.set('server', values.server_url ?? '');
    const url = new URL('/login.html', host ?? loginHost.hosting);
    url.searchParams.set('client_id', 'Rovora');
    url.searchParams.set('access_type', '-1');
    url.searchParams.set('activation_time', '0');
    url.searchParams.set('duration', '0');
    url.searchParams.set('flags', '0x1');
    url.searchParams.set('redirect_uri', back.toString());
    window.location.href = url.toString();
  };

  const pick = (key: string) => {
    setProviderKey(key);
    setValues({});
    setError('');
    setDone(null);
  };

  const valueOf = (f: GpsCredentialField) => values[f.key] ?? f.defaultValue ?? '';

  // Wialon: the server field only matters for Wialon Local.
  const visible = (f: GpsCredentialField) =>
    !(provider?.key === 'wialon' && f.key === 'server_url' && (values.region ?? 'hosting') !== 'local');

  const canSubmit =
    !!provider && provider.fields.every((f) => f.optional || f.options || !visible(f) || valueOf(f).trim() !== '');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!provider) return;
    setError('');
    const payload: Record<string, string> = {};
    for (const f of provider.fields) if (visible(f)) payload[f.key] = valueOf(f);
    startTransition(async () => {
      const res = await connectGpsAction({ provider: provider.key, values: payload, connectionId: reconnect?.connectionId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // The secrets have done their job — don't leave them in the page.
      setValues({});
      setDone(
        res.warning ??
          `Connected — ${res.devices} tracker${res.devices === 1 ? '' : 's'} found, ${res.linked} matched to a vehicle automatically.`,
      );
      router.refresh();
    });
  };

  return (
    <div>
      {!reconnect && (
        <>
          <div className={styles.providerGrid}>
            {providers.map((p) => (
              <button
                key={p.key}
                type="button"
                className={styles.providerCard}
                data-active={p.key === providerKey}
                onClick={() => pick(p.key)}
                disabled={pending}
              >
                <span
                  className={styles.providerLogo}
                  style={integrationTileStyle(p, 36)}
                  aria-hidden
                >
                  <IntegrationMark it={p} tile={36} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span className={styles.providerName}>{p.name}</span>
                  <span className={styles.providerDesc}>{p.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {provider && (
        <div className={styles.connectWrap}>
          <form className={styles.connectCard} onSubmit={submit}>
            <h2 className={styles.connectTitle}>
              {reconnect ? `Reconnect ${provider.name}` : `Connect ${provider.name}`}
            </h2>
            <p className={styles.connectLead}>
              {reconnect
                ? 'Enter working details and Rovora carries on where it left off — trackers and vehicle links are kept.'
                : 'Rovora reads the position of every tracker on this account about once a minute and puts each one in the matching vehicle.'}
            </p>

            {error && <div className={styles.error}>{error}</div>}
            {done && <div className={styles.noteOk} style={{ margin: '8px 0' }}>{done}</div>}

            {provider.fields.filter(visible).map((f) => (
              <div key={f.key}>
                {provider.key === 'wialon' && f.key === 'token' && (
                  <div style={{ marginTop: 16 }}>
                    <button className={styles.primary} type="button" onClick={signInWithWialon} disabled={pending}>
                      Sign in with Wialon
                    </button>
                    <p className={styles.hint}>Opens Wialon&rsquo;s own sign-in page and brings you back here.</p>
                  </div>
                )}
                <label className={styles.label} htmlFor={`gps-${f.key}`}>
                  {f.label} {f.optional && <span className={styles.optional}>(optional)</span>}
                </label>
                {f.options ? (
                  <select
                    id={`gps-${f.key}`}
                    className={styles.input}
                    value={valueOf(f)}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    disabled={pending}
                  >
                    {f.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`gps-${f.key}`}
                    className={styles.input}
                    type={f.secret ? 'password' : 'text'}
                    value={valueOf(f)}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    autoComplete="off"
                    spellCheck={false}
                    disabled={pending}
                  />
                )}
                {f.hint && <p className={styles.hint}>{f.hint}</p>}
              </div>
            ))}

            <p className={styles.hint} style={{ marginTop: 14 }}>
              <FleetIcon name="lock" size={12} stroke={1.8} /> Stored encrypted and only used to READ positions.
              Rovora can&rsquo;t change anything in your {provider.name} account.
            </p>

            <div className={styles.formActions}>
              <button className={styles.primary} type="submit" disabled={pending || !canSubmit}>
                {pending ? 'Checking and importing trackers…' : reconnect ? `Reconnect ${provider.name}` : `Connect ${provider.name}`}
              </button>
              {onCancel && (
                <button className={styles.ghostBtn} type="button" onClick={onCancel} disabled={pending}>
                  Cancel
                </button>
              )}
            </div>
          </form>

          <aside className={styles.steps}>
            <h3 className={styles.stepsTitle}>Where do I find this?</h3>
            <ol className={styles.stepList}>
              {provider.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            <h3 className={styles.stepsTitle}>What you get</h3>
            <ul className={styles.benefits}>
              <li>Every car on the Live Map — even when the driver&rsquo;s phone is off</li>
              <li>Tick Drivers, Cars or both on the map</li>
              <li>Speed, ignition and today&rsquo;s route per vehicle</li>
              <li>Trackers matched to your cars by number plate</li>
            </ul>
          </aside>
        </div>
      )}
    </div>
  );
}
