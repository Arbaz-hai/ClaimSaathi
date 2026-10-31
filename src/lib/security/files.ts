import 'server-only';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs/promises';

/** Persistent local storage, outside the public directory. */
export const DATA_DIR =
  process.env.CLAIMSATHI_DATA_DIR ?? path.join(process.cwd(), 'data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const AUDIO_DIR = path.join(DATA_DIR, 'audio');

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.txt', '.png', '.jpg', '.jpeg']);
const ALLOWED_MIME = new Set([
  'application/pdf',
  'text/plain',
  'image/png',
  'image/jpeg',
]);

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB

/** Reduce an untrusted filename to a safe basename + lowercased extension. */
export function sanitizeFilename(raw: string): string | null {
  const base = path.basename(raw.replace(/\\/g, '/')).trim();
  if (!base) return null;
  const ext = path.extname(base).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) return null;
  const stem = base.slice(0, -ext.length).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
  if (!stem) return null;
  return `${stem}${ext}`;
}

/** Sniff magic bytes; do not trust the client-declared MIME type. */
export async function sniffDocumentType(buf: Buffer): Promise<string | null> {
  if (buf.length >= 4 && buf.subarray(0, 4).toString('latin1') === '%PDF') {
    return 'application/pdf';
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return 'image/png';
  }
  if (
    buf.length >= 3 &&
    buf[0] === 0xff &&
    buf[1] === 0xd8 &&
    buf[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  // Text: reject embedded NUL bytes; accept UTF-8-ish plain text.
  if (buf.length > 0 && !buf.subarray(0, Math.min(buf.length, 4096)).includes(0)) {
    const sample = buf.subarray(0, Math.min(buf.length, 4096)).toString('utf8');
    if (/^[\t\n\r\x20-\x7e\u00a0-\uffff]*$/u.test(sample)) return 'text/plain';
  }
  return null;
}

export function validateUploadSize(sizeBytes: number): string | null {
  if (sizeBytes <= 0) return 'File is empty.';
  if (sizeBytes > MAX_UPLOAD_BYTES) return 'File exceeds the 10 MB limit.';
  return null;
}

export function validateUploadMeta(name: string, declaredMime: string, sniffed: string): string | null {
  if (!sanitizeFilename(name)) {
    return 'Unsupported file type. Allowed: PDF, TXT, PNG, JPG.';
  }
  if (!ALLOWED_MIME.has(declaredMime) || declaredMime !== sniffed) {
    return 'File content does not match the declared type.';
  }
  return null;
}

/** Private per-session per-document storage path. */
export function uploadPathFor(sessionId: string, documentId: string, ext: string): string {
  return path.join(UPLOADS_DIR, sessionId, `${documentId}${ext}`);
}

export function audioPathFor(sessionId: string, operationId: string, ext: string): string {
  return path.join(AUDIO_DIR, sessionId, `${operationId}${ext}`);
}

export async function ensureDataDirs(): Promise<void> {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  await fs.mkdir(AUDIO_DIR, { recursive: true });
}

export async function deleteTempAudio(sessionId: string, operationId: string, ext: string): Promise<void> {
  const p = audioPathFor(sessionId, operationId, ext);
  await fs.rm(p, { force: true });
}

export function newDocumentId(): string {
  return randomUUID();
}
