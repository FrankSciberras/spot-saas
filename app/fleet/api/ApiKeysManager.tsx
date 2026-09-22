'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import FleetIcon from '@/components/fleet/FleetIcon';
import { SCOPE_GROUPS, type ApiScope } from '@/lib/api/scopes';
import {
  createApiKeyAction,
  deleteApiKeyAction,
  revokeApiKeyAction,
} from '@/lib/actions/api-keys';
import styles from './api-keys.module.css';

export interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[] | null;
  allowed_ips: string[] | null;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  last_used_ip: string | null;
  request_count: number;
  created_at: string;
}

export interface LogRow {
  id: number;
  method: string;
  path: string;
  status: number;
  duration_ms: number | null;
  error_code: string | null;
  created_at: string;
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

/** Expiry presets. "Never" is offered but not the default — keys should rotate. */
const EXPIRY_OPTIONS = [
  { label: '90 days', days: 90 },
  { label: '1 year', days: 365 },
  { label: 'Never', days: 0 },
];

export default function ApiKeysManager({
  keys,
  logs,
  maxKeys,
  perMinute,
  perDay,
  planName,
}: {
  keys: ApiKeyRow[];
  logs: LogRow[];
  maxKeys: number;
  perMinute: number | null;
  perDay: number | null;
  planName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<Set<ApiScope>>(new Set());
  const [expiryDays, setExpiryDays] = useState(365);
  const [ips, setIps] = useState('');
  const [error, setError] = useState<string | null>(null);

  // The one and only moment the secret exists outside the caller's database.
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const live = keys.filter((k) => !k.revoked_at);
  const atLimit = maxKeys > 0 && live.length >= maxKeys;

  const toggleScope = (scope: ApiScope) => {
    setScopes((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  };

  const submit = () => {
    setError(null);
    const expiresAt =
      expiryDays > 0 ? new Date(Date.now() + expiryDays * 86_400_000).toISOString() : null;
    const allowedIps = ips
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    startTransition(async () => {
      const res = await createApiKeyAction({
        name,
        scopes: Array.from(scopes),
        allowedIps,
        expiresAt,
      });
      if (res.error || !res.data) {
        setError(res.error ?? 'Could not create the key.');
        return;
      }
      setNewSecret(res.data.secret);
      setShowForm(false);
      setName('');
      setScopes(new Set());
      setIps('');
      router.refresh();
    });
  };

  const revoke = (key: ApiKeyRow) => {
    if (!confirm(`Revoke "${key.name}"? Anything using this key stops working immediately.`)) return;
    startTransition(async () => {
      const res = await revokeApiKeyAction(key.id);
      if (res.error) setError(res.error);
      router.refresh();
    });
  };

  const remove = (key: ApiKeyRow) => {
    startTransition(async () => {
      const res = await deleteApiKeyAction(key.id);
      if (res.error) setError(res.error);
      router.refresh();
    });
  };

  const copySecret = async () => {
    if (!newSecret) return;
    try {
      await navigator.clipboard.writeText(newSecret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy automatically — select the key and copy it manually.');
    }
  };

  return (
    <>
      {/* ── Plan allowance ── */}
      <div className={styles.limitsBar}>
        <div className={styles.limit}>
          <span className={styles.limitLabel}>Plan</span>
          <span className={styles.limitValue}>{planName}</span>
        </div>
        <div className={styles.limit}>
          <span className={styles.limitLabel}>Active keys</span>
          <span className={styles.limitValue}>
            {live.length}
            {maxKeys > 0 ? ` / ${maxKeys}` : ''}
          </span>
        </div>
        <div className={styles.limit}>
          <span className={styles.limitLabel}>Requests / minute</span>
          <span className={styles.limitValue}>{perMinute === null ? 'Unlimited' : perMinute}</span>
        </div>
        <div className={styles.limit}>
          <span className={styles.limitLabel}>Requests / day</span>
          <span className={styles.limitValue}>
            {perDay === null ? 'Unlimited' : perDay.toLocaleString()}
          </span>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {/* ── The one-time secret ── */}
      {newSecret && (
        <div className={styles.secretPanel}>
          <div className={styles.secretHead}>
            <FleetIcon name="doc" size={16} stroke={1.7} />
            <strong>Copy your key now — this is the only time it is shown.</strong>
          </div>
          <p className={styles.secretBody}>
            We store only a one-way hash of it, so we genuinely cannot show it to you again. If you
            lose it, revoke this key and create another.
          </p>
          <div className={styles.secretRow}>
            <code className={styles.secretValue}>{newSecret}</code>
            <button className={styles.copyBtn} type="button" onClick={copySecret}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button className={styles.secretDone} type="button" onClick={() => setNewSecret(null)}>
            I&rsquo;ve saved it
          </button>
        </div>
      )}

      {/* ── Create ── */}
      {!showForm ? (
        <button
          className={styles.newBtn}
          type="button"
          disabled={atLimit || pending}
          onClick={() => setShowForm(true)}
        >
          <FleetIcon name="plug" size={15} stroke={1.8} />
          {atLimit ? `Key limit reached (${maxKeys})` : 'Create an API key'}
        </button>
      ) : (
        <div className={styles.form}>
          <h2 className={styles.formTitle}>New API key</h2>

          <label className={styles.label} htmlFor="key-name">
            Name
          </label>
          <input
            id="key-name"
            className={styles.input}
            value={name}
            maxLength={80}
            placeholder="e.g. Payroll sync"
            onChange={(e) => setName(e.target.value)}
          />
          <p className={styles.hint}>So you can tell your keys apart later.</p>

          <div className={styles.label}>Permissions</div>
          <p className={styles.hint}>
            Give a key only what it needs. A read-only key is far less dangerous if it ever leaks.
          </p>
          <div className={styles.scopeGrid}>
            {SCOPE_GROUPS.map((g) => (
              <div className={styles.scopeCard} key={g.resource}>
                <div className={styles.scopeName}>{g.resource}</div>
                <p className={styles.scopeBlurb}>{g.blurb}</p>
                <div className={styles.scopeChecks}>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={scopes.has(g.read)}
                      onChange={() => toggleScope(g.read)}
                    />
                    Read
                  </label>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={scopes.has(g.write)}
                      onChange={() => toggleScope(g.write)}
                    />
                    Write
                  </label>
                </div>
              </div>
            ))}
          </div>

          <label className={styles.label} htmlFor="key-expiry">
            Expires
          </label>
          <select
            id="key-expiry"
            className={styles.input}
            value={expiryDays}
            onChange={(e) => setExpiryDays(Number(e.target.value))}
          >
            {EXPIRY_OPTIONS.map((o) => (
              <option key={o.label} value={o.days}>
                {o.label}
              </option>
            ))}
          </select>

          <label className={styles.label} htmlFor="key-ips">
            Restrict to IP addresses <span className={styles.optional}>optional</span>
          </label>
          <input
            id="key-ips"
            className={styles.input}
            value={ips}
            placeholder="91.98.141.100, 203.0.113.7"
            onChange={(e) => setIps(e.target.value)}
          />
          <p className={styles.hint}>
            If your integration calls from fixed servers, list their addresses here and the key will
            be refused from anywhere else. Leave blank to allow any address.
          </p>

          <div className={styles.formActions}>
            <button
              className={styles.primary}
              type="button"
              onClick={submit}
              disabled={pending || !name.trim() || scopes.size === 0}
            >
              {pending ? 'Creating…' : 'Create key'}
            </button>
            <button
              className={styles.ghost}
              type="button"
              onClick={() => {
                setShowForm(false);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Existing keys ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Your keys</h2>
        {keys.length === 0 ? (
          <div className={styles.empty}>
            <p>No API keys yet. Create one to start calling the API.</p>
          </div>
        ) : (
          <div className={styles.keyList}>
            {keys.map((k) => {
              const expired = k.expires_at && new Date(k.expires_at) <= new Date();
              const state = k.revoked_at ? 'revoked' : expired ? 'expired' : 'active';
              return (
                <div className={styles.keyCard} key={k.id} data-state={state}>
                  <div className={styles.keyTop}>
                    <div>
                      <div className={styles.keyName}>{k.name}</div>
                      <code className={styles.keyPrefix}>{k.key_prefix}…</code>
                    </div>
                    <span className={styles[`badge_${state}`]}>
                      {state === 'active' ? 'Active' : state === 'expired' ? 'Expired' : 'Revoked'}
                    </span>
                  </div>

                  <div className={styles.keyScopes}>
                    {(k.scopes ?? []).map((s) => (
                      <span className={styles.scopeChip} key={s}>
                        {s}
                      </span>
                    ))}
                  </div>

                  <dl className={styles.keyMeta}>
                    <div>
                      <dt>Created</dt>
                      <dd>{fmt(k.created_at)}</dd>
                    </div>
                    <div>
                      <dt>Last used</dt>
                      <dd>{fmt(k.last_used_at)}</dd>
                    </div>
                    <div>
                      <dt>Requests</dt>
                      <dd>{k.request_count.toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt>Expires</dt>
                      <dd>{k.expires_at ? fmt(k.expires_at) : 'Never'}</dd>
                    </div>
                    {(k.allowed_ips ?? []).length > 0 && (
                      <div>
                        <dt>Allowed IPs</dt>
                        <dd>{(k.allowed_ips ?? []).join(', ')}</dd>
                      </div>
                    )}
                  </dl>

                  <div className={styles.keyActions}>
                    {!k.revoked_at ? (
                      <button
                        className={styles.danger}
                        type="button"
                        disabled={pending}
                        onClick={() => revoke(k)}
                      >
                        Revoke
                      </button>
                    ) : (
                      <button
                        className={styles.ghost}
                        type="button"
                        disabled={pending}
                        onClick={() => remove(k)}
                      >
                        Remove from list
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Recent traffic ── */}
      {logs.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Recent API calls</h2>
          <p className={styles.hint}>
            The last 25 requests made with your keys. Useful when an integration isn&rsquo;t behaving
            — a run of 401s means a bad key, 429s mean you&rsquo;re calling too fast.
          </p>
          <div className={styles.logTable}>
            {logs.map((l) => (
              <div className={styles.logRow} key={l.id}>
                <span className={styles.logMethod}>{l.method}</span>
                <span className={styles.logPath}>{l.path}</span>
                <span className={l.status >= 400 ? styles.logBad : styles.logOk}>{l.status}</span>
                <span className={styles.logTime}>{l.duration_ms ?? '—'} ms</span>
                <span className={styles.logWhen}>{fmt(l.created_at)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
