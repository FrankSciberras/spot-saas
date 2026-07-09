'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setModuleEnabledAction } from '@/lib/actions/modules';
import { FLEET_MODULES } from '@/lib/modules/catalog';
import FleetIcon from '@/components/fleet/FleetIcon';
import styles from './integrations.module.css';

/**
 * The "Your modules" panel on /fleet/integrations: one card per module with a
 * working on/off switch. Turning a module off hides its sidebar items and blocks
 * its pages (server side); coming-soon modules show a badge instead of a switch.
 * We update optimistically, then router.refresh() so the sidebar reflects the
 * change without a full reload.
 */
export default function ModuleToggles({ enabledKeys }: { enabledKeys: string[] }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState<Set<string>>(() => new Set(enabledKeys));
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [, startTransition] = useTransition();

  const toggle = (key: string, next: boolean) => {
    setError('');
    setBusyKey(key);
    // Optimistic — flip immediately, revert if the server rejects it.
    setEnabled((prev) => {
      const s = new Set(prev);
      if (next) s.add(key);
      else s.delete(key);
      return s;
    });
    startTransition(async () => {
      const res = await setModuleEnabledAction(key, next);
      if (res.error) {
        setEnabled((prev) => {
          const s = new Set(prev);
          if (next) s.delete(key);
          else s.add(key);
          return s;
        });
        setError(res.error);
      } else {
        router.refresh();
      }
      setBusyKey(null);
    });
  };

  return (
    <>
      {error && <div className={styles.moduleError}>{error}</div>}
      <div className={styles.grid}>
        {FLEET_MODULES.map((m) => {
          const comingSoon = m.status !== 'available';
          const isOn = enabled.has(m.key);
          return (
            <div className={styles.card} key={m.key}>
              <div className={styles.cardTop}>
                <div
                  className={styles.logo}
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                  aria-hidden
                >
                  <FleetIcon name={m.icon} size={22} stroke={1.7} />
                </div>
                {comingSoon ? (
                  <span className={styles.soon}>Coming soon</span>
                ) : (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isOn}
                    aria-label={`${isOn ? 'Turn off' : 'Turn on'} ${m.name}`}
                    className={`${styles.switch} ${isOn ? styles.switchOn : ''}`}
                    disabled={busyKey === m.key}
                    onClick={() => toggle(m.key, !isOn)}
                  >
                    <span className={styles.switchKnob} />
                  </button>
                )}
              </div>
              <div className={styles.name}>{m.name}</div>
              <p className={styles.desc}>{m.description}</p>
            </div>
          );
        })}
      </div>
    </>
  );
}
