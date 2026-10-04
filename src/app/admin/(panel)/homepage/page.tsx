import Link from 'next/link';
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/session';
import { getAdminLocale, translate, type AdminLocale, type TranslationKey } from '@/lib/admin/i18n';
import { SECTION_SHAPES, SECTION_TYPES, sectionLabel } from '@/lib/admin/homepage-sections';
import { PageHeader } from '@/components/admin/page-header';
import { ReorderList, type ReorderRow } from '@/components/admin/reorder-list';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { createSection, deleteSection, moveSection, saveSectionOrder, toggleSection } from './actions';
import { HOME_NOTICES } from './notices';

function RowAction({
  action,
  id,
  label,
  icon: Icon,
  extra,
  destructive = false,
}: {
  action: (form: FormData) => Promise<void>;
  id: string;
  label: string;
  icon: LucideIcon;
  extra?: Record<string, string>;
  destructive?: boolean;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="back" value="/admin/homepage" />
      {Object.entries(extra ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button
        type="submit"
        size="sm"
        variant="ghost"
        title={label}
        className={destructive ? 'h-7 px-2 text-destructive' : 'h-7 px-2 text-muted-foreground'}
      >
        <Icon />
        <span className="sr-only">{label}</span>
      </Button>
    </form>
  );
}

/**
 * Homepage Builder. The list is the page: block order here is block order on the site, so the
 * screen shows exactly what a visitor will scroll through.
 */
export default async function HomepagePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('homepage.manage');
  const locale = await getAdminLocale(user.language as AdminLocale);
  const t = (key: TranslationKey) => translate(locale, key);
  const query = await searchParams;

  const sections = await prisma.homepageSection.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { contents: { select: { lang: true, heading: true } } },
  });

  const confirmId = typeof query.delete === 'string' ? query.delete : '';
  const noticeKey = typeof query.notice === 'string' ? HOME_NOTICES[query.notice] : undefined;
  const notice = noticeKey ? t(noticeKey) : '';
  const usedTypes = new Set(sections.map((section) => section.type));
  const availableTypes = SECTION_TYPES.filter((type) => !usedTypes.has(type));

  const heading = (contents: { lang: string; heading: string | null }[]) =>
    contents.find((row) => row.lang === locale)?.heading ??
    contents.find((row) => row.lang === 'ru')?.heading ??
    contents[0]?.heading ??
    '';

  const rows: ReorderRow[] = sections.map((section) => {
    const label = sectionLabel(section.type, t);
    return {
      id: section.id,
      depth: 0,
      content: (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">{label}</span>
            {heading(section.contents) ? (
              <span className="truncate text-sm text-muted-foreground">· {heading(section.contents)}</span>
            ) : null}
            {section.isEnabled ? null : (
              <Badge variant="secondary" className="gap-1 font-normal">
                <EyeOff className="size-3" />
                {t('home.hiddenBadge')}
              </Badge>
            )}
          </div>

          {confirmId === section.id ? (
            <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-2">
              <p className="text-xs text-destructive">{t('home.deleteHint')}</p>
              <div className="flex flex-wrap items-center gap-2">
                <RowAction action={deleteSection} id={section.id} label={t('home.delete')} icon={Trash2} destructive />
                <Button asChild size="sm" variant="ghost" className="h-7 px-2">
                  <Link href="/admin/homepage">{t('common.cancel')}</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1">
              <Button asChild size="sm" variant="outline" className="h-7 px-2">
                <Link href={`/admin/homepage/${section.id}`}>
                  <Pencil />
                  {t('home.configure')}
                </Link>
              </Button>
              <RowAction action={moveSection} id={section.id} label={t('order.moveUp')} icon={ArrowUp} extra={{ direction: 'up' }} />
              <RowAction
                action={moveSection}
                id={section.id}
                label={t('order.moveDown')}
                icon={ArrowDown}
                extra={{ direction: 'down' }}
              />
              <RowAction
                action={toggleSection}
                id={section.id}
                label={section.isEnabled ? t('home.hide') : t('home.show')}
                icon={section.isEnabled ? Eye : EyeOff}
              />
              <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-destructive">
                <Link href={`/admin/homepage?delete=${section.id}`} title={t('home.delete')}>
                  <Trash2 />
                  <span className="sr-only">{t('home.delete')}</span>
                </Link>
              </Button>
            </div>
          )}
        </div>
      ),
    };
  });

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader title={t('home.title')} description={t('home.note')} />

      {notice ? (
        <p className="mb-4 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm" role="status">
          {notice}
        </p>
      ) : null}

      {rows.length ? (
        <ReorderList
          rows={rows}
          maxDepth={0}
          action={saveSectionOrder}
          labels={{ drag: t('order.drag'), saving: t('order.saving'), list: t('home.title') }}
        />
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">{t('home.empty')}</CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardContent className="pt-6">
          {availableTypes.length ? (
            <form action={createSection} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="back" value="/admin/homepage" />
              <div className="min-w-64 flex-1 space-y-1">
                <label htmlFor="section-type" className="text-xs text-muted-foreground">
                  {t('home.type')}
                </label>
                <select
                  id="section-type"
                  name="type"
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  {availableTypes.map((type) => (
                    <option key={type} value={type}>
                      {t(SECTION_SHAPES[type].labelKey)}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" size="sm" className="h-9">
                <Plus />
                {t('home.add')}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">{t('home.allUsed')}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
