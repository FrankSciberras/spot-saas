import { NextResponse } from 'next/server';
import { ALL_ENDPOINTS, API_BASE_PATH, DOC_ERRORS } from '@/lib/api/docs';
import { SITE_URL } from '@/lib/seo';

export const runtime = 'nodejs';
// The spec is derived from a static definition, so it can be cached hard.
export const revalidate = 3600;

/**
 * GET /api/v1/openapi.json — the machine-readable spec.
 *
 * Generated from lib/api/docs.ts, the same definition the human documentation
 * page renders, so the spec cannot drift from the docs. Public and unauthenticated
 * on purpose: an integrator needs to import this into Postman or a code generator
 * BEFORE they have a key.
 */
export function GET() {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const ep of ALL_ENDPOINTS) {
    const key = `${API_BASE_PATH}${ep.path}`;
    paths[key] ??= {};

    const parameters: Record<string, unknown>[] = [];

    // Path parameters, from the {braces} in the documented path.
    for (const match of ep.path.matchAll(/\{(\w+)\}/g)) {
      parameters.push({
        name: match[1],
        in: 'path',
        required: true,
        schema: { type: 'string', format: 'uuid' },
        description: 'Record id.',
      });
    }

    for (const q of ep.query ?? []) {
      parameters.push({
        name: q.name,
        in: 'query',
        required: Boolean(q.required),
        schema: { type: q.type.startsWith('integer') ? 'integer' : q.type === 'number' ? 'number' : 'string' },
        description: q.description,
      });
    }

    const operation: Record<string, unknown> = {
      operationId: ep.id.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()),
      summary: ep.summary,
      description: ep.description,
      tags: [ep.path.split('/')[1] || 'account'],
      security: [{ bearerAuth: [] }],
      parameters,
      responses: {
        [String(ep.successStatus ?? 200)]: {
          description: 'Success',
          content: {
            'application/json': {
              schema: { type: 'object' },
              ...(ep.responseExample ? { example: safeParse(ep.responseExample) } : {}),
            },
          },
        },
        ...Object.fromEntries(
          DOC_ERRORS.map((e) => [
            String(e.status),
            { description: `${e.code} — ${e.meaning}`, content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          ]),
        ),
      },
    };

    if (ep.body && ep.body.length > 0) {
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const f of ep.body) {
        if (f.name === '…') continue;
        properties[f.name] = {
          type: f.type === 'integer' ? 'integer' : f.type === 'number' ? 'number' : 'string',
          ...(f.type === 'date' ? { format: 'date' } : {}),
          ...(f.type === 'uuid' ? { format: 'uuid' } : {}),
          description: f.description,
        };
        if (f.required) required.push(f.name);
      }
      operation.requestBody = {
        required: ep.method === 'POST',
        content: {
          'application/json': {
            schema: { type: 'object', properties, ...(required.length ? { required } : {}) },
            ...(ep.requestExample ? { example: safeParse(ep.requestExample) } : {}),
          },
        },
      };
    }

    paths[key][ep.method.toLowerCase()] = operation;
  }

  const spec = {
    openapi: '3.1.0',
    info: {
      title: 'Rovora Fleet API',
      version: '1.0.0',
      description:
        'Read and write your fleet’s drivers, vehicles and financials. Server-to-server only — authenticate with a bearer API key created in Rovora under Admin → API.',
      contact: { name: 'Rovora support', email: 'support@rovora.eu', url: `${SITE_URL}/docs/api` },
    },
    servers: [{ url: SITE_URL, description: 'Production' }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'Send your key as `Authorization: Bearer rvk_live_…`.',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', enum: Array.from(new Set(DOC_ERRORS.map((e) => e.code))) },
                message: { type: 'string' },
                details: { type: 'object' },
              },
              required: ['code', 'message'],
            },
          },
        },
      },
    },
    paths,
  };

  return NextResponse.json(spec, {
    headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
  });
}

/** Examples are hand-written JSON with ellipsis ids; never let one break the spec. */
function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}
