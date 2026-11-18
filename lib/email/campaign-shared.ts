// =============================================================================
// EMAIL CAMPAIGNS — shared (client + server) helpers
// =============================================================================
// Pure functions only: no Node APIs, no env secrets. The admin console editor
// uses these to render its live preview, and the send action uses the exact
// same functions per recipient, so what the admin previews is what goes out.
//
// Merge tags look like {{first_name}} and accept a fallback after a pipe:
// {{first_name|there}} renders "there" when the recipient has no name.
// =============================================================================

// ─── Audience ────────────────────────────────────────────────────────────────

export type CampaignAudience =
  /** Every account on the platform (operators, staff and drivers). */
  | { kind: 'everyone' }
  /** Fleet admins & staff, optionally narrowed to plans or specific fleets. */
  | { kind: 'operators'; scope: 'all' | 'plan' | 'operators'; planKeys?: string[]; operatorIds?: string[] }
  /** Drivers, optionally narrowed to specific fleets and to active drivers. */
  | { kind: 'drivers'; scope: 'all' | 'operators'; operatorIds?: string[]; activeOnly?: boolean }
  /** A pasted list of addresses (need not be Rovora users). */
  | { kind: 'custom'; emails: string[] };

/** Hard ceiling per send, so one click can't fire an unbounded job. */
export const MAX_CAMPAIGN_RECIPIENTS = 10_000;

/** Gmail hides everything past ~102 KB behind "[Message clipped]". */
export const GMAIL_CLIP_BYTES = 102 * 1024;

// ─── Merge tags ──────────────────────────────────────────────────────────────

export const MERGE_TAGS = [
  { tag: 'first_name', label: 'First name', hint: 'Recipient first name' },
  { tag: 'full_name', label: 'Full name', hint: 'Recipient full name' },
  { tag: 'email', label: 'Email', hint: 'Recipient email address' },
  { tag: 'fleet_name', label: 'Fleet name', hint: 'Their fleet (first one if several)' },
  { tag: 'app_url', label: 'App URL', hint: 'Link to the Rovora app' },
  { tag: 'logo_url', label: 'Logo URL', hint: 'Absolute URL of the Rovora logo' },
  { tag: 'app_name', label: 'App name', hint: 'Rovora' },
  { tag: 'unsubscribe_url', label: 'Unsubscribe URL', hint: 'Personal one-click opt-out link' },
  { tag: 'preheader', label: 'Preview text', hint: 'The inbox preview line' },
  { tag: 'year', label: 'Year', hint: 'Current year' },
] as const;

export type MergeTag = (typeof MERGE_TAGS)[number]['tag'];
export type MergeVars = Partial<Record<MergeTag, string>>;

const KNOWN_TAGS = new Set<string>(MERGE_TAGS.map((t) => t.tag));
const TAG_RE = /\{\{\s*([a-zA-Z_]+)\s*(?:\|([^{}]*))?\}\}/g;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Replace merge tags with the recipient's values. In 'html' mode values are
 * escaped (they may land in text or in an href); in 'text' mode (subjects,
 * plaintext) they are inserted raw. Unknown tags are left untouched so they
 * stay visible in the preview — the send action refuses to send them.
 */
export function renderMergeTags(input: string, vars: MergeVars, mode: 'html' | 'text' = 'html'): string {
  return input.replace(TAG_RE, (whole, rawName: string, fallback?: string) => {
    const name = rawName.toLowerCase();
    if (!KNOWN_TAGS.has(name)) return whole;
    const value = (vars[name as MergeTag] ?? '').trim() || (fallback ?? '').trim();
    return mode === 'html' ? escapeHtml(value) : value;
  });
}

/** Tags used in `input` that we don't know how to fill. */
export function findUnknownMergeTags(input: string): string[] {
  const unknown = new Set<string>();
  for (const m of input.matchAll(TAG_RE)) {
    if (!KNOWN_TAGS.has(m[1].toLowerCase())) unknown.add(m[1]);
  }
  return [...unknown];
}

function hasTag(html: string, tag: MergeTag): boolean {
  return new RegExp(`\\{\\{\\s*${tag}\\s*(\\|[^{}]*)?\\}\\}`, 'i').test(html);
}

// ─── Preparing the HTML ──────────────────────────────────────────────────────

const FOOT_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const PREHEADER_BLOCK =
  '<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">{{preheader}}</div>';

