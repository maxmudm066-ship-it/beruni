import 'server-only';
import type { Media as MediaRecord, MediaVariant } from '@/generated/prisma/client';
import type { MediaFieldValue } from '@/lib/content/form-types';
import type { PickedMedia } from '@/components/admin/media/media-types';

export type MediaWithRelations = MediaRecord & {
  variants?: MediaVariant[];
  folderPath?: string | null;
};

/**
 * Shape the Media Library picker and every material form work with. `thumbUrl` falls back to the
 * original while a file is still being processed, so a freshly uploaded image is never blank.
 */
export function toPickedMedia(media: MediaWithRelations): PickedMedia {
  const variants = media.variants ?? [];
  const thumb = variants.find((variant) => variant.role === 'thumb') ?? variants.find((variant) => variant.role === 'small');
  return {
    id: media.id,
    kind: media.kind as PickedMedia['kind'],
    mimeType: media.mimeType,
    sizeBytes: media.sizeBytes,
    width: media.width,
    height: media.height,
    altText: media.altText,
    title: media.title,
    caption: media.caption,
    originalName: media.originalName,
    filename: media.filename,
    publicUrl: media.publicUrl,
    thumbUrl: thumb?.publicUrl ?? media.publicUrl,
    status: media.status,
    folderId: media.folderId,
    folderPath: media.folderPath ?? null,
    createdAt: media.createdAt.toISOString(),
    updatedAt: media.updatedAt.toISOString(),
  };
}

export function toMediaFieldValue(media: MediaWithRelations, caption: string | null): MediaFieldValue {
  const asset = toPickedMedia(media);
  return { asset, caption: caption ?? asset.caption ?? '' };
}
