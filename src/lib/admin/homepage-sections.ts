/**
 * What each homepage block can contain.
 *
 * The block editor is built from this table, so a content manager sees the fields that belong to
 * the block they are editing and never the JSON they are stored in. Adding a block type to the
 * public site means adding one entry here.
 */
import type { TranslationKey } from '@/lib/admin/labels';

export const SECTION_TYPES = [
  'hero',
  'about',
  'latest_news',
  'research',
  'manuscripts',
  'publications',
  'international',
  'events',
  'young_scientists',
  'announcements',
  'media',
  'useful_links',
  'dissertations',
  'contact',
] as const;

export type SectionType = (typeof SECTION_TYPES)[number];

export function isSectionType(value: unknown): value is SectionType {
  return typeof value === 'string' && (SECTION_TYPES as readonly string[]).includes(value);
}

export type ConfigField =
  | { name: string; kind: 'image' }
  | { name: string; kind: 'boolean'; labelKey: TranslationKey; defaultValue: boolean }
  | { name: string; kind: 'number'; labelKey: TranslationKey; min: number; max: number; defaultValue: number }
  | {
      name: string;
      kind: 'select';
      labelKey: TranslationKey;
      defaultValue: string;
      options: { value: string; labelKey: TranslationKey }[];
    };

export interface SectionShape {
  labelKey: TranslationKey;
  /** Whether this block carries a subheading and a free-text paragraph. */
  subheading: boolean;
  body: boolean;
  /** How many call-to-action buttons the block shows: none, one, or two. */
  buttons: 0 | 1 | 2;
  /** Whether the block lists materials, and so can be filled by hand on the block screen. */
  items: boolean;
  config: ConfigField[];
}

const MATERIAL_LIST = (count: number, columns: number, showImages: boolean): ConfigField[] => [
  { name: 'count', kind: 'number', labelKey: 'home.count', min: 1, max: 24, defaultValue: count },
  { name: 'columns', kind: 'number', labelKey: 'home.columns', min: 1, max: 4, defaultValue: columns },
  { name: 'showImages', kind: 'boolean', labelKey: 'home.showImages', defaultValue: showImages },
];

export const SECTION_SHAPES: Record<SectionType, SectionShape> = {
  hero: {
    labelKey: 'home.typeHero',
    subheading: true,
    body: false,
    buttons: 2,
    items: false,
    config: [
      { name: 'imageId', kind: 'image' },
      {
        name: 'height',
        kind: 'select',
        labelKey: 'home.height',
        defaultValue: 'medium',
        options: [
          { value: 'small', labelKey: 'home.heightSmall' },
          { value: 'medium', labelKey: 'home.heightMedium' },
          { value: 'large', labelKey: 'home.heightLarge' },
        ],
      },
      { name: 'darkOverlay', kind: 'boolean', labelKey: 'home.darkOverlay', defaultValue: true },
    ],
  },
  about: {
    labelKey: 'home.typeAbout',
    subheading: true,
    body: true,
    buttons: 1,
    items: false,
    config: [
      { name: 'imageId', kind: 'image' },
      {
        name: 'layout',
        kind: 'select',
        labelKey: 'home.layout',
        defaultValue: 'right',
        options: [
          { value: 'left', labelKey: 'home.layoutLeft' },
          { value: 'right', labelKey: 'home.layoutRight' },
        ],
      },
    ],
  },
  latest_news: {
    labelKey: 'home.typeLatestNews',
    subheading: false,
    body: false,
    buttons: 1,
    items: true,
    config: MATERIAL_LIST(6, 3, true),
  },
  research: {
    labelKey: 'home.typeResearch',
    subheading: true,
    body: false,
    buttons: 1,
    items: true,
    config: MATERIAL_LIST(6, 3, true),
  },
  manuscripts: {
    labelKey: 'home.typeManuscripts',
    subheading: true,
    body: false,
    buttons: 1,
    items: true,
    config: [{ name: 'imageId', kind: 'image' }, ...MATERIAL_LIST(4, 2, true)],
  },
  publications: {
    labelKey: 'home.typePublications',
    subheading: false,
    body: false,
    buttons: 1,
    items: true,
    config: MATERIAL_LIST(6, 3, true),
  },
  international: {
    labelKey: 'home.typeInternational',
    subheading: true,
    body: false,
    buttons: 1,
    items: true,
    config: [{ name: 'imageId', kind: 'image' }, ...MATERIAL_LIST(6, 3, true)],
  },
  events: {
    labelKey: 'home.typeEvents',
    subheading: false,
    body: false,
    buttons: 1,
    items: true,
    config: MATERIAL_LIST(4, 2, true),
  },
  young_scientists: {
    labelKey: 'home.typeYoungScientists',
    subheading: true,
    body: false,
    buttons: 1,
    items: true,
    config: MATERIAL_LIST(4, 2, false),
  },
  announcements: {
    labelKey: 'home.typeAnnouncements',
    subheading: false,
    body: false,
    buttons: 1,
    items: true,
    config: MATERIAL_LIST(4, 2, false),
  },
  media: {
    labelKey: 'home.typeMedia',
    subheading: false,
    body: false,
    buttons: 1,
    items: true,
    config: MATERIAL_LIST(6, 3, true),
  },
  useful_links: {
    labelKey: 'home.typeUsefulLinks',
    subheading: false,
    body: false,
    buttons: 0,
    items: true,
    config: MATERIAL_LIST(8, 3, false),
  },
  dissertations: {
    labelKey: 'home.typeDissertations',
    subheading: false,
    body: false,
    buttons: 1,
    items: true,
    config: MATERIAL_LIST(6, 2, false),
  },
  contact: {
    labelKey: 'home.typeContact',
    subheading: true,
    body: true,
    buttons: 0,
    items: false,
    config: [
      { name: 'showMap', kind: 'boolean', labelKey: 'home.showMap', defaultValue: true },
      { name: 'showForm', kind: 'boolean', labelKey: 'home.showForm', defaultValue: true },
    ],
  },
};