const UNSUBSCRIBE_BLOCK = `
<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
  <tr>
    <td align="center" style="padding:8px 16px 28px;font-family:${FOOT_FONT};font-size:12px;line-height:1.6;color:#7a8290;">
      You're receiving this because you have a {{app_name}} account.
      <a href="{{unsubscribe_url}}" target="_blank" rel="noopener" style="color:#7a8290;text-decoration:underline;">Unsubscribe</a>
    </td>
  </tr>
</table>`;

/**
 * Make sure the two things every campaign needs are present, whatever HTML
 * the admin pasted in:
 *   - the preview text, as a hidden block right after <body>, when the
 *     template doesn't place {{preheader}} itself;
 *   - for marketing sends, an unsubscribe link before </body>, when the
 *     template doesn't place {{unsubscribe_url}} itself.
 * Merge tags are left in; render them per recipient afterwards.
 */
export function prepareCampaignHtml(html: string, opts: { preheader?: string; marketing: boolean }): string {
  let out = html;

  if (opts.preheader?.trim() && !hasTag(out, 'preheader')) {
    out = /<body[^>]*>/i.test(out)
      ? out.replace(/<body[^>]*>/i, (open) => `${open}\n${PREHEADER_BLOCK}`)
      : `${PREHEADER_BLOCK}\n${out}`;
  }

  if (opts.marketing && !hasTag(out, 'unsubscribe_url')) {
    out = /<\/body>/i.test(out)
      ? out.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${UNSUBSCRIBE_BLOCK}\n</body>`)
      : `${out}\n${UNSUBSCRIBE_BLOCK}`;
  }

  return out;
}

// ─── Plaintext version ───────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'",
  rarr: '→', larr: '←', middot: '·', mdash: '—', ndash: '–', hellip: '…',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', bull: '•', copy: '©', reg: '®', trade: '™', euro: '€',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (whole, ent: string) => {
    const lower = ent.toLowerCase();
    if (lower.startsWith('#x')) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith('#') && lower !== '#39') return String.fromCodePoint(parseInt(lower.slice(1), 10));
    return ENTITIES[lower] ?? whole;
  });
}

/**
 * A readable plaintext version of an HTML email. Sent alongside the HTML —
 * multipart mail with a real text part scores better with spam filters, and
 * it's what text-only clients and screen-reader setups show.
 */
export function htmlToText(html: string): string {
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<(head|style|script|title)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  // Hidden blocks (the preheader) aren't part of the readable message.
  s = s.replace(/<div\b[^>]*display\s*:\s*none[^>]*>[\s\S]*?<\/div>/gi, '');
  s = s.replace(/<a\b[^>]*?href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, (_m, _q, href: string, inner: string) => {
    const label = decodeEntities(inner.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    const url = decodeEntities(href).trim();
    if (!url || url.startsWith('#')) return label;
    if (!label) return url;
    return label === url ? url : `${label} (${url})`;
  });
  s = s.replace(/<img\b[^>]*?alt\s*=\s*(["'])(.*?)\1[^>]*>/gi, (_m, _q, alt: string) => (alt ? `${alt} ` : ''));
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<li\b[^>]*>/gi, '\n• ');
  s = s.replace(/<\/(p|div|h[1-6]|tr|table|ul|ol|blockquote)>/gi, '\n\n');
  s = s.replace(/<\/(td|th)>/gi, ' ');
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEntities(s);
  return s
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─── Addresses ───────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:".]{2,}$/;

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email);
}

/** Split a pasted list (commas, semicolons, spaces, newlines) into clean, unique addresses. */
export function parseEmailList(input: string): { valid: string[]; invalid: string[] } {
  const valid = new Set<string>();
  const invalid = new Set<string>();
  // Accept pastes from a mail client or spreadsheet: in `Maria Camilleri <maria@x.com>`
  // or `"Camilleri, Maria" <maria@x.com>` only the address counts, so the
  // display name isn't reported as an invalid address.
  const segments = input.replace(/"[^"]*"/g, ' ').split(/[,;\n]+/);
  for (const segment of segments) {
    const bracketed = [...segment.matchAll(/<([^<>]*)>/g)].map((m) => m[1]);
    const words = segment.replace(/<[^<>]*>/g, ' ').split(/\s+/).filter(Boolean);
    const candidates = bracketed.length ? [...bracketed, ...words.filter((w) => w.includes('@'))] : words;
    for (const raw of candidates) {
      const email = raw.trim().replace(/^mailto:/i, '').toLowerCase();
      if (!email) continue;
      if (isValidEmail(email)) valid.add(email);
      else invalid.add(raw.trim());
    }
  }
  return { valid: [...valid], invalid: [...invalid] };
}

/** Bytes of a string once UTF-8 encoded (what Gmail's clip limit counts). */
export function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}
