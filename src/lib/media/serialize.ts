import 'server-only';
import { prisma } from '@/lib/db';
import { MEDIA_VARIANT_ROLE } from '@/lib/enums';

/** Flattens the folder tree into "News/2024" style paths, one query for all folders. */
export async function folderPaths(): Promise<Map<string, string>> {
  const folders = await prisma.mediaFolder.findMany({ select: { id: true, name: true, parentId: true } });
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const paths = new Map<string, string>();

  const resolve = (id: string, guard: number): string => {
    const cached = paths.get(id);
    if (cached) return cached;
    const folder = byId.get(id);
    if (!folder || guard > 10) return folder?.name ?? '';
    const parent = folder.parentId && folder.parentId !== id ? resolve(folder.parentId, guard + 1) : '';
    const value = parent ? `${parent}/${folder.name}` : folder.name;
    paths.set(id, value);
    return value;
  };

  for (const folder of folders) resolve(folder.id, 0);
  return paths;
}

/** The shape the Media Library grid, the picker and the form fields all consume. */
export function toPickedMedia(
  media: {
    id: string;
    kind: string;
    mimeType: string;
    sizeBytes: number;
    width: number | null;
    height: number | null;
    altText: string | null;
    title: string | null;
    caption: string | null;
    originalName: string;
    filename: string;
    publicUrl: string;
    status: string;
    folderId: string | null;
    createdAt: Date;
    updatedAt: Date;
    replacedCount?: number;
    error?: string | null;
    variants: { role: string; publicUrl: string; width: number | null }[];
  },
  folderPath: string | null,
  usedIn?: number,
) {
  const thumb =
    media.variants.find((variant) => variant.role === MEDIA_VARIANT_ROLE.THUMB)?.publicUrl ??
    media.variants.find((variant) => variant.role === MEDIA_VARIANT_ROLE.SMALL)?.publicUrl ??
    (media.kind === 'image' ? media.publicUrl : '');

  return {
    id: media.id,
    kind: media.kind as 'image' | 'document' | 'video' | 'audio' | 'other',
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
    thumbUrl: thumb || media.publicUrl,
    status: media.status,
    folderId: media.folderId,
    folderPath,
    usedIn: usedIn ?? null,
    variantCount: media.variants.length,
    replacedCount: media.replacedCount ?? 0,
    error: media.error ?? null,
    createdAt: media.createdAt.toISOString(),
    updatedAt: media.updatedAt.toISOString(),
  };
}

export type PickedMediaDto = ReturnType<typeof toPickedMedia>;
