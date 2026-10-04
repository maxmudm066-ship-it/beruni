import { AlertCircle } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/session';
import { getAdminLocale, mediaPickerLabels, translate, type AdminLocale, type TranslationKey } from '@/lib/admin/i18n';
import {
  SETTING_GROUPS,
  SETTING_GROUP_META,
  SETTING_PROBLEM_KEYS,
  findSetting,
  isSettingProblem,
  settingsOfGroup,
  settingId,
  type SettingField,
  type SettingGroup,
} from '@/lib/admin/settings-catalog';
import { loadSettings, settingFieldName, settingValue, type SettingStore } from '@/lib/settings';
import { toPickedMedia } from '@/lib/content/media-value';
import type { PickedMedia } from '@/components/admin/media/media-types';
import { PageHeader } from '@/components/admin/page-header';
import { ImageField } from '@/components/admin/image-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { saveSettingsGroup } from './actions';
import { SETTINGS_NOTICES } from './notices';

const SELECT_CLASS = 'h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm';
const IMAGE_LABELS = (t: (key: TranslationKey) => string) => ({
  pick: t('media.pickFromLibrary'),
  change: t('media.change'),
  remove: t('media.remove'),
  title: t('media.pickFromLibrary'),
});

type Translator = (key: TranslationKey) => string;

interface ControlProps {
  field: SettingField;
  value: string;
  name: string;
  id: string;
  languages: { code: string; nativeName: string }[];
  image: PickedMedia | null;
  pickerLabels: Parameters<typeof ImageField>[0]['pickerLabels'];
  t: Translator;
}

