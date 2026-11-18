'use server';

// =============================================================================
// EMAIL AN INVOICE OR CREDIT NOTE TO THE CUSTOMER (fleet admin only)
// =============================================================================
// Renders the same PDF a manager downloads (lib/invoices/pdf.ts), attaches it
// and sends it through Resend. The document is only marked as sent
// (sent_at / sent_to) once Resend has accepted the message — if email isn't
// configured or the send fails, nothing changes and the caller is told so.
// =============================================================================

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';
import { createAuditLogEntry, getAuditActor } from '@/lib/audit/log';
import { getFleetSettings } from '@/lib/settings/server';
import { isEmailConfigured, sendEmail } from '@/lib/email';
import { assetUrl } from '@/lib/urls';
import { formatMoney, type MoneyFormat } from '@/lib/money';
import { fromCents, toCents } from '@/lib/invoices/math';
import { getDocument, invoiceErrorMessage } from '@/lib/invoices/server';
import { formatPdfDate, invoicePdfFileName, renderInvoicePdf } from '@/lib/invoices/pdf';
import type { ActionResult, DocumentDetail } from '@/lib/invoices/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

let cachedFonts: { normal: string; bold: string } | null = null;

/**
 * The Geist TTFs as base64. Read from disk (public/ ships with the app); if
 * that fails — an unusual deployment layout — fetched from the app itself.
 */
