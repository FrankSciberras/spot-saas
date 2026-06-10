import { Geist, Geist_Mono } from 'next/font/google';

/**
 * Geist + Geist Mono — the typefaces used across the Rovora marketing site,
 * auth screens and dashboard. Exposed as CSS variables (consumed by the
 * stylesheets as var(--font-geist) / var(--font-geist-mono)).
 */
export const geistSans = Geist({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-geist',
  display: 'swap',
});

export const geistMono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-geist-mono',
  display: 'swap',
});

/** Combined className to drop on the `.rovora-site` wrapper element. */
export const rovoraFontVars = `${geistSans.variable} ${geistMono.variable}`;
