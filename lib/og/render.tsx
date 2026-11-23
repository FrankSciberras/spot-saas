import 'server-only';

// =============================================================================
// Draws one social share card (1200 × 630 PNG) — see lib/og/cards.ts for the
// content and app/og/[...slug]/route.tsx for where it is served.
//
// Design: the marketing site's light look — white to mint background, Rovora
// logo, green eyebrow, a big dark headline with its key words in brand green,
// one supporting line, and a real product screenshot in a browser frame
// bleeding off the right edge. Pages without a screenshot get a large faint
// "R" mark instead. Everything important sits in the left ~60 % and the logo
// is top-left, so square crops (WhatsApp's small preview) still read.
//
// Fonts: Geist (shipped in public/fonts/pdf for the settlement PDFs).
// Images are read from public/ and converted with sharp (screenshots are WebP,
// which the image renderer can't read); if sharp fails the card is drawn
// without the screenshot rather than failing the build.
// =============================================================================

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import type { OgCard, OgShot } from './cards';
import { OG_SIZE } from './cards';

const GREEN = '#08733f';
const INK = '#0b1220';
const MUTED = '#475467';

const pub = (...p: string[]) => join(process.cwd(), 'public', ...p);

let fontsP: Promise<{ regular: Buffer; bold: Buffer }> | null = null;
function fonts() {
  fontsP ??= Promise.all([readFile(pub('fonts', 'pdf', 'Geist-Regular.ttf')), readFile(pub('fonts', 'pdf', 'Geist-Bold.ttf'))])
    .then(([regular, bold]) => ({ regular, bold }));
  return fontsP;
}

const imageCache = new Map<string, Promise<string | null>>();
/** A public/ image as a data URI, resized (and re-encoded) with sharp. */
function dataUri(file: string, width: number, format: 'png' | 'jpeg'): Promise<string | null> {
  const key = `${file}|${width}|${format}`;
  let p = imageCache.get(key);
  if (!p) {
    p = (async () => {
      try {
        const sharp = (await import('sharp')).default;
        const img = sharp(await readFile(pub(file))).resize({ width, withoutEnlargement: true });
        const buf = format === 'png' ? await img.png().toBuffer() : await img.jpeg({ quality: 86 }).toBuffer();
        return `data:image/${format};base64,${buf.toString('base64')}`;
      } catch (err) {
        console.error(`og card: could not prepare ${file}:`, err);
        return null;
      }
    })();
    imageCache.set(key, p);
  }
  return p;
}

const SHOT_FILE: Record<OgShot, string> = {
  dashboard: 'home/dashboard.webp',
  vehicles: 'home/vehicles.webp',
  'vehicle-record': 'home/vehicle-record.webp',
  'live-map': 'home/live-map.webp',
  earnings: 'home/earnings.webp',
  'expiring-soon': 'home/expiring-soon.webp',
};

/** Headline words, with the accent words flagged (accent must be in the title). */
function headlineWords(title: string, accent?: string): { w: string; green: boolean }[] {
  const at = accent ? title.indexOf(accent) : -1;
  const out: { w: string; green: boolean }[] = [];
  const push = (text: string, green: boolean) => {
    for (const w of text.split(/\s+/).filter(Boolean)) out.push({ w, green });
  };
  if (at < 0) push(title, false);
  else {
    push(title.slice(0, at), false);
    push(accent!, true);
    push(title.slice(at + accent!.length), false);
  }
  return out;
}

