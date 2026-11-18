// =============================================================================
// INVOICE & CREDIT NOTE PDF — one renderer for the browser and the server
// =============================================================================
// The same function draws the PDF a manager downloads (client) and the one
// attached to the email a customer receives (server), so the two can never
// differ. It therefore touches neither `window` nor `fs`:
//
//   browser — the caller awaits loadPdfFonts() first; registerPdfFonts() then
//             embeds Geist (see lib/utils/pdfFonts.ts for why Helvetica can't
//             be trusted with "€" or Maltese letters).
//   server  — the caller reads the two TTFs from public/fonts/pdf and passes
//             them in `opts.fonts` as base64.
//
// Everything printed comes from the SNAPSHOT on the document (seller_*,
// customer_*, payment_instructions, footer_note) and from figures the database
// computed at issue. A draft can be rendered too (it says DRAFT and shows the
// live customer), which is handy for a preview.
// =============================================================================

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatMoney, pdfText, type MoneyFormat } from '@/lib/money';
import { registerPdfFonts } from '@/lib/utils/pdfFonts';
import { fromCents, toCents } from './math';
import type { DocumentDetail } from './types';

export interface InvoicePdfOptions {
  /** Number style, e.g. 'en-IE' (the fleet's finance.number_format). */
  locale: string;
  /** Font family already registered on documents by the caller (rarely needed). */
  fontFamily?: string;
  /** Base64 TTFs to embed (server). Without them the browser-loaded fonts are used. */
  fonts?: { normal: string; bold: string };
}

type RGB = [number, number, number];

const INK: RGB = [17, 24, 39];
const MUTED: RGB = [107, 114, 128];
const FAINT: RGB = [156, 163, 175];
const RULE: RGB = [226, 229, 234];
const BAND: RGB = [246, 247, 249];

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 16;
const RIGHT = PAGE_W - MARGIN;
const CONTENT_W = PAGE_W - MARGIN * 2;
/** Nothing but the footer is drawn below this line. */
const BOTTOM = PAGE_H - 22;

const SERVER_FAMILY = 'Geist';

/** "2026-11-18" → "18 Nov 2026". */
export function formatPdfDate(date: string | null | undefined): string {
  if (!date) return '';
  const parsed = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(parsed)) return date;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(parsed);
}

/** "INV-0007 Hotel Calypso.pdf" — safe as a file name on every system. */
export function invoicePdfFileName(doc: Pick<DocumentDetail, 'kind' | 'number' | 'display_customer' | 'customer_name'>): string {
  const label = doc.number ?? (doc.kind === 'credit_note' ? 'Draft credit note' : 'Draft invoice');
  const customer = doc.customer_name ?? doc.display_customer ?? '';
  const base = `${label} ${customer}`
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .trim();
  return `${base || 'Invoice'}.pdf`;
}

function trimNumber(value: number, locale: string, maxDecimals: number): string {
  try {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: maxDecimals }).format(value);
  } catch {
    return String(value);
  }
}

const cents = (value: unknown): number => toCents(value as number | string) ?? 0;

