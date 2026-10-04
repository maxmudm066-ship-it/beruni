/**
 * Every setting the panel exposes: what type it is stored as, what may be typed into it and the
 * words used to describe it.
 *
 * The database keeps values only. Labels and hints come from the panel dictionary so a setting is
 * described in the language the person is working in, and every value is checked against the type
 * it is meant to hold before it is stored. Adding a setting means adding one row to the table
 * below and three strings to the dictionary.
 */
import type { TranslationKey } from '@/lib/admin/labels';

export const SETTING_GROUPS = ['general', 'contact', 'social', 'seo', 'media', 'email', 'analytics', 'security'] as const;
export type SettingGroup = (typeof SETTING_GROUPS)[number];

export type SettingKind = 'text' | 'textarea' | 'number' | 'boolean' | 'url' | 'email' | 'select' | 'language' | 'image';

export type SettingProblem = 'number' | 'range' | 'url' | 'email' | 'length' | 'option' | 'missing';

/** Wording used when a value is refused, so the person knows which box to fix. */
export const SETTING_PROBLEM_KEYS: Record<SettingProblem, TranslationKey> = {
  number: 'settings.problemNumber',
  range: 'settings.problemRange',
  url: 'settings.problemUrl',
  email: 'settings.problemEmail',
  length: 'settings.problemLength',
  option: 'settings.problemOption',
  missing: 'settings.problemMissing',
};

export function isSettingProblem(value: string): value is SettingProblem {
  return ['number', 'range', 'url', 'email', 'length', 'option', 'missing'].includes(value);
}

export interface SettingOption {
  value: string;
  labelKey: TranslationKey;
}

export interface SettingField {
  group: SettingGroup;
  key: string;
  kind: SettingKind;
  labelKey: TranslationKey;
  hintKey?: TranslationKey;
  /** `technical` fields are shown only with the settings.security permission. */
  level: 'staff' | 'technical';
  /** What the site uses while the database holds no value for this setting. */
  fallback: string;
  /** Stored once per site language instead of one shared value (names, addresses). */
  perLanguage?: boolean;
  /** Empty is not allowed: the previous value stays in force. */
  required?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  options?: SettingOption[];
}

export const SETTING_GROUP_META: Record<SettingGroup, { labelKey: TranslationKey; hintKey: TranslationKey }> = {
  general: { labelKey: 'settings.groupGeneral', hintKey: 'settings.groupGeneralHint' },
  contact: { labelKey: 'settings.groupContact', hintKey: 'settings.groupContactHint' },
  social: { labelKey: 'settings.groupSocial', hintKey: 'settings.groupSocialHint' },
  seo: { labelKey: 'settings.groupSeo', hintKey: 'settings.groupSeoHint' },
  media: { labelKey: 'settings.groupMedia', hintKey: 'settings.groupMediaHint' },
  email: { labelKey: 'settings.groupEmail', hintKey: 'settings.groupEmailHint' },
  analytics: { labelKey: 'settings.groupAnalytics', hintKey: 'settings.groupAnalyticsHint' },
  security: { labelKey: 'settings.groupSecurity', hintKey: 'settings.groupSecurityHint' },
};

const ANALYTICS_OPTIONS: SettingOption[] = [
  { value: 'none', labelKey: 'settings.providerNone' },
  { value: 'google', labelKey: 'settings.providerGoogle' },
  { value: 'matomo', labelKey: 'settings.providerMatomo' },
  { value: 'yandex', labelKey: 'settings.providerYandex' },
];

