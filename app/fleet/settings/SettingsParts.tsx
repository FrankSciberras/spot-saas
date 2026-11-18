'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './settings.module.css';

/** Page-level success / error banner, owned by the settings page. */
export type Notify = (type: 'success' | 'error', text: string) => void;

/** A titled block inside a settings tab. */
export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.brandSection}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {description && <p className={styles.sectionSub}>{description}</p>}
      <div className={styles.settingsGrid}>{children}</div>
    </section>
  );
}

/** One on/off fleet setting: icon, label, explanation and a switch. */
export function ToggleCard({
  icon,
  label,
  description,
  checked,
  onToggle,
  saving,
  onLabel = 'Enabled',
  offLabel = 'Disabled',
  children,
}: {
  icon: string;
  label: string;
  description: ReactNode;
  checked: boolean;
  onToggle: () => void;
  saving?: boolean;
  onLabel?: string;
  offLabel?: string;
  /** Extra controls under the description (e.g. thresholds), shown as given. */
  children?: ReactNode;
}) {
  return (
    <div className={styles.settingCard}>
      <div className={styles.settingIcon} aria-hidden>{icon}</div>
      <div className={styles.settingContent}>
        <div className={styles.settingLabel}>{label}</div>
        <div className={styles.settingDescription}>{description}</div>
        {children}
      </div>
      <div className={styles.settingAction}>
        <label className={`${styles.toggle} ${saving ? styles.toggleDisabled : ''}`}>
          <input type="checkbox" checked={checked} onChange={onToggle} disabled={saving} aria-label={label} />
          <span className={styles.toggleSlider}></span>
        </label>
        <span className={styles.statusLabel}>{checked ? onLabel : offLabel}</span>
      </div>
    </div>
  );
}

/** A card that sends the admin to where a setting is actually managed. */
export function LinkCard({
  icon,
  label,
  description,
  href,
  cta,
}: {
  icon: string;
  label: string;
  description: ReactNode;
  href: string;
  cta: string;
}) {
  return (
    <div className={styles.settingCard}>
      <div className={styles.settingIcon} aria-hidden>{icon}</div>
      <div className={styles.settingContent}>
        <div className={styles.settingLabel}>{label}</div>
        <div className={styles.settingDescription}>{description}</div>
      </div>
      <div className={styles.settingAction}>
        <Link href={href} className="btn btn-secondary">{cta}</Link>
      </div>
    </div>
  );
}

/** Placeholder while a tab loads its current values. */
export function PanelLoading({ rows = 2 }: { rows?: number }) {
  return (
    <div className={styles.settingsGrid} aria-busy="true" aria-label="Loading settings">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={styles.skeletonCard} />
      ))}
    </div>
  );
}

/** PUT/PATCH JSON and return the parsed body, throwing the API's error text. */
export async function sendJson<T = Record<string, unknown>>(url: string, method: 'PUT' | 'PATCH', body: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || 'Failed to update setting');
  return json as T;
}
