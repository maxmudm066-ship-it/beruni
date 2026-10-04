import { Prisma } from '@/generated/prisma/client';
import { requirePermission } from '@/lib/auth/session';
import { getAdminLocale, translate } from '@/lib/admin/i18n';
import { mediaLibraryLabels, type TranslationKey } from '@/lib/admin/labels';
import { prisma } from '@/lib/db';
import { MEDIA_KIND } from '@/lib/enums';
import { folderPaths, toPickedMedia } from '@/lib/media/serialize';
import { PageHeader } from '@/components/admin/page-header';
import { MediaLibrary } from '@/components/admin/media/media-library';

export const dynamic = 'force-dynamic';

type SearchParams = { q?: string; kind?: string; folderId?: string; status?: string };

function has(permission: string, permissions: string[]) {
  return permissions.includes('*') || permissions.includes(permission);
}

export default async function MediaLibraryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePermission('media.view');
  const locale = await getAdminLocale(user.language as 'ru' | 'en' | 'uz');
  const t = (key: TranslationKey) => translate(locale, key);
  const sp = await searchParams;

  const filters = {
    q: sp.q?.trim() ?? '',
    kind: (Object.values(MEDIA_KIND) as string[]).includes(sp.kind ?? '') ? (sp.kind as string) : '',
    folderId: sp.folderId ?? '',
    status: ['processing', 'ready', 'failed'].includes(sp.status ?? '') ? (sp.status as string) : '',
  };

  const where: Prisma.MediaWhereInput = {
    ...(filters.kind ? { kind: filters.kind } : {}),
    ...(filters.folderId ? (filters.folderId === 'none' ? { folderId: null } : { folderId: filters.folderId }) : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.q
      ? {
          OR: [
            { originalName: { contains: filters.q } },
            { filename: { contains: filters.q } },
            { altText: { contains: filters.q } },
            { caption: { contains: filters.q } },
            { title: { contains: filters.q } },
          ],
        }
      : {}),
  };

  const [rows, total, folders, paths, grouped, failed] = await Promise.all([
    prisma.media.findMany({
      where,
      include: { variants: true, _count: { select: { links: true } } },
      orderBy: { createdAt: 'desc' },
      take: 60,
    }),
    prisma.media.count({ where }),
    prisma.mediaFolder.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, parentId: true } }),
    folderPaths(),
    prisma.media.groupBy({ by: ['kind'], _count: { _all: true } }),
    prisma.media.count({ where: { status: 'failed' } }),
  ]);

  const counts: Record<string, number> = { failed };
  let all = 0;
  for (const kind of Object.values(MEDIA_KIND)) counts[kind] = 0;
  for (const group of grouped) {
    counts[group.kind] = group._count._all;
    all += group._count._all;
  }
  counts.all = all;

  const init = {
    items: rows.map((row) => toPickedMedia(row, row.folderId ? (paths.get(row.folderId) ?? null) : null, row._count.links)),
    total,
    counts,
    folders: folders.map((folder) => ({ id: folder.id, name: folder.name, parentId: folder.parentId, path: paths.get(folder.id) ?? folder.name })),
    filters,
    canUpload: has('media.upload', user.permissions),
    canEdit: has('media.edit', user.permissions),
    canDelete: has('media.delete', user.permissions),
  };

  return (
    <>
      <PageHeader title={t('nav.mediaLibrary')} description={t('media.libraryHint')} />
      <MediaLibrary init={init} labels={mediaLibraryLabels(locale)} />
    </>
  );
}
