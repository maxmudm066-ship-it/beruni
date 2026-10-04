import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/session';
import { getAdminLocale, translate, type AdminLocale, type TranslationKey } from '@/lib/admin/i18n';
import { PageHeader } from '@/components/admin/page-header';
import { MenuItemForm } from '@/components/admin/menu-item-form';
import { saveMenuItem } from '../../../actions';
import { loadMenuItemForm, readDraft } from '../../../item-data';
import { MENU_NOTICES } from '../../../notices';

export default async function NewMenuItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('menus.manage');
  const locale = await getAdminLocale(user.language as AdminLocale);
  const t = (key: TranslationKey) => translate(locale, key);
  const { id } = await params;
  const query = await searchParams;
  const draft = readDraft(query);

  const data = await loadMenuItemForm(id, null, locale, draft);
  if (!data) notFound();

  // "Add a sub-item" arrives with the future parent already chosen.
  const parent = typeof query.parent === 'string' ? query.parent : '';
  const values =
    !draft && parent && data.parents.some((row) => row.id === parent)
      ? { ...data.values, parentId: parent }
      : data.values;

  const noticeKey = typeof query.notice === 'string' ? MENU_NOTICES[query.notice] : undefined;
  const notice = noticeKey ? t(noticeKey) : '';

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title={t('menu.newItem')}
        description={data.menu.name}
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
        itemId=""
        locale={locale}
        languages={data.languages}
        parents={data.parents}
        values={values}
        action={saveMenuItem}
      />
    </div>
  );
}
