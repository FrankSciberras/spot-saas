import localFont from 'next/font/local';

/**
 * The site's typefaces, served from files in lib/fonts rather than fetched from
 * Google Fonts at build time. next/font/google downloads every font during
 * `next build`; when that request fails from the build server the whole deploy
 * fails ("Can't resolve '@vercel/turbopack-next/internal/font/google/font'"),
 * so the files now live in the repo. Same faces and weights as before — all
 * three include Maltese letters (ħ ġ ż ċ) and €. Licences: lib/fonts/LICENSE-*.
 */

/**
 * Geist + Geist Mono — the typefaces used across the Rovora marketing site,
 * auth screens and dashboard. Exposed as CSS variables (consumed by the
 * stylesheets as var(--font-geist) / var(--font-geist-mono)). Variable fonts:
 * one file covers every weight.
 */
export const geistSans = localFont({
  src: './fonts/Geist-Variable.woff2',
  weight: '100 900',
  variable: '--font-geist',
  display: 'swap',
});

export const geistMono = localFont({
  src: './fonts/GeistMono-Variable.woff2',
  weight: '100 900',
  variable: '--font-geist-mono',
  display: 'swap',
});

/** Combined className to drop on the `.rovora-site` wrapper element. */
export const rovoraFontVars = `${geistSans.variable} ${geistMono.variable}`;

/** Figtree — the base face for the whole app (applied on <body> in app/layout.tsx). */
export const figtree = localFont({
  src: [
    { path: './fonts/Figtree-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/Figtree-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/Figtree-600.woff2', weight: '600', style: 'normal' },
    { path: './fonts/Figtree-700.woff2', weight: '700', style: 'normal' },
  ],
  display: 'swap',
});
