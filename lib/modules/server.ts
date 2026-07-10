import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { resolveEnabledModules } from './catalog';

/**
 * The set of module keys switched ON for a fleet (catalog defaults merged with
 * the fleet's org_modules overrides). Wrapped in React `cache()` so the fleet
 * layout, the per-page module guard, and anything else that asks during one
 * request share a single DB read.
 *
 * We filter by organization_id explicitly: RLS only narrows reads to orgs the
 * user is a member of, so a multi-fleet account would otherwise merge every
 * fleet's overrides together.
 */
export const getEnabledModuleKeys = cache(
  async (organizationId: string): Promise<Set<string>> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from('org_modules')
      .select('module_key, is_enabled')
      .eq('organization_id', organizationId);
    return resolveEnabledModules(data ?? []);
  },
);
