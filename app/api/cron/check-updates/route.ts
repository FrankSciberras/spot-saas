import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { Resend } from 'resend';
import fs from 'fs';
import path from 'path';

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface OutdatedPackage {
  name: string;
  current: string;
  latest: string;
  type: 'dependencies' | 'devDependencies';
}

function cleanVersion(version: string): string {
  return version.replace(/^[\^~>=<]+/, '');
}

async function getLatestVersion(packageName: string): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${packageName}/latest`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.version || null;
  } catch {
    return null;
  }
}

function compareVersions(current: string, latest: string): boolean {
  const c = current.split('.').map(Number);
  const l = latest.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((l[i] || 0) > (c[i] || 0)) return true;
    if ((l[i] || 0) < (c[i] || 0)) return false;
  }
  return false;
}

export async function GET(request: Request) {
  try {
    console.log('[cron/check-updates] Cron triggered at', new Date().toISOString());

    // Verify cron secret (Vercel sends this header for cron jobs)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.log('[cron/check-updates] Unauthorized - CRON_SECRET mismatch');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if the feature is enabled
    const supabase = createAdminClient();
    const { data: setting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'package_update_check_enabled')
      .single();

    if (!setting || setting.value !== true) {
      console.log('[cron/check-updates] Feature disabled or app_settings query failed. setting:', JSON.stringify(setting));
      return NextResponse.json({ message: 'Package update check is disabled' });
    }

    console.log('[cron/check-updates] Feature is enabled, checking packages...');

    // Read package.json
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf-8');
    const packageJson: PackageJson = JSON.parse(packageJsonContent);

    const allDeps: { name: string; version: string; type: 'dependencies' | 'devDependencies' }[] = [];

    if (packageJson.dependencies) {
      for (const [name, version] of Object.entries(packageJson.dependencies)) {
        allDeps.push({ name, version, type: 'dependencies' });
      }
    }
    if (packageJson.devDependencies) {
      for (const [name, version] of Object.entries(packageJson.devDependencies)) {
        allDeps.push({ name, version, type: 'devDependencies' });
      }
    }

    // Check each package against the npm registry
    const outdated: OutdatedPackage[] = [];

    const results = await Promise.allSettled(
      allDeps.map(async (dep) => {
        const latest = await getLatestVersion(dep.name);
        if (!latest) return null;
        const current = cleanVersion(dep.version);
        if (compareVersions(current, latest)) {
          return {
            name: dep.name,
            current,
            latest,
            type: dep.type,
          } as OutdatedPackage;
        }
        return null;
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        outdated.push(result.value);
      }
    }

    if (outdated.length === 0) {
      console.log(`[cron/check-updates] All ${allDeps.length} packages are up to date, no email needed`);
      return NextResponse.json({
        message: 'All packages are up to date',
        checked: allDeps.length,
      });
    }

    console.log(`[cron/check-updates] Found ${outdated.length} outdated package(s), preparing email...`);

    // Send email via Resend
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn('[cron/check-updates] RESEND_API_KEY not configured, skipping email');
      return NextResponse.json({
        message: 'Updates found but email not configured',
        outdated,
      });
    }

    const resend = new Resend(apiKey);
    const fromEmail = process.env.EMAIL_FROM || 'SPOT Dashboard <onboarding@resend.dev>';
    const appName = process.env.NEXT_PUBLIC_APP_NAME || 'SPOT Dashboard';

    const depsRows = outdated
      .filter((p) => p.type === 'dependencies')
      .map(
        (p) =>
          `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:500">${p.name}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#ef4444">${p.current}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#22c55e;font-weight:600">${p.latest}</td></tr>`
      )
      .join('');

    const devDepsRows = outdated
      .filter((p) => p.type === 'devDependencies')
      .map(
        (p) =>
          `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:500">${p.name}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#ef4444">${p.current}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#22c55e;font-weight:600">${p.latest}</td></tr>`
      )
      .join('');

    const tableHeader = `<tr style="background:#f8fafc"><th style="padding:10px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0">Package</th><th style="padding:10px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0">Current</th><th style="padding:10px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0">Latest</th></tr>`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Package Updates Available</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f5f5f5; }
    .container { max-width: 650px; margin: 0 auto; padding: 20px; }
    .card { background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { text-align: center; margin-bottom: 24px; }
    .logo { font-size: 24px; font-weight: 700; color: #6366f1; }
    h1 { font-size: 20px; margin: 0 0 8px; color: #111; }
    h2 { font-size: 16px; margin: 24px 0 8px; color: #334155; }
    p { margin: 0 0 16px; color: #555; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 600; background: #fef3c7; color: #92400e; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0; }
    .footer { text-align: center; margin-top: 24px; font-size: 12px; color: #888; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">${appName}</div>
      </div>
      <h1>Package Updates Available</h1>
      <span class="badge">${outdated.length} update${outdated.length > 1 ? 's' : ''} available</span>
      <p>The following npm packages in your ${appName} project have newer versions available:</p>
      ${
        depsRows
          ? `<h2>Dependencies</h2><table>${tableHeader}${depsRows}</table>`
          : ''
      }
      ${
        devDepsRows
          ? `<h2>Dev Dependencies</h2><table>${tableHeader}${devDepsRows}</table>`
          : ''
      }
      <p style="margin-top:20px;font-size:14px;color:#64748b">Run <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:13px">npm outdated</code> and <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:13px">npm update</code> to apply these updates.</p>
    </div>
    <div class="footer">
      <p>This is an automated weekly check from ${appName}.</p>
      <p>You can disable this in Admin &rarr; Settings.</p>
    </div>
  </div>
</body>
</html>`;

    const { error: emailError } = await resend.emails.send({
      from: fromEmail,
      to: ['franksciberras@gmail.com'],
      subject: `${appName} - ${outdated.length} Package Update${outdated.length > 1 ? 's' : ''} Available`,
      html: htmlContent,
    });

    if (emailError) {
      console.error('[cron/check-updates] Failed to send update email:', emailError);
      return NextResponse.json(
        { message: 'Updates found but email failed', outdated, error: emailError },
        { status: 500 }
      );
    }

    console.log(`[cron/check-updates] Email sent successfully with ${outdated.length} update(s)`);
    return NextResponse.json({
      message: `Email sent with ${outdated.length} package update(s)`,
      outdated,
    });
  } catch (error) {
    console.error('[cron/check-updates] Cron error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