export function renderInvoicePdf(detail: DocumentDetail, opts: InvoicePdfOptions): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  let family = opts.fontFamily;
  if (!family) {
    if (opts.fonts) {
      doc.addFileToVFS('Geist-Regular.ttf', opts.fonts.normal);
      doc.addFont('Geist-Regular.ttf', SERVER_FAMILY, 'normal');
      doc.addFileToVFS('Geist-Bold.ttf', opts.fonts.bold);
      doc.addFont('Geist-Bold.ttf', SERVER_FAMILY, 'bold');
      family = SERVER_FAMILY;
    } else {
      family = registerPdfFonts(doc);
    }
  }
  const font: string = family;

  const fmt: MoneyFormat = { currency: detail.currency || 'EUR', locale: opts.locale };
  const money = (c: number) => pdfText(formatMoney(fromCents(c), fmt));
  const isCredit = detail.kind === 'credit_note';
  const isDraft = detail.status === 'draft';
  const isVoid = detail.status === 'void';

  const set = (size: number, style: 'normal' | 'bold', color: RGB = INK) => {
    doc.setFont(font, style);
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
  };
  /** Line height in mm for a font size in pt. */
  const lh = (size: number) => size * 0.3528 * 1.38;
  const wrap = (text: string, width: number): string[] =>
    text
      .split(/\r?\n/)
      .flatMap((line) => (line.trim() === '' ? [''] : (doc.splitTextToSize(pdfText(line), width) as string[])));

  /** Draws wrapped text and returns the y just below it. */
  const block = (text: string, x: number, y: number, width: number, size: number, style: 'normal' | 'bold', color: RGB, align: 'left' | 'right' = 'left') => {
    set(size, style, color);
    const lines = wrap(text, width);
    let cursor = y;
    for (const line of lines) {
      doc.text(line, x, cursor, { align });
      cursor += lh(size);
    }
    return cursor;
  };

  // ── Header: seller on the left, title and number on the right ─────────────
  const sellerName = detail.seller_name ?? '';
  const title = isCredit ? 'CREDIT NOTE' : 'INVOICE';
  const leftW = 104;
  const rightW = CONTENT_W - leftW - 6;

  let leftY = MARGIN + 5;
  if (sellerName) leftY = block(sellerName, MARGIN, leftY, leftW, 13, 'bold', INK) + 0.6;
  if (detail.seller_address) leftY = block(detail.seller_address, MARGIN, leftY, leftW, 9, 'normal', MUTED);
  if (detail.seller_vat_number) leftY = block(`VAT no. ${detail.seller_vat_number}`, MARGIN, leftY, leftW, 9, 'normal', MUTED);
  const contact = [detail.seller_email, detail.seller_phone].filter(Boolean).join('  ·  ');
  if (contact) leftY = block(contact, MARGIN, leftY, leftW, 9, 'normal', MUTED);

  set(20, 'bold', INK);
  doc.text(title, RIGHT, MARGIN + 6.5, { align: 'right' });
  set(11, 'bold', isDraft ? MUTED : INK);
  doc.text(pdfText(detail.number ?? 'DRAFT'), RIGHT, MARGIN + 13, { align: 'right' });

  const meta: [string, string][] = [];
  if (detail.issue_date) meta.push([isCredit ? 'Date' : 'Issue date', formatPdfDate(detail.issue_date)]);
  if (!isCredit && detail.due_date) meta.push(['Due date', formatPdfDate(detail.due_date)]);
  if (detail.reference) meta.push(['Reference', detail.reference]);

  let rightY = MARGIN + 20;
  for (const [label, value] of meta) {
    set(9, 'normal', MUTED);
    doc.text(label, RIGHT - 48, rightY, { align: 'right' });
    set(9, 'normal', INK);
    // A long reference wraps onto further lines rather than being cut off.
    for (const line of (doc.splitTextToSize(pdfText(value), 45) as string[]).slice(0, 3)) {
      doc.text(line, RIGHT, rightY, { align: 'right' });
      rightY += lh(9);
    }
    rightY += 0.4;
  }

  let y = Math.max(leftY, rightY) + 5;
  doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
  doc.setLineWidth(0.25);
  doc.line(MARGIN, y, RIGHT, y);
  y += 8;

  // ── Bill to (and, on a credit note, what it corrects) ─────────────────────
  const customerName = detail.customer_name ?? detail.display_customer;
  const customerAddress = detail.customer_address ?? detail.customer?.address ?? null;
  const customerVat = detail.customer_vat_number ?? detail.customer?.vat_number ?? null;

  set(7.5, 'bold', FAINT);
  doc.text(isCredit ? 'CREDIT TO' : 'BILL TO', MARGIN, y);
  let billY = y + 5;
  billY = block(customerName, MARGIN, billY, leftW - 10, 11, 'bold', INK) + 0.4;
  if (customerAddress) billY = block(customerAddress, MARGIN, billY, leftW - 10, 9, 'normal', MUTED);
  if (customerVat) billY = block(`VAT no. ${customerVat}`, MARGIN, billY, leftW - 10, 9, 'normal', MUTED);

  let sideY = y;
  if (isCredit) {
    const sideX = MARGIN + leftW + 6;
    set(7.5, 'bold', FAINT);
    doc.text('CREDIT FOR', sideX, sideY);
    sideY += 5;
    const original = detail.credited_invoice;
    const originalText = original?.number
      ? `Invoice ${original.number}${original.issue_date ? ` dated ${formatPdfDate(original.issue_date)}` : ''}`
      : 'An earlier invoice';
    sideY = block(originalText, sideX, sideY, rightW, 9.5, 'bold', INK) + 0.4;
    if (detail.credit_reason) sideY = block(`Reason: ${detail.credit_reason}`, sideX, sideY, rightW, 9, 'normal', MUTED);
  }

  y = Math.max(billY, sideY) + 6;

  // ── Lines ─────────────────────────────────────────────────────────────────
  const body = detail.lines.map((line) => [
    pdfText(line.description),
    trimNumber(line.quantity, opts.locale, 3),
    money(cents(line.unit_price)),
    `${trimNumber(line.tax_rate, opts.locale, 2)}%`,
    money(cents(line.line_net)),
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN, top: MARGIN + 4, bottom: PAGE_H - BOTTOM },
    head: [['Description', 'Qty', 'Unit price', 'VAT', 'Amount']],
    body: body.length > 0 ? body : [['No lines yet', '', '', '', '']],
    theme: 'plain',
    styles: {
      font,
      fontSize: 9,
      textColor: INK,
      cellPadding: { top: 2.4, bottom: 2.4, left: 2, right: 2 },
      lineColor: RULE,
      lineWidth: 0,
      overflow: 'linebreak',
      valign: 'top',
    },
    headStyles: { font, fontStyle: 'bold', fontSize: 7.5, textColor: MUTED, fillColor: BAND, cellPadding: { top: 2.2, bottom: 2.2, left: 2, right: 2 } },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 16, halign: 'right' },
      2: { cellWidth: 27, halign: 'right' },
      3: { cellWidth: 14, halign: 'right' },
      4: { cellWidth: 29, halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.section === 'head' && data.column.index > 0) data.cell.styles.halign = 'right';
    },
    didDrawCell: (data) => {
      // A hairline under every body row.
      if (data.section === 'body') {
        doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
        doc.setLineWidth(0.15);
        doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
      }
    },
  });

  y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 7;

  /** Starts a new page when fewer than `needed` mm are left. */
  const ensure = (needed: number) => {
    if (y + needed > BOTTOM) {
      doc.addPage();
      y = MARGIN + 6;
    }
  };

  // ── VAT summary (left) and totals (right) ─────────────────────────────────
  const bands = new Map<number, { net: number; tax: number }>();
  for (const line of detail.lines) {
    const band = bands.get(line.tax_rate) ?? { net: 0, tax: 0 };
    band.net += cents(line.line_net);
    band.tax += cents(line.line_tax);
    bands.set(line.tax_rate, band);
  }
  const bandRows = [...bands.entries()].sort((a, b) => b[0] - a[0]);

  const totals: { label: string; value: string; strong?: boolean; rule?: boolean }[] = [
    { label: 'Subtotal', value: money(cents(detail.subtotal)) },
    { label: 'VAT', value: money(cents(detail.tax_total)) },
    { label: isCredit ? 'Total credit' : 'Total', value: money(cents(detail.total)), strong: true, rule: true },
  ];
  if (detail.status === 'issued') {
    if (isCredit) {
      if (detail.credited_cents > 0) {
        totals.push({ label: `Applied to invoice${detail.credited_invoice?.number ? ` ${detail.credited_invoice.number}` : ''}`, value: money(-detail.credited_cents) });
      }
      if (detail.paid_cents > 0) totals.push({ label: 'Refunded', value: money(-detail.paid_cents) });
      if (detail.credited_cents > 0 || detail.paid_cents > 0 || detail.balance_cents > 0) {
        totals.push({ label: 'Credit remaining', value: money(detail.balance_cents), strong: true, rule: true });
      }
    } else {
      if (detail.paid_cents > 0) totals.push({ label: 'Paid', value: money(-detail.paid_cents) });
      if (detail.credited_cents > 0) totals.push({ label: 'Credit notes', value: money(-detail.credited_cents) });
      totals.push({ label: 'Balance due', value: money(detail.balance_cents), strong: true, rule: true });
    }
  }

  const rowH = 5.6;
  const summaryH = 6 + (bandRows.length + 1) * 5 + 2;
  const totalsH = totals.length * rowH + totals.filter((t) => t.rule).length * 2 + 2;
  ensure(Math.max(summaryH, totalsH) + 2);

  const totalsW = 78;
  const totalsX = RIGHT - totalsW;
  let ty = y;
  for (const row of totals) {
    if (row.rule) {
      doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
      doc.setLineWidth(0.25);
      doc.line(totalsX, ty - 1.2, RIGHT, ty - 1.2);
      ty += 2;
    }
    const size = row.strong ? 10.5 : 9;
    set(size, row.strong ? 'bold' : 'normal', row.strong ? INK : MUTED);
    doc.text(pdfText(row.label), totalsX, ty + 2.6);
    set(size, row.strong ? 'bold' : 'normal', INK);
    doc.text(row.value, RIGHT, ty + 2.6, { align: 'right' });
    ty += rowH;
  }

  // VAT summary: always printed, so the tax per rate is on the face of the document.
  const sumW = 74;
  const col = [MARGIN, MARGIN + 36, MARGIN + sumW];
  let sy = y;
  set(7.5, 'bold', FAINT);
  doc.text('VAT SUMMARY', MARGIN, sy + 2.6);
  sy += 6;
  set(7.5, 'bold', MUTED);
  doc.text('Rate', col[0], sy + 2.4);
  doc.text('Net', col[1], sy + 2.4, { align: 'right' });
  doc.text('VAT', col[2], sy + 2.4, { align: 'right' });
  sy += 4.6;
  doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
  doc.setLineWidth(0.15);
  doc.line(MARGIN, sy, MARGIN + sumW, sy);
  sy += 1;
  for (const [rate, band] of bandRows) {
    set(8.5, 'normal', INK);
    doc.text(`${trimNumber(rate, opts.locale, 2)}%`, col[0], sy + 3);
    doc.text(money(band.net), col[1], sy + 3, { align: 'right' });
    doc.text(money(band.tax), col[2], sy + 3, { align: 'right' });
    sy += 5;
  }

  y = Math.max(ty, sy) + 8;

  // ── Notes, how to pay ─────────────────────────────────────────────────────
  const section = (heading: string, text: string) => {
    set(9, 'normal', INK);
    const lines = wrap(text, CONTENT_W);
    // Keep the heading with at least the first few lines.
    ensure(6 + Math.min(lines.length, 3) * lh(9));
    set(7.5, 'bold', FAINT);
    doc.text(heading, MARGIN, y);
    y += 4.6;
    for (const line of lines) {
      if (y + lh(9) > BOTTOM) {
        doc.addPage();
        y = MARGIN + 6;
      }
      set(9, 'normal', INK);
      doc.text(line, MARGIN, y);
      y += lh(9);
    }
    y += 5;
  };

  if (detail.notes) section('NOTES', detail.notes);
  // A voided invoice must not ask anyone to pay it.
  if (!isCredit && !isVoid && detail.payment_instructions) section('HOW TO PAY', detail.payment_instructions);

  // ── Every page: void watermark, footer note, page x of y ──────────────────
  const pages = doc.getNumberOfPages();
  const footer = detail.footer_note ? wrap(detail.footer_note, CONTENT_W - 30).slice(0, 2) : [];
  const gstate = doc as unknown as {
    GState?: new (options: { opacity: number }) => unknown;
    setGState?: (state: unknown) => void;
    saveGraphicsState?: () => void;
    restoreGraphicsState?: () => void;
  };

  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);

    if (isVoid || isDraft) {
      const canFade = Boolean(gstate.GState && gstate.setGState && gstate.saveGraphicsState && gstate.restoreGraphicsState);
      if (canFade) {
        gstate.saveGraphicsState!();
        gstate.setGState!(new gstate.GState!({ opacity: isVoid ? 0.13 : 0.07 }));
      }
      doc.setFont(font, 'bold');
      doc.setFontSize(isVoid ? 150 : 120);
      if (isVoid) doc.setTextColor(canFade ? 200 : 250, canFade ? 30 : 225, canFade ? 30 : 225);
      else doc.setTextColor(canFade ? 60 : 236, canFade ? 60 : 238, canFade ? 60 : 241);
      doc.text(isVoid ? 'VOID' : 'DRAFT', PAGE_W / 2, PAGE_H / 2 + 20, { align: 'center', angle: 35 });
      if (canFade) gstate.restoreGraphicsState!();
    }

    doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, PAGE_H - 16, RIGHT, PAGE_H - 16);
    set(7.5, 'normal', FAINT);
    let fy = PAGE_H - 11.5;
    for (const line of footer) {
      doc.text(line, MARGIN, fy);
      fy += lh(7.5);
    }
    const label = [detail.number, `Page ${page} of ${pages}`].filter(Boolean).join('  ·  ');
    doc.text(pdfText(label), RIGHT, PAGE_H - 11.5, { align: 'right' });
  }

  return doc;
}