export async function renderOgCard(card: OgCard): Promise<ImageResponse> {
  const [{ regular, bold }, logo, mark, shot] = await Promise.all([
    fonts(),
    dataUri('logo-full.png', 360, 'png'),
    card.shot ? Promise.resolve(null) : dataUri('logo-mark.png', 520, 'png'),
    card.shot ? dataUri(SHOT_FILE[card.shot], 1000, 'jpeg') : Promise.resolve(null),
  ]);

  const words = headlineWords(card.title, card.accent);
  const len = card.title.length;
  const wide = !shot;
  // Fit the headline: shorter titles get bigger type.
  const size = wide ? (len > 56 ? 60 : len > 40 ? 68 : 76) : len > 50 ? 50 : len > 38 ? 56 : 62;
  const textWidth = wide ? 860 : 600;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          backgroundColor: '#ffffff',
          backgroundImage: 'linear-gradient(135deg, #ffffff 0%, #f4fbf7 50%, #ddf3e6 100%)',
          fontFamily: 'Geist',
          overflow: 'hidden',
        }}
      >
        {/* Soft green glow, top right */}
        <div
          style={{
            position: 'absolute',
            right: -220,
            top: -260,
            width: 760,
            height: 760,
            borderRadius: 760,
            backgroundImage: 'radial-gradient(circle, rgba(62,207,142,0.28) 0%, rgba(62,207,142,0) 70%)',
            display: 'flex',
          }}
        />

        {/* Big faint R for text-only cards */}
        {mark && (
          // eslint-disable-next-line @next/next/no-img-element -- rendered to PNG, not a page
          <img src={mark} width={430} height={497} style={{ position: 'absolute', right: 40, top: 66, opacity: 0.08 }} alt="" />
        )}

        {/* Product screenshot in a browser frame, bleeding off the right edge */}
        {shot && (
          <div
            style={{
              position: 'absolute',
              left: 688,
              top: 150,
              width: 660,
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 18,
              overflow: 'hidden',
              backgroundColor: '#ffffff',
              border: '1px solid #dfe5ec',
              boxShadow: '0 28px 60px rgba(16, 24, 40, 0.18)',
            }}
          >
            <div style={{ height: 34, display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 16, backgroundColor: '#f2f4f7', borderBottom: '1px solid #e4e7ec' }}>
              <div style={{ width: 11, height: 11, borderRadius: 11, backgroundColor: '#f97066', display: 'flex' }} />
              <div style={{ width: 11, height: 11, borderRadius: 11, backgroundColor: '#fdb022', display: 'flex' }} />
              <div style={{ width: 11, height: 11, borderRadius: 11, backgroundColor: '#32d583', display: 'flex' }} />
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- rendered to PNG, not a page */}
            <img src={shot} width={660} height={325} style={{ objectFit: 'cover', objectPosition: 'left top' }} alt="" />
          </div>
        )}

        {/* Copy */}
        <div style={{ position: 'absolute', left: 72, top: 62, width: textWidth, display: 'flex', flexDirection: 'column' }}>
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element -- rendered to PNG, not a page
            <img src={logo} width={186} height={46} alt="" />
          )}
          <div style={{ display: 'flex', marginTop: 54 }}>
            <div
              style={{
                display: 'flex',
                padding: '9px 18px',
                borderRadius: 999,
                backgroundColor: 'rgba(8, 115, 63, 0.09)',
                border: '1px solid rgba(8, 115, 63, 0.22)',
                color: GREEN,
                fontSize: 21,
                fontWeight: 700,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
              }}
            >
              {card.eyebrow}
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: 22, fontSize: size, fontWeight: 700, lineHeight: 1.08, letterSpacing: -1.6, color: INK }}>
            {words.map((x, i) => (
              <span key={i} style={{ color: x.green ? GREEN : INK, marginRight: size * 0.2 }}>{x.w}</span>
            ))}
          </div>
          <div style={{ display: 'flex', marginTop: 22, fontSize: 26, lineHeight: 1.38, color: MUTED, fontWeight: 400, maxWidth: wide ? 820 : 580 }}>
            {card.sub}
          </div>
        </div>

        {/* Footer */}
        <div style={{ position: 'absolute', left: 72, bottom: 50, display: 'flex', alignItems: 'center', gap: 14, fontSize: 23 }}>
          <span style={{ color: GREEN, fontWeight: 700 }}>rovora.eu</span>
          <span style={{ width: 5, height: 5, borderRadius: 5, backgroundColor: '#98a2b3', display: 'flex' }} />
          <span style={{ color: MUTED }}>Get started free · No card required</span>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: 'Geist', data: regular, weight: 400, style: 'normal' },
        { name: 'Geist', data: bold, weight: 700, style: 'normal' },
      ],
      headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' },
    },
  );
}
