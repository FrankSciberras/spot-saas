import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Creates a Supabase client for use in server components and route handlers.
 * This client uses cookies for session management.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method is called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  );
}

/**
 * Creates a Supabase client that never touches cookies, for reading data that
 * is public by definition (e.g. the published package catalogue on the
 * marketing site).
 *
 * Why this exists: `createClient()` awaits `cookies()`, and any server component
 * that does so opts the whole route out of static rendering. That silently made
 * every marketing page render per-request and uncacheable. Reading public data
 * through this client keeps those pages prerenderable.
 *
 * Uses the anon key, so RLS still applies — this grants no extra access.
 */
export function createPublicClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          /* No session to persist — this client is deliberately anonymous. */
        },
      },
    }
  );
}

/**
 * Creates a Supabase admin client with service role key.
 * Use this for operations that need to bypass RLS.
 * ONLY use in trusted server-side code.
 */
export function createAdminClient() {
  const { createClient } = require('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
