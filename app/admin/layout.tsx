import { requirePlatformAdmin } from '@/lib/auth/platform';
import '../fleet/fleet-theme.css';

export const dynamic = 'force-dynamic';

/**
 * Platform admin (Tier 1) shell. Gated to platform admins only — non-admins are
 * redirected by requirePlatformAdmin before any child page renders. The console
 * renders its own sidebar/topbar chrome (AdminConsole), so this layout only
 * gates access and loads the fleet design tokens.
 */
export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePlatformAdmin();
  return children;
}
