# Rovora (spot-saas)

## Changelog & roadmap — keep them current

The public pages https://rovora.eu/changelog and https://rovora.eu/roadmap must
reflect what has shipped. **Every moderately sized update** (a new feature, a
visible improvement, or a fix a fleet would notice — not refactors, deps-only
bumps, admin-console-only tools or internal scripts) updates them in the same
PR:

1. **Changelog** — `components/marketing/changelog/releases.ts`
   - Add the change to the top release if it belongs to the same batch, or add a
     new `Release` at the top of `RELEASES` (newest first). Move
     `highlight: true` to the newest release.
   - Write for fleet operators, not developers: plain English, what it does for
     them, one line per item, tagged `new` / `improved` / `fixed` / `security`
     with an `area` label matching the existing ones. No internal names (tables,
     routes, env vars, PR numbers).
   - Only claim what is live for customers. Anything behind a beta flag or not
     merged to `main` stays off the changelog.

2. **Roadmap** — `components/marketing/roadmap/roadmap.ts`
   - The "Shipped" section is generated from `RELEASES`; don't duplicate it.
   - When an item ships, delete it from `ROADMAP` (it now appears under
     Shipped via the changelog). When work starts on one, set it to
     `in-progress`. Bump `ROADMAP_UPDATED`.
   - Only list things that are actually being built or already committed to
     (`/ai`, the modules catalog). No dates. `/integrations` lists live
     connections only, so a planned integration belongs here, not there —
     and moves to `lib/integrations/catalog.ts` the day it ships.

If a change makes a "coming soon" claim elsewhere true (the `/ai` page,
`lib/integrations/catalog.ts`, `lib/modules/catalog.ts`,
`lib/marketing/rovora-knowledge.ts`, `app/llms.txt/route.ts`), update those too.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