/** How many materials a block may hold: the same ceiling the «how many to show» setting has. */
export const BLOCK_ITEMS_MAX = 24;

/**
 * The materials a block fills itself with when nobody chose any, and the ones the block screen
 * offers when asked to choose. A block missing from this table shows only what it is given —
 * «Медиа» and «Полезные ссылки» have no single material type to fall back on.
 */
export const BLOCK_SOURCE: Partial<Record<SectionType, { typeKey: string; youngOnly?: boolean }>> = {
  latest_news: { typeKey: 'news' },
  research: { typeKey: 'research_project' },
  manuscripts: { typeKey: 'manuscript' },
  publications: { typeKey: 'publication' },
  international: { typeKey: 'partner' },
  events: { typeKey: 'event' },
  young_scientists: { typeKey: 'researcher', youngOnly: true },
  announcements: { typeKey: 'announcement' },
  dissertations: { typeKey: 'dissertation' },
};

/** Values a block starts with, so a newly added block already renders sensibly. */
export function defaultConfig(type: SectionType): Record<string, string | number | boolean> {
  const values: Record<string, string | number | boolean> = {};
  for (const field of SECTION_SHAPES[type].config) {
    if (field.kind === 'image') values[field.name] = '';
    else values[field.name] = field.defaultValue;
  }
  return values;
}

/**
 * Reads the stored JSON and forces every known field back to its type. Anything unrecognised is
 * dropped, which is what keeps a hand-edited or outdated value from reaching the public site.
 */
export function readConfig(type: SectionType, raw: string | null): Record<string, string | number | boolean> {
  const values = defaultConfig(type);
  if (!raw) return values;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return values;
  }
  if (!parsed || typeof parsed !== 'object') return values;

  const source = parsed as Record<string, unknown>;
  for (const field of SECTION_SHAPES[type].config) {
    const value = source[field.name];
    if (field.kind === 'image') {
      values[field.name] = typeof value === 'string' ? value.slice(0, 40) : '';
    } else if (field.kind === 'boolean') {
      values[field.name] = value === true || value === 'true' || value === 1;
    } else if (field.kind === 'number') {
      const parsedNumber = Number.parseInt(String(value ?? ''), 10);
      values[field.name] = Number.isFinite(parsedNumber)
        ? Math.min(field.max, Math.max(field.min, parsedNumber))
        : field.defaultValue;
    } else {
      const allowed = field.options.some((option) => option.value === value);
      values[field.name] = allowed ? String(value) : field.defaultValue;
    }
  }
  return values;
}

export function sectionLabel(type: string, label: (key: TranslationKey) => string): string {
  return isSectionType(type) ? label(SECTION_SHAPES[type].labelKey) : type;
}
