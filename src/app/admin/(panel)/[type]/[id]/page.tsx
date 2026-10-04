import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/session';
import { getAdminLocale, translate, type AdminLocale, type TranslationKey } from '@/lib/admin/i18n';
import { CONTENT_TYPE_MAP } from '@/lib/content-types';
import { buildMaterialFormInit, materialPermissions } from '@/lib/content/material-read';
import { MaterialForm } from '@/components/admin/form/material-form';
import { PageHeader } from '@/components/admin/page-header';
import { Button } from '@/components/ui/button';
import { saveMaterial, trashMaterial } from '../actions';

export default async function EditMaterialPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { type, id } = await params;
  const def = CONTENT_TYPE_MAP.get(type);
  if (!def) notFound();

  const user = await requirePermission(`${def.key}.view`);
  const item = await prisma.contentItem.findUnique({
    where: { id },
    select: {
      id: true,
      lang: true,
      title: true,
      status: true,
      origin: true,
      rejectReason: true,
      deletedAt: true,
      group: { select: { type: true, sourceLang: true } },
    },
  });
  if (!item || item.group.type !== def.key) notFound();

  const query = await searchParams;
  const locale = await getAdminLocale(user.language as AdminLocale);
  const t = (key: TranslationKey) => translate(locale, key);
  const mayTrash = !item.deletedAt && (user.permissions.includes('*') || user.permissions.includes(`${def.key}.delete`));
  const init = await buildMaterialFormInit({
    typeKey: def.key,
    itemId: item.id,
    lang: item.lang,
    locale,
    permissions: materialPermissions(user, def.key),
  });

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title={item.title}
        description={item.deletedAt ? t('form.trashed') : undefined}
        backHref={`/admin/${def.key}`}
        backLabel={t('form.back')}
        actions={
          <>
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/${def.key}/${item.id}/versions`}>{t('ver.title')}</Link>
            </Button>
            {mayTrash ? (
              <form action={trashMaterial}>
                <input type="hidden" name="type" value={def.key} />
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="back" value={`/admin/${def.key}/${item.id}`} />
                <Button type="submit" size="sm" variant="outline" title={t('trash.note')} className="text-destructive hover:text-destructive">
                  {t('trash.moveTo')}
                </Button>
              </form>
            ) : null}
          </>
        }
      />
      {typeof query.translation === 'string' && item.origin === 'translation' ? (
        <p role="status" className="mb-4 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          {t('trans.added')} ({t('trans.source')}: <span className="uppercase">{item.group.sourceLang}</span>)
        </p>
      ) : null}

      {item.status === 'draft' && item.rejectReason ? (
        <p
          role="status"
          className="mb-4 rounded-md border border-amber-400/50 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        >
          {t('review.rejectedReason')}: {item.rejectReason}
        </p>
      ) : null}

      <MaterialForm init={init} action={saveMaterial} />
    </div>
  );
}
