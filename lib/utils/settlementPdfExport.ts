import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { DriverAdjustment, SettlementPlatform } from '@/lib/types/database';
import { formatCurrency, round2 } from './settlementCalculations';

function signedAdjustmentAmount(type: DriverAdjustment['type'], amount: number): number {
  if (type === 'expense' || type === 'deduction') return -amount;
  if (type === 'bonus' || type === 'reimbursement') return amount;
  return 0;
}

function calculateAdjustmentsNet(adjustments: DriverAdjustment[]): number {
  return adjustments.reduce((sum, adj) => sum + signedAdjustmentAmount(adj.type, Number(adj.amount) || 0), 0);
}

function formatSignedCurrency(value: number): string {
  const abs = Math.abs(value);
  return `${value >= 0 ? '+' : '-'}${formatCurrency(abs)}`;
}

interface DriverSettlementData {
  driverName: string;
  weekLabel: string;
  periodName: string | null;
  platforms: SettlementPlatform[];
  totalGrossFare: number;
  totalFiftyPercent: number;
  totalFee: number;
  totalNet: number;
  totalCashRide: number;
  totalTips: number;
  totalCampaigns: number;
  totalBalanceBeforeTax: number;
  fssTax: number;
  finalBalance: number;
  /** Wage line (hourly + fixed) for wage-based presets. 0/undefined = none. */
  wageAmount?: number;
  hoursWorked?: number;
  /** Weekly vehicle rent deducted. 0/undefined = none. */
  rentAmount?: number;
  driverAdjustments?: DriverAdjustment[];
  driverAdjustmentsNet?: number;
  status: string;
  paidAt: string | null;
  notes: string | null;
}

interface ExportOptions {
  periodLabel: string;
  periodName: string | null;
  settlements: DriverSettlementData[];
}

/**
 * Export weekly settlements to PDF - one page per driver with 4 tables
 */
