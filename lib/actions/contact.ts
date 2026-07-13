'use server';

// =============================================================================
// CONTACT INQUIRY ACTIONS
// =============================================================================
// One public action (the marketing /contact form) plus two platform-admin
// actions used by the Admin Console "Inquiries" inbox. Every write uses the
// service-role client: the public submit needs no login, and the table has RLS
// enabled with no policies, so nothing but the service role can read/write it.
// The admin actions re-check requirePlatformAdmin() before touching anything.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/server';
import { requirePlatformAdmin } from '@/lib/auth/platform';
import { sendEmail, renderBrandedEmail } from '@/lib/email';

export type InquiryStatus = 'new' | 'read' | 'replied' | 'archived';

const TOPICS = ['sales', 'support', 'partnership', 'other'] as const;
const STATUSES: InquiryStatus[] = ['new', 'read', 'replied', 'archived'];

interface Result {
  ok?: boolean;
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Public — submit a contact inquiry. No auth required; called from the marketing
 * contact form. Validates, drops obvious bot spam (honeypot), stores the row and
 * fires a best-effort notification email to the team.
 */
export async function submitInquiryAction(formData: FormData): Promise<Result> {
  // Honeypot: a hidden field real users never see. If it's filled, it's a bot —
  // pretend success so the bot moves on, but store nothing.
  if (String(formData.get('company_url') || '').trim()) return { ok: true };

  const name = String(formData.get('name') || '').trim();
  const email = String(formData.get('email') || '').trim();
  const phone = String(formData.get('phone') || '').trim();
  const company = String(formData.get('company') || '').trim();
  const fleetSize = String(formData.get('fleet_size') || '').trim();
  const topicRaw = String(formData.get('topic') || 'sales').trim();
  const message = String(formData.get('message') || '').trim();

  if (!name) return { error: 'Please enter your name.' };
  if (!EMAIL_RE.test(email)) return { error: 'Please enter a valid email address.' };
  if (message.length < 10) return { error: 'Please add a little more detail to your message.' };
  if (name.length > 120 || email.length > 200 || company.length > 160 || message.length > 4000) {
    return { error: 'That’s a bit long — please shorten your message.' };
  }

  const topic = (TOPICS as readonly string[]).includes(topicRaw) ? topicRaw : 'other';

  let userAgent: string | null = null;
  try {
    const h = await headers();
    userAgent = h.get('user-agent');
  } catch {
    /* headers() unavailable — non-fatal */
  }

  const admin = createAdminClient();
  const { error } = await admin.from('contact_inquiries').insert({
    name,
    email,
    phone: phone || null,
    company: company || null,
    fleet_size: fleetSize || null,
    topic,
    message,
    source: 'contact_page',
    page_path: '/contact',
    user_agent: userAgent,
  });

  if (error) {
    console.error('submitInquiryAction insert failed:', error);
    return { error: 'Sorry — something went wrong. Please email hello@rovora.eu instead.' };
  }

  // Best-effort team notification. Reply-To is the sender so the team can just
  // hit reply. Never blocks the submission on an email failure.
  try {
    const to = process.env.CONTACT_INBOX || process.env.ADMIN_EMAIL || 'hello@rovora.eu';
    await sendEmail({
      to,
      replyTo: email,
      subject: `New inquiry — ${name}${company ? ` · ${company}` : ''}`,
      html: renderBrandedEmail({
        heading: 'New contact inquiry',
        body: [
          `Name: ${name}`,
          `Email: ${email}`,
          phone ? `Phone: ${phone}` : '',
          company ? `Fleet / company: ${company}` : '',
          fleetSize ? `Fleet size: ${fleetSize}` : '',
          `Topic: ${topic}`,
          '',
          message,
        ]
          .filter((line) => line !== '')
          .join('\n'),
        actionUrl: 'https://rovora.eu/admin',
        actionLabel: 'Open the admin console',
        footnote: 'Reply to this email to respond directly to the sender.',
      }),
    });
  } catch (err) {
    console.error('submitInquiryAction notify email failed:', err);
  }

  return { ok: true };
}

/** Platform admin — move an inquiry through its triage states. */
export async function setInquiryStatusAction(id: string, status: InquiryStatus): Promise<Result> {
  const adminUser = await requirePlatformAdmin();
  if (!STATUSES.includes(status)) return { error: 'Invalid status.' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('contact_inquiries')
    .update({
      status,
      handled_by: adminUser.id,
      handled_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    console.error('setInquiryStatusAction failed:', error);
    return { error: 'Could not update the inquiry.' };
  }

  revalidatePath('/admin');
  return { ok: true };
}

/** Platform admin — permanently delete an inquiry. */
export async function deleteInquiryAction(id: string): Promise<Result> {
  await requirePlatformAdmin();

  const admin = createAdminClient();
  const { error } = await admin.from('contact_inquiries').delete().eq('id', id);

  if (error) {
    console.error('deleteInquiryAction failed:', error);
    return { error: 'Could not delete the inquiry.' };
  }

  revalidatePath('/admin');
  return { ok: true };
}
