import 'server-only';
import path from 'node:path';
import sharp from 'sharp';
import type { TranslationKey } from '@/lib/admin/labels';
import { prisma } from '@/lib/db';
import { ALLOWED_UPLOAD, BLOCKED_EXTENSIONS, MEDIA_STATUS, MEDIA_VARIANT_ROLE, type MediaKind } from '@/lib/enums';
import {
  extensionOf,
  looksLikeSvg,
  mimeTypeFor,
  publicUrlFor,
  relativePathFor,
  removeAsset,
  sanitizeSvg,
  writeAsset,
  checksum,
} from './storage';

/** Route handlers have no body-size limiter, so every cap is enforced here after reading. */
export const MAX_BYTES: Record<MediaKind, number> = {
  image: 20 * 1024 * 1024,
  document: 60 * 1024 * 1024,
  video: 150 * 1024 * 1024,
  audio: 60 * 1024 * 1024,
  other: 10 * 1024 * 1024,
};

/**
 * A rejected upload. It carries a dictionary key instead of a sentence because the media screen
 * shows this to staff, who read the panel in their own language.
 */
export class MediaUploadError extends Error {
  constructor(
    readonly key: TranslationKey,
    readonly params: Record<string, string | number> = {},
  ) {
    super(key);
  }
}

const KIND_BY_EXTENSION: Record<string, MediaKind> = Object.fromEntries(
  Object.entries(ALLOWED_UPLOAD).flatMap(([kind, list]) => list.map((ext) => [ext, kind as MediaKind])),
);

