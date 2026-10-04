import Link from 'next/link';
import { ExternalLink, Link2Off, Search } from 'lucide-react';
import { translate, type AdminLocale, type TranslationKey } from '@/lib/admin/labels';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export interface MenuItemFormParent {
  id: string;
  title: string;
  depth: number;
}

export interface MenuItemFormValues {
  parentId: string | null;
  targetType: string;
  targetUrl: string | null;
  isVisible: boolean;
  openInNewTab: boolean;
  isMegaMenu: boolean;
  titles: Record<string, string>;
  /** Material the item points at, when it points at one. */
  material: { groupId: string; title: string } | null;
}

const TARGET_LABELS: Record<string, TranslationKey> = {
  page: 'menu.targetPage',
  content: 'menu.targetContent',
  external: 'menu.targetExternal',
  section: 'menu.targetSection',
};

const TARGET_HINTS: Record<string, TranslationKey> = {
  page: 'menu.pageHint',
  external: 'menu.externalHint',
  section: 'menu.anchorHint',
};

/**
 * The item editor, shared by "new item" and "edit item".
 *
 * A plain form post — nothing here needs JavaScript. The material picker lives on its own screen,
 * so searching for a material can never throw away text somebody has already typed here.
 */
export function MenuItemForm({
  menuId,
  itemId,
  locale,
  languages,
  parents,
  values,
  action,
  unlinkAction,
}: {
  menuId: string;
  /** Empty while creating. */
  itemId: string;
  locale: AdminLocale;
  languages: { code: string; nativeName: string }[];
  parents: MenuItemFormParent[];
  values: MenuItemFormValues;
  action: (form: FormData) => Promise<void>;
  unlinkAction?: (form: FormData) => Promise<void>;
}) {
  const t = (key: TranslationKey) => translate(locale, key);
  const back = `/admin/menus/${menuId}`;
  const pickerHref = `${back}/pick?item=${itemId}`;
  const showUnlink = Boolean(unlinkAction && itemId && values.material);
  // Every field here is uncontrolled, and a server action returns through a client-side
  // navigation: without a new key React would keep the DOM values from before the save.
  const revision = [
    itemId,
    values.targetType,
    values.targetUrl,
    values.parentId,
    values.material?.groupId ?? '',
    Number(values.isVisible),
    Number(values.openInNewTab),
    Number(values.isMegaMenu),
    languages.map((language) => values.titles[language.code] ?? '').join('\u0000'),
  ].join('|');

  return (
    <>
      <form key={revision} action={action} className="space-y-6">
        <input type="hidden" name="id" value={menuId} />
        <input type="hidden" name="item" value={itemId} />
        <input type="hidden" name="back" value={itemId ? `${back}/item/${itemId}` : back} />
        <input type="hidden" name="contentGroupId" value={values.material?.groupId ?? ''} />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('menu.titles')}</CardTitle>
            <CardDescription>{t('menu.titlesHint')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {languages.map((language) => (
              <div key={language.code} className="space-y-1">
                <label htmlFor={`title-${language.code}`} className="text-xs text-muted-foreground">
                  {language.nativeName}
                </label>
                <Input
                  id={`title-${language.code}`}
                  name={`title:${language.code}`}
                  defaultValue={values.titles[language.code] ?? ''}
                  maxLength={200}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('menu.linkTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="targetType" className="text-xs text-muted-foreground">
                  {t('menu.targetType')}
                </label>
                <select
                  id="targetType"
                  name="targetType"
                  defaultValue={values.targetType}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  {Object.entries(TARGET_LABELS).map(([value, key]) => (
                    <option key={value} value={value}>
                      {t(key)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor="parent" className="text-xs text-muted-foreground">
                  {t('menu.parent')}
                </label>
                <select
                  id="parent"
                  name="parent"
                  defaultValue={values.parentId ?? ''}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  <option value="">{t('menu.parentNone')}</option>
                  {parents.map((parent) => (
                    <option key={parent.id} value={parent.id}>
                      {'— '.repeat(parent.depth)}
                      {parent.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="targetUrl" className="text-xs text-muted-foreground">
                {t('menu.targetUrl')}
              </label>
              <Input
                id="targetUrl"
                name="targetUrl"
                defaultValue={values.targetUrl ?? ''}
                maxLength={500}
                placeholder={values.targetType === 'external' ? 'https://' : '/news'}
                readOnly={values.targetType === 'content'}
                className={values.targetType === 'content' ? 'bg-muted' : undefined}
              />
              <p className="text-xs text-muted-foreground">
                {t(TARGET_HINTS[values.targetType] ?? 'menu.pageHint')}
                {values.targetType === 'content' ? ` ${t('menu.pickMaterialHint')}` : ''}
              </p>
            </div>

            {values.targetType === 'content' ? (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                {values.material ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{values.material.title}</span>
                    {itemId ? (
                      <>
                        <Button asChild size="sm" variant="outline" className="h-7 px-2">
                          <Link href={pickerHref}>
                            <Search />
                            {t('menu.changeMaterial')}
                          </Link>
                        </Button>
                        {showUnlink ? (
                          <Button type="submit" form="unlink-material" size="sm" variant="ghost" className="h-7 px-2">
                            <Link2Off />
                            {t('menu.unlinkMaterial')}
                          </Button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                ) : itemId ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={pickerHref}>
                      <Search />
                      {t('menu.pickMaterial')}
                    </Link>
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">{t('menu.pickAfterSave')}</p>
                )}
              </div>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-3">
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="isVisible" defaultChecked={values.isVisible} className="mt-0.5 size-4 accent-primary" />
                {t('menu.visible')}
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="openInNewTab"
                  defaultChecked={values.openInNewTab}
                  className="mt-0.5 size-4 accent-primary"
                />
                {t('menu.newTab')}
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="isMegaMenu" defaultChecked={values.isMegaMenu} className="mt-0.5 size-4 accent-primary" />
                {t('menu.mega')}
              </label>
            </div>
            <p className="text-xs text-muted-foreground">{t('menu.megaHint')}</p>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit">{t('common.save')}</Button>
          <Button asChild variant="ghost">
            <Link href={back}>{t('common.cancel')}</Link>
          </Button>
          {values.targetType === 'external' && values.targetUrl ? (
            <a
              href={values.targetUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline"
            >
              <ExternalLink className="size-3.5" />
              {t('common.open')}
            </a>
          ) : null}
        </div>
      </form>

      {showUnlink && unlinkAction ? (
        /* Sibling of the editor form: nesting a form inside a form is not allowed in HTML, and the
           unlink button above reaches this one through its form attribute. */
        <form id="unlink-material" action={unlinkAction} className="hidden">
          <input type="hidden" name="item" value={itemId} />
          <input type="hidden" name="back" value={`${back}/item/${itemId}`} />
        </form>
      ) : null}
    </>
  );
}
