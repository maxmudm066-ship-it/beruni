/**
 * Shapes shared by the generic material editor: the server describes a form (fields, options,
 * current values) and the client returns the same shapes through FormData. Keeping them here
 * means the Client Component never has to import anything server-only.
 */
import type { FieldKind } from '@/lib/content-types';
import type { EditorLabels, MaterialFormLabels } from '@/lib/admin/labels';
import type { PickedMedia } from '@/components/admin/media/media-types';

/** Sentinel used by dropdowns for "nothing selected" — Radix Select cannot carry an empty value. */
export const NONE = 'none';

/** A Media Library asset chosen for a material, together with the caption used in that material. */
export interface MediaFieldValue {
  asset: PickedMedia;
  caption: string;
}

/** Media stored as JSON in the form: the asset id plus the per-material caption. */
export interface MediaRef {
  mediaId: string;
  caption: string;
}

export interface PersonValue {
  /** Researcher detail row id, when the person was picked from the staff list. */
  detailId: string | null;
  /** Content group of that researcher, needed by the membership tables. */
  groupId: string | null;
  fullName: string;
  note: string;
}

export interface RefValue {
  detailId: string;
  groupId: string;
}

export type ScalarValue = string | number | boolean | null;

/** Option list for a dropdown, already translated for the admin interface language. */
export interface FormOption {
  value: string;
  label: string;
}

/** Field as the client renders it: registry description with translated captions. */
export interface FormFieldSchema {
  name: string;
  kind: FieldKind;
  label: string;
  required: boolean;
  hint?: string;
  rows?: number;
  section: 'main' | 'taxonomy' | 'media' | 'relations' | 'meta' | 'seo';
  options?: FormOption[];
  /** contentRef: the content type key being referenced. */
  target?: string;
  /** contentRef: label of the referenced material type, shown in the picker. */
  targetLabel?: string;
  many?: boolean;
}

export interface RefOption {
  detailId: string;
  groupId: string;
  label: string;
}

export interface PersonOption {
  detailId: string;
  groupId: string;
  label: string;
}

export interface MaterialFormInit {
  typeKey: string;
  /** Translated name of the content type, e.g. "Новости". */
  typeLabel: string;
  /** ContentItem id of the language version being edited, null for a new material. */
  itemId: string | null;
  groupId: string | null;
  status: string;
  revision: number;
  /** Whether this type goes through Draft → In Review → Approved → Published. */
  needsReview: boolean;
  /** Whether the interface language differs from this material's language. */
  locale: 'ru' | 'en' | 'uz';
  fields: FormFieldSchema[];
  scalars: Record<string, ScalarValue>;
  /** HTML of richtext fields, keyed by field name. */
  bodies: Record<string, string>;
  mediaRefs: Record<string, MediaRef[]>;
  personRefs: Record<string, PersonValue[]>;
  contentRefs: Record<string, RefValue[]>;
  /** Media rows resolved for the picker UI, keyed by field name. */
  mediaValues: Record<string, MediaFieldValue[]>;
  categoryOptions: FormOption[];
  languageOptions: FormOption[];
  authorOptions: FormOption[];
  personOptions: PersonOption[];
  refOptions: Record<string, RefOption[]>;
  canCreate: boolean;
  canEdit: boolean;
  canPublish: boolean;
  canReview: boolean;
  labels: MaterialFormLabels;
  editorLabels: EditorLabels;
  /** Where the public site will show this material; used by Preview. */
  previewBase: string | null;
  /**
   * Server clock when the form was built. The client compares publish dates against this
   * instead of reading Date.now() during render.
   */
  nowMs: number;
}

/** Everything the client submits for one material. */
export interface MaterialSubmission {
  intent: 'draft' | 'review' | 'publish' | 'preview';
  scalars: Record<string, ScalarValue>;
  bodies: Record<string, string>;
  mediaRefs: Record<string, MediaRef[]>;
  personRefs: Record<string, PersonValue[]>;
  contentRefs: Record<string, RefValue[]>;
  tags: string[];
  slug: string;
  lang: string;
  title: string;
}

export function toMediaRef(value: MediaFieldValue): MediaRef {
  return { mediaId: value.asset.id, caption: value.caption };
}

export function parseJsonArray<T>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function splitTags(raw: string | null | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}