export const SETTING_FIELDS: SettingField[] = [
  {
    group: 'general',
    key: 'site_name',
    kind: 'text',
    labelKey: 'settings.siteName',
    hintKey: 'settings.siteNameHint',
    level: 'staff',
    fallback: 'Beruniy Institute of Oriental Studies',
    perLanguage: true,
    required: true,
    maxLength: 200,
  },
  {
    group: 'general',
    key: 'site_short_name',
    kind: 'text',
    labelKey: 'settings.shortName',
    hintKey: 'settings.shortNameHint',
    level: 'staff',
    fallback: 'Beruniy Institute',
    perLanguage: true,
    maxLength: 120,
  },
  {
    group: 'general',
    key: 'logo',
    kind: 'image',
    labelKey: 'settings.logo',
    hintKey: 'settings.logoHint',
    level: 'staff',
    fallback: '',
  },
  {
    group: 'general',
    key: 'default_language',
    kind: 'language',
    labelKey: 'settings.defaultLanguage',
    hintKey: 'settings.defaultLanguageHint',
    level: 'staff',
    fallback: 'ru',
  },
  {
    group: 'general',
    key: 'address',
    kind: 'textarea',
    labelKey: 'settings.address',
    level: 'staff',
    fallback: '',
    perLanguage: true,
    maxLength: 400,
  },
  {
    group: 'general',
    key: 'footer_note',
    kind: 'text',
    labelKey: 'settings.footerNote',
    hintKey: 'settings.footerNoteHint',
    level: 'staff',
    fallback: '',
    perLanguage: true,
    maxLength: 300,
  },

  { group: 'contact', key: 'phone', kind: 'text', labelKey: 'settings.phone', level: 'staff', fallback: '', maxLength: 60 },
  {
    group: 'contact',
    key: 'email',
    kind: 'email',
    labelKey: 'settings.email',
    level: 'staff',
    fallback: 'info@beruni.uz',
    maxLength: 160,
  },
  { group: 'contact', key: 'fax', kind: 'text', labelKey: 'settings.fax', level: 'staff', fallback: '', maxLength: 60 },
  {
    group: 'contact',
    key: 'map',
    kind: 'url',
    labelKey: 'settings.map',
    hintKey: 'settings.mapHint',
    level: 'staff',
    fallback: '',
    maxLength: 500,
  },
  {
    group: 'contact',
    key: 'working_hours',
    kind: 'text',
    labelKey: 'settings.workingHours',
    level: 'staff',
    fallback: '',
    maxLength: 160,
  },

  { group: 'social', key: 'telegram', kind: 'url', labelKey: 'settings.telegram', level: 'staff', fallback: '', maxLength: 300 },
  { group: 'social', key: 'youtube', kind: 'url', labelKey: 'settings.youtube', level: 'staff', fallback: '', maxLength: 300 },
  { group: 'social', key: 'facebook', kind: 'url', labelKey: 'settings.facebook', level: 'staff', fallback: '', maxLength: 300 },
  { group: 'social', key: 'instagram', kind: 'url', labelKey: 'settings.instagram', level: 'staff', fallback: '', maxLength: 300 },
  { group: 'social', key: 'linkedin', kind: 'url', labelKey: 'settings.linkedin', level: 'staff', fallback: '', maxLength: 300 },

  {
    group: 'seo',
    key: 'site_url',
    kind: 'url',
    labelKey: 'settings.siteUrl',
    hintKey: 'settings.siteUrlHint',
    level: 'staff',
    fallback: '',
    maxLength: 300,
  },
  {
    group: 'seo',
    key: 'site_title_suffix',
    kind: 'text',
    labelKey: 'settings.titleSuffix',
    hintKey: 'settings.titleSuffixHint',
    level: 'staff',
    fallback: '',
    maxLength: 80,
  },
  {
    group: 'seo',
    key: 'og_image',
    kind: 'image',
    labelKey: 'settings.ogImage',
    hintKey: 'settings.ogImageHint',
    level: 'staff',
    fallback: '',
  },
  {
    group: 'seo',
    key: 'google_analytics_id',
    kind: 'text',
    labelKey: 'settings.googleId',
    level: 'staff',
    fallback: '',
    maxLength: 60,
  },
  { group: 'seo', key: 'matomo_url', kind: 'url', labelKey: 'settings.matomoUrl', level: 'staff', fallback: '', maxLength: 300 },

  {
    group: 'media',
    key: 'max_upload_mb',
    kind: 'number',
    labelKey: 'settings.maxUpload',
    hintKey: 'settings.maxUploadHint',
    level: 'staff',
    fallback: '50',
    min: 1,
    max: 500,
  },
  {
    group: 'media',
    key: 'generate_avif',
    kind: 'boolean',
    labelKey: 'settings.avif',
    hintKey: 'settings.avifHint',
    level: 'staff',
    fallback: 'true',
  },
  {
    group: 'media',
    key: 'thumbnail_width',
    kind: 'number',
    labelKey: 'settings.thumbnailWidth',
    level: 'staff',
    fallback: '320',
    min: 64,
    max: 2000,
  },

  {
    group: 'email',
    key: 'smtp_from',
    kind: 'email',
    labelKey: 'settings.fromAddress',
    level: 'staff',
    fallback: 'no-reply@beruni.uz',
    maxLength: 160,
  },
  {
    group: 'email',
    key: 'notify_review_recipients',
    kind: 'text',
    labelKey: 'settings.reviewRecipients',
    hintKey: 'settings.reviewRecipientsHint',
    level: 'staff',
    fallback: '',
    maxLength: 500,
  },

  {
    group: 'analytics',
    key: 'provider',
    kind: 'select',
    labelKey: 'settings.provider',
    level: 'staff',
    fallback: 'none',
    options: ANALYTICS_OPTIONS,
  },

  {
    group: 'security',
    key: 'session_timeout_minutes',
    kind: 'number',
    labelKey: 'settings.sessionTimeout',
    level: 'technical',
    fallback: '480',
    min: 5,
    max: 10080,
  },
  {
    group: 'security',
    key: 'max_failed_logins',
    kind: 'number',
    labelKey: 'settings.maxFailedLogins',
    level: 'technical',
    fallback: '5',
    min: 1,
    max: 50,
  },
  {
    group: 'security',
    key: 'lock_minutes',
    kind: 'number',
    labelKey: 'settings.lockMinutes',
    level: 'technical',
    fallback: '15',
    min: 1,
    max: 1440,
  },
];

