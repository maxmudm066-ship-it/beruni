import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/session';
import { getAdminLocale, translate, type AdminLocale, type TranslationKey } from '@/lib/admin/i18n';
import { PageHeader } from '@/components/admin/page-header';
import { MenuItemForm } from '@/components/admin/menu-item-form';
import { saveMenuItem, unlinkMenuMaterial } from '../../../actions';
import { loadMenuItemForm, readDraft } from '../../../item-data';
import { MENU_NOTICES } from '../../../notices';

export default async function EditMenuItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; itemId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('menus.manage');
  const locale = await getAdminLocale(user.language as AdminLocale);
  const t = (key: TranslationKey) => translate(locale, key);
  const { id, itemId } = await params;
  const query = await searchParams;

  const data = await loadMenuItemForm(id, itemId, locale, readDraft(query));
  if (!data) notFound();

  const noticeKey = typeof query.notice === 'string' ? MENU_NOTICES[query.notice] : undefined;
  const notice = noticeKey ? t(noticeKey) : '';
  const title =
    data.values.titles[locale] ?? data.values.titles.ru ?? Object.values(data.values.titles)[0] ?? t('menu.editItem');

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title={title}
        description={`${data.menu.name} · ${t('menu.editItem')}`}
        backHref={`/admin/menus/${data.menu.id}`}
        backLabel={t('menu.backToItems')}
      />

      {notice ? (
        <p className="mb-4 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm" role="status">
          {notice}
        </p>
      ) : null}

      <MenuItemForm
        menuId={data.menu.id}
        itemId={itemId}
        locale={locale}
        languages={data.languages}
        parents={data.parents}
        values={data.values}
        action={saveMenuItem}
        unlinkAction={data.values.material ? unlinkMenuMaterial : undefined}
      />
    </div>
  );
}
