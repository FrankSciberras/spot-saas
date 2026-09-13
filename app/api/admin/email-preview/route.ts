import { NextResponse } from 'next/server';
import { isPlatformAdmin } from '@/lib/auth/platform';
import { buildInactivityEmail } from '@/lib/email/inactivity';
import { buildWelcomeEmail } from '@/lib/email/welcome';

/**
 * GET /api/admin/email-preview?kind=inactivity|welcome&variant=new|partial
 * Renders a lifecycle email with sample data so it can be checked in a
 * browser. Platform admins only.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  // Same secret the cron endpoints accept, so the preview can be fetched from
  // a script; otherwise a signed-in platform admin.
  const secret = process.env.CRON_SECRET;
  const viaSecret = !!secret && request.headers.get('authorization') === `Bearer ${secret}`;
  if (!viaSecret && !(await isPlatformAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const kind = url.searchParams.get('kind') || 'inactivity';
  const variant = url.searchParams.get('variant') || 'new';
  const asText = url.searchParams.get('format') === 'text';

  const sample = { fullName: 'Frank Sciberras', fleetName: 'Harbour Cabs' };
  const email =
    kind === 'welcome'
      ? buildWelcomeEmail({ to: 'preview@example.com', ...sample, onTrial: true })
      : buildInactivityEmail(
          variant === 'partial'
            ? { to: 'preview@example.com', ...sample, daysAway: 9, vehicles: 3, drivers: 4, settlements: 0, onTrial: false, trialDaysLeft: 0 }
            : { to: 'preview@example.com', ...sample, daysAway: 8, vehicles: 0, drivers: 0, settlements: 0, onTrial: true, trialDaysLeft: 19 },
        );

  return new NextResponse(asText ? email.text : email.html, {
    headers: { 'Content-Type': asText ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
