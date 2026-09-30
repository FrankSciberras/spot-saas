// =============================================================================
// Settlement PDFs
// =============================================================================
// Three exports share one set of building blocks:
//   exportSettlementsPdf             — fleet, one period (a week or a 4-week
//                                      cycle): one driver per page
//   exportMonthlySettlementsPdf      — fleet, one month: overview + a page per driver
//   exportDriverMonthlySettlementPdf — the driver's own month
//
// Every driver page leads with WHAT THE FLEET OWES. Each week is worth
// final_balance + total_adjustments to the driver — already after platform
// fees, cash the driver collected (when the preset deducts cash), tax and rent.
// The amount owed is the total of those weeks minus the weeks already marked
// paid. A negative amount is printed with a minus: the driver owes the fleet.
//
// Each driver gets exactly one page: the page is drawn at the roomiest
// density that fits (see drawOnOnePage) and only flows onto a second page
// when even the tightest density can't hold it.
// =============================================================================

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { DriverAdjustment, DriverSettlement, SettlementPlatform } from '@/lib/types/database';
import {
  COMPONENT_KEYS,
  DEFAULT_SCHEME,
  resolveComponents,
  type SettlementComponents,
} from '@/lib/config/settlements';
import { calculateAdjustmentsNet, signedAdjustmentAmount } from './adjustments';
import { formatCurrency, round2 } from './settlementCalculations';

// ── Input ────────────────────────────────────────────────────────────────────

