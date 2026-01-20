import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface EarningsData {
  boltGross: number;
  uberGross: number;
  offappGross: number;
  boltVat: number;
  uberVat: number;
  offappVat: number;
  boltCommission: number;
  uberCommission: number;
  driverSettlements: number;
  rent: number;
  utilities: number;
  insurance: number;
  niTax: number;
  servicesTotal: number;
  fuel: number;
  vehicleExpenses: number;
  otherExpenses: number;
  otherExpensesNotes: string;
  notes: string;
  totalGrossRevenue: number;
  totalVat: number;
  totalCommissions: number;
  netRevenue: number;
  totalExpenses: number;
  netProfit: number;
}

interface ExportOptions {
  monthLabel: string;
  data: EarningsData;
  status: 'draft' | 'finalized';
}

function formatCurrency(value: number): string {
  return `€${value.toFixed(2)}`;
}

/**
 * Export monthly earnings to PDF
 */
export function exportEarningsPdf(options: ExportOptions): void {
  const { monthLabel, data, status } = options;

  const doc = new jsPDF('portrait', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - (margin * 2);

  let yPos = margin;

  // Header
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Monthly Earnings Report', margin, yPos);
  yPos += 10;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text(monthLabel, margin, yPos);
  yPos += 6;

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Status: ${status === 'finalized' ? 'Finalized' : 'Draft'}`, margin, yPos);
  doc.setTextColor(0);
  yPos += 12;

  // Table 1: Platform Revenue
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('1. Platform Revenue', margin, yPos);
  yPos += 2;

  const revenueData = [
    ['Bolt', formatCurrency(data.boltGross), formatCurrency(data.boltVat), formatCurrency(data.boltCommission), formatCurrency(data.boltGross - data.boltVat - data.boltCommission)],
    ['Uber', formatCurrency(data.uberGross), formatCurrency(data.uberVat), formatCurrency(data.uberCommission), formatCurrency(data.uberGross - data.uberVat - data.uberCommission)],
    ['Off-App', formatCurrency(data.offappGross), formatCurrency(data.offappVat), '-', formatCurrency(data.offappGross - data.offappVat)],
    ['TOTAL', formatCurrency(data.totalGrossRevenue), formatCurrency(data.totalVat), formatCurrency(data.totalCommissions), formatCurrency(data.netRevenue)],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [['Platform', 'Gross Sales', 'VAT (18%)', 'Commission (20%)', 'Net']],
    body: revenueData,
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
    didParseCell: (cellData) => {
      if (cellData.row.index === revenueData.length - 1) {
        cellData.cell.styles.fontStyle = 'bold';
        cellData.cell.styles.fillColor = [240, 240, 240];
      }
    },
  });

  yPos = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  // Table 2: Operating Expenses
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('2. Operating Expenses', margin, yPos);
  yPos += 2;

  const expensesData = [
    ['Driver Settlements', formatCurrency(data.driverSettlements)],
    ['Rent', formatCurrency(data.rent)],
    ['Utilities', formatCurrency(data.utilities)],
    ['Insurance', formatCurrency(data.insurance)],
    ['NI / Tax', formatCurrency(data.niTax)],
    ['Services', formatCurrency(data.servicesTotal)],
    ['Fuel', formatCurrency(data.fuel)],
    ['Vehicle Expenses', formatCurrency(data.vehicleExpenses)],
    ['Other Expenses', formatCurrency(data.otherExpenses)],
    ['TOTAL EXPENSES', formatCurrency(data.totalExpenses)],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [['Expense Category', 'Amount']],
    body: expensesData,
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [66, 66, 66], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { halign: 'left', cellWidth: contentWidth * 0.6 },
      1: { halign: 'right', cellWidth: contentWidth * 0.4 },
    },
    didParseCell: (cellData) => {
      if (cellData.row.index === expensesData.length - 1) {
        cellData.cell.styles.fontStyle = 'bold';
        cellData.cell.styles.fillColor = [240, 240, 240];
      }
    },
  });

  yPos = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  // Table 3: Summary
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('3. Summary', margin, yPos);
  yPos += 2;

  const summaryData = [
    ['Total Gross Revenue', formatCurrency(data.totalGrossRevenue)],
    ['Less: VAT', `-${formatCurrency(data.totalVat)}`],
    ['Less: Platform Commissions', `-${formatCurrency(data.totalCommissions)}`],
    ['Net Revenue', formatCurrency(data.netRevenue)],
    ['Less: Total Expenses', `-${formatCurrency(data.totalExpenses)}`],
    ['NET PROFIT / (LOSS)', formatCurrency(data.netProfit)],
  ];

  autoTable(doc, {
    startY: yPos,
    body: summaryData,
    margin: { left: margin, right: margin },
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: {
      0: { halign: 'left', cellWidth: contentWidth * 0.6 },
      1: { halign: 'right', cellWidth: contentWidth * 0.4, fontStyle: 'bold' },
    },
    didParseCell: (cellData) => {
      // Net Revenue row
      if (cellData.row.index === 3) {
        cellData.cell.styles.fillColor = [240, 248, 255];
      }
      // Net Profit row
      if (cellData.row.index === 5) {
        cellData.cell.styles.fontStyle = 'bold';
        cellData.cell.styles.fontSize = 11;
        cellData.cell.styles.fillColor = data.netProfit >= 0 
          ? [220, 252, 231] // green
          : [254, 226, 226]; // red
      }
    },
  });

  yPos = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  // Other expenses notes
  if (data.otherExpensesNotes) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Other Expenses Details:', margin, yPos);
    yPos += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const splitNotes = doc.splitTextToSize(data.otherExpensesNotes, contentWidth);
    doc.text(splitNotes, margin, yPos);
    yPos += splitNotes.length * 4 + 6;
  }

  // General notes
  if (data.notes) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Notes:', margin, yPos);
    yPos += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const splitNotes = doc.splitTextToSize(data.notes, contentWidth);
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
  doc.setTextColor(0);

  // Save
  const sanitizedMonth = monthLabel.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `Earnings_${sanitizedMonth}.pdf`;
  
  doc.save(filename);
}