export function exportSettlementsPdf(options: ExportOptions): void {
  const { periodLabel, periodName, settlements } = options;
  
  if (settlements.length === 0) {
    alert('No settlements to export');
    return;
  }

  const doc = new jsPDF('portrait', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - (margin * 2);

  settlements.forEach((settlement, index) => {
    if (index > 0) {
      doc.addPage();
    }

    let yPos = margin;

    const driverAdjustments = Array.isArray(settlement.driverAdjustments) ? settlement.driverAdjustments : [];
    const driverAdjustmentsNet = typeof settlement.driverAdjustmentsNet === 'number'
      ? settlement.driverAdjustmentsNet
      : calculateAdjustmentsNet(driverAdjustments);

    // Header
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Driver Settlement', margin, yPos);
    yPos += 8;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(settlement.driverName, margin, yPos);
    yPos += 6;

    doc.setFontSize(10);
    doc.setTextColor(100);
    const periodText = settlement.periodName 
      ? `${settlement.periodName} (${settlement.weekLabel})`
      : settlement.weekLabel;
    doc.text(periodText, margin, yPos);
    yPos += 4;

    // Status badge
    const statusText = settlement.status === 'finalized' ? 'Finalized' : 'Draft';
    const paidText = settlement.paidAt 
      ? ` - Paid ${new Date(settlement.paidAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`
      : '';
    doc.text(`Status: ${statusText}${paidText}`, margin, yPos);
    doc.setTextColor(0);
    yPos += 10;

    // Table 1: Platform Earnings Breakdown
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('1. Platform Earnings', margin, yPos);
    yPos += 2;

    const platformHeaders = ['Platform', 'Gross', '50%', 'Fee %', 'Fee', 'Net'];
    const platformData = settlement.platforms.map(p => [
      p.platform_name,
      formatCurrency(p.gross_fare),
      formatCurrency(p.fifty_percent),
      `${round2(p.platform_fee_percent)}%`,
      formatCurrency(p.fee),
      formatCurrency(p.net),
    ]);
    
    // Add totals row
    platformData.push([
      'TOTAL',
      formatCurrency(settlement.totalGrossFare),
      formatCurrency(settlement.totalFiftyPercent),
      '-',
      formatCurrency(settlement.totalFee),
      formatCurrency(settlement.totalNet),
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [platformHeaders],
      body: platformData,
      margin: { left: margin, right: margin },
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [66, 66, 66], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { halign: 'left', cellWidth: 30 },
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right', cellWidth: 18 },
        4: { halign: 'right' },
        5: { halign: 'right' },
      },
      footStyles: { fontStyle: 'bold' },
      didParseCell: (data) => {
        if (data.row.index === platformData.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [240, 240, 240];
        }
      },
    });

    yPos = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

    if (driverAdjustments.length > 0) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Driver Adjustments', margin, yPos);
      yPos += 2;

      const adjHeaders = ['Date', 'Type', 'Description', 'Amount'];
      const sorted = [...driverAdjustments].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      const adjRows = sorted.map((a) => {
        const signed = signedAdjustmentAmount(a.type, Number(a.amount) || 0);
        return [
          a.date,
          a.type,
          a.description,
          formatSignedCurrency(signed),
        ];
      });

      adjRows.push(['', '', 'TOTAL', formatSignedCurrency(driverAdjustmentsNet)]);

      autoTable(doc, {
        startY: yPos,
        head: [adjHeaders],
        body: adjRows,
        margin: { left: margin, right: margin },
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: [66, 66, 66], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          0: { halign: 'left', cellWidth: 22 },
          1: { halign: 'left', cellWidth: 28 },
          2: { halign: 'left' },
          3: { halign: 'right', cellWidth: 26 },
        },
        didParseCell: (data) => {
          if (data.row.index === adjRows.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [240, 240, 240];
          }
        },
      });

      yPos = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    }

    // Table 2: Adjustments (Cash, Tips, Campaigns)
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('2. Adjustments by Platform', margin, yPos);
    yPos += 2;

    const adjustmentHeaders = ['Platform', 'Cash Ride', 'Tips', 'Campaigns', 'Balance'];
    const adjustmentData = settlement.platforms.map(p => [
      p.platform_name,
      `-${formatCurrency(p.cash_ride)}`,
      `+${formatCurrency(p.tips)}`,
      `+${formatCurrency(p.campaigns)}`,
      formatCurrency(p.balance),
    ]);
    
    // Add totals row
    adjustmentData.push([
      'TOTAL',
      `-${formatCurrency(settlement.totalCashRide)}`,
      `+${formatCurrency(settlement.totalTips)}`,
      `+${formatCurrency(settlement.totalCampaigns)}`,
      formatCurrency(settlement.totalBalanceBeforeTax),
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [adjustmentHeaders],
      body: adjustmentData,
      margin: { left: margin, right: margin },
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [66, 66, 66], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { halign: 'left', cellWidth: 30 },
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
      },
      didParseCell: (data) => {
        if (data.row.index === adjustmentData.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [240, 240, 240];
        }
      },
    });

    yPos = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

    // Table 3: Summary Totals
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('3. Summary', margin, yPos);
    yPos += 2;

    const summaryData = [
      ['Total Gross Fare', formatCurrency(settlement.totalGrossFare)],
      ['Driver Share (50%)', formatCurrency(settlement.totalFiftyPercent)],
      ['Platform Fees', `-${formatCurrency(settlement.totalFee)}`],
      ['Total Net', formatCurrency(settlement.totalNet)],
      ['Cash Rides', `-${formatCurrency(settlement.totalCashRide)}`],
      ['Tips', `+${formatCurrency(settlement.totalTips)}`],
      ['Campaigns', `+${formatCurrency(settlement.totalCampaigns)}`],
      // Wage line for wage-based presets, so the balance below adds up.
      ...((settlement.wageAmount ?? 0) > 0
        ? [[
            `Wage${(settlement.hoursWorked ?? 0) > 0 ? ` (${settlement.hoursWorked}h)` : ''}`,
            `+${formatCurrency(settlement.wageAmount ?? 0)}`,
          ]]
        : []),
      ['Balance Before Tax', formatCurrency(settlement.totalBalanceBeforeTax)],
      ['Driver Adjustments', formatSignedCurrency(driverAdjustmentsNet)],
    ];

    autoTable(doc, {
      startY: yPos,
      body: summaryData,
      margin: { left: margin, right: margin },
      styles: { fontSize: 9, cellPadding: 2 },
      columnStyles: {
        0: { halign: 'left', cellWidth: contentWidth * 0.6 },
        1: { halign: 'right', cellWidth: contentWidth * 0.4 },
      },
      alternateRowStyles: { fillColor: [248, 248, 248] },
    });

    yPos = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

    // Table 4: Final Calculation
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('4. Final Settlement', margin, yPos);
    yPos += 2;

    const payableBalance = round2((settlement.finalBalance || 0) + driverAdjustmentsNet);
    const finalData = [
      ['Balance Before Tax', formatCurrency(settlement.totalBalanceBeforeTax)],
      ['FSS / Tax Deduction', `-${formatCurrency(settlement.fssTax)}`],
      // Rent line for rent presets, so Final Balance visibly adds up.
      ...((settlement.rentAmount ?? 0) > 0
        ? [['Vehicle Rent', `-${formatCurrency(settlement.rentAmount ?? 0)}`]]
        : []),
      ['Final Balance (Settlement)', formatCurrency(settlement.finalBalance)],
      ['Driver Adjustments', formatSignedCurrency(driverAdjustmentsNet)],
      ['PAYABLE BALANCE', formatCurrency(payableBalance)],
    ];

    autoTable(doc, {
      startY: yPos,
      body: finalData,
      margin: { left: margin, right: margin },
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: {
        0: { halign: 'left', cellWidth: contentWidth * 0.6 },
        1: { halign: 'right', cellWidth: contentWidth * 0.4, fontStyle: 'bold' },
      },
      didParseCell: (data) => {
        if (data.row.index === finalData.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = payableBalance >= 0 
            ? [220, 252, 231] // green
            : [254, 226, 226]; // red
          data.cell.styles.fontSize = 11;
        }
      },
    });

    yPos = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

    // Notes (if any)
    if (settlement.notes) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Notes:', margin, yPos);
      yPos += 4;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const splitNotes = doc.splitTextToSize(settlement.notes, contentWidth);
      doc.text(splitNotes, margin, yPos);
    }

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Generated on ${new Date().toLocaleDateString('en-GB', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}`,
      margin,
      doc.internal.pageSize.getHeight() - 10
    );
    doc.text(
      `Page ${index + 1} of ${settlements.length}`,
      pageWidth - margin - 25,
      doc.internal.pageSize.getHeight() - 10
    );
    doc.setTextColor(0);
  });

  // Generate filename
  const sanitizedPeriod = (periodName || periodLabel).replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `Settlements_${sanitizedPeriod}.pdf`;
  
  doc.save(filename);
}

export function exportMonthlySettlementsPdf(options: {
  monthLabel: string;
  settlements: Array<{
    driverId: string;
    driverName: string;
    weekStart: string;
    weekLabel: string;
    periodName: string | null;
    status: string;
    paidAt: string | null;
    totalGrossFare: number;
    totalNet: number;
    fssTax: number;
    finalBalance: number;
    platforms: SettlementPlatform[];
  }>;
  driverAdjustmentsByDriver?: Record<string, DriverAdjustment[]>;
}): void {
  const { monthLabel, settlements } = options;

  type MonthlySettlementRow = (typeof settlements)[number];

  if (settlements.length === 0) {
    alert('No settlements to export');
    return;
  }

  const doc = new jsPDF('portrait', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - (margin * 2);

  const driverMap = new Map<string, {
    driverId: string;
    driverName: string;
    rows: MonthlySettlementRow[];
  }>();

  settlements.forEach(s => {
    const key = s.driverId || s.driverName;
    const existing = driverMap.get(key);
    if (existing) {
      existing.rows.push(s);
    } else {
      driverMap.set(key, { driverId: s.driverId, driverName: s.driverName, rows: [s] });
    }
  });

  const drivers = Array.from(driverMap.values()).sort((a, b) => a.driverName.localeCompare(b.driverName));

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Monthly Settlements', margin, margin);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text(monthLabel, margin, margin + 8);
  doc.setTextColor(0);

  const summaryHeaders = ['Driver', 'Settlements (Finalized)', 'Adjustments', 'Payable Total', 'Paid'];
  const summaryRows = drivers.map(d => {
    const finalized = d.rows.filter(r => r.status === 'finalized');
    const finalizedTotal = round2(finalized.reduce((sum, r) => sum + (r.finalBalance || 0), 0));
    const paidFinalized = finalized.filter(r => !!r.paidAt).length;

    const adj = options.driverAdjustmentsByDriver?.[d.driverId] || [];
    const adjNet = round2(calculateAdjustmentsNet(adj));
    const payable = round2(finalizedTotal + adjNet);
    return [
      d.driverName,
      formatCurrency(finalizedTotal),
      formatSignedCurrency(adjNet),
      formatCurrency(payable),
      finalized.length === 0 ? '-' : `${paidFinalized}/${finalized.length}`,
    ];
  });

  const monthFinalizedTotal = round2(drivers.reduce((sum, d) => {
    return sum + d.rows.filter(r => r.status === 'finalized').reduce((s2, r) => s2 + (r.finalBalance || 0), 0);
  }, 0));

  const monthAdjustmentsTotal = round2(drivers.reduce((sum, d) => {
    const adj = options.driverAdjustmentsByDriver?.[d.driverId] || [];
    return sum + calculateAdjustmentsNet(adj);
  }, 0));

  const monthPayableTotal = round2(monthFinalizedTotal + monthAdjustmentsTotal);

  summaryRows.push([
    'TOTAL',
    formatCurrency(monthFinalizedTotal),
    formatSignedCurrency(monthAdjustmentsTotal),
    formatCurrency(monthPayableTotal),
    '-',
  ]);

  autoTable(doc, {
    startY: margin + 14,
    head: [summaryHeaders],
    body: summaryRows,
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [66, 66, 66], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { halign: 'left', cellWidth: contentWidth * 0.42 },
      1: { halign: 'right', cellWidth: contentWidth * 0.19 },
      2: { halign: 'right', cellWidth: contentWidth * 0.15 },
      3: { halign: 'right', cellWidth: contentWidth * 0.16 },
      4: { halign: 'center', cellWidth: contentWidth * 0.08 },
    },
    didParseCell: (data) => {
      if (data.row.index === summaryRows.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [240, 240, 240];
      }
    },
  });

  drivers.forEach((driver) => {
    doc.addPage();
    let yPos = margin;

    const rowsSorted = [...driver.rows].sort((a, b) => (a.weekStart || '').localeCompare(b.weekStart || ''));

    const driverAdjustments = options.driverAdjustmentsByDriver?.[driver.driverId] || [];
    const driverAdjustmentsNet2 = round2(calculateAdjustmentsNet(driverAdjustments));

    const driverSums = rowsSorted.reduce((acc, r) => {
      (r.platforms || []).forEach(p => {
        acc.gross += p.gross_fare || 0;
        acc.fifty += p.fifty_percent || 0;
        acc.fee += p.fee || 0;
        acc.net += p.net || 0;
        acc.cash += p.cash_ride || 0;
        acc.tips += p.tips || 0;
        acc.campaigns += p.campaigns || 0;
        acc.balance += p.balance || 0;
      });
      return acc;
    }, { gross: 0, fifty: 0, fee: 0, net: 0, cash: 0, tips: 0, campaigns: 0, balance: 0 });

    const feePercentDisplay = driverSums.gross > 0
      ? `${round2((driverSums.fee / driverSums.gross) * 100)}%`
      : '-';

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(driver.driverName, margin, yPos);
    yPos += 7;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(monthLabel, margin, yPos);
    doc.setTextColor(0);
    yPos += 6;

    const finalBalance = round2(driverSums.balance + driverAdjustmentsNet2);

    const summaryRows: Array<[string, string]> = [
      ['Gross', formatCurrency(round2(driverSums.gross))],
      ['50%', formatCurrency(round2(driverSums.fifty))],
      ['Fee %', feePercentDisplay],
      ['Fee', `-${formatCurrency(round2(driverSums.fee))}`],
      ['Net', formatCurrency(round2(driverSums.net))],
      ['Cash', `-${formatCurrency(round2(driverSums.cash))}`],
      ['Tips', `+${formatCurrency(round2(driverSums.tips))}`],
      ['Campaigns', `+${formatCurrency(round2(driverSums.campaigns))}`],
      ['Adjustments', formatSignedCurrency(driverAdjustmentsNet2)],
      ['Balance', formatCurrency(finalBalance)],
    ];

    const netRowIndex = 4;
    const balanceRowIndex = summaryRows.length - 1;

    autoTable(doc, {
      startY: yPos,
      body: summaryRows,
      margin: { left: margin, right: margin },
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: {
        0: { halign: 'left', cellWidth: contentWidth * 0.65 },
        1: { halign: 'right', cellWidth: contentWidth * 0.35, fontStyle: 'bold' },
      },
      didParseCell: (data) => {
        if (data.row.index === netRowIndex) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [240, 240, 240];
        }
        if (data.row.index === balanceRowIndex) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = finalBalance >= 0
            ? [220, 252, 231]
            : [254, 226, 226];
          data.cell.styles.fontSize = 11;
        }
      },
    });

    yPos = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

    const platformTotals = new Map<string, {
      platformName: string;
      gross: number;
      net: number;
      cash: number;
      tips: number;
      campaigns: number;
      balance: number;
    }>();

    rowsSorted.forEach(r => {
      (r.platforms || []).forEach(p => {
        const key = p.platform_id || p.platform_name;
        const cur = platformTotals.get(key) || {
          platformName: p.platform_name,
          gross: 0,
          net: 0,
          cash: 0,
          tips: 0,
          campaigns: 0,
          balance: 0,
        };
        cur.gross += p.gross_fare || 0;
        cur.net += p.net || 0;
        cur.cash += p.cash_ride || 0;
        cur.tips += p.tips || 0;
        cur.campaigns += p.campaigns || 0;
        cur.balance += p.balance || 0;
        platformTotals.set(key, cur);
      });
    });

    const platformBreakdownRows: Array<Array<string>> = Array.from(platformTotals.values())
      .sort((a, b) => a.platformName.localeCompare(b.platformName))
      .map(p => ([
        p.platformName,
        formatCurrency(round2(p.gross)),
        formatCurrency(round2(p.net)),
        formatCurrency(round2(p.cash)),
        formatCurrency(round2(p.tips)),
        formatCurrency(round2(p.campaigns)),
        formatCurrency(round2(p.balance)),
      ]));

    if (platformBreakdownRows.length > 0) {
      platformBreakdownRows.push([
        'TOTAL',
        formatCurrency(round2(driverSums.gross)),
        formatCurrency(round2(driverSums.net)),
        formatCurrency(round2(driverSums.cash)),
        formatCurrency(round2(driverSums.tips)),
        formatCurrency(round2(driverSums.campaigns)),
        formatCurrency(round2(driverSums.balance)),
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [['Platform', 'Gross', 'Net', 'Cash', 'Tips', 'Campaigns', 'Balance']],
        body: platformBreakdownRows,
        margin: { left: margin, right: margin },
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [66, 66, 66], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          0: { halign: 'left', cellWidth: contentWidth * 0.25 },
          1: { halign: 'right', cellWidth: contentWidth * 0.12 },
          2: { halign: 'right', cellWidth: contentWidth * 0.12 },
          3: { halign: 'right', cellWidth: contentWidth * 0.12 },
          4: { halign: 'right', cellWidth: contentWidth * 0.12 },
          5: { halign: 'right', cellWidth: contentWidth * 0.13 },
          6: { halign: 'right', cellWidth: contentWidth * 0.14 },
        },
        didParseCell: (data) => {
          if (data.row.index === platformBreakdownRows.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [240, 240, 240];
          }
        },
      });

      yPos = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    }

    if (driverAdjustments.length > 0) {
      const adjHeaders = ['Date', 'Type', 'Description', 'Amount'];
      const sorted = [...driverAdjustments].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      const adjRows = sorted.map((a) => {
        const signed = signedAdjustmentAmount(a.type, Number(a.amount) || 0);
        return [a.date, a.type, a.description, formatSignedCurrency(signed)];
      });
      adjRows.push(['', '', 'TOTAL', formatSignedCurrency(driverAdjustmentsNet2)]);

      autoTable(doc, {
        startY: yPos,
        head: [adjHeaders],
        body: adjRows,
        margin: { left: margin, right: margin },
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [66, 66, 66], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          0: { halign: 'left', cellWidth: contentWidth * 0.14 },
          1: { halign: 'left', cellWidth: contentWidth * 0.14 },
          2: { halign: 'left', cellWidth: contentWidth * 0.52 },
          3: { halign: 'right', cellWidth: contentWidth * 0.20 },
        },
        didParseCell: (data) => {
          if (data.row.index === adjRows.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [240, 240, 240];
          }
        },
      });

      yPos = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    }

    const platformNamesSet = new Set<string>();
    rowsSorted.forEach(r => (r.platforms || []).forEach(p => platformNamesSet.add(p.platform_name)));
    const platformNames = Array.from(platformNamesSet).sort();
    const hasPlatforms = platformNames.length > 0;
    const grossColHeaders = hasPlatforms ? platformNames.map(n => `${n} Gross`) : ['Gross'];

    const weekHeaders = ['Week', 'Status', 'Paid', ...grossColHeaders, 'Net', 'FSS', 'Final'];
    const weekRows = rowsSorted.map(r => {
      const statusText = r.status === 'finalized' ? 'Finalized' : 'Draft';
      const paidText = r.paidAt ? new Date(r.paidAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '-';
      const weekText = r.periodName ? `${r.periodName} (${r.weekLabel})` : r.weekLabel;
      const grossCells = hasPlatforms
        ? platformNames.map(name => {
            const plat = (r.platforms || []).find(p => p.platform_name === name);
            return formatCurrency(round2(plat?.gross_fare || 0));
          })
        : [formatCurrency(r.totalGrossFare)];
      return [
        weekText,
        statusText,
        paidText,
        ...grossCells,
        formatCurrency(r.totalNet),
        formatCurrency(r.fssTax),
        formatCurrency(r.finalBalance),
      ];
    });

    const totalGrossCells = hasPlatforms
      ? platformNames.map(name => {
          const total = rowsSorted.reduce((sum, r) => {
            const plat = (r.platforms || []).find(p => p.platform_name === name);
            return sum + (plat?.gross_fare || 0);
          }, 0);
          return formatCurrency(round2(total));
        })
      : [formatCurrency(round2(rowsSorted.reduce((s, r) => s + (r.totalGrossFare || 0), 0)))];
    weekRows.push([
      'TOTAL',
      '',
      '',
      ...totalGrossCells,
      formatCurrency(round2(rowsSorted.reduce((s, r) => s + (r.totalNet || 0), 0))),
      formatCurrency(round2(rowsSorted.reduce((s, r) => s + (r.fssTax || 0), 0))),
      formatCurrency(round2(rowsSorted.reduce((s, r) => s + (r.finalBalance || 0), 0))),
    ]);

    const fixedWeek = 0.27;
    const fixedStatus = 0.09;
    const fixedPaid = 0.09;
    const fixedNet = 0.10;
    const fixedFss = 0.09;
    const fixedFinal = 0.12;
    const platformShareTotal = 1 - (fixedWeek + fixedStatus + fixedPaid + fixedNet + fixedFss + fixedFinal);
    const perPlatformWidth = platformShareTotal / grossColHeaders.length;

    const weekColumnStyles: Record<number, { halign: 'left' | 'right' | 'center'; cellWidth: number }> = {
      0: { halign: 'left', cellWidth: contentWidth * fixedWeek },
      1: { halign: 'left', cellWidth: contentWidth * fixedStatus },
      2: { halign: 'left', cellWidth: contentWidth * fixedPaid },
    };
    grossColHeaders.forEach((_, i) => {
      weekColumnStyles[3 + i] = { halign: 'right', cellWidth: contentWidth * perPlatformWidth };
    });
    const tailOffset = 3 + grossColHeaders.length;
    weekColumnStyles[tailOffset] = { halign: 'right', cellWidth: contentWidth * fixedNet };
    weekColumnStyles[tailOffset + 1] = { halign: 'right', cellWidth: contentWidth * fixedFss };
    weekColumnStyles[tailOffset + 2] = { halign: 'right', cellWidth: contentWidth * fixedFinal };

    autoTable(doc, {
      startY: yPos,
      head: [weekHeaders],
      body: weekRows,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [66, 66, 66], textColor: 255, fontStyle: 'bold' },
      columnStyles: weekColumnStyles,
      didParseCell: (data) => {
        if (data.row.index === weekRows.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [240, 240, 240];
        }
      },
    });
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Generated on ${new Date().toLocaleDateString('en-GB', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}`,
      margin,
      pageHeight - 10
    );
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth - margin - 25,
      pageHeight - 10
    );
    doc.setTextColor(0);
  }

  const sanitizedMonth = monthLabel.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `Settlements_${sanitizedMonth}.pdf`;
  doc.save(filename);
}