/** Identifies a setting inside forms and in the loaded store. */
export function settingId(field: SettingField): string {
  return `${field.group}.${field.key}`;
}

export function settingsOfGroup(group: SettingGroup, level: 'staff' | 'technical' = 'staff'): SettingField[] {
  return SETTING_FIELDS.filter((field) => field.group === group && (level === 'technical' || field.level === 'staff'));
}

export function findSetting(group: string, key: string): SettingField | null {
  return SETTING_FIELDS.find((field) => field.group === group && field.key === key) ?? null;
}

const EMAIL_SHAPE = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i;

/**
 * Turns what was posted into the value that will be stored. Nothing is silently repaired: a value
 * that does not fit its type is refused and named on screen, so the person knows which box to fix.
 */
export function coerceSetting(
  field: SettingField,
  raw: string,
  allowed: readonly string[] = [],
): { ok: true; value: string } | { ok: false; problem: SettingProblem } {
  if (field.kind === 'boolean') return { ok: true, value: raw === 'on' || raw === 'true' || raw === '1' ? 'true' : 'false' };

  const value = raw.trim();
  if (!value) return field.required ? { ok: false, problem: 'missing' } : { ok: true, value: '' };
  if (field.maxLength && value.length > field.maxLength) return { ok: false, problem: 'length' };

  switch (field.kind) {
    case 'number': {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || !/^-?\d+(\.\d+)?$/.test(value)) return { ok: false, problem: 'number' };
      if (field.min !== undefined && parsed < field.min) return { ok: false, problem: 'range' };
      if (field.max !== undefined && parsed > field.max) return { ok: false, problem: 'range' };
      return { ok: true, value: String(Math.round(parsed)) };
    }
    case 'url': {
      if (/^javascript:/i.test(value) || /\s/.test(value)) return { ok: false, problem: 'url' };
      const withScheme = /^https:\/\//i.test(value) || /^http:\/\//i.test(value) ? value : `https://${value}`;
      try {
        const url = new URL(withScheme);
        if (!url.hostname.includes('.')) return { ok: false, problem: 'url' };
        return { ok: true, value: withScheme };
      } catch {
        return { ok: false, problem: 'url' };
      }
    }
    case 'email':
      return EMAIL_SHAPE.test(value) ? { ok: true, value } : { ok: false, problem: 'email' };
    case 'select':
      return field.options?.some((option) => option.value === value) ? { ok: true, value } : { ok: false, problem: 'option' };
    case 'language':
      return allowed.includes(value) ? { ok: true, value } : { ok: false, problem: 'option' };
    case 'image':
      return { ok: true, value };
    default:
      return { ok: true, value };
  }
}