/** Formats recognised from the first bytes, so a renamed executable cannot slip in. */
const SIGNATURES: { family: string; test: (head: Buffer) => boolean }[] = [
  { family: 'png', test: (h) => h.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { family: 'jpeg', test: (h) => h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff },
  { family: 'gif', test: (h) => h.subarray(0, 3).toString('latin1') === 'GIF' },
  { family: 'webp', test: (h) => h.subarray(0, 4).toString('latin1') === 'RIFF' && h.subarray(8, 12).toString('latin1') === 'WEBP' },
  { family: 'wav', test: (h) => h.subarray(0, 4).toString('latin1') === 'RIFF' && h.subarray(8, 12).toString('latin1') === 'WAVE' },
  { family: 'avif', test: (h) => h.subarray(4, 8).toString('latin1') === 'ftyp' && /avif|avis/.test(h.subarray(8, 12).toString('latin1')) },
  { family: 'mp4', test: (h) => h.subarray(4, 8).toString('latin1') === 'ftyp' && /mp4|isom|M4V|avif/.test(h.subarray(8, 12).toString('latin1')) },
  { family: 'mov', test: (h) => h.subarray(4, 8).toString('latin1') === 'ftyp' },
  { family: 'webm', test: (h) => h[0] === 0x1a && h[1] === 0x45 && h[2] === 0xdf && h[3] === 0xa3 },
  { family: 'mp3', test: (h) => h.subarray(0, 3).toString('latin1') === 'ID3' || (h[0] === 0xff && (h[1] & 0xe0) === 0xe0) },
  { family: 'ogg', test: (h) => h.subarray(0, 4).toString('latin1') === 'OggS' },
  { family: 'pdf', test: (h) => h.subarray(0, 5).toString('latin1') === '%PDF-' },
  { family: 'zip', test: (h) => h[0] === 0x50 && h[1] === 0x4b && (h[2] === 0x03 || h[2] === 0x05 || h[2] === 0x07) },
];

const ZIP_FORMATS = ['zip', 'docx', 'xlsx', 'pptx'];
const TEXT_FORMATS = ['csv', 'svg'];

/** Formats the first bytes name differently from the extension a person types. */
const FAMILY_FOR_EXTENSION: Record<string, string> = { jpg: 'jpeg' };

function sniff(data: Uint8Array): string | null {
  const head = Buffer.from(data.slice(0, 16));
  if (head.every((byte) => byte === 0)) return 'executable';
  for (const signature of SIGNATURES) if (signature.test(head)) return signature.family;
  if (looksLikeSvg(data)) return 'svg';
  const head0 = head.toString('latin1');
  if (/^<?(xml|csv|text)/i.test(head0)) return head0.includes('<svg') ? 'svg' : 'csv';
  if (/^[\dA-Za-z".]/.test(head0.replace(/\uFEFF/, ''))) return 'csv';
  return null;
}

export interface Classified {
  kind: MediaKind;
  extension: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  pageCount: number | null;
}

export async function classify(originalName: string, data: Uint8Array): Promise<Classified> {
  const extension = extensionOf(originalName);
  if (!extension) throw new MediaUploadError('error.uploadNoExtension');
  if ((BLOCKED_EXTENSIONS as readonly string[]).includes(extension)) {
    throw new MediaUploadError('error.uploadBlockedType');
  }

  const kind = KIND_BY_EXTENSION[extension];
  if (!kind) throw new MediaUploadError('error.uploadExtRejected', { ext: extension });

  const family = sniff(data);
  if (family === null) throw new MediaUploadError('error.uploadUnreadable');
  if (family === 'executable') throw new MediaUploadError('error.uploadExecutable');

  const expected = FAMILY_FOR_EXTENSION[extension] ?? extension;
  const matches =
    expected === family ||
    (ZIP_FORMATS.includes(extension) && family === 'zip') ||
    (extension === 'mov' && family === 'mp4') ||
    (TEXT_FORMATS.includes(extension) && (family === 'csv' || family === 'svg')) ||
    (extension === 'svg' && family === 'svg');
  if (!matches) throw new MediaUploadError('error.uploadContentMismatch');

  const buffer = Buffer.from(data);
  let width: number | null = null;
  let height: number | null = null;
  let pageCount: number | null = null;

  if (kind === 'image' && extension !== 'svg') {
    try {
      const meta = await sharp(buffer).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;
    } catch {
      throw new MediaUploadError('error.uploadImageUnreadable');
    }
  } else if (kind === 'image') {
    const viewBox = buffer.toString('utf8').match(/viewBox="([\d.+\s-]+)"/i)?.[1]?.trim().split(/\s+/);
    width = viewBox ? Number.parseInt(viewBox[2], 10) || null : null;
    height = viewBox ? Number.parseInt(viewBox[3], 10) || null : null;
  } else if (extension === 'pdf') {
    pageCount = (buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length || null;
  }

  return { kind, extension, mimeType: mimeTypeFor(extension), width, height, pageCount };
}

const IMAGE_VARIANTS: { role: string; width: number; format: 'webp' | 'avif' }[] = [
  { role: MEDIA_VARIANT_ROLE.THUMB, width: 320, format: 'webp' },
  { role: MEDIA_VARIANT_ROLE.SMALL, width: 640, format: 'webp' },
  { role: MEDIA_VARIANT_ROLE.MEDIUM, width: 1200, format: 'webp' },
  { role: MEDIA_VARIANT_ROLE.LARGE, width: 1920, format: 'avif' },
];

/**
 * Writes resized WebP/AVIF copies next to the original. The original is always kept, and
 * variant paths are derived from it, so a later replacement reuses the same URLs.
 */
async function buildVariants(
  mediaRelativePath: string,
  original: Uint8Array,
  kind: MediaKind,
  extension: string,
  existing: { role: string; storagePath: string }[],
): Promise<{ role: string; storagePath: string; publicUrl: string; mimeType: string; sizeBytes: number; width: number; height: number }[]> {
  // Only raster images get optimised copies; SVG/GIF keep their own bytes, documents and media have nothing to resize.
  if (kind !== 'image' || extension === 'svg' || extension === 'gif') return [];

  const dir = path.dirname(mediaRelativePath).replace(/\\/g, '/');
  const stem = path.basename(mediaRelativePath, path.extname(mediaRelativePath));
  const byRole = new Map(existing.map((row) => [row.role, row.storagePath]));
  const meta = await sharp(Buffer.from(original), { animated: false }).metadata();
  const sourceWidth = meta.width ?? 0;

  const created: { role: string; storagePath: string; publicUrl: string; mimeType: string; sizeBytes: number; width: number; height: number }[] = [];

  for (const variant of IMAGE_VARIANTS) {
    if (sourceWidth && sourceWidth < variant.width) continue;
    const target =
      byRole.get(variant.role) ?? `${dir}/${stem}-${variant.role}-${variant.width}.${variant.format}`;
    const output = await sharp(Buffer.from(original), { animated: false })
      .resize({ width: variant.width, withoutEnlargement: true })
      [variant.format]({ quality: variant.format === 'webp' ? 78 : 52 })
      .toBuffer({ resolveWithObject: true });

    await writeAsset(target, output.data);
    created.push({
      role: variant.role,
      storagePath: target,
      publicUrl: publicUrlFor(target),
      mimeType: variant.format === 'webp' ? 'image/webp' : 'image/avif',
      sizeBytes: output.info.size,
      width: output.info.width,
      height: output.info.height,
    });
  }

  return created;
}

export interface StoreInput {
  originalName: string;
  data: Uint8Array;
  folderId?: string | null;
  altText?: string | null;
  title?: string | null;
  caption?: string | null;
  userId?: string | null;
}

/** Creates the Media row plus its variants. Throws MediaUploadError on rejected input. */
export async function storeUpload(input: StoreInput) {
  if (input.data.byteLength === 0) throw new MediaUploadError('error.uploadEmpty');

  const info = await classify(input.originalName, input.data);
  if (input.data.byteLength > MAX_BYTES[info.kind]) {
    throw new MediaUploadError('error.uploadTooLarge', { limit: Math.round(MAX_BYTES[info.kind] / 1024 / 1024) });
  }

  let payload: Uint8Array = input.data;
  if (info.extension === 'svg') {
    payload = Buffer.from(sanitizeSvg(Buffer.from(input.data).toString('utf8')), 'utf8');
  }

  const relative = relativePathFor(input.originalName);
  await writeAsset(relative, payload);

  const media = await prisma.media.create({
    data: {
      folderId: input.folderId || null,
      filename: path.basename(relative),
      originalName: input.originalName.slice(0, 240),
      kind: info.kind,
      mimeType: info.mimeType,
      extension: info.extension,
      sizeBytes: payload.byteLength,
      width: info.width,
      height: info.height,
      pageCount: info.pageCount,
      altText: input.altText?.trim() || (info.kind === 'image' ? input.originalName.replace(/\.[^.]+$/, '').slice(0, 240) : null),
      title: input.title?.trim() || null,
      caption: input.caption?.trim() || null,
      storagePath: relative,
      publicUrl: publicUrlFor(relative),
      checksum: checksum(payload),
      status: MEDIA_STATUS.PROCESSING,
      uploadedById: input.userId ?? null,
    },
  });

  try {
    const variants = await buildVariants(relative, payload, info.kind, info.extension, []);
    if (variants.length) {
      await prisma.mediaVariant.createMany({ data: variants.map((row) => ({ ...row, mediaId: media.id })) });
    }
    await prisma.media.update({ where: { id: media.id }, data: { status: MEDIA_STATUS.READY } });
  } catch (error) {
    // A missing optimised copy must not lose the upload: the original is already on disk.
    console.error('variant generation failed', error);
    await prisma.media.update({
      where: { id: media.id },
      data: { status: MEDIA_STATUS.READY, error: error instanceof Error ? error.message.slice(0, 300) : 'variant failed' },
    });
  }

  return prisma.media.findUniqueOrThrow({
    where: { id: media.id },
    include: { variants: true, folder: true, _count: { select: { links: true } } },
  });
}

/**
 * Swaps the bytes behind an existing asset. The stored path and publicUrl never change,
 * so every material that already links this file keeps working — the requirement
 * "replace the file without changing the URL of the material".
 */
export async function replaceUpload(mediaId: string, input: { originalName: string; data: Uint8Array }) {
  const existing = await prisma.media.findUnique({ where: { id: mediaId }, include: { variants: true } });
  if (!existing) throw new MediaUploadError('error.mediaGone');

  const info = await classify(input.originalName, input.data);
  if (input.data.byteLength > MAX_BYTES[info.kind]) {
    throw new MediaUploadError('error.uploadTooLarge', { limit: Math.round(MAX_BYTES[info.kind] / 1024 / 1024) });
  }

  let payload: Uint8Array = input.data;
  if (info.extension === 'svg') payload = Buffer.from(sanitizeSvg(Buffer.from(input.data).toString('utf8')), 'utf8');

  await writeAsset(existing.storagePath, payload);

  for (const variant of existing.variants) await removeAsset(variant.storagePath);
  await prisma.mediaVariant.deleteMany({ where: { mediaId } });

  // Losing the optimised copies must not abort the swap: the new bytes are already live at the same URL.
  let variantError: string | null = null;
  try {
    const variants = await buildVariants(existing.storagePath, payload, info.kind, info.extension, existing.variants);
    if (variants.length) {
      await prisma.mediaVariant.createMany({ data: variants.map((row) => ({ ...row, mediaId })) });
    }
  } catch (error) {
    console.error('variant generation failed', error);
    variantError = error instanceof Error ? error.message.slice(0, 300) : 'variant failed';
  }

  return prisma.media.update({
    where: { id: mediaId },
    data: {
      kind: info.kind,
      mimeType: info.mimeType,
      extension: info.extension,
      sizeBytes: payload.byteLength,
      width: info.width,
      height: info.height,
      pageCount: info.pageCount,
      checksum: checksum(payload),
      status: MEDIA_STATUS.READY,
      error: variantError,
      replacedCount: { increment: 1 },
      lastReplacedAt: new Date(),
    },
    include: { variants: true, folder: true, _count: { select: { links: true } } },
  });
}

/** Deletes the database rows and the files behind them. Content links cascade in the schema. */
export async function purgeMedia(mediaId: string): Promise<number> {
  const media = await prisma.media.findUnique({ where: { id: mediaId }, include: { variants: true } });
  if (!media) return 0;

  await prisma.media.delete({ where: { id: mediaId } });
  await removeAsset(media.storagePath);
  for (const variant of media.variants) await removeAsset(variant.storagePath);
  return 1;
}
