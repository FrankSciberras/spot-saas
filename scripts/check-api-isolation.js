#!/usr/bin/env node
// =============================================================================
// TENANT-ISOLATION GUARD for the public API (/api/v1)
// =============================================================================
// The public API authenticates with an API key, not a Supabase session, so its
// queries run with the SERVICE ROLE and row-level security does not apply. That
// makes the explicit `organization_id` filter in each query the ONE thing
// keeping one fleet's data away from another's.
//
// A single forgotten filter in a future endpoint would be a cross-tenant data
// leak that nothing else would catch — no type error, no failing page, no
// visible bug until the wrong fleet's drivers appeared in someone's export.
//
// So it is checked mechanically, on every build: each database query in the v1
// surface must either filter by the caller's organization, stamp it on insert,
// or name a table that has no tenant column at all.
//
// Runs as `prebuild`, so a violation fails the Docker build and the deploy
// never ships. Run it by hand with:  node scripts/check-api-isolation.js
// =============================================================================

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCAN_DIRS = [path.join(ROOT, 'app', 'api', 'v1'), path.join(ROOT, 'lib', 'api')];

/**
 * Tables with no organization_id column — global catalogues and the API's own
 * plumbing. Each is scoped some other way, noted here so the exemption is a
 * decision rather than an oversight.
 */
const TENANTLESS_TABLES = new Set([
  'plans', //            global package catalogue, same for every fleet
  'organizations', //    scoped by .eq('id', <the caller's org>)
  'api_keys', //         scoped by .eq('id', <the authenticated key>)
  'api_rate_limits', //  keyed by api key id; service-role only
  'api_request_logs', // written only, with the caller's org stamped on
]);

/** Proof that a statement is confined to one fleet. */
const SCOPE_MARKERS = [
  ".eq('organization_id'", //     a read or update filtered to the fleet
  'organization_id: ctx.organizationId', // an insert stamped with the fleet
  'organization_id: organizationId',
  'organization_id: line.organizationId',
  ".eq('id', ctx.organizationId)", //       the caller's own organization row
  ".eq('id', organizationId)",
  ".eq('id', ctx.keyId)", //                the caller's own key row
  ".eq('id', keyId)",
];

/** How far past `.from(` to look for the filter (one chained statement). */
const STATEMENT_WINDOW = 900;

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const violations = [];
let checked = 0;

for (const dir of SCAN_DIRS) {
  for (const file of walk(dir)) {
    const source = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');

    const pattern = /(\.storage)?\.from\(\s*'([^']+)'\s*\)/g;
    let match;

    while ((match = pattern.exec(source)) !== null) {
      // `.storage.from('bucket')` is object storage, not a table.
      if (match[1]) continue;

      const table = match[2];
      if (TENANTLESS_TABLES.has(table)) continue;

      checked += 1;

      // The chained statement: everything up to the next semicolon.
      const tail = source.slice(match.index, match.index + STATEMENT_WINDOW);
      const end = tail.indexOf(';');
      const statement = end === -1 ? tail : tail.slice(0, end);

      if (!SCOPE_MARKERS.some((marker) => statement.includes(marker))) {
        const line = source.slice(0, match.index).split('\n').length;
        violations.push({ rel, line, table });
      }
    }
  }
}

if (violations.length > 0) {
  console.error('\n✖ Tenant-isolation check FAILED\n');
  console.error(
    '  These /api/v1 queries run with the service role but are not scoped to a\n' +
      '  single fleet, so they could return or modify another fleet\'s data:\n',
  );
  for (const v of violations) {
    console.error(`    ${v.rel}:${v.line}  —  .from('${v.table}')`);
  }
  console.error(
    "\n  Fix: add .eq('organization_id', ctx.organizationId) to the query, or\n" +
      '  stamp organization_id on the insert. If the table genuinely has no\n' +
      '  tenant column, add it to TENANTLESS_TABLES in this script with a note.\n',
  );
  process.exit(1);
}

console.log(`✔ Tenant-isolation check passed (${checked} fleet-scoped queries in /api/v1).`);
