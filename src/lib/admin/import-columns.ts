/**
 * The spreadsheet dialect of the CMS: which columns of a material type fit into a CSV file,
 * how a header is recognised, and how a cell becomes the value a database column expects.
 *
 * Files, images, authors and links between materials are deliberately absent — a spreadsheet can
 * name them but cannot carry them, so those stay in the material editor. Everything here is pure,
 * so the same rules run while checking a file and while writing it back out.
 */
import { slugify } from '@/lib/slug';
import { fieldLabel, optionLabel } from './field-labels';
import type { ContentTypeDef, FieldDef, FieldKind } from '@/lib/content-types';
import { ADMIN_LOCALES, type AdminLocale, type TranslationKey } from './labels';

export const LANG_FIELD = 'lang';
export const TAGS_FIELD = 'tags';

const MAX_SHORT = 500;
const MAX_LONG = 20000;
const MAX_BODY = 200_000;
const MAX_TAGS = 30;

const NOT_IN_SPREADSHEET = new Set<FieldKind>([
  'media',
  'mediaGallery',
  'mediaList',
  'authors',
  'people',
  'contentRef',
  'json',
]);

/** Chosen from a list of users, so a text cell cannot carry it. */
const HIDDEN_FIELDS = new Set(['author']);

export interface ImportColumn {
  field: string;
  kind: FieldKind;
  label: string;
  registryLabel: string;
  required: boolean;
  options: { value: string; label: string }[];
  scope?: string;
}

export interface LanguageOption {
  code: string;
  name: string;
}

/** The order the material editor uses, so the file reads like the form. */
const SECTION_ORDER: Record<string, number> = { main: 0, taxonomy: 1, media: 2, relations: 3, meta: 4, seo: 5 };

export function spreadsheetFields(def: ContentTypeDef): FieldDef[] {
  return def.fields
    .map((field, index) => ({ field, index }))
    .filter(({ field }) => !NOT_IN_SPREADSHEET.has(field.kind) && !HIDDEN_FIELDS.has(field.name))
    .sort((a, b) => {
      const bySection = (SECTION_ORDER[a.field.section ?? ''] ?? 9) - (SECTION_ORDER[b.field.section ?? ''] ?? 9);
      return bySection !== 0 ? bySection : a.index - b.index;
    })
    .map(({ field }) => field);
}

export function importColumns(def: ContentTypeDef, locale: AdminLocale, languages: LanguageOption[]): ImportColumn[] {
  return spreadsheetFields(def).map((field) => ({
    field: field.name,
    kind: field.kind,
    label: fieldLabel(locale, field.name, field.label),
    registryLabel: field.label,
    // A row may leave the language empty and take the one chosen above the file.
    required: field.name === LANG_FIELD ? false : Boolean(field.required),
    options:
      field.name === LANG_FIELD
        ? languages.map((language) => ({ value: language.code, label: language.name }))
        : (field.options ?? []),
    scope: field.scope,
  }));
}

