import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Uploads live outside the repository so they never reach git or the build output.
 * Resolved against the project root the same way the SQLite path is in lib/db.ts,
 * because the Next.js runtime and the CLI do not always share a working directory.
 */
export function uploadRoot(): string {
  const raw = process.env.UPLOAD_DIR ?? 'uploads';
  return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
}

export const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv',
  zip: 'application/zip',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
};

export function extensionOf(name: string): string {
  return path.extname(name ?? '').toLowerCase().replace(/^\./, '');
}

export function mimeTypeFor(extension: string): string {
  return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

/** Absolute path for a stored relative path, or null when it tries to leave the upload root. */
export function absolutePath(relative: string): string | null {
  const normalized = relative.replace(/\\/g, '/').replace(/^\/+/, '');
  const target = path.resolve(uploadRoot(), normalized);
  const root = uploadRoot();
  return target === root || target.startsWith(root + path.sep) ? target : null;
}

export function publicUrlFor(relative: string): string {
  return `/uploads/${relative.replace(/\\/g, '/').replace(/^\/+/, '')}`;
}

/** yyyy/mm/name.ext — keeps a single directory from growing to millions of files. */
export function relativePathFor(originalName: string): string {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const base = slugBase(originalName);
  return `${yyyy}/${mm}/${base}-${randomBytes(6).toString('hex')}.${extensionOf(originalName) || 'bin'}`;
}

/** Reuses the original name for a replacement so the stored path never changes. */
export function slugBase(originalName: string): string {
  const stem = path.basename(originalName ?? 'file', path.extname(originalName ?? ''))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return stem || 'file';
}

export async function writeAsset(relative: string, data: Uint8Array): Promise<void> {
  const target = absolutePath(relative);
  if (!target) throw new Error('unsafe storage path');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, data);
}

export async function readAsset(relative: string): Promise<Buffer | null> {
  const target = absolutePath(relative);
  if (!target) return null;
  try {
    return await fs.readFile(target);
  } catch {
    return null;
  }
}

export async function removeAsset(relative: string): Promise<void> {
  const target = absolutePath(relative);
  if (!target) return;
  await fs.rm(target, { force: true });
}

export function checksum(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex').slice(0, 32);
}

/**
 * SVG is the one accepted format that can carry script. Anything executable is stripped;
 * the file is additionally served with a sandbox policy (see app/uploads/[...path]).
 */
export function sanitizeSvg(input: string): string {
  return input
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<!ENTITY[\s\S]*?>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/<(annotation|metadata)[\s\S]*?<\/\1>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/(href|xlink:href)\s*=\s*"(?!#)[^"]*"/gi, '$1=""')
    .replace(/(href|xlink:href)\s*=\s*'(?!#)[^']*'/gi, "$1=''");
}

export function looksLikeSvg(data: Uint8Array): boolean {
  const head = Buffer.from(data.slice(0, 512)).toString('utf8').trimStart();
  return head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'));
}
