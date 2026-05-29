import { Geist, Geist_Mono } from 'next/font/google';

/**
 * Geist + Geist Mono — the typefaces used by the Spot marketing site
 * and auth screens. Exposed as CSS variables consumed by spot-site.css.
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

/** Combined className to drop on the `.spot-site` wrapper element. */
export const spotFontVars = `${geistSans.variable} ${geistMono.variable}`;
