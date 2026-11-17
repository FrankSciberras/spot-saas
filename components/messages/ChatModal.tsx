'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import FleetIcon from '@/components/fleet/FleetIcon';
import { useFleetTheme } from '@/components/fleet/FleetThemeRoot';
import { useIsClient } from './hooks';
import styles from './messages.module.css';

/**
 * Dialog / side drawer for the chat screens. Portalled to <body> (with the
 * fleet theme class, so the design tokens still resolve) so it sits above the
 * phone's bottom tab bar instead of underneath it.
 */
export default function ChatModal({
  title,
  onClose,
  children,
  footer,
  variant = 'dialog',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  variant?: 'dialog' | 'drawer';
}) {
  const { theme } = useFleetTheme();
  const mounted = useIsClient();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!mounted) return null;
  return createPortal(
    <div
      className={`fleetTheme ${styles.scrim} ${variant === 'drawer' ? styles.scrimRight : ''}`}
      data-fleet-theme={theme}
      onClick={onClose}
    >
      <div
        className={`${styles.modal} ${variant === 'drawer' ? styles.drawer : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.modalHead}>
          <h2>{title}</h2>
          <button type="button" className={`${styles.iconBtn} ${styles.iconBtnBare}`} onClick={onClose} aria-label="Close">
            <FleetIcon name="close" size={18} stroke={2} />
          </button>
        </div>
        <div className={styles.modalBody}>{children}</div>
        {footer && <div className={styles.modalFoot}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
