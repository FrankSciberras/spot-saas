import type jsPDF from 'jspdf';

// =============================================================================
// Fonts for generated PDFs
// =============================================================================
// jsPDF's built-in Helvetica can't be trusted with anything beyond plain ASCII:
//   • it writes no character widths, so each viewer falls back to its own —
//     Apple's (iPhone, iPad, Mac Preview) have none for "€", draw it with zero
//     width and print the next digit on top of it ("€1048.06" → "€048.06");
//   • it garbles Maltese letters (ħ ġ ż ċ) in driver names outright.
// An embedded TrueType font carries its own glyphs and widths, so every viewer
// shows the same thing. Geist is the dashboard's typeface (OFL, see
// public/fonts/pdf/LICENSE-Geist.txt).
//
// The TTFs are served from /fonts/pdf and fetched once, before the first
// export (loadPdfFonts). Documents created after that get them via
// registerPdfFonts; if the files can't be fetched, PDFs fall back to Helvetica
// rather than failing.
// =============================================================================

const FAMILY = 'Geist';
const FILES = {
  normal: { url: '/fonts/pdf/Geist-Regular.ttf', vfsName: 'Geist-Regular.ttf' },
  bold: { url: '/fonts/pdf/Geist-Bold.ttf', vfsName: 'Geist-Bold.ttf' },
} as const;

type FontStyle = keyof typeof FILES;

/** Base64 of each TTF once loaded; null until then (or if loading failed). */
let fontData: Record<FontStyle, string> | null = null;
let loading: Promise<boolean> | null = null;

/** The font family each document was set up with. */
const familyOf = new WeakMap<jsPDF, string>();

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Fetch the font files (once per page load). Resolves false if they couldn't be loaded. */
export function loadPdfFonts(): Promise<boolean> {
  if (fontData) return Promise.resolve(true);
  loading ??= (async () => {
    try {
      const styles = Object.keys(FILES) as FontStyle[];
      const data = await Promise.all(
        styles.map(async (style) => {
          const res = await fetch(FILES[style].url);
          if (!res.ok) throw new Error(`${FILES[style].url}: HTTP ${res.status}`);
          return toBase64(await res.arrayBuffer());
        })
      );
      fontData = Object.fromEntries(styles.map((style, i) => [style, data[i]])) as Record<FontStyle, string>;
      return true;
    } catch (error) {
      console.warn('PDF font could not be loaded — falling back to Helvetica:', error);
      return false;
    } finally {
      loading = null;
    }
  })();
  return loading;
}

/**
 * Embed the loaded fonts in a new document and select them. Returns the font
 * family to use with doc.setFont / autoTable styles ('helvetica' if the fonts
 * aren't loaded).
 */
export function registerPdfFonts(doc: jsPDF): string {
  let family = 'helvetica';
  if (fontData) {
    for (const style of Object.keys(FILES) as FontStyle[]) {
      doc.addFileToVFS(FILES[style].vfsName, fontData[style]);
      doc.addFont(FILES[style].vfsName, FAMILY, style);
    }
    family = FAMILY;
  }
  familyOf.set(doc, family);
  doc.setFont(family, 'normal');
  return family;
}

/** The font family a document was set up with by registerPdfFonts. */
export function pdfFont(doc: jsPDF): string {
  return familyOf.get(doc) ?? 'helvetica';
}
