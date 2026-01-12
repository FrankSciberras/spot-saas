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
