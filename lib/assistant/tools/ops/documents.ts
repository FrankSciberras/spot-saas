// documents_expiring — driver and vehicle documents that are expired or expire soon.
// REFERENCE TOOL: the shape every tool follows (scope by org, PII-free output,
// capped lists, sources that link back to the dashboard).

import type { AssistantTool } from '../../types';
import { argInt, argEnum, capList, dedupeSources } from '../args';
import { daysBetween } from '../../period';

const DRIVER_DOCS = [
  ['id_card_expiry_date', 'ID card'],
  ['police_conduct_expiry_date', 'Police conduct'],
  ['driving_license_expiry_date', 'Driving licence'],
  ['tag_license_expiry_date', 'Tag licence'],
] as const;

const VEHICLE_DOCS = [
  ['insurance_expiry_date', 'Insurance'],
  ['road_license_expiry_date', 'Road licence'],
] as const;

export const documentsExpiringTool: AssistantTool = {
  name: 'documents_expiring',
  status: 'Checking documents…',
  description:
    'Driver documents (ID card, police conduct, driving licence, tag licence) and vehicle documents (insurance, road licence) that have already expired or expire within the next N days. Use for "what is expiring", "whose licence runs out", "is any insurance expired".',
  parameters: {
    type: 'object',
    properties: {
      within_days: { type: 'integer', description: 'Look this many days ahead (default 30, max 365).' },
      include_expired: { type: 'boolean', description: 'Include documents that have already expired (default true).' },
      kind: { type: 'string', enum: ['all', 'drivers', 'vehicles'], description: 'Default all.' },
    },
  },
  roles: ['admin', 'staff'],
  async run(ctx, args) {
    const withinDays = argInt(args, 'within_days', 30, 0, 365);
    const includeExpired = args.include_expired !== false;
    const kind = argEnum(args, 'kind', ['all', 'drivers', 'vehicles'] as const, 'all');

    const horizon = new Date(`${ctx.today}T00:00:00Z`);
    horizon.setUTCDate(horizon.getUTCDate() + withinDays);
    const until = horizon.toISOString().slice(0, 10);

    type Item = { kind: 'driver' | 'vehicle'; name: string; document: string; expires: string; days_left: number; href: string };
    const items: Item[] = [];

    if (kind !== 'vehicles') {
      const { data, error } = await ctx.db
        .from('drivers')
        .select('id, full_name, status, id_card_expiry_date, police_conduct_expiry_date, driving_license_expiry_date, tag_license_expiry_date')
        .eq('organization_id', ctx.orgId)
        .or(DRIVER_DOCS.map(([col]) => `${col}.lte.${until}`).join(','))
        .limit(500);
      if (error) throw new Error(`drivers: ${error.message}`);
      for (const d of (data ?? []) as Record<string, string | null>[]) {
        for (const [col, label] of DRIVER_DOCS) {
          const date = d[col];
          if (!date || date > until) continue;
          const left = daysBetween(ctx.today, date);
          if (left < 0 && !includeExpired) continue;
          items.push({ kind: 'driver', name: d.full_name ?? 'Unnamed driver', document: label, expires: date, days_left: left, href: `/fleet/drivers/${d.id}` });
        }
      }
    }

    if (kind !== 'drivers') {
      const { data, error } = await ctx.db
        .from('vehicles')
        .select('id, registration_number, make, model, insurance_expiry_date, road_license_expiry_date')
        .eq('organization_id', ctx.orgId)
        .or(VEHICLE_DOCS.map(([col]) => `${col}.lte.${until}`).join(','))
        .limit(500);
      if (error) throw new Error(`vehicles: ${error.message}`);
      for (const v of (data ?? []) as Record<string, string | null>[]) {
        const name = [v.registration_number, [v.make, v.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
        for (const [col, label] of VEHICLE_DOCS) {
          const date = v[col];
          if (!date || date > until) continue;
          const left = daysBetween(ctx.today, date);
          if (left < 0 && !includeExpired) continue;
          items.push({ kind: 'vehicle', name: name || 'Vehicle', document: label, expires: date, days_left: left, href: `/fleet/vehicles/${v.id}` });
        }
      }
    }

    items.sort((a, b) => a.days_left - b.days_left);
    const list = capList(items, 40);
    return {
      data: {
        today: ctx.today,
        looked_ahead_days: withinDays,
        expired: items.filter((i) => i.days_left < 0).length,
        expiring: items.filter((i) => i.days_left >= 0).length,
        documents: list.items.map((i) => ({ kind: i.kind, name: i.name, document: i.document, expires: i.expires, days_left: i.days_left })),
        truncated: list.truncated,
      },
      sources: dedupeSources(list.items.slice(0, 6).map((i) => ({ label: i.name, href: i.href }))),
    };
  },
};

