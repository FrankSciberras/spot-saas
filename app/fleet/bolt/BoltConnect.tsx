'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { connectBoltAction, type BoltCompanyChoice } from '@/lib/actions/bolt';
import FleetIcon from '@/components/fleet/FleetIcon';
import styles from './bolt.module.css';

/**
 * The "connect your Bolt account" card: where to find the key in the Bolt Fleet
 * Portal, then the two fields. Also used to RE-connect when Bolt has refused
 * the stored key (`reconnect`), in which case the imported data is kept.
 */
export default function BoltConnect({ reconnect = false }: { reconnect?: boolean }) {
  const router = useRouter();
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [companies, setCompanies] = useState<BoltCompanyChoice[] | null>(null);
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    startTransition(async () => {
      const res = await connectBoltAction({ clientId, clientSecret, companyId });
      if (res.ok) {
        // The secret has done its job — don't leave it sitting in the page.
        setClientSecret('');
        router.refresh();
        return;
      }
      if ('chooseCompany' in res) {
        setCompanies(res.chooseCompany);
        setCompanyId(res.chooseCompany[0]?.company_id ?? null);
        return;
      }
      setError(res.error);
    });
  };

  return (
    <div className={styles.connectWrap}>
      <form className={styles.connectCard} onSubmit={submit}>
        <div className={styles.connectHead}>
          <div className={styles.boltLogo} aria-hidden>b</div>
          <div>
            <h2 className={styles.connectTitle}>{reconnect ? 'Reconnect your Bolt account' : 'Connect your Bolt account'}</h2>
            <p className={styles.connectLead}>
              {reconnect
                ? 'Paste a working API key and Rovora carries on where it left off — nothing already imported is lost.'
                : 'Paste an API key from your Bolt Fleet Portal and Rovora imports your drivers, vehicles and rides, then keeps them up to date every hour.'}
            </p>
          </div>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <label className={styles.label} htmlFor="bolt-client-id">Client ID</label>
        <input
          id="bolt-client-id"
          className={styles.input}
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="From Bolt → Settings → Fleet API keys (v2)"
          disabled={pending}
        />

        <label className={styles.label} htmlFor="bolt-client-secret">Client secret</label>
        <input
          id="bolt-client-secret"
          className={styles.input}
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="Shown once when you create the key"
          disabled={pending}
        />
        <p className={styles.hint}>
          <FleetIcon name="lock" size={12} stroke={1.8} /> Stored encrypted and only ever used to read your
          data from Bolt. Rovora can&rsquo;t change anything in your Bolt account.
        </p>

        {companies && (
          <>
            <label className={styles.label} htmlFor="bolt-company">Which Bolt company?</label>
            <select
              id="bolt-company"
              className={styles.input}
              value={companyId ?? ''}
              onChange={(e) => setCompanyId(Number(e.target.value))}
              disabled={pending}
            >
              {companies.map((c) => (
                <option key={c.company_id} value={c.company_id}>
                  {c.name}{c.city ? ` — ${c.city}` : ''}
                </option>
              ))}
            </select>
            <p className={styles.hint}>This key can see more than one Bolt company. Pick the one for this fleet.</p>
          </>
        )}

        <div className={styles.formActions}>
          <button className={styles.primary} type="submit" disabled={pending || !clientId.trim() || !clientSecret.trim()}>
            {pending ? 'Connecting — importing your rides…' : reconnect ? 'Reconnect Bolt' : 'Connect Bolt'}
          </button>
          {pending && <span className={styles.pendingNote}>This can take up to a minute the first time.</span>}
        </div>
      </form>

      <aside className={styles.steps}>
        <h3 className={styles.stepsTitle}>Where do I find the key?</h3>
        <ol className={styles.stepList}>
          <li>
            Sign in to the{' '}
            <a href="https://fleets.bolt.eu" target="_blank" rel="noopener noreferrer">Bolt Fleet Portal</a>.
          </li>
          <li>Open <strong>Settings</strong> → <strong>Fleet API keys (v2)</strong>.</li>
          <li>Press <strong>Create API key</strong>. Leave Companies and Endpoints on <strong>All</strong>.</li>
          <li>Copy the <strong>Client ID</strong> and <strong>Client secret</strong> and paste them here.</li>
        </ol>
        <p className={styles.stepsNote}>
          The secret is only shown once by Bolt. If you&rsquo;ve lost it, just create a new key — it takes a few
          seconds.
        </p>

        <h3 className={styles.stepsTitle}>What you get</h3>
        <ul className={styles.benefits}>
          <li>Rides, fares and tips per driver for any period</li>
          <li>Acceptance rate and earnings per hour on the job</li>
          <li>Who is online on Bolt right now</li>
          <li>Drivers and cars Bolt has suspended, and why</li>
        </ul>
      </aside>
    </div>
  );
}
