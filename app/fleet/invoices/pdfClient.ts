// Browser-side PDF download. Imported lazily (it pulls in jsPDF) from the
// document view, so the invoice pages don't pay for it until someone clicks.

import { loadPdfFonts } from '@/lib/utils/pdfFonts';
import { invoicePdfFileName, renderInvoicePdf } from '@/lib/invoices/pdf';
import type { DocumentDetail } from '@/lib/invoices/types';

export async function downloadInvoicePdf(doc: DocumentDetail, locale: string): Promise<void> {
  // Embeds Geist so "€" and Maltese letters print correctly; falls back to
  // Helvetica (with a console warning) if the font files can't be fetched.
  await loadPdfFonts();
  renderInvoicePdf(doc, { locale }).save(invoicePdfFileName(doc));
}
