'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import FleetIcon from '@/components/fleet/FleetIcon';
import { useEnabledModules } from '@/components/fleet/FleetModulesProvider';
import { badgeText, useUnreadMessages } from './useUnreadMessages';

/**
 * Topbar shortcut to Messages with the unread count — sits beside the
 * notification bell for managers and drivers alike. Hidden when the fleet has
 * the Messages module switched off.
 */
export default function MessagesButton({ variant = 'fleet' }: { variant?: 'fleet' | 'driver' }) {
  const pathname = usePathname();
  const enabledModules = useEnabledModules();
  const { enabled, count } = useUnreadMessages();

  // Managers: the layout already knows the module state. Drivers: wait for the
  // unread endpoint to say whether chat is on.
  if (variant === 'fleet' ? !enabledModules.has('messaging') : enabled !== true) return null;

  const href = variant === 'driver' ? '/driver/messages' : '/fleet/messages';
  const here = pathname.startsWith(href);

  return (
    <Link
      href={href}
      style={{ ...st.btn, ...(here ? { color: 'var(--accent)' } : {}) }}
      className="fleetIconBtn"
      aria-label={count > 0 ? `Messages, ${count} unread` : 'Messages'}
      title="Messages"
    >
      <FleetIcon name="chat" size={16} />
      {count > 0 && <span style={st.badge}>{badgeText(count)}</span>}
    </Link>
  );
}

const st: Record<string, CSSProperties> = {
  btn: {
    position: 'relative',
    width: 32,
    height: 32,
    borderRadius: 7,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textDecoration: 'none',
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 18,
    height: 18,
    padding: '0 4px',
    background: 'var(--accent)',
    color: '#fff',
    fontSize: 9.5,
    fontWeight: 600,
    borderRadius: 9,
    border: '2px solid var(--bg-1)',
  },
};
