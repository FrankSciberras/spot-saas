import { redirect } from 'next/navigation';
import { getEnabledModuleKeys } from './server';

/**
 * Guard a module's pages. If the active fleet has this module switched OFF, bounce
 * the request back to the dashboard so a bookmarked/typed URL can't reach a
 * feature the fleet turned off. Call at the top of a module's route, right after
 * the existing requireRole():
 *
 *   const user = await requireRole(['admin', 'staff']);
 *   await requireModule(user.organization_id, 'settlements');
 *
 * The enabled-set lookup is React-cached per request, so pairing this with the
 * layout's own lookup costs nothing extra.
 */
export async function requireModule(
  organizationId: string,
  moduleKey: string,
): Promise<void> {
  const enabled = await getEnabledModuleKeys(organizationId);
  if (!enabled.has(moduleKey)) {
    redirect('/fleet');
  }
}
