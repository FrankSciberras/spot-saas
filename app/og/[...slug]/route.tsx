import { ogImagePath } from '@/lib/og/cards';
import { ogCardFor, ogCardPaths, pathFromOgSlug } from '@/lib/og/registry';
import { renderOgCard } from '@/lib/og/render';

// =============================================================================
// GET /og/<page>.png — the social share card for one public page
// (/og/home.png, /og/pricing.png, /og/features/vehicles.png, /og/blog/<slug>.png).
// Every card is drawn at build time; paths without a card are 404s.
// =============================================================================

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams(): { slug: string[] }[] {
  return ogCardPaths().map((path) => ({ slug: ogImagePath(path).replace(/^\/og\//, '').split('/') }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = pathFromOgSlug(slug);
  const card = path ? ogCardFor(path) : null;
  if (!card) return new Response('Not found', { status: 404 });
  return renderOgCard(card);
}