async function loadServerFonts(): Promise<{ normal: string; bold: string } | null> {
  if (cachedFonts) return cachedFonts;
  const files = { normal: 'Geist-Regular.ttf', bold: 'Geist-Bold.ttf' } as const;
  try {
    const dir = join(process.cwd(), 'public', 'fonts', 'pdf');
    const [normal, bold] = await Promise.all([readFile(join(dir, files.normal)), readFile(join(dir, files.bold))]);
    cachedFonts = { normal: normal.toString('base64'), bold: bold.toString('base64') };
    return cachedFonts;
  } catch (diskError) {
    try {
      const [normal, bold] = await Promise.all(
        [files.normal, files.bold].map(async (name) => {
          const res = await fetch(assetUrl(`/fonts/pdf/${name}`));
          if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
          return Buffer.from(await res.arrayBuffer()).toString('base64');
        }),
      );
      cachedFonts = { normal, bold };
      return cachedFonts;
    } catch (fetchError) {
      console.error('invoice email: PDF fonts could not be loaded:', diskError, fetchError);
      return null;
    }
  }
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * A plain, neutral email: it is the fleet writing to its own customer, so it
 * carries the fleet's name rather than Rovora's branding.
 */
function buildEmail(doc: DocumentDetail, fmt: MoneyFormat, message: string | null) {
  const isCredit = doc.kind === 'credit_note';
  const seller = doc.seller_name ?? 'us';
  const what = isCredit ? 'credit note' : 'invoice';
  const money = (cents: number) => formatMoney(fromCents(cents), fmt);
  const total = toCents(doc.total) ?? 0;

  const facts: [string, string][] = [[isCredit ? 'Credit note' : 'Invoice', doc.number ?? '']];
  if (doc.issue_date) facts.push(['Date', formatPdfDate(doc.issue_date)]);
  if (isCredit) {
    facts.push(['Amount credited', money(total)]);
    if (doc.credited_invoice?.number) facts.push(['For invoice', doc.credited_invoice.number]);
  } else {
    facts.push(['Total', money(total)]);
    if (doc.balance_cents !== total) facts.push(['Balance due', money(doc.balance_cents)]);
    if (doc.due_date && doc.balance_cents > 0) facts.push(['Due', formatPdfDate(doc.due_date)]);
  }

  const intro = isCredit
    ? `Please find attached credit note ${doc.number} from ${seller}.`
    : `Please find attached invoice ${doc.number} from ${seller}.`;
  const paragraphs = [message, intro].filter((p): p is string => Boolean(p));
  const closing = doc.seller_email
    ? `If anything doesn’t look right, reply to this email and it will reach ${seller}.`
    : `If anything doesn’t look right, please get in touch with ${seller}.`;

  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const p = (text: string) =>
    `<p style="margin:0 0 14px;font-family:${font};font-size:15px;line-height:1.6;color:#1f2937;">${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;
  const rows = facts
    .map(
      ([label, value]) =>
        `<tr><td style="padding:7px 16px 7px 0;font-family:${font};font-size:14px;color:#6b7280;white-space:nowrap;">${escapeHtml(label)}</td>` +
        `<td style="padding:7px 0;font-family:${font};font-size:14px;color:#111827;font-weight:600;">${escapeHtml(value)}</td></tr>`,
    )
    .join('');

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f5f6f8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:28px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;">
<tr><td style="padding:26px 28px 8px;">
<p style="margin:0 0 18px;font-family:${font};font-size:18px;line-height:1.3;font-weight:600;color:#111827;">${escapeHtml(isCredit ? `Credit note ${doc.number}` : `Invoice ${doc.number}`)} <span style="font-weight:400;color:#6b7280;">from ${escapeHtml(seller)}</span></p>
${paragraphs.map(p).join('\n')}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 16px;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;width:100%;">${rows}</table>
${p(`The ${what} is attached to this email as a PDF.`)}
${p(closing)}
</td></tr>
<tr><td style="padding:14px 28px 22px;border-top:1px solid #f0f1f3;">
<p style="margin:0;font-family:${font};font-size:12px;line-height:1.5;color:#9ca3af;">Sent by ${escapeHtml(seller)} using Rovora.</p>
</td></tr></table></td></tr></table></body></html>`;

  const text = [
    ...paragraphs,
    '',
    ...facts.map(([label, value]) => `${label}: ${value}`),
    '',
    `The ${what} is attached to this email as a PDF.`,
    closing,
  ].join('\n');

  return { html, text };
}

/**
 * Emails an issued invoice or credit note, with its PDF, to `to`. Drafts and
 * voided documents can't be sent.
 */
export async function emailDocumentAction(id: string, to: string, message?: string | null): Promise<ActionResult<{ sentTo: string }>> {
  const user = await requireRole(['admin']);
  const orgId = user.organization_id;

  if (typeof id !== 'string' || !UUID.test(id)) return { ok: false, error: 'That document no longer exists.' };
  const address = typeof to === 'string' ? to.trim() : '';
  if (!address) return { ok: false, error: 'Enter the email address to send it to.' };
  if (address.length > 200 || !EMAIL.test(address)) return { ok: false, error: 'That email address doesn’t look right.' };
  const note = typeof message === 'string' && message.trim() ? message.trim().slice(0, 2000) : null;

  const admin = createAdminClient();
  const doc = await getDocument(admin, orgId, id);
  if (!doc) return { ok: false, error: 'That document no longer exists.' };
  if (doc.status === 'draft') return { ok: false, error: 'Issue this document before sending it.' };
  if (doc.status === 'void') return { ok: false, error: 'A voided document can’t be sent.' };

  if (!isEmailConfigured()) {
    return { ok: false, error: 'Email isn’t set up on this workspace yet, so nothing was sent. Download the PDF and send it yourself for now.' };
  }

  const fleet = await getFleetSettings(orgId);
  const fmt: MoneyFormat = { currency: doc.currency || fleet['finance.currency'], locale: fleet['finance.number_format'] };

  const fonts = await loadServerFonts();
  if (!fonts) return { ok: false, error: 'The PDF could not be prepared, so nothing was sent. Please try again.' };

  let pdf: Buffer;
  try {
    pdf = Buffer.from(renderInvoicePdf(doc, { locale: fmt.locale, fonts }).output('arraybuffer'));
  } catch (error) {
    console.error('invoice email: rendering the PDF failed:', error);
    return { ok: false, error: 'The PDF could not be prepared, so nothing was sent. Please try again.' };
  }

  const isCredit = doc.kind === 'credit_note';
  const seller = doc.seller_name ?? user.organization_name;
  const { html, text } = buildEmail(doc, fmt, note);
  const sent = await sendEmail({
    to: address,
    subject: `${isCredit ? 'Credit note' : 'Invoice'} ${doc.number} from ${seller}`,
    html,
    text,
    ...(doc.seller_email && EMAIL.test(doc.seller_email) ? { replyTo: doc.seller_email } : {}),
    attachments: [{ filename: invoicePdfFileName(doc), content: pdf, contentType: 'application/pdf' }],
    // The customer sees who it is from: "Spot Cabs Ltd via Rovora".
    fromName: seller,
  });
  if (!sent) return { ok: false, error: 'The email could not be sent. Nothing was changed — please try again.' };

  // Allowed on an issued document: the freeze trigger leaves sent_at / sent_to alone.
  const { error } = await admin
    .from('invoices')
    .update({ sent_at: new Date().toISOString(), sent_to: address })
    .eq('organization_id', orgId)
    .eq('id', id);
  if (error) {
    // The email did go out; say so rather than inviting a second send.
    console.error('invoice email: could not record sent_at:', error);
    return { ok: false, error: `The email was sent to ${address}, but it couldn’t be recorded here: ${invoiceErrorMessage(error)}` };
  }

  try {
    await createAuditLogEntry({
      actor: await getAuditActor(user.id),
      organizationId: orgId,
      action: 'update',
      entityType: isCredit ? 'credit_note' : 'invoice',
      entityId: id,
      summary: `Emailed ${isCredit ? 'credit note' : 'invoice'} ${doc.number} to ${address}`,
      details: { to: address },
    });
  } catch (auditError) {
    console.error('invoice email: audit log failed:', auditError);
  }

  revalidatePath('/fleet/invoices');
  revalidatePath(`/fleet/invoices/${id}`);
  return { ok: true, sentTo: address };
}
