import { randomUUID } from 'crypto';
import type { Admin } from './server';
import { MAX_ATTACHMENT_BYTES } from './types';

/**
 * Chat photos and files. Stored in the PRIVATE `documents` bucket (same one as
 * receipts and driver documents) under chat/<org>/<conversation>/<uuid>.<ext>.
 * Nothing in that bucket is readable from a browser — files are only ever
 * handed out as short-lived signed URLs by GET /api/messages/attachment/[id],
 * after a membership check.
 */

export const CHAT_BUCKET = 'documents';

/** Allowed types → stored extension + how the chat shows them. Never trust the filename. */
const TYPES: Record<string, { ext: string; kind: 'image' | 'file' }> = {
  'image/jpeg': { ext: 'jpg', kind: 'image' },
  'image/png': { ext: 'png', kind: 'image' },
  'image/webp': { ext: 'webp', kind: 'image' },
  'image/gif': { ext: 'gif', kind: 'image' },
  // iPhone originals — most browsers can't draw these inline, so send as a file.
  'image/heic': { ext: 'heic', kind: 'file' },
  'image/heif': { ext: 'heif', kind: 'file' },
  'application/pdf': { ext: 'pdf', kind: 'file' },
  'application/msword': { ext: 'doc', kind: 'file' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', kind: 'file' },
  'application/vnd.ms-excel': { ext: 'xls', kind: 'file' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: 'xlsx', kind: 'file' },
  'text/csv': { ext: 'csv', kind: 'file' },
  'text/plain': { ext: 'txt', kind: 'file' },
};

export interface StoredAttachment {
  path: string;
  name: string;
  mime: string;
  size: number;
  kind: 'image' | 'file';
}

/** Keeps a readable name for the download, minus anything path-like. */
function cleanName(name: string, ext: string): string {
  const base = (name || '').split(/[\\/]/).pop()!.replace(/[^\p{L}\p{N} ._()-]/gu, '').trim().slice(0, 120);
  return base || `attachment.${ext}`;
}

export async function storeAttachment(
  admin: Admin,
  organizationId: string,
  conversationId: string,
  file: File,
): Promise<StoredAttachment | { error: string }> {
  const type = TYPES[file.type];
  if (!type) return { error: 'You can send photos (JPG, PNG, WEBP), PDFs, Word, Excel, CSV or text files.' };
  if (file.size === 0) return { error: 'That file is empty.' };
  if (file.size > MAX_ATTACHMENT_BYTES) return { error: 'That file is over 15 MB.' };

  const path = `chat/${organizationId}/${conversationId}/${randomUUID()}.${type.ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await admin.storage
    .from(CHAT_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false, cacheControl: '3600' });
  if (error) {
    console.error('[messages] attachment upload failed:', error);
    return { error: 'Could not upload that file. Please try again.' };
  }
  return { path, name: cleanName(file.name, type.ext), mime: file.type, size: file.size, kind: type.kind };
}

export async function removeAttachment(admin: Admin, path: string | null | undefined) {
  if (!path) return;
  await admin.storage.from(CHAT_BUCKET).remove([path]);
}
