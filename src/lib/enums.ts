/** String enums. SQLite does not enforce enums, so these are the single source of truth
 *  and every write path validates against them. Kept PostgreSQL-portable. */

export const CONTENT_STATUS = {
  DRAFT: 'draft',
  IN_REVIEW: 'in_review',
  APPROVED: 'approved',
  SCHEDULED: 'scheduled',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
} as const;

export type ContentStatus = (typeof CONTENT_STATUS)[keyof typeof CONTENT_STATUS];

export const CONTENT_STATUS_VALUES = Object.values(CONTENT_STATUS) as ContentStatus[];

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  draft: 'Draft',
  in_review: 'In Review',
  approved: 'Approved',
  scheduled: 'Scheduled',
  published: 'Published',
  archived: 'Archived',
};

/** Statuses that make a material visible on the public site. */
export const PUBLIC_STATUSES: ContentStatus[] = [CONTENT_STATUS.PUBLISHED];

/** Workflow order used by the status stepper in the admin UI. */
export const WORKFLOW_ORDER: ContentStatus[] = [
  CONTENT_STATUS.DRAFT,
  CONTENT_STATUS.IN_REVIEW,
  CONTENT_STATUS.APPROVED,
  CONTENT_STATUS.SCHEDULED,
  CONTENT_STATUS.PUBLISHED,
  CONTENT_STATUS.ARCHIVED,
];

export const MEDIA_KIND = {
  IMAGE: 'image',
  DOCUMENT: 'document',
  VIDEO: 'video',
  AUDIO: 'audio',
  OTHER: 'other',
} as const;
export type MediaKind = (typeof MEDIA_KIND)[keyof typeof MEDIA_KIND];

export const MEDIA_STATUS = {
  PROCESSING: 'processing',
  READY: 'ready',
  FAILED: 'failed',
} as const;

export const MEDIA_ROLE = {
  MAIN: 'main',
  GALLERY: 'gallery',
  ATTACHMENT: 'attachment',
  OG: 'og',
  LOGO: 'logo',
  COVER: 'cover',
} as const;

export const MEDIA_VARIANT_ROLE = {
  ORIGINAL: 'original',
  THUMB: 'thumb',
  SMALL: 'small',
  MEDIUM: 'medium',
  LARGE: 'large',
  WEBP: 'webp',
  AVIF: 'avif',
} as const;

/** File types the Media Library accepts. Anything executable is rejected. */
export const ALLOWED_UPLOAD = {
  image: ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'svg'],
  document: ['pdf', 'docx', 'xlsx', 'pptx', 'csv', 'zip'],
  video: ['mp4', 'webm', 'mov'],
  audio: ['mp3', 'wav', 'ogg'],
} as const;

export const BLOCKED_EXTENSIONS = [
  'exe', 'dll', 'bat', 'cmd', 'sh', 'ps1', 'msi', 'scr', 'jar', 'php', 'php5', 'phtml',
  'asp', 'aspx', 'js', 'jsp', 'py', 'rb', 'pl', 'htaccess',
];

export const TRANSLATION_STATUS = {
  PUBLISHED: 'translated_published',
  DRAFT: 'translated_draft',
  MISSING: 'missing',
} as const;

export const REDIRECT_TYPE = { PERMANENT: 'permanent', TEMPORARY: 'temporary' } as const;

export const SETTING_GROUPS = [
  'general', 'languages', 'seo', 'social', 'contact', 'email',
  'security', 'media', 'menus', 'homepage', 'analytics', 'header', 'footer',
] as const;
export type SettingGroup = (typeof SETTING_GROUPS)[number];

export const DEFAULT_LANGUAGES = [
  { code: 'uz', name: 'Uzbek', nativeName: "O'zbekcha", urlPrefix: 'uz', isDefault: false, sortOrder: 1 },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', urlPrefix: 'ru', isDefault: true, sortOrder: 2 },
  { code: 'en', name: 'English', nativeName: 'English', urlPrefix: 'en', isDefault: false, sortOrder: 3 },
] as const;

/** Admin panel interface languages. Independent from the public site language. */
export const ADMIN_LANGUAGES = [
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
  { code: 'uz', label: "O'zbekcha" },
] as const;
