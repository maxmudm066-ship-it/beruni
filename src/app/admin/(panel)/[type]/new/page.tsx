import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/session';
import { getAdminLocale, translate, type AdminLocale, type TranslationKey } from '@/lib/admin/i18n';
import { CONTENT_TYPE_MAP } from '@/lib/content-types';
import { buildMaterialFormInit, materialPermissions, typeLabel } from '@/lib/content/material-read';
import { MaterialForm } from '@/components/admin/form/material-form';
import { PageHeader } from '@/components/admin/page-header';
import { saveMaterial } from '../actions';

export default async function NewMaterialPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const def = CONTENT_TYPE_MAP.get(type);
  if (!def) notFound();

  const user = await requirePermission(`${def.key}.view`);
  const locale = await getAdminLocale(user.language as AdminLocale);
  const init = await buildMaterialFormInit({
    typeKey: def.key,
    itemId: null,
    // A new material starts in the language the administrator is working in.
    lang: locale,
    locale,
    permissions: materialPermissions(user, def.key),
  });

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title={`${translate(locale, 'form.new' as TranslationKey)} · ${typeLabel(locale, def.key)}`}
        backHref={`/admin/${def.key}`}
        backLabel={translate(locale, 'form.back' as TranslationKey)}
      />
      <MaterialForm init={init} action={saveMaterial} />
    </div>
  );
}
