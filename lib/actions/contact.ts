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

  await notifyTeam({ name, email, phone, company, fleetSize, topic, message });

  return { ok: true };
}

/**
 * Best-effort team notification for a new inquiry. Reply-To is the sender so the
 * team can just hit reply. Never blocks a submission on an email failure.
 */
async function notifyTeam(i: {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  fleetSize?: string;
  topic: string;
  message: string;
  heading?: string;
  subjectPrefix?: string;
}): Promise<void> {
  try {
    const to = process.env.CONTACT_INBOX || process.env.ADMIN_EMAIL || 'hello@rovora.eu';
    await sendEmail({
      to,
      replyTo: i.email,
      subject: `${i.subjectPrefix ?? 'New inquiry'} — ${i.name}${i.company ? ` · ${i.company}` : ''}`,
      html: renderBrandedEmail({
        heading: i.heading ?? 'New contact inquiry',
        body: [
          `Name: ${i.name}`,
          `Email: ${i.email}`,
          i.phone ? `Phone: ${i.phone}` : '',
          i.company ? `Fleet / company: ${i.company}` : '',
          i.fleetSize ? `Fleet size: ${i.fleetSize}` : '',
          `Topic: ${i.topic}`,
          '',
          i.message,
        ]
          .filter((line) => line !== '')
          .join('\n'),
        actionUrl: 'https://rovora.eu/admin',
        actionLabel: 'Open the admin console',
        footnote: 'Reply to this email to respond directly to the sender.',
      }),
    });
  } catch (err) {
    console.error('contact notify email failed:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LEADS FROM THE WEBSITE CHAT
// ─────────────────────────────────────────────────────────────────────────────
// The marketing assistant used to hand visitors a mailto: link, which quietly
// lost every lead whose browser had no mail client wired up — and left no trace
// of the ones that did send. This captures the lead in the same Inquiries inbox,
// tagged source='chat', with the conversation so far attached so whoever picks
// it up already knows what was discussed.

const MAX_TRANSCRIPT_CHARS = 2500;

export interface ChatLeadInput {
  name: string;
  email: string;
  phone?: string;
  fleetSize?: string;
  message?: string;
  /** 'sales' for a demo request, 'support' for an existing customer, etc. */
  topic?: string;
  /** Recent conversation, oldest first, already rendered as "Visitor: …" lines. */
  transcript?: string;
  /** Marketing path the chat was opened from. */
  page?: string;
}

/** Public — capture a lead raised from the website chat widget. */
export async function submitChatLeadAction(input: ChatLeadInput): Promise<Result> {
  const name = String(input?.name || '').trim();
  const email = String(input?.email || '').trim();
  const phone = String(input?.phone || '').trim();
  const fleetSize = String(input?.fleetSize || '').trim();
  const note = String(input?.message || '').trim();

  if (!name) return { error: 'Please enter your name.' };
  if (!EMAIL_RE.test(email)) return { error: 'Please enter a valid email address.' };
  if (name.length > 120 || email.length > 200 || note.length > 2000) {
    return { error: 'That’s a bit long — please shorten your message.' };
  }

  const topicRaw = String(input?.topic || 'sales').trim();
  const topic = (TOPICS as readonly string[]).includes(topicRaw) ? topicRaw : 'sales';

  // Unlike the contact form, a message is optional here — the visitor has often
  // already explained themselves to the assistant. Fall back to the transcript
  // so the row is never empty, and always append it for context.
  const transcript = String(input?.transcript || '').trim().slice(-MAX_TRANSCRIPT_CHARS);
  const message =
    [note || '(No message — raised from the website chat.)', transcript ? `--- Chat so far ---\n${transcript}` : '']
      .filter(Boolean)
      .join('\n\n');

  let userAgent: string | null = null;
  try {
    const h = await headers();
    userAgent = h.get('user-agent');
  } catch {
    /* headers() unavailable — non-fatal */
  }

  const pageRaw = String(input?.page || '').trim();
  const page = /^\/[a-zA-Z0-9/_-]{0,60}$/.test(pageRaw) ? pageRaw : null;

  const admin = createAdminClient();
  const { error } = await admin.from('contact_inquiries').insert({
    name,
    email,
    phone: phone || null,
    company: null,
    fleet_size: fleetSize || null,
    topic,
    message,
    source: 'chat',
    page_path: page,
    user_agent: userAgent,
  });

  if (error) {
    console.error('submitChatLeadAction insert failed:', error);
    return { error: 'Sorry — something went wrong. Please email hello@rovora.eu instead.' };
  }

  await notifyTeam({
    name,
    email,
    phone,
    fleetSize,
    topic,
    message,
    heading: 'New lead from the website chat',
    subjectPrefix: 'Chat lead',
  });

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
