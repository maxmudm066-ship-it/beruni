import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/session';
import { getAdminLocale, mediaPickerLabels, translate, type AdminLocale, type TranslationKey } from '@/lib/admin/i18n';
import { SECTION_SHAPES, BLOCK_ITEMS_MAX, BLOCK_SOURCE, isSectionType, readConfig } from '@/lib/admin/homepage-sections';
import { blockCandidates, blockItems } from '@/lib/admin/homepage-items';
import { CONTENT_TYPE_MAP } from '@/lib/content-types';
import { toPickedMedia } from '@/lib/content/media-value';
import { PageHeader } from '@/components/admin/page-header';
import { ImageField } from '@/components/admin/image-field';
import { HomepageItems } from '@/components/admin/homepage-items';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { deleteSection, saveSection } from '../actions';
import { HOME_NOTICES } from '../notices';

/**
 * One homepage block: its texts in every site language, its pictures and the handful of layout
 * settings that belong to this block type. Everything the block can hold is on this one screen.
 */
export default async function HomepageSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('homepage.manage');
  const locale = await getAdminLocale(user.language as AdminLocale);
  const t = (key: TranslationKey) => translate(locale, key);
  const { id } = await params;
  const query = await searchParams;

  const [section, languages] = await Promise.all([
    prisma.homepageSection.findUnique({
      where: { id },
      include: { contents: { select: { lang: true, heading: true, subheading: true, body: true, buttonText: true, buttonUrl: true, button2Text: true, button2Url: true } } },
    }),
    prisma.language.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { code: true, nativeName: true },
    }),
  ]);
  if (!section || !isSectionType(section.type)) notFound();

  const shape = SECTION_SHAPES[section.type];
  const config = readConfig(section.type, section.config);
  const imageId = typeof config.imageId === 'string' && config.imageId ? config.imageId : '';
  const media = imageId
    ? await prisma.media.findFirst({ where: { id: imageId, kind: 'image' }, include: { variants: true } })
    : null;

  // Chosen materials and the ones that may still be chosen, in the language the person works in.
  const picked = shape.items ? await blockItems(section.id, locale) : [];
  const candidates = shape.items ? await blockCandidates(section.type, locale, picked.map((row) => row.groupId)) : [];
  const typeLabels = Object.fromEntries(
    [...new Set([...picked, ...candidates].map((row) => row.typeKey))]
      .filter((key) => CONTENT_TYPE_MAP.has(key))
      .map((key) => [key, t(`type.${key}` as TranslationKey)]),
  );

  const text = (lang: string, field: 'heading' | 'subheading' | 'body' | 'buttonText' | 'buttonUrl' | 'button2Text' | 'button2Url') =>
    section.contents.find((row) => row.lang === lang)?.[field] ?? '';

  const back = '/admin/homepage';
  const noticeKey = typeof query.notice === 'string' ? HOME_NOTICES[query.notice] : undefined;
  const notice = noticeKey ? t(noticeKey) : '';
  const confirmDelete = query.delete === '1';

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        title={t(shape.labelKey)}
        description={t('home.note')}
        backHref={back}
        backLabel={t('home.backToList')}
        actions={
          confirmDelete ? undefined : (
            <Button asChild size="sm" variant="ghost" className="text-destructive">
              <Link href={`/admin/homepage/${section.id}?delete=1`}>
                <Trash2 />
                {t('home.delete')}
              </Link>
            </Button>
          )
        }
      />

      {notice ? (
        <p className="mb-4 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm" role="status">
          {notice}
        </p>
      ) : null}

      {confirmDelete ? (
        <Card className="mb-6 border-destructive/40">
          <CardContent className="space-y-3 pt-6">
            <p className="text-sm text-destructive">{t('home.deleteHint')}</p>
            <div className="flex flex-wrap items-center gap-2">
              <form action={deleteSection}>
                <input type="hidden" name="id" value={section.id} />
                <input type="hidden" name="back" value={back} />
                <Button type="submit" size="sm" variant="destructive">
                  {t('home.delete')}
                </Button>
              </form>
              <Button asChild size="sm" variant="ghost">
                <Link href={`/admin/homepage/${section.id}`}>{t('common.cancel')}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <form action={saveSection} className="space-y-6">
        <input type="hidden" name="id" value={section.id} />
        <input type="hidden" name="back" value={`/admin/homepage/${section.id}`} />

        <Card>
          <CardContent className="flex flex-wrap items-center gap-4 pt-6">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isEnabled" defaultChecked={section.isEnabled} className="size-4 accent-primary" />
              {t('home.show')}
            </label>
            {section.isEnabled ? null : (
              <p className="text-xs text-muted-foreground">{t('home.hiddenBlock')}</p>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {t('home.position')}: {section.sortOrder + 1}
            </span>
          </CardContent>
        </Card>

        {shape.config.length ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('home.settings')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {shape.config.map((field) => {
                if (field.kind === 'image') {
                  return (
                    <div key={field.name} className="space-y-1.5">
                      <p className="text-xs text-muted-foreground">{t('home.image')}</p>
                      <ImageField
                        name={`cfg:${field.name}`}
                        value={media ? toPickedMedia(media) : null}
                        labels={{
                          pick: t('media.pickFromLibrary'),
                          change: t('media.change'),
                          remove: t('media.remove'),
                          title: t('media.pickFromLibrary'),
                        }}
                        pickerLabels={mediaPickerLabels(locale)}
                      />
                    </div>
                  );
                }
                if (field.kind === 'boolean') {
                  return (
                    <label key={field.name} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name={`cfg:${field.name}`}
                        defaultChecked={config[field.name] === true}
                        className="size-4 accent-primary"
                      />
                      {t(field.labelKey)}
                    </label>
                  );
                }
                if (field.kind === 'number') {
                  return (
                    <div key={field.name} className="max-w-40 space-y-1">
                      <label htmlFor={`cfg-${field.name}`} className="text-xs text-muted-foreground">
                        {t(field.labelKey)}
                      </label>
                      <Input
                        id={`cfg-${field.name}`}
                        name={`cfg:${field.name}`}
                        type="number"
                        min={field.min}
                        max={field.max}
                        defaultValue={Number(config[field.name])}
                      />
                    </div>
                  );
                }
                return (
                  <div key={field.name} className="max-w-64 space-y-1">
                    <label htmlFor={`cfg-${field.name}`} className="text-xs text-muted-foreground">
                      {t(field.labelKey)}
                    </label>
                    <select
                      id={`cfg-${field.name}`}
                      name={`cfg:${field.name}`}
                      defaultValue={String(config[field.name])}
                      className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                    >
                      {field.options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {t(option.labelKey)}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ) : null}

        {shape.items ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('home.items')}</CardTitle>
              <CardDescription>{t(BLOCK_SOURCE[section.type] ? 'home.itemsHint' : 'home.itemsHintCurated')}</CardDescription>
            </CardHeader>
            <CardContent>
              <HomepageItems
                items={picked}
                options={candidates}
                max={BLOCK_ITEMS_MAX}
                typeLabels={typeLabels}
                labels={{
                  search: t('form.relatedSearch'),
                  add: t('common.add'),
                  remove: t('media.remove'),
                  up: t('order.moveUp'),
                  down: t('order.moveDown'),
                  empty: t('home.noItems'),
                  noneFound: t('form.noRelated'),
                  limit: t('home.itemLimit'),
                }}
              />
            </CardContent>
          </Card>
        ) : null}

        <div>
          <h2 className="font-heading text-lg font-semibold">{t('home.texts')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('home.textsHint')}</p>
        </div>

        {languages.map((language) => (
          <Card key={language.code}>
            <CardHeader>
              <CardTitle className="text-base">{language.nativeName}</CardTitle>
              <CardDescription>{language.code.toUpperCase()}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <label htmlFor={`heading-${language.code}`} className="text-xs text-muted-foreground">
                  {t('home.heading')}
                </label>
                <Input
                  id={`heading-${language.code}`}
                  name={`heading:${language.code}`}
                  defaultValue={text(language.code, 'heading')}
                  maxLength={300}
                />
              </div>

              {shape.subheading ? (
                <div className="space-y-1">
                  <label htmlFor={`subheading-${language.code}`} className="text-xs text-muted-foreground">
                    {t('home.subheading')}
                  </label>
                  <Textarea
                    id={`subheading-${language.code}`}
                    name={`subheading:${language.code}`}
                    defaultValue={text(language.code, 'subheading')}
                    maxLength={400}
                    rows={2}
                  />
                </div>
              ) : null}

              {shape.body ? (
                <div className="space-y-1">
                  <label htmlFor={`body-${language.code}`} className="text-xs text-muted-foreground">
                    {t('home.body')}
                  </label>
                  <Textarea
                    id={`body-${language.code}`}
                    name={`body:${language.code}`}
                    defaultValue={text(language.code, 'body')}
                    maxLength={8000}
                    rows={5}
                  />
                </div>
              ) : null}

              {shape.buttons >= 1 ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor={`buttonText-${language.code}`} className="text-xs text-muted-foreground">
                      {t('home.buttonText')}
                    </label>
                    <Input
                      id={`buttonText-${language.code}`}
                      name={`buttonText:${language.code}`}
                      defaultValue={text(language.code, 'buttonText')}
                      maxLength={80}
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor={`buttonUrl-${language.code}`} className="text-xs text-muted-foreground">
                      {t('home.buttonUrl')}
                    </label>
                    <Input
                      id={`buttonUrl-${language.code}`}
                      name={`buttonUrl:${language.code}`}
                      defaultValue={text(language.code, 'buttonUrl')}
                      maxLength={500}
                      placeholder="/news"
                    />
                  </div>
                </div>
              ) : null}

              {shape.buttons >= 2 ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor={`button2Text-${language.code}`} className="text-xs text-muted-foreground">
                      {t('home.button2Text')}
                    </label>
                    <Input
                      id={`button2Text-${language.code}`}
                      name={`button2Text:${language.code}`}
                      defaultValue={text(language.code, 'button2Text')}
                      maxLength={80}
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor={`button2Url-${language.code}`} className="text-xs text-muted-foreground">
                      {t('home.button2Url')}
                    </label>
                    <Input
                      id={`button2Url-${language.code}`}
                      name={`button2Url:${language.code}`}
                      defaultValue={text(language.code, 'button2Url')}
                      maxLength={500}
                      placeholder="/manuscripts"
                    />
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit">{t('common.save')}</Button>
          <Button asChild variant="ghost">
            <Link href={back}>{t('common.cancel')}</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