/** One saved settlement, flattened for the PDFs. Build it with toPdfSettlement(). */
export interface PdfSettlement {
  id: string;
  driverId: string;
  driverName: string;
  weekStart: string;
  weekLabel: string;
  periodName: string | null;
  /** 'YYYY-MM' the settlement is filed under (settlement_month, else week_start). */
  monthKey: string;
  status: string;
  paidAt: string | null;
  notes: string | null;
  platforms: SettlementPlatform[];
  totalBalanceBeforeTax: number;
  fssTax: number;
  rentAmount: number;
  wageAmount: number;
  hoursWorked: number;
  /** Platform balances + wage − tax − rent (excludes adjustments). */
  finalBalance: number;
  /** Frozen net of the adjustments linked to this settlement. */
  totalAdjustments: number;
  /** The frozen component toggles this settlement was priced with. */
  components: SettlementComponents;
  driverSharePct: number;
  tipsDriverPct: number;
  campaignsDriverPct: number;
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function toPdfSettlement(
  s: DriverSettlement & { settlement_platforms?: SettlementPlatform[] | null },
  driverName: string
): PdfSettlement {
  return {
    id: s.id,
    driverId: s.driver_id,
    driverName,
    weekStart: (s.week_start || '').slice(0, 10),
    weekLabel: s.week_label,
    periodName: s.period_name,
    monthKey: (s.settlement_month || s.week_start || '').slice(0, 7),
    status: s.status,
    paidAt: s.paid_at,
    notes: s.notes,
    platforms: s.settlement_platforms ?? [],
    totalBalanceBeforeTax: num(s.total_balance_before_tax),
    fssTax: num(s.fss_tax),
    rentAmount: num(s.rent_amount),
    wageAmount: num(s.wage_amount),
    hoursWorked: num(s.hours_worked),
    finalBalance: num(s.final_balance),
    totalAdjustments: num(s.total_adjustments),
    components: resolveComponents(s.components),
    driverSharePct: num(s.driver_share_pct, DEFAULT_SCHEME.driverSharePct),
    tipsDriverPct: num(s.tips_driver_pct, DEFAULT_SCHEME.tipsDriverPct),
    campaignsDriverPct: num(s.campaigns_driver_pct, DEFAULT_SCHEME.campaignsDriverPct),
  };
}

/** What one settlement is worth to the driver: final balance + its adjustments. */
export function settlementPayable(s: Pick<PdfSettlement, 'finalBalance' | 'totalAdjustments'>): number {
  return round2(s.finalBalance + s.totalAdjustments);
}

// ── Amount owed ──────────────────────────────────────────────────────────────

export interface OwedWeek {
  label: string;
  status: string;
  /** Gross fares that week (context only). */
  gross?: number;
  /** What the week is worth to the driver (negative = driver owes the fleet). */
  amount: number;
  paidAt: string | null;
  /** The settlement this page is about (printed bold). */
  current?: boolean;
}

export interface OwedSummary {
  /** Sum of every week's amount. */
  earned: number;
  /** Sum of the weeks already marked paid. */
  paid: number;
  /** earned − paid: what the fleet still owes (negative = driver owes the fleet). */
  owed: number;
  weeks: number;
  paidWeeks: number;
  drafts: number;
}

export function summarizeOwed(weeks: OwedWeek[]): OwedSummary {
  const earned = round2(weeks.reduce((sum, w) => sum + w.amount, 0));
  const paidWeeks = weeks.filter((w) => !!w.paidAt);
  const paid = round2(paidWeeks.reduce((sum, w) => sum + w.amount, 0));
  return {
    earned,
    paid,
    owed: round2(earned - paid),
    weeks: weeks.length,
    paidWeeks: paidWeeks.length,
    drafts: weeks.filter((w) => w.status !== 'finalized').length,
  };
}

function owedWeeksOf(rows: PdfSettlement[], currentId?: string): OwedWeek[] {
  return [...rows]
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .map((s) => ({
      label: periodTitle(s),
      status: s.status,
      gross: round2(s.platforms.reduce((sum, p) => sum + num(p.gross_fare), 0)),
      amount: settlementPayable(s),
      paidAt: s.paidAt,
      current: s.id === currentId,
    }));
}

// ── Formatting ───────────────────────────────────────────────────────────────

type RGB = [number, number, number];
type Audience = 'fleet' | 'driver';

const MARGIN = 15;
/** Space kept clear at the bottom of every page for the footer. */
const FOOTER_SPACE = 16;
const TABLE_MARGIN = { left: MARGIN, right: MARGIN, top: MARGIN, bottom: FOOTER_SPACE };
const HEAD_STYLES = { fillColor: [66, 66, 66] as RGB, textColor: 255, fontStyle: 'bold' as const };
const TOTAL_FILL: RGB = [240, 240, 240];
const OWED_FILL: RGB = [220, 252, 231];
const OWES_FILL: RGB = [254, 226, 226];
const OWED_TEXT: RGB = [21, 128, 61];
const OWES_TEXT: RGB = [185, 28, 28];
const MUTED_TEXT: RGB = [110, 110, 110];

/** How tightly a page is set: table font (pt), cell padding and gap between sections (mm). */
interface Density {
  font: number;
  pad: number;
  gap: number;
}

/** Roomiest first; drawOnOnePage steps down until a driver fits on one page. */
const DENSITIES: Density[] = [
  { font: 8.5, pad: 1.3, gap: 6 },
  { font: 8, pad: 1, gap: 4.5 },
  { font: 7.2, pad: 0.7, gap: 3.5 },
];
const ROOMY = DENSITIES[0];

/** Height (mm) of one table row at this density. */
function rowMm(d: Density): number {
  return (d.font * 1.15 * 25.4) / 72 + d.pad * 2;
}

function tableStyles(d: Density) {
  return { fontSize: d.font, cellPadding: { top: d.pad, bottom: d.pad, left: 2, right: 2 } };
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** €12.50 / -€12.50 — the minus goes in front of the euro sign. */
function money(value: number): string {
  const v = round2(value);
  return v < 0 ? `-${formatCurrency(-v)}` : formatCurrency(v);
}

/** Always signed, for additions and adjustments: +€12.50 / -€12.50. */
function signedMoney(value: number): string {
  const v = round2(value);
  return v < 0 ? `-${formatCurrency(-v)}` : `+${formatCurrency(v)}`;
}

/** A deduction printed as a subtraction: -€12.50. */
function minusMoney(value: number): string {
  const v = Math.abs(round2(value));
  return v === 0 ? formatCurrency(0) : `-${formatCurrency(v)}`;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function periodTitle(s: { periodName: string | null; weekLabel: string }): string {
  return s.periodName ? `${s.periodName} (${s.weekLabel})` : s.weekLabel;
}

/** 'YYYY-MM' → 'September 2026'. */
function monthKeyLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  const name = MONTH_NAMES[(month || 0) - 1];
  return name ? `${name} ${year}` : key;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function fileSafe(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '_');
}

// ── Page furniture ───────────────────────────────────────────────────────────

function newDoc(): jsPDF {
  return new jsPDF('portrait', 'mm', 'a4');
}

function tableEndY(doc: jsPDF): number {
  return (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

function contentWidth(doc: jsPDF): number {
  return doc.internal.pageSize.getWidth() - MARGIN * 2;
}

/**
 * One compact header row: the title (and an optional status line) top-left,
 * the driver's name with the date under it top-right. Returns the y to continue from.
 */
function drawPageHeader(doc: jsPDF, title: string, name: string, date: string, status?: string): number {
  const right = doc.internal.pageSize.getWidth() - MARGIN;
  const top = MARGIN + 3;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(0);
  doc.text(title, MARGIN, top + 1);
  doc.setFontSize(12);
  doc.text(name, right, top, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(100);
  doc.text(date, right, top + 5.5, { align: 'right' });
  if (status) doc.text(status, MARGIN, top + 6.5);

  doc.setTextColor(0);
  return top + 11;
}

/** Start a new page when fewer than `needed` mm are left above the footer. */
function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed <= doc.internal.pageSize.getHeight() - FOOTER_SPACE) return y;
  doc.addPage();
  return MARGIN + 4;
}

/**
 * Bold section heading — moved to the next page rather than left orphaned.
 * `keepTogether` is the height of what follows; when it fits on a fresh page,
 * the whole section moves over instead of splitting.
 */
function sectionTitle(doc: jsPDF, text: string, y: number, keepTogether = 20): number {
  const usable = doc.internal.pageSize.getHeight() - FOOTER_SPACE - MARGIN - 6;
  const top = ensureSpace(doc, y + 3.5, Math.min(keepTogether, usable));
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(0);
  doc.text(text, MARGIN, top);
  return top + 1.8;
}

/** Small grey explanation under a table. Returns the y below it. */
function footnote(doc: jsPDF, text: string, y: number): number {
  const lineMm = 3.1;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const lines = doc.splitTextToSize(text, contentWidth(doc)) as string[];
  const top = ensureSpace(doc, y + 3.3, lines.length * lineMm);
  doc.setTextColor(...MUTED_TEXT);
  doc.text(lines, MARGIN, top);
  doc.setTextColor(0);
  return top + (lines.length - 1) * lineMm + 1;
}

/** The "amount owed" box at the top of a driver page. Returns the y below it. */
function drawOwedHeadline(doc: jsPDF, y: number, owed: number, label: string, detail: string): number {
  const width = contentWidth(doc);
  const height = 14;
  const top = ensureSpace(doc, y, height + 4);
  const negative = round2(owed) < 0;

  doc.setFillColor(...(negative ? OWES_FILL : OWED_FILL));
  doc.roundedRect(MARGIN, top, width, height, 2, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(0);
  doc.text(label, MARGIN + 5, top + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(80);
  doc.text(detail, MARGIN + 5, top + 10.6, { maxWidth: width * 0.68 });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...(negative ? OWES_TEXT : OWED_TEXT));
  doc.text(money(owed), MARGIN + width - 5, top + 9.3, { align: 'right' });

  doc.setTextColor(0);
  return top + height;
}

function drawFooters(doc: jsPDF): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const generated = `Generated on ${new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
  const count = doc.getNumberOfPages();
  for (let i = 1; i <= count; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(generated, MARGIN, pageHeight - 9);
    doc.text(`Page ${i} of ${count}`, pageWidth - MARGIN, pageHeight - 9, { align: 'right' });
  }
  doc.setTextColor(0);
}

/**
 * Draw one driver's page at the roomiest density that fits on a single page:
 * each density is tried on a scratch document first. If nothing fits (a very
 * long month), the tightest density is used and the page flows on.
 */
function drawOnOnePage(doc: jsPDF, draw: (target: jsPDF, d: Density) => void): void {
  for (const d of DENSITIES) {
    const probe = newDoc();
    draw(probe, d);
    if (probe.getNumberOfPages() === 1) {
      draw(doc, d);
      return;
    }
  }
  draw(doc, DENSITIES[DENSITIES.length - 1]);
}

// ── Pay lines ────────────────────────────────────────────────────────────────

interface PlatformLines {
  gross: number;
  share: number;
  fee: number;
  net: number;
  /** Cash the driver holds, when the settlement deducts it. */
  cash: number;
  /** Tips / campaigns after the driver's % — what actually reached the balance. */
  tips: number;
  campaigns: number;
  balance: number;
}

/** One platform row's lines, exactly as calculatePlatformEarnings priced them. */
function platformLines(p: SettlementPlatform, s: PdfSettlement): PlatformLines {
  const c = s.components;
  return {
    gross: num(p.gross_fare),
    share: num(p.fifty_percent),
    fee: num(p.fee),
    net: num(p.net),
    cash: c.cash ? num(p.cash_ride) : 0,
    tips: c.tips ? round2(num(p.tips) * (s.tipsDriverPct / 100)) : 0,
    campaigns: c.campaigns ? round2(num(p.campaigns) * (s.campaignsDriverPct / 100)) : 0,
    balance: num(p.balance),
  };
}

interface PayLines extends PlatformLines {
  wage: number;
  hours: number;
  balanceBeforeTax: number;
  tax: number;
  rent: number;
  adjustments: number;
  payable: number;
  /** Components switched on in at least one of the settlements. */
  on: SettlementComponents;
}

function payLinesOf(rows: PdfSettlement[]): PayLines {
  const on = Object.fromEntries(COMPONENT_KEYS.map((k) => [k, false])) as SettlementComponents;
  const t = {
    gross: 0, share: 0, fee: 0, net: 0, cash: 0, tips: 0, campaigns: 0, balance: 0,
    wage: 0, hours: 0, balanceBeforeTax: 0, tax: 0, rent: 0, adjustments: 0, payable: 0,
  };
  for (const s of rows) {
    for (const key of COMPONENT_KEYS) {
      if (s.components[key]) on[key] = true;
    }
    for (const p of s.platforms) {
      const l = platformLines(p, s);
      t.gross += l.gross;
      t.share += l.share;
      t.fee += l.fee;
      t.net += l.net;
      t.cash += l.cash;
      t.tips += l.tips;
      t.campaigns += l.campaigns;
      t.balance += l.balance;
    }
    t.wage += s.wageAmount;
    t.hours += s.hoursWorked;
    t.balanceBeforeTax += s.totalBalanceBeforeTax;
    t.tax += s.fssTax;
    t.rent += s.rentAmount;
    t.adjustments += s.totalAdjustments;
    t.payable += settlementPayable(s);
  }
  const rounded = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, round2(v)])) as typeof t;
  return { ...rounded, on };
}

/** Whether the per-platform table has anything to show (pure-wage fleets may have no fares). */
function hasPlatformEarnings(l: PayLines): boolean {
  return l.gross !== 0 || l.cash !== 0 || l.tips !== 0 || l.campaigns !== 0;
}

/** The shared % when every settlement used the same one, else null. */
function uniformPct(rows: PdfSettlement[], pick: (s: PdfSettlement) => number): number | null {
  if (rows.length === 0) return null;
  const first = round2(pick(rows[0]));
  return rows.every((s) => round2(pick(s)) === first) ? first : null;
}

function withPct(label: string, pct: number | null): string {
  return pct !== null && pct < 100 ? `${label} (${pct}%)` : label;
}

interface SummaryRow {
  label: string;
  value: string;
  tone?: 'subtotal' | 'result';
}

/**
 * From the platform balance down to what the driver is owed. The fares, fees,
 * cash, tips and campaigns behind the platform balance are itemised in the
 * platform table, so they aren't repeated here. Every line adds up to the result.
 */
function payLineRows(rows: PdfSettlement[], resultLabel: string): SummaryRow[] {
  const l = payLinesOf(rows);
  const out: SummaryRow[] = [];

  if (hasPlatformEarnings(l)) out.push({ label: 'Platform balance (from the table above)', value: money(l.balance) });
  if (l.wage > 0 || l.on.hours || l.on.fixed) {
    out.push({ label: l.hours > 0 ? `Wage (${l.hours}h)` : 'Wage', value: signedMoney(l.wage) });
  }
  // One line above already IS the balance before tax; repeat it only as a subtotal of two.
  if (out.length !== 1) out.push({ label: 'Balance before tax', value: money(l.balanceBeforeTax), tone: 'subtotal' });
  if (l.on.tax || l.tax > 0) out.push({ label: 'FSS / Tax', value: minusMoney(l.tax) });
  if (l.rent > 0) out.push({ label: 'Vehicle rent', value: minusMoney(l.rent) });
  if (l.adjustments !== 0) out.push({ label: 'Driver adjustments', value: signedMoney(l.adjustments) });
  out.push({ label: resultLabel, value: money(l.payable), tone: 'result' });
  return out;
}

// ── Tables ───────────────────────────────────────────────────────────────────

function drawSummaryTable(
  doc: jsPDF,
  rows: PdfSettlement[],
  title: string,
  resultLabel: string,
  startY: number,
  d: Density
): number {
  const width = contentWidth(doc);
  const negative = payLinesOf(rows).payable < 0;
  const summary = payLineRows(rows, resultLabel);
  const top = sectionTitle(doc, title, startY, 6 + summary.length * rowMm(d));
  autoTable(doc, {
    startY: top,
    body: summary.map((r) => [r.label, r.value]),
    margin: TABLE_MARGIN,
    styles: tableStyles(d),
    columnStyles: {
      0: { halign: 'left', cellWidth: width * 0.65 },
      1: { halign: 'right', cellWidth: width * 0.35 },
    },
    didParseCell: (data) => {
      const tone = summary[data.row.index]?.tone;
      if (tone === 'subtotal') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = TOTAL_FILL;
      } else if (tone === 'result') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fontSize = d.font + 1;
        data.cell.styles.fillColor = negative ? OWES_FILL : OWED_FILL;
      }
    },
  });
  return tableEndY(doc);
}

/** Per-platform earnings (summed over the given settlements). Null when there are no fares at all. */
function drawPlatformTable(doc: jsPDF, rows: PdfSettlement[], title: string, startY: number, d: Density): number | null {
  const lines = payLinesOf(rows);
  if (!hasPlatformEarnings(lines)) return null;

  const byPlatform = new Map<string, PlatformLines & { name: string }>();
  for (const s of rows) {
    for (const p of s.platforms) {
      const key = p.platform_id || p.platform_name;
      const cur = byPlatform.get(key) ?? {
        name: p.platform_name, gross: 0, share: 0, fee: 0, net: 0, cash: 0, tips: 0, campaigns: 0, balance: 0,
      };
      const l = platformLines(p, s);
      cur.gross += l.gross;
      cur.share += l.share;
      cur.fee += l.fee;
      cur.net += l.net;
      cur.cash += l.cash;
      cur.tips += l.tips;
      cur.campaigns += l.campaigns;
      cur.balance += l.balance;
      byPlatform.set(key, cur);
    }
  }

  const on = lines.on;
  const sharePct = uniformPct(rows, (s) => s.driverSharePct);
  const columns: { title: string; cell: (a: PlatformLines) => string }[] = [
    ...(on.share || on.fee || lines.gross > 0 ? [{ title: 'Gross', cell: (a: PlatformLines) => money(a.gross) }] : []),
    ...(on.share ? [{ title: sharePct !== null ? `Share ${sharePct}%` : 'Share', cell: (a: PlatformLines) => money(a.share) }] : []),
    ...(on.fee ? [{ title: 'Fee', cell: (a: PlatformLines) => minusMoney(a.fee) }] : []),
    ...(on.share || on.fee ? [{ title: 'Net', cell: (a: PlatformLines) => money(a.net) }] : []),
    ...(on.cash ? [{ title: 'Cash kept', cell: (a: PlatformLines) => minusMoney(a.cash) }] : []),
    ...(on.tips ? [{ title: withPct('Tips', uniformPct(rows, (s) => s.tipsDriverPct)), cell: (a: PlatformLines) => signedMoney(a.tips) }] : []),
    ...(on.campaigns
      ? [{ title: withPct('Campaigns', uniformPct(rows, (s) => s.campaignsDriverPct)), cell: (a: PlatformLines) => signedMoney(a.campaigns) }]
      : []),
    { title: 'Balance', cell: (a) => money(a.balance) },
  ];

  const platforms = [...byPlatform.values()].sort((a, b) => a.name.localeCompare(b.name));
  const body = [
    ...platforms.map((a) => [a.name, ...columns.map((c) => c.cell(a))]),
    ['TOTAL', ...columns.map((c) => c.cell(lines))],
  ];

  const width = contentWidth(doc);
  const columnStyles: Record<number, { halign: 'left' | 'right'; cellWidth?: number }> = {
    0: { halign: 'left', cellWidth: width * 0.17 },
  };
  columns.forEach((_, i) => {
    columnStyles[i + 1] = { halign: 'right' };
  });

  const top = sectionTitle(doc, title, startY, 6 + (body.length + 1) * rowMm(d));
  autoTable(doc, {
    startY: top,
    head: [['Platform', ...columns.map((c) => c.title)]],
    body,
    margin: TABLE_MARGIN,
    styles: tableStyles(d),
    headStyles: HEAD_STYLES,
    columnStyles,
    didParseCell: (data) => {
      if (data.section === 'head' && data.column.index > 0) data.cell.styles.halign = 'right';
      if (data.section === 'body' && data.row.index === body.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = TOTAL_FILL;
      }
    },
  });
  return tableEndY(doc);
}

/** The itemised driver adjustments (fuel, fines, bonuses…). Null when there are none. */
function drawAdjustmentsTable(
  doc: jsPDF,
  adjustments: DriverAdjustment[],
  title: string,
  startY: number,
  d: Density
): number | null {
  if (adjustments.length === 0) return null;
  const sorted = [...adjustments].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const body = sorted.map((a) => [
    a.date,
    a.type.charAt(0).toUpperCase() + a.type.slice(1),
    a.description,
    signedMoney(signedAdjustmentAmount(a.type, a.amount)),
  ]);
  body.push(['', '', 'TOTAL', signedMoney(calculateAdjustmentsNet(sorted))]);

  const width = contentWidth(doc);
  const top = sectionTitle(doc, title, startY, 6 + (body.length + 1) * rowMm(d));
  autoTable(doc, {
    startY: top,
    head: [['Date', 'Type', 'Description', 'Amount']],
    body,
    margin: TABLE_MARGIN,
    styles: tableStyles(d),
    headStyles: HEAD_STYLES,
    columnStyles: {
      0: { halign: 'left', cellWidth: width * 0.14 },
      1: { halign: 'left', cellWidth: width * 0.16 },
      2: { halign: 'left', cellWidth: width * 0.5 },
      3: { halign: 'right', cellWidth: width * 0.2 },
    },
    didParseCell: (data) => {
      if (data.section === 'head' && data.column.index === 3) data.cell.styles.halign = 'right';
      if (data.section === 'body' && data.row.index === body.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = TOTAL_FILL;
      }
    },
  });
  return tableEndY(doc);
}

/**
 * The payment statement: every week with its amount and whether it was paid,
 * then total earned, less already paid = still owed.
 */
function drawOwedStatement(
  doc: jsPDF,
  weeks: OwedWeek[],
  title: string,
  owedLabel: string,
  startY: number,
  d: Density
): number {
  const t = summarizeOwed(weeks);
  const showGross = weeks.some((w) => (w.gross ?? 0) !== 0);
  const grossCell = (value: number) => (showGross ? [money(value)] : []);

  const body = weeks.map((w) => [
    w.label,
    w.status === 'finalized' ? 'Finalized' : 'Draft',
    ...grossCell(w.gross ?? 0),
    money(w.amount),
    w.paidAt ? `Paid ${shortDate(w.paidAt)}` : 'Not paid yet',
  ]);
  const firstTotal = body.length;
  const blank = showGross ? ['', ''] : [''];
  body.push(['Total earned', '', ...grossCell(weeks.reduce((sum, w) => sum + (w.gross ?? 0), 0)), money(t.earned), '']);
  body.push(['Less: already paid', ...blank, money(t.paid), '']);
  body.push([owedLabel, ...blank, money(t.owed), '']);

  const width = contentWidth(doc);
  const amountCol = showGross ? 3 : 2;
  const widths = showGross ? [0.4, 0.12, 0.14, 0.14, 0.2] : [0.46, 0.14, 0.18, 0.22];
  const columnStyles: Record<number, { halign: 'left' | 'right'; cellWidth: number }> = {};
  widths.forEach((w, i) => {
    columnStyles[i] = { halign: i >= 2 && i <= amountCol ? 'right' : 'left', cellWidth: width * w };
  });

  const top = sectionTitle(doc, title, startY, 6 + (body.length + 1) * rowMm(d));
  autoTable(doc, {
    startY: top,
    head: [['Week', 'Status', ...(showGross ? ['Gross'] : []), 'Amount', 'Paid']],
    body,
    margin: TABLE_MARGIN,
    styles: tableStyles(d),
    headStyles: HEAD_STYLES,
    columnStyles,
    didParseCell: (data) => {
      const col = data.column.index;
      if (data.section === 'head') {
        if (col >= 2 && col <= amountCol) data.cell.styles.halign = 'right';
        return;
      }
      const i = data.row.index;
      if (i < firstTotal) {
        const week = weeks[i];
        if (week.current) data.cell.styles.fontStyle = 'bold';
        if (col === amountCol && week.amount < 0) data.cell.styles.textColor = OWES_TEXT;
        if (col === amountCol + 1) data.cell.styles.textColor = week.paidAt ? OWED_TEXT : MUTED_TEXT;
        return;
      }
      data.cell.styles.fontStyle = 'bold';
      if (i === body.length - 1) {
        data.cell.styles.fontSize = d.font + 1;
        data.cell.styles.fillColor = t.owed < 0 ? OWES_FILL : OWED_FILL;
      } else {
        data.cell.styles.fillColor = TOTAL_FILL;
      }
    },
  });
  return tableEndY(doc);
}

/** Plain-English note under the statement: what each amount already includes. */
function owedFootnote(rows: PdfSettlement[], weeks: OwedWeek[], audience: Audience): string {
  const l = payLinesOf(rows);
  const parts: string[] = [];
  if (l.on.fee && l.fee > 0) parts.push('platform fees');
  if (l.on.cash) parts.push(audience === 'driver' ? 'the cash you already collected' : 'the cash the driver already collected');
  if (l.tax > 0) parts.push('tax');
  if (l.rent > 0) parts.push('vehicle rent');
  if (l.adjustments !== 0) parts.push('adjustments');

  const t = summarizeOwed(weeks);
  const sentences = [
    parts.length > 0
      ? `Each amount is already after ${joinList(parts)}.`
      : 'Each amount is what the week is worth to the driver.',
    'Still owed = total earned less the weeks already marked as paid.',
    audience === 'driver' ? 'A minus means you owe the fleet.' : 'A minus means the driver owes the fleet.',
  ];
  if (t.drafts > 0) {
    sentences.push(`Includes ${t.drafts} draft ${t.drafts === 1 ? 'week' : 'weeks'} that may still change.`);
  }
  return sentences.join(' ');
}

// ── Driver pages ─────────────────────────────────────────────────────────────

/**
 * One driver, one settlement period. `monthRows` are the driver's settlements
 * in the same month up to and including this one — they feed the "owed so far"
 * statement, so earlier unpaid (or negative) weeks carry into what's owed.
 */
function drawPeriodDriverPage(
  doc: jsPDF,
  s: PdfSettlement,
  monthRows: PdfSettlement[],
  adjustments: DriverAdjustment[],
  d: Density
): void {
  const status = `${s.status === 'finalized' ? 'Finalized' : 'Draft'} · ${s.paidAt ? `Paid ${shortDate(s.paidAt)}` : 'Not paid yet'}`;
  let y = drawPageHeader(doc, 'Driver Settlement', s.driverName, periodTitle(s), status);

  const weeks = owedWeeksOf(monthRows, s.id);
  const t = summarizeOwed(weeks);
  const month = monthKeyLabel(s.monthKey);
  const detail = weeks.length > 1
    ? `${month} so far: earned ${money(t.earned)}, already paid ${money(t.paid)}`
    : s.paidAt
      ? `This period was paid on ${shortDate(s.paidAt)}`
      : 'This period has not been paid yet';
  y = drawOwedHeadline(doc, y, t.owed, 'Amount owed to driver', detail) + d.gap - 2;

  let n = 1;
  const platformEnd = drawPlatformTable(doc, [s], `${n}. Earnings by platform`, y, d);
  if (platformEnd !== null) {
    n++;
    y = platformEnd + d.gap;
  }

  const adjustmentsEnd = drawAdjustmentsTable(doc, adjustments, `${n}. Driver adjustments`, y, d);
  if (adjustmentsEnd !== null) {
    n++;
    y = adjustmentsEnd + d.gap;
  }

  y = drawSummaryTable(doc, [s], `${n++}. This period`, 'PAYABLE FOR THIS PERIOD', y, d) + d.gap;

  y = drawOwedStatement(doc, weeks, `${n++}. Amount owed - ${month} so far`, 'STILL OWED TO DRIVER', y, d);
  y = footnote(doc, owedFootnote(monthRows, weeks, 'fleet'), y) + d.gap;

  if (s.notes) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(d.font);
    const lines = doc.splitTextToSize(s.notes, contentWidth(doc)) as string[];
    y = ensureSpace(doc, y + 2, 5 + lines.length * 3.8);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text('Notes:', MARGIN, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(d.font);
    doc.text(lines, MARGIN, y + 4.5);
  }
}

/** One driver, one month: owed headline, platform earnings, summary, payment statement. */
function drawMonthDriverPage(
  doc: jsPDF,
  driverName: string,
  monthLabel: string,
  rows: PdfSettlement[],
  adjustments: DriverAdjustment[],
  audience: Audience,
  d: Density
): void {
  let y = drawPageHeader(doc, 'Monthly Settlement', driverName, monthLabel);

  const weeks = owedWeeksOf(rows);
  const t = summarizeOwed(weeks);
  y = drawOwedHeadline(
    doc,
    y,
    t.owed,
    audience === 'driver' ? 'Amount owed to you' : 'Amount owed to driver',
    `Earned ${money(t.earned)} this month, already paid ${money(t.paid)} (${t.paidWeeks} of ${t.weeks} ${t.weeks === 1 ? 'week' : 'weeks'})`
  ) + d.gap - 2;

  let n = 1;
  const platformEnd = drawPlatformTable(doc, rows, `${n}. Earnings by platform`, y, d);
  if (platformEnd !== null) {
    n++;
    y = platformEnd + d.gap;
  }

  const adjustmentsEnd = drawAdjustmentsTable(doc, adjustments, `${n}. Driver adjustments`, y, d);
  if (adjustmentsEnd !== null) {
    n++;
    y = adjustmentsEnd + d.gap;
  }

  y = drawSummaryTable(doc, rows, `${n++}. Month summary`, 'TOTAL EARNED THIS MONTH', y, d) + d.gap;

  y = drawOwedStatement(
    doc,
    weeks,
    `${n++}. Payments & amount owed`,
    audience === 'driver' ? 'STILL OWED TO YOU' : 'STILL OWED TO DRIVER',
    y,
    d
  );
  footnote(doc, owedFootnote(rows, weeks, audience), y);
}

function groupByDriver(rows: PdfSettlement[]): { driverName: string; rows: PdfSettlement[] }[] {
  const map = new Map<string, { driverName: string; rows: PdfSettlement[] }>();
  for (const s of rows) {
    const key = s.driverId || s.driverName;
    const cur = map.get(key);
    if (cur) cur.rows.push(s);
    else map.set(key, { driverName: s.driverName, rows: [s] });
  }
  return [...map.values()].sort((a, b) => a.driverName.localeCompare(b.driverName));
}

function adjustmentsFor(rows: PdfSettlement[], bySettlement: Record<string, DriverAdjustment[]> | undefined): DriverAdjustment[] {
  return rows.flatMap((s) => bySettlement?.[s.id] ?? []);
}

// ── Exports ──────────────────────────────────────────────────────────────────

interface PeriodPdfOptions {
  periodLabel: string;
  periodName: string | null;
  /** This period's settlements, one per driver. */
  settlements: PdfSettlement[];
  /**
   * The same drivers' other settlements. Earlier weeks in the same month feed
   * the "amount owed so far" statement; without them it covers this period only.
   */
  history?: PdfSettlement[];
  /** Frozen adjustments, keyed by settlement id. */
  adjustmentsBySettlement?: Record<string, DriverAdjustment[]>;
}

/** One settlement period: a page per driver. */
export function buildSettlementsPdf(options: PeriodPdfOptions): jsPDF {
  const { settlements, history = [], adjustmentsBySettlement } = options;
  const doc = newDoc();
  const ordered = [...settlements].sort((a, b) => a.driverName.localeCompare(b.driverName));

  ordered.forEach((s, index) => {
    if (index > 0) doc.addPage();
    const earlier = history.filter(
      (h) => h.driverId === s.driverId && h.monthKey === s.monthKey && h.weekStart < s.weekStart && h.id !== s.id
    );
    const adjustments = adjustmentsBySettlement?.[s.id] ?? [];
    drawOnOnePage(doc, (target, d) => drawPeriodDriverPage(target, s, [...earlier, s], adjustments, d));
  });

  drawFooters(doc);
  return doc;
}

export function exportSettlementsPdf(options: PeriodPdfOptions): void {
  if (options.settlements.length === 0) {
    alert('No settlements to export');
    return;
  }
  const doc = buildSettlementsPdf(options);
  doc.save(`Settlements_${fileSafe(options.periodName || options.periodLabel)}.pdf`);
}

interface MonthPdfOptions {
  monthLabel: string;
  /** Every settlement filed under the month. */
  settlements: PdfSettlement[];
  /** Frozen adjustments, keyed by settlement id. */
  adjustmentsBySettlement?: Record<string, DriverAdjustment[]>;
}

/** One month for the whole fleet: an overview of what's owed, then a page per driver. */
export function buildMonthlySettlementsPdf(options: MonthPdfOptions): jsPDF {
  const { monthLabel, settlements, adjustmentsBySettlement } = options;
  const doc = newDoc();
  const width = contentWidth(doc);
  const drivers = groupByDriver(settlements).map((d) => {
    const weeks = owedWeeksOf(d.rows);
    return { ...d, weeks, totals: summarizeOwed(weeks) };
  });

  // Overview page.
  let y = drawPageHeader(
    doc,
    'Monthly Settlements',
    monthLabel,
    `${drivers.length} ${drivers.length === 1 ? 'driver' : 'drivers'}`
  );

  // Money owed to one driver can't be offset against another driver's debt,
  // so the headline sums only the positive balances.
  const owedToDrivers = round2(drivers.reduce((sum, d) => sum + Math.max(0, d.totals.owed), 0));
  const owedByDrivers = round2(drivers.reduce((sum, d) => sum + Math.min(0, d.totals.owed), 0));
  const owingCount = drivers.filter((d) => d.totals.owed > 0).length;
  const detail = owedByDrivers < 0
    ? `${owingCount} ${owingCount === 1 ? 'driver' : 'drivers'} still to pay · drivers owing the fleet: ${money(owedByDrivers)}`
    : `${owingCount} ${owingCount === 1 ? 'driver' : 'drivers'} still to pay`;
  y = drawOwedHeadline(doc, y, owedToDrivers, 'Total owed to drivers', detail) + 6;

  const all = summarizeOwed(drivers.flatMap((d) => d.weeks));
  const body = [
    ...drivers.map((d) => [
      d.driverName,
      `${d.totals.paidWeeks}/${d.totals.weeks}`,
      money(d.totals.earned),
      money(d.totals.paid),
      money(d.totals.owed),
    ]),
    ['TOTAL', `${all.paidWeeks}/${all.weeks}`, money(all.earned), money(all.paid), money(all.owed)],
  ];

  autoTable(doc, {
    startY: y,
    head: [['Driver', 'Weeks paid', 'Earned', 'Already paid', 'Owed to driver']],
    body,
    margin: TABLE_MARGIN,
    styles: tableStyles(ROOMY),
    headStyles: HEAD_STYLES,
    columnStyles: {
      0: { halign: 'left', cellWidth: width * 0.34 },
      1: { halign: 'center', cellWidth: width * 0.12 },
      2: { halign: 'right', cellWidth: width * 0.18 },
      3: { halign: 'right', cellWidth: width * 0.18 },
      4: { halign: 'right', cellWidth: width * 0.18 },
    },
    didParseCell: (data) => {
      if (data.section === 'head') {
        if (data.column.index === 1) data.cell.styles.halign = 'center';
        if (data.column.index >= 2) data.cell.styles.halign = 'right';
        return;
      }
      const isTotal = data.row.index === body.length - 1;
      if (isTotal) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = TOTAL_FILL;
      }
      if (data.column.index === 4) {
        const owed = isTotal ? all.owed : drivers[data.row.index].totals.owed;
        data.cell.styles.fontStyle = 'bold';
        if (owed < 0) data.cell.styles.textColor = OWES_TEXT;
      }
    },
  });
  footnote(doc, owedFootnote(settlements, drivers.flatMap((d) => d.weeks), 'fleet'), tableEndY(doc));

  for (const driver of drivers) {
    doc.addPage();
    const adjustments = adjustmentsFor(driver.rows, adjustmentsBySettlement);
    drawOnOnePage(doc, (target, d) =>
      drawMonthDriverPage(target, driver.driverName, monthLabel, driver.rows, adjustments, 'fleet', d)
    );
  }

  drawFooters(doc);
  return doc;
}

export function exportMonthlySettlementsPdf(options: MonthPdfOptions): void {
  if (options.settlements.length === 0) {
    alert('No settlements to export');
    return;
  }
  const doc = buildMonthlySettlementsPdf(options);
  doc.save(`Settlements_${fileSafe(options.monthLabel)}.pdf`);
}

interface DriverMonthPdfOptions {
  driverName: string;
  monthLabel: string;
  settlements: PdfSettlement[];
  driverAdjustments?: DriverAdjustment[];
}

/** The driver's own month, from the driver app. */
export function buildDriverMonthlySettlementPdf(options: DriverMonthPdfOptions): jsPDF {
  const doc = newDoc();
  drawOnOnePage(doc, (target, d) =>
    drawMonthDriverPage(
      target,
      options.driverName,
      options.monthLabel,
      options.settlements,
      options.driverAdjustments ?? [],
      'driver',
      d
    )
  );
  drawFooters(doc);
  return doc;
}

export function exportDriverMonthlySettlementPdf(options: DriverMonthPdfOptions): void {
  if (options.settlements.length === 0) {
    alert('No settlements to export');
    return;
  }
  const doc = buildDriverMonthlySettlementPdf(options);
  doc.save(`Settlement_${fileSafe(options.driverName)}_${fileSafe(options.monthLabel)}.pdf`);
}