/** One control per setting type — a checkbox, a list, a picture picker or a text box. */
function Control({ field, value, name, id, languages, image, pickerLabels, t }: ControlProps) {
  if (field.kind === 'boolean') {
    return <input id={id} type="checkbox" name={name} defaultChecked={value === 'true'} className="size-4 accent-primary" />;
  }

  if (field.kind === 'image') {
    return <ImageField name={name} value={image} labels={IMAGE_LABELS(t)} pickerLabels={pickerLabels} />;
  }

  if (field.kind === 'select' || field.kind === 'language') {
    return (
      <select id={id} name={name} defaultValue={value} className={SELECT_CLASS}>
        {field.kind === 'language'
          ? languages.map((language) => (
              <option key={language.code} value={language.code}>
                {language.nativeName}
              </option>
            ))
          : (field.options ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
      </select>
    );
  }

  if (field.kind === 'textarea') {
    return <Textarea id={id} name={name} defaultValue={value} rows={3} maxLength={field.maxLength} />;
  }

  return (
    <Input
      id={id}
      name={name}
      type={field.kind === 'number' ? 'number' : 'text'}
      inputMode={field.kind === 'number' ? 'numeric' : undefined}
      defaultValue={value}
      min={field.min}
      max={field.max}
      maxLength={field.maxLength}
    />
  );
}

/** A setting with its words: one box normally, or one box per site language for names and addresses. */
function FieldBlock({
  field,
  store,
  languages,
  mediaById,
  t,
  pickerLabels,
}: {
  field: SettingField;
  store: SettingStore;
  languages: { code: string; nativeName: string }[];
  mediaById: Map<string, PickedMedia>;
  t: Translator;
  pickerLabels: Parameters<typeof ImageField>[0]['pickerLabels'];
}) {
  const label = t(field.labelKey);
  const hint = field.hintKey ? t(field.hintKey) : '';
  const domId = `s-${field.group}-${field.key}`;
  const control = (value: string, name: string, id: string) => (
    <Control
      field={field}
      value={value}
      name={name}
      id={id}
      languages={languages}
      image={mediaById.get(value) ?? null}
      pickerLabels={pickerLabels}
      t={t}
    />
  );

  if (field.kind === 'boolean') {
    return (
      <div className="space-y-1">
        <label className="flex items-start gap-2 text-sm" htmlFor={domId}>
          {control(settingValue(store, field), settingFieldName(field), domId)}
          <span>{label}</span>
        </label>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    );
  }

  if (field.perLanguage) {
    return (
      <div className="space-y-1.5">
        <p className="text-xs font-medium">{label}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          {languages.map((language) => (
            <div key={language.code} className="space-y-1">
              <label htmlFor={`${domId}-${language.code}`} className="text-xs text-muted-foreground">
                {language.nativeName}
              </label>
              {control(settingValue(store, field, language.code), settingFieldName(field, language.code), `${domId}-${language.code}`)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="space-y-1">
        <label htmlFor={domId} className="text-xs font-medium">
          {label}
        </label>
        <div className={field.kind === 'image' ? undefined : 'max-w-md'}>
          {control(settingValue(store, field), settingFieldName(field), domId)}
        </div>
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

interface Refused {
  field: SettingField;
  problemKey: TranslationKey;
}

/** Decodes the `bad` parameter back into named fields, ignoring anything the catalog does not know. */
function readRefused(raw: unknown): Refused[] {
  if (typeof raw !== 'string') return [];
  const list: Refused[] = [];
  for (const token of raw.slice(0, 600).split(',')) {
    const [id, problem] = token.split(':');
    const reason = problem ?? '';
    if (!id || !isSettingProblem(reason)) continue;
    const [group, key] = id.split('.');
    const field = findSetting(group ?? '', key ?? '');
    if (field) list.push({ field, problemKey: SETTING_PROBLEM_KEYS[reason] });
  }
  return list;
}

/**
 * Site settings. Every group is its own plain form, so editing the contact details can never touch
 * the limits an administrator owns, and nothing here needs JavaScript.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('settings.manage');
  const locale = await getAdminLocale(user.language as AdminLocale);
  const t = (key: TranslationKey) => translate(locale, key);
  const query = await searchParams;

  const technical = user.permissions.includes('*') || user.permissions.includes('settings.security');
  const groups = SETTING_GROUPS.filter((group: SettingGroup) => (group === 'security' ? technical : true));

  const [store, languages] = await Promise.all([
    loadSettings(),
    prisma.language.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { code: true, nativeName: true },
    }),
  ]);

  const cards = groups.map((group) => ({ group, fields: settingsOfGroup(group, technical ? 'technical' : 'staff') }));

  const imageIds = cards
    .flatMap((card) => card.fields)
    .filter((field) => field.kind === 'image')
    .map((field) => settingValue(store, field))
    .filter(Boolean);

  const mediaRows = imageIds.length
    ? await prisma.media.findMany({ where: { id: { in: imageIds }, kind: 'image' }, include: { variants: true } })
    : [];
  const mediaById = new Map(mediaRows.map((row) => [row.id, toPickedMedia(row)]));

  const noticeKey = typeof query.notice === 'string' ? SETTINGS_NOTICES[query.notice] : undefined;
  const notice = noticeKey ? t(noticeKey) : '';
  const refused = readRefused(query.bad);
  const pickerLabels = mediaPickerLabels(locale);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        title={t('settings.title')}
        description={t('settings.subtitle')}
        backHref="/admin"
        backLabel={t('nav.dashboard')}
      />

      {notice ? (
        <p className="mb-4 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm" role="status">
          {notice}
        </p>
      ) : null}

      {refused.length ? (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
          <p className="flex items-center gap-1.5 font-medium">
            <AlertCircle className="size-4" />
            {t('settings.problemIntro')}
          </p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {refused.map(({ field, problemKey }) => (
              <li key={settingId(field)}>
                {t(field.labelKey)} — {t(problemKey)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-6">
        {cards.map((card) => {
          const meta = SETTING_GROUP_META[card.group];
          return (
            <Card key={card.group}>
              <CardHeader>
                <CardTitle className="text-base">{t(meta.labelKey)}</CardTitle>
                <CardDescription>{t(meta.hintKey)}</CardDescription>
              </CardHeader>
              <CardContent>
                <form action={saveSettingsGroup} className="space-y-5">
                  <input type="hidden" name="group" value={card.group} />
                  {card.fields.map((field) => (
                    <FieldBlock
                      key={settingId(field)}
                      field={field}
                      store={store}
                      languages={languages}
                      mediaById={mediaById}
                      t={t}
                      pickerLabels={pickerLabels}
                    />
                  ))}
                  <div>
                    <Button type="submit" size="sm">
                      {t('common.save')}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
