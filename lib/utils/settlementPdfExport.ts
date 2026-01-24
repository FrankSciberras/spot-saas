import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { SettlementPlatform } from '@/lib/types/database';
import { formatCurrency, round2 } from './settlementCalculations';

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
      ['Balance Before Tax', formatCurrency(settlement.totalBalanceBeforeTax)],
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

    const finalData = [
      ['Balance Before Tax', formatCurrency(settlement.totalBalanceBeforeTax)],
      ['FSS / Tax Deduction', `-${formatCurrency(settlement.fssTax)}`],
      ['FINAL BALANCE', formatCurrency(settlement.finalBalance)],
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
        if (data.row.index === 2) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = settlement.finalBalance >= 0 
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

  const summaryHeaders = ['Driver', 'Finalized Total', 'Draft Total', 'Finalized', 'Paid'];
  const summaryRows = drivers.map(d => {
    const finalized = d.rows.filter(r => r.status === 'finalized');
    const drafts = d.rows.filter(r => r.status !== 'finalized');
    const finalizedTotal = round2(finalized.reduce((sum, r) => sum + (r.finalBalance || 0), 0));
    const draftTotal = round2(drafts.reduce((sum, r) => sum + (r.finalBalance || 0), 0));
    const paidFinalized = finalized.filter(r => !!r.paidAt).length;
    return [
      d.driverName,
      formatCurrency(finalizedTotal),
      formatCurrency(draftTotal),
      `${finalized.length}/${d.rows.length}`,
      finalized.length === 0 ? '-' : `${paidFinalized}/${finalized.length}`,
    ];
  });

  const monthFinalizedTotal = round2(drivers.reduce((sum, d) => {
    return sum + d.rows.filter(r => r.status === 'finalized').reduce((s2, r) => s2 + (r.finalBalance || 0), 0);
  }, 0));
  const monthDraftTotal = round2(drivers.reduce((sum, d) => {
    return sum + d.rows.filter(r => r.status !== 'finalized').reduce((s2, r) => s2 + (r.finalBalance || 0), 0);
  }, 0));

  summaryRows.push([
    'TOTAL',
    formatCurrency(monthFinalizedTotal),
    formatCurrency(monthDraftTotal),
    '-',
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
      1: { halign: 'right', cellWidth: contentWidth * 0.17 },
      2: { halign: 'right', cellWidth: contentWidth * 0.17 },
      3: { halign: 'center', cellWidth: contentWidth * 0.12 },
      4: { halign: 'center', cellWidth: contentWidth * 0.12 },
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
    const finalizedRows = rowsSorted.filter(r => r.status === 'finalized');

    const driverFinalizedTotal2 = round2(finalizedRows.reduce((sum, r) => sum + (r.finalBalance || 0), 0));
    const driverAllTotal2 = round2(rowsSorted.reduce((sum, r) => sum + (r.finalBalance || 0), 0));
    const paidFinalized2 = finalizedRows.filter(r => !!r.paidAt).length;

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

    const summaryData = [
      ['Payable Total (Finalized)', formatCurrency(driverFinalizedTotal2)],
      ['All Weeks Total (Finalized + Draft)', formatCurrency(driverAllTotal2)],
      ['Finalized Weeks Paid', `${paidFinalized2}/${finalizedRows.length}`],
    ];

    autoTable(doc, {
      startY: yPos,
      body: summaryData,
      margin: { left: margin, right: margin },
      styles: { fontSize: 9, cellPadding: 2 },
      columnStyles: {
        0: { halign: 'left', cellWidth: contentWidth * 0.65 },
        1: { halign: 'right', cellWidth: contentWidth * 0.35, fontStyle: 'bold' },
      },
      alternateRowStyles: { fillColor: [248, 248, 248] },
    });

    yPos = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

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
      const totals = Array.from(platformTotals.values()).reduce((acc, p) => {
        return {
          gross: acc.gross + p.gross,
          net: acc.net + p.net,
          cash: acc.cash + p.cash,
          tips: acc.tips + p.tips,
          campaigns: acc.campaigns + p.campaigns,
          balance: acc.balance + p.balance,
        };
      }, { gross: 0, net: 0, cash: 0, tips: 0, campaigns: 0, balance: 0 });

      platformRows.push([
        'TOTAL',
        formatCurrency(round2(totals.gross)),
        formatCurrency(round2(totals.net)),
        formatCurrency(round2(totals.cash)),
        formatCurrency(round2(totals.tips)),
        formatCurrency(round2(totals.campaigns)),
        formatCurrency(round2(totals.balance)),
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