export function exportDriverMonthlySettlementPdf(options: {
  driverName: string;
  monthLabel: string;
  settlements: Array<{
    weekStart: string;
    weekLabel: string;
    periodName: string | null;
    status: string;
    paidAt: string | null;
    totalGrossFare: number;
    totalNet: number;
    fssTax: number;
    finalBalance: number;
    platforms: SettlementPlatform[];
  }>;
  driverAdjustments?: DriverAdjustment[];
}): void {
  const { driverName, monthLabel, settlements } = options;

  if (settlements.length === 0) {
    alert('No settlements to export');
    return;
  }

  const doc = new jsPDF('portrait', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - (margin * 2);

  const rowsSorted = [...settlements].sort((a, b) => (a.weekStart || '').localeCompare(b.weekStart || ''));
  const finalizedRows = rowsSorted.filter(r => r.status === 'finalized');

  const driverAdjustments = Array.isArray(options.driverAdjustments) ? options.driverAdjustments : [];
  const driverAdjustmentsNet = round2(calculateAdjustmentsNet(driverAdjustments));

  const finalizedTotal = round2(finalizedRows.reduce((sum, r) => sum + (r.finalBalance || 0), 0));
  const payableTotal = round2(finalizedTotal + driverAdjustmentsNet);

  const monthGrossTotal = round2(finalizedRows.reduce((sum, r) => sum + (r.totalGrossFare || 0), 0));
  const monthNetTotal = round2(finalizedRows.reduce((sum, r) => sum + (r.totalNet || 0), 0));
  const monthFssTaxTotal = round2(finalizedRows.reduce((sum, r) => sum + (r.fssTax || 0), 0));

  const paidFinalized = finalizedRows.filter(r => !!r.paidAt).length;

  const platformTotals = new Map<string, {
    platformName: string;
    gross: number;
    net: number;
    cash: number;
    tips: number;
    campaigns: number;
    balance: number;
  }>();

  rowsSorted.forEach(r => {
    (r.platforms || []).forEach(p => {
      const key = p.platform_id || p.platform_name;
      const cur = platformTotals.get(key) || {
        platformName: p.platform_name,
        gross: 0,
        net: 0,
        cash: 0,
        tips: 0,
        campaigns: 0,
        balance: 0,
      };
      cur.gross += p.gross_fare || 0;
      cur.net += p.net || 0;
      cur.cash += p.cash_ride || 0;
      cur.tips += p.tips || 0;
      cur.campaigns += p.campaigns || 0;
      cur.balance += p.balance || 0;
      platformTotals.set(key, cur);
    });
  });

  const monthTotals = Array.from(platformTotals.values()).reduce((acc, p) => {
    return {
      gross: acc.gross + p.gross,
      net: acc.net + p.net,
      cash: acc.cash + p.cash,
      tips: acc.tips + p.tips,
      campaigns: acc.campaigns + p.campaigns,
      balance: acc.balance + p.balance,
    };
  }, { gross: 0, net: 0, cash: 0, tips: 0, campaigns: 0, balance: 0 });

  let yPos = margin;

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Monthly Settlement', margin, yPos);
  yPos += 8;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(driverName, margin, yPos);
  yPos += 6;

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(monthLabel, margin, yPos);
  doc.setTextColor(0);
  yPos += 10;

  const summaryData = [
    ['Gross', formatCurrency(monthGrossTotal)],
    ['Tips', `+${formatCurrency(round2(monthTotals.tips))}`],
    ['Campaigns', `+${formatCurrency(round2(monthTotals.campaigns))}`],
    ['Cash Collected', `-${formatCurrency(round2(monthTotals.cash))}`],
    ['Net', formatCurrency(monthNetTotal)],
    ['FSS / Tax', `-${formatCurrency(monthFssTaxTotal)}`],
    ['Final', formatCurrency(finalizedTotal)],
    ['Adjustments', formatSignedCurrency(driverAdjustmentsNet)],
    ['Payable', formatCurrency(payableTotal)],
  ];

  autoTable(doc, {
    startY: yPos,
    body: summaryData,
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: {
      0: { halign: 'left', cellWidth: contentWidth * 0.68 },
      1: { halign: 'right', cellWidth: contentWidth * 0.32, fontStyle: 'bold' },
    },
    alternateRowStyles: { fillColor: [248, 248, 248] },
  });

  yPos = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  if (driverAdjustments.length > 0) {
    const adjHeaders = ['Date', 'Type', 'Description', 'Amount'];
    const sorted = [...driverAdjustments].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const adjRows = sorted.map((a) => {
      const signed = signedAdjustmentAmount(a.type, Number(a.amount) || 0);
      return [a.date, a.type, a.description, formatSignedCurrency(signed)];
    });
    adjRows.push(['', '', 'TOTAL', formatSignedCurrency(driverAdjustmentsNet)]);

    autoTable(doc, {
      startY: yPos,
      head: [adjHeaders],
      body: adjRows,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [66, 66, 66], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { halign: 'left', cellWidth: contentWidth * 0.14 },
        1: { halign: 'left', cellWidth: contentWidth * 0.14 },
        2: { halign: 'left', cellWidth: contentWidth * 0.52 },
        3: { halign: 'right', cellWidth: contentWidth * 0.20 },
      },
      didParseCell: (data) => {
        if (data.row.index === adjRows.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [240, 240, 240];
        }
      },
    });

    yPos = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  const weekHeaders = ['Week', 'Status', 'Paid', 'Gross', 'Net', 'FSS', 'Final'];
  const weekRows = rowsSorted.map(r => {
    const statusText = r.status === 'finalized' ? 'Finalized' : 'Draft';
    const paidText = r.paidAt ? new Date(r.paidAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '-';
    const weekText = r.periodName ? `${r.periodName} (${r.weekLabel})` : r.weekLabel;
    return [
      weekText,
      statusText,
      paidText,
      formatCurrency(r.totalGrossFare),
      formatCurrency(r.totalNet),
      formatCurrency(r.fssTax),
      formatCurrency(r.finalBalance),
    ];
  });

  autoTable(doc, {
    startY: yPos,
    head: [weekHeaders],
    body: weekRows,
    margin: { left: margin, right: margin },
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [66, 66, 66], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { halign: 'left', cellWidth: contentWidth * 0.35 },
      1: { halign: 'left', cellWidth: contentWidth * 0.10 },
      2: { halign: 'left', cellWidth: contentWidth * 0.10 },
      3: { halign: 'right', cellWidth: contentWidth * 0.11 },
      4: { halign: 'right', cellWidth: contentWidth * 0.11 },
      5: { halign: 'right', cellWidth: contentWidth * 0.11 },
      6: { halign: 'right', cellWidth: contentWidth * 0.12 },
    },
  });

  yPos = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  const platformHeaders = ['Platform', 'Gross', 'Net', 'Cash', 'Tips', 'Campaigns', 'Balance'];
  const platformRows = Array.from(platformTotals.values())
    .sort((a, b) => a.platformName.localeCompare(b.platformName))
    .map(p => ([
      p.platformName,
      formatCurrency(round2(p.gross)),
      formatCurrency(round2(p.net)),
      formatCurrency(round2(p.cash)),
      formatCurrency(round2(p.tips)),
      formatCurrency(round2(p.campaigns)),
      formatCurrency(round2(p.balance)),
    ]));

  if (platformRows.length > 0) {
    platformRows.push([
      'TOTAL',
      formatCurrency(round2(monthTotals.gross)),
      formatCurrency(round2(monthTotals.net)),
      formatCurrency(round2(monthTotals.cash)),
      formatCurrency(round2(monthTotals.tips)),
      formatCurrency(round2(monthTotals.campaigns)),
      formatCurrency(round2(monthTotals.balance)),
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [platformHeaders],
      body: platformRows,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [66, 66, 66], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { halign: 'left', cellWidth: contentWidth * 0.25 },
        1: { halign: 'right', cellWidth: contentWidth * 0.12 },
        2: { halign: 'right', cellWidth: contentWidth * 0.12 },
        3: { halign: 'right', cellWidth: contentWidth * 0.12 },
        4: { halign: 'right', cellWidth: contentWidth * 0.12 },
        5: { halign: 'right', cellWidth: contentWidth * 0.13 },
        6: { halign: 'right', cellWidth: contentWidth * 0.14 },
      },
      didParseCell: (data) => {
        if (data.row.index === platformRows.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [240, 240, 240];
        }
      },
    });
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Generated on ${new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}`,
      margin,
      pageHeight - 10
    );
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth - margin - 25,
      pageHeight - 10
    );
    doc.setTextColor(0);
  }

  const sanitizedMonth = monthLabel.replace(/[^a-zA-Z0-9]/g, '_');
  const sanitizedDriver = driverName.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `Settlement_${sanitizedDriver}_${sanitizedMonth}.pdf`;
  doc.save(filename);
}
