'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { settingsLinkFor } from '@/lib/settings/pages';
import FleetIcon from './FleetIcon';
import { useEnabledModules } from './FleetModulesProvider';
import { fleetPageName } from './navConfig';

/**
 * Top-bar gear on pages that have settings (lib/settings/pages.ts). Opens the
 * page's Settings tab; Settings then offers "Back to <this page>".
 */
export default function FleetSettingsGear({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const enabledModules = useEnabledModules();
  const href = settingsLinkFor(pathname, { isAdmin, enabledModules });
  if (!href) return null;

  const page = fleetPageName(pathname);
  const label = page ? `${page} settings` : 'Settings for this page';
  return (
    <Link
      href={href}
      className="fleetIconBtn"
      style={{ width: 32, height: 32, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)' }}
      aria-label={label}
      title={label}
    >
      <FleetIcon name="gear" size={16} />
    </Link>
  );
}