export function normaliseHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[’‘`´]/g, '')
    .replace(/\s*\((?:slug|url)\)\s*/i, '')
    .replace(/[\s_]+/g, '-');
}

/** A header matches the field name, the caption from the registry, or its translation. */
export function headerKeys(column: ImportColumn): string[] {
  const keys = new Set([
    normaliseHeader(column.field),
    normaliseHeader(column.registryLabel),
    normaliseHeader(column.label),
  ]);
  if (column.field === LANG_FIELD) keys.add('til');
  return [...keys];
}

export interface HeaderMap {
  /** Field name → 0-based column index in the file. */
  byField: Record<string, number>;
  /** Headers the importer did not recognise: ignored, and listed for the person doing the import. */
  unknown: string[];
}

export function resolveHeaders(headers: string[], columns: ImportColumn[]): HeaderMap {
  const lookup = new Map<string, string>();
  for (const column of columns) {
    for (const key of headerKeys(column)) {
      if (!lookup.has(key)) lookup.set(key, column.field);
    }
  }

  const byField: Record<string, number> = {};
  const unknown: string[] = [];
  headers.forEach((header, index) => {
    const field = lookup.get(normaliseHeader(header));
    if (field) {
      if (byField[field] === undefined) byField[field] = index;
    } else if (header.trim()) {
      unknown.push(header.trim().slice(0, 60));
    }
  });
  return { byField, unknown };
}

export function rawFromCells(cells: string[], byField: Record<string, number>): Record<string, string> {
  const raw: Record<string, string> = {};
  for (const [field, index] of Object.entries(byField)) {
    raw[field] = (cells[index] ?? '').trim();
  }
  return raw;
}

export type RowProblem =
  | 'required'
  | 'badNumber'
  | 'badDate'
  | 'badTime'
  | 'badOption'
  | 'badYesNo'
  | 'unknownCategory'
  | 'tooLong'
  | 'duplicate'
  | 'badRow';

export interface RowIssue {
  problem: RowProblem;
  field: string;
}

export const ROW_PROBLEM_KEYS: Record<RowProblem, TranslationKey> = {
  required: 'importExport.problemRequired',
  badNumber: 'importExport.problemBadNumber',
  badDate: 'importExport.problemBadDate',
  badTime: 'importExport.problemBadTime',
  badOption: 'importExport.problemBadOption',
  badYesNo: 'importExport.problemBadYesNo',
  unknownCategory: 'importExport.problemUnknownCategory',
  tooLong: 'importExport.problemTooLong',
  duplicate: 'importExport.problemDuplicate',
  badRow: 'importExport.problemBadRow',
};

/** How a stored row message is read back: every `<problem>:<field>` pair in it, in file order. */
export function rowIssues(message: string | null | undefined): RowIssue[] {
  if (!message) return [];
  const issues: RowIssue[] = [];
  for (const part of message.split(';')) {
    const [problem, field = ''] = part.split(':');
    if (!(ROW_PROBLEM_KEYS as Record<string, TranslationKey>)[problem]) continue;
    issues.push({ problem: problem as RowProblem, field });
  }
  return issues;
}

export interface ParsedRow {
  /** Field → value for the database; dates are ISO text, a category is its id. */
  values: Record<string, string | number | boolean | null>;
  title: string;
  slug: string;
  lang: string;
  tags: string[];
  problems: RowIssue[];
}

export interface ParseContext {
  columns: ImportColumn[];
  /** Category name or slug, normalised → id. */
  categories: Map<string, string>;
  languageCodes: Set<string>;
  defaultLang: string;
}

const YES = new Set(['1', 'yes', 'y', 'true', 'да', 'верно', 'есть', '+', 'ha', 'haqiqiy', 'togri', 'rost']);
const NO = new Set(['0', 'no', 'n', 'false', 'нет', '-', 'yoq', 'xato', 'yoqlik']);

export function tagList(value: string): string[] {
  return [...new Set(value.split(/[;,\n]/).map((part) => part.trim()).filter(Boolean))].slice(0, MAX_TAGS);
}

const ISO_FIRST = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/;
const DAY_FIRST = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/;

/** 'date' cells become UTC midnight, 'datetime' cells server-local time — exactly as the editor stores them. */
export function parseDateCell(kind: FieldKind, value: string): Date | null {
  const text = value.trim();
  if (!text) return null;

  const yearOnly = /^(\d{4})$/.exec(text);
  if (yearOnly && kind === 'date') return new Date(Date.UTC(Number(yearOnly[1]), 0, 1));

  const iso = ISO_FIRST.exec(text);
  const day = DAY_FIRST.exec(text);
  let year: number;
  let month: number;
  let date: number;
  let hour = 0;
  let minute = 0;

  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    date = Number(iso[3]);
    hour = iso[4] ? Number(iso[4]) : 0;
    minute = iso[5] ? Number(iso[5]) : 0;
  } else if (day) {
    year = Number(day[3]);
    month = Number(day[2]);
    date = Number(day[1]);
    hour = day[4] ? Number(day[4]) : 0;
    minute = day[5] ? Number(day[5]) : 0;
  } else {
    return null;
  }

  if (!(year > 1000 && year < 3000 && month >= 1 && month <= 12 && date >= 1 && date <= 31)) return null;
  if (hour > 23 || minute > 59) return null;
  if (kind === 'date') return new Date(Date.UTC(year, month - 1, date));
  return new Date(year, month - 1, date, hour, minute);
}

/** '14:30', '9.15' and the '14:30:00' Excel writes all mean the same time of day. */
export function parseTimeCell(value: string): string | null {
  const match = /^(\d{1,2})[:.](\d{2})(?::\d{2})?$/i.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function optionValue(column: ImportColumn, cell: string): string | null {
  const wanted = normaliseHeader(cell);
  for (const option of column.options) {
    if (normaliseHeader(option.value) === wanted || normaliseHeader(option.label) === wanted) return option.value;
    for (const locale of ADMIN_LOCALES) {
      if (normaliseHeader(optionLabel(locale, option.value, option.label)) === wanted) return option.value;
    }
  }
  return null;
}

function maxLengthOf(column: ImportColumn): number {
  if (column.kind === 'richtext') return MAX_BODY;
  if (column.kind === 'textarea') return MAX_LONG;
  return MAX_SHORT;
}

export function parseRow(raw: Record<string, string>, ctx: ParseContext): ParsedRow {
  const values: Record<string, string | number | boolean | null> = {};
  const tags: string[] = [];
  const problems: RowIssue[] = [];
  let lang = ctx.defaultLang;

  for (const column of ctx.columns) {
    const cell = (raw[column.field] ?? '').trim();

    if (column.field === LANG_FIELD) {
      if (!cell) continue;
      const code = cell.toLowerCase();
      if (ctx.languageCodes.has(code)) lang = code;
      else problems.push({ problem: 'badOption', field: column.field });
      continue;
    }

    if (column.kind === 'tags') {
      tags.push(...tagList(cell));
      continue;
    }

    if (!cell) {
      if (column.required) problems.push({ problem: 'required', field: column.field });
      else values[column.field] = null;
      continue;
    }

    switch (column.kind) {
      case 'number': {
        const parsed = Number.parseInt(cell.replace(/\s/g, ''), 10);
        if (Number.isFinite(parsed)) values[column.field] = parsed;
        else problems.push({ problem: 'badNumber', field: column.field });
        break;
      }
      case 'date':
      case 'datetime': {
        const parsed = parseDateCell(column.kind, cell);
        if (parsed) values[column.field] = parsed.toISOString();
        else problems.push({ problem: 'badDate', field: column.field });
        break;
      }
      case 'time': {
        const parsed = parseTimeCell(cell);
        if (parsed) values[column.field] = parsed;
        else problems.push({ problem: 'badTime', field: column.field });
        break;
      }
      case 'checkbox': {
        const key = normaliseHeader(cell);
        if (YES.has(key)) values[column.field] = true;
        else if (NO.has(key)) values[column.field] = false;
        else problems.push({ problem: 'badYesNo', field: column.field });
        break;
      }
      case 'select': {
        const parsed = optionValue(column, cell);
        if (parsed !== null) values[column.field] = parsed;
        else problems.push({ problem: 'badOption', field: column.field });
        break;
      }
      case 'category': {
        const categoryId = ctx.categories.get(normaliseHeader(cell)) ?? ctx.categories.get(slugify(cell));
        if (categoryId) values[column.field] = categoryId;
        else problems.push({ problem: 'unknownCategory', field: column.field });
        break;
      }
      default: {
        if (cell.length > maxLengthOf(column)) problems.push({ problem: 'tooLong', field: column.field });
        else values[column.field] = cell;
      }
    }
  }

  const title = String(values.title ?? '').trim();
  if (!title) problems.push({ problem: 'required', field: 'title' });

  return {
    values,
    title,
    slug: slugify(String(values.slug ?? '')) || slugify(title),
    lang,
    tags: [...new Set(tags)],
    problems,
  };
}

/** A date column as a cell: 'date' stays the day it was stored as, 'datetime' follows the server clock. */
export function dateToCell(kind: FieldKind, value: Date | null | undefined): string {
  if (!value) return '';
  if (kind !== 'datetime') return value.toISOString().slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}`;
}
