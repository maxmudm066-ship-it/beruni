/**
 * Reading and writing site settings.
 *
 * Values live in the `settings` table, their meaning in ./admin/settings-catalog. Anything the
 * catalog does not describe is never read and never written, so a stray form field cannot create a
 * new setting.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import {
  SETTING_FIELDS,
  coerceSetting,
  settingId,
  type SettingField,
  type SettingProblem,
} from '@/lib/admin/settings-catalog';

export interface SettingStore {
  /** `group.key` → stored value. */
  base: Map<string, string>;
  /** `group.key` → language code → stored value, for settings that differ per language. */
  perLanguage: Map<string, Map<string, string>>;
}

const VALUE_TYPE: Record<SettingField['kind'], string> = {
  text: 'string',
  textarea: 'text',
  number: 'number',
  boolean: 'boolean',
  url: 'url',
  email: 'string',
  select: 'string',
  language: 'string',
  image: 'image',
};

export async function loadSettings(): Promise<SettingStore> {
  const rows = await prisma.setting.findMany({
    select: { group: true, key: true, value: true, translations: { select: { lang: true, value: true } } },
  });

  const base = new Map<string, string>();
  const perLanguage = new Map<string, Map<string, string>>();

  for (const row of rows) {
    const id = `${row.group}.${row.key}`;
    base.set(id, row.value);
    if (row.translations.length) {
      perLanguage.set(id, new Map(row.translations.map((translation) => [translation.lang, translation.value])));
    }
  }

  return { base, perLanguage };
}

/** The value to show in a field, falling back to the catalog default. */
export function settingValue(store: SettingStore, field: SettingField, lang?: string): string {
  const id = settingId(field);
  if (field.perLanguage && lang) {
    const translated = store.perLanguage.get(id)?.get(lang)?.trim();
    if (translated) return translated;
  }
  return store.base.get(id) ?? field.fallback;
}

/** One value for the public site: language variant, then shared value, then the catalog default. */
export async function getSiteSetting(group: string, key: string, lang?: string): Promise<string> {
  const field = SETTING_FIELDS.find((row) => row.group === group && row.key === key);
  if (!field) return '';
  const store = await loadSettings();
  return settingValue(store, field, lang);
}

export interface SettingRejection {
  field: SettingField;
  problem: SettingProblem;
  lang?: string;
}

export interface SettingsFormResult {
  saved: SettingField[];
  rejected: SettingRejection[];
}

function posted(form: FormData, name: string): string {
  const raw = form.get(name);
  return typeof raw === 'string' ? raw : '';
}

function fieldName(field: SettingField, lang?: string): string {
  return lang ? `s:${settingId(field)}:${lang}` : `s:${settingId(field)}`;
}

/** Reads the name a settings form uses for this field, so screens and actions never disagree. */
export function settingFieldName(field: SettingField, lang?: string): string {
  return fieldName(field, lang);
}

async function storedImage(value: string): Promise<{ ok: true; value: string } | { ok: false }> {
  if (!value) return { ok: true, value: '' };
  const media = await prisma.media.findFirst({ where: { id: value, kind: 'image' }, select: { id: true } });
  return media ? { ok: true, value: media.id } : { ok: false };
}

async function writeBase(field: SettingField, value: string, sortOrder: number): Promise<string> {
  const row = await prisma.setting.upsert({
    where: { group_key: { group: field.group, key: field.key } },
    update: { value, valueType: VALUE_TYPE[field.kind] },
    create: {
      group: field.group,
      key: field.key,
      value,
      valueType: VALUE_TYPE[field.kind],
      label: field.labelKey,
      sortOrder,
      isPublic: field.level === 'staff',
    },
    select: { id: true },
  });
  return row.id;
}

/**
 * Saves one settings form. Every field is checked on its own: a box with an unusable value keeps
 * its previous content and is reported back, while the rest of the form is stored as usual.
 */
export async function applySettingsForm(
  form: FormData,
  fields: SettingField[],
  languages: { code: string }[],
  defaultLang: string,
): Promise<SettingsFormResult> {
  const saved: SettingField[] = [];
  const rejected: SettingRejection[] = [];
  const codes = languages.map((language) => language.code);

  for (const field of fields) {
    if (field.perLanguage) {
      const values = new Map<string, string>();
      let problem: SettingProblem | null = null;
      let badLang = '';

      for (const code of codes) {
        const raw = posted(form, fieldName(field, code));
        const result = coerceSetting(field, raw, codes);
        if (!result.ok) {
          problem = result.problem;
          badLang = code;
          break;
        }
        values.set(code, result.value);
      }

      if (problem) {
        rejected.push({ field, problem, lang: badLang });
        continue;
      }

      const primary = values.get(defaultLang) ?? values.get(codes[0]) ?? '';
      const id = await writeBase(field, primary, fields.indexOf(field));
      for (const code of codes) {
        const value = values.get(code) ?? '';
        if (!value || value === primary) {
          await prisma.settingTranslation.deleteMany({ where: { settingId: id, lang: code } });
        } else {
          await prisma.settingTranslation.upsert({
            where: { settingId_lang: { settingId: id, lang: code } },
            update: { value },
            create: { settingId: id, lang: code, value },
          });
        }
      }
      saved.push(field);
      continue;
    }

    const raw = posted(form, fieldName(field));
    const result = coerceSetting(field, raw, codes);
    if (!result.ok) {
      rejected.push({ field, problem: result.problem });
      continue;
    }

    let value = result.value;
    if (field.kind === 'image') {
      const image = await storedImage(value);
      if (!image.ok) {
        rejected.push({ field, problem: 'option' });
        continue;
      }
      value = image.value;
    }

    await writeBase(field, value, fields.indexOf(field));
    saved.push(field);
  }

  return { saved, rejected };
}
