'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import FleetIcon from '@/components/fleet/FleetIcon';
import styles from './invoices.module.css';

/**
 * A modal dialog for the invoice screens. It is drawn into the fleet shell root
 * (`.fleetCanvas`), not inside <main>: <main> is its own stacking layer, which
 * would put the phone bottom nav on top of the dialog and hide its buttons.
 * On a phone it becomes a sheet pinned to the bottom of the screen.
 */
export default function InvoiceDialog({
  title,
  onClose,
  children,
  footer,
  busy = false,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Buttons, right-aligned (stacked full-width on a phone). */
  footer?: ReactNode;
  /** While true the dialog can't be dismissed (an action is in flight). */
  busy?: boolean;
  wide?: boolean;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setTarget(anchorRef.current?.closest<HTMLElement>('.fleetCanvas') ?? document.body);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return (
    <>
      <span ref={anchorRef} hidden />
      {target &&
        createPortal(
          <div
            className={styles.scrim}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget && !busy) onClose();
            }}
          >
            <div className={`${styles.dialog} ${wide ? styles.dialogWide : ''}`} role="dialog" aria-modal="true" aria-label={title}>
              <div className={styles.dialogHead}>
                <h2 className={styles.dialogTitle}>{title}</h2>
                <button type="button" className={styles.iconBtn} onClick={onClose} disabled={busy} aria-label="Close">
                  <FleetIcon name="close" size={16} />
                </button>
              </div>
              <div className={styles.dialogBody}>{children}</div>
              {footer && <div className={styles.dialogFoot}>{footer}</div>}
            </div>
          </div>,
          target,
        )}
    </>
  );
}
