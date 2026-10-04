import 'server-only';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/db';
import { slugify } from '@/lib/slug';
import { CONTENT_TYPE_MAP, type ContentTypeDef, type FieldKind } from '@/lib/content-types';
import { sanitizeContentHtml } from '@/lib/content/html';
import { uniqueSlug } from '@/lib/content/unique-slug';
import { syncTags } from '@/lib/content/sync-tags';
import { optionLabel } from './field-labels';
import { parseTable, toCsv } from './csv';
import {
  dateToCell,
  importColumns,
  normaliseHeader,
  parseRow,
  rawFromCells,
  resolveHeaders,
  type ImportColumn,
  type ParsedRow,
} from './import-columns';
import type { AdminLocale } from './labels';

/** A file bigger than this is not a list of materials but a database dump someone mis-typed. */
export const MAX_IMPORT_BYTES = 4 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 2000;

/** ContentItem columns; everything else of a type lives in its own detail table. */
const ITEM_FIELDS = new Set([
  'title',
  'subtitle',
  'slug',
  'excerpt',
  'body',
  'publishedAt',
  'seoTitle',
  'seoDescription',
  'keywords',
  'canonicalUrl',
  'ogTitle',
  'ogDescription',
]);

/** Fields that are neither an item column nor a detail column. */
const SPECIAL_FIELDS = new Set(['lang', 'tags', 'isFeatured']);

export type ExportSubset = 'published' | 'unpublished' | 'all';
export type JobProblem = 'emptyFile' | 'noColumns' | 'noData' | 'tooManyRows' | 'tooLarge' | 'badType';

interface RowPayload {
  values: ParsedRow['values'];
  title: string;
  slug: string;
  slugGiven: boolean;
  lang: string;
  tags: string[];
}

interface DetailReader {
  findMany(args: { where: Record<string, unknown> }): Promise<Record<string, unknown>[]>;
}

interface DetailWriter {
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
}

function detailReader(model: string): DetailReader | null {
  return (prisma as unknown as Record<string, DetailReader>)[model] ?? null;
}

function detailWriter(client: unknown, model: string): DetailWriter | null {
  return (client as Record<string, DetailWriter>)[model] ?? null;
}

const YES_NO: Record<AdminLocale, [string, string]> = {
  ru: ['да', 'нет'],
  en: ['Yes', 'No'],
  uz: ['ha', 'yo‘q'],
};

function activeLanguages() {
  return prisma.language.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
}

/** A rubric is found by its name in any language as well as by its slug. */
async function categoryIndex(
  scope: string,
): Promise<{ byName: Map<string, string>; names: Map<string, Map<string, string>>; slugOf: Map<string, string> }> {
  const rows = await prisma.category.findMany({ where: { scope }, include: { translations: true } });
  const byName = new Map<string, string>();
  const names = new Map<string, Map<string, string>>();
  const slugOf = new Map<string, string>();
  for (const category of rows) {
    const byLang = new Map<string, string>();
    for (const translation of category.translations) {
      byLang.set(translation.lang, translation.name);
      const key = normaliseHeader(translation.name);
      if (key && !byName.has(key)) byName.set(key, category.id);
    }
    names.set(category.id, byLang);
    slugOf.set(category.id, category.slug);
    const slugKey = normaliseHeader(category.slug);
    if (slugKey && !byName.has(slugKey)) byName.set(slugKey, category.id);
  }
  return { byName, names, slugOf };
}

/** A written-out rubric, preferring the language of the row it belongs to. */
function rubricName(
  index: { names: Map<string, Map<string, string>>; slugOf: Map<string, string> },
  id: string,
  langs: string[],
): string {
  const byLang = index.names.get(id);
  for (const lang of langs) {
    const name = byLang?.get(lang);
    if (name) return name;
  }
  return byLang?.values().next().value ?? index.slugOf.get(id) ?? '';
}

/** Markup is cleaned the way the editor cleans it; plain text becomes paragraphs. */
function toBodyHtml(value: string): string {
  const text = value.trim();
  if (!text) return '';
  if (/<[a-z][^>]*>/i.test(text)) return sanitizeContentHtml(text);
  return sanitizeContentHtml(
    text
      .split(/\n{2,}/)
      .map((block) => `<p>${block.replace(/\n/g, '<br />')}</p>`)
      .join(''),
  );
}

// ── export ────────────────────────────────────────────────────────────────────────────────

export interface ExportRequest {
  typeKey: string;
  /** 'all' exports every language version, which is what a multilingual file looks like. */
  lang: string;
  subset: ExportSubset;
  locale: AdminLocale;
  headersOnly: boolean;
}

export interface ExportFile {
  filename: string;
  content: string;
  rowCount: number;
  truncated: boolean;
}

export interface ItemRecord {
  lang: string;
  title: string;
  subtitle: string | null;
  slug: string;
  excerpt: string | null;
  body: string | null;
  publishedAt: Date | null;
  seoTitle: string | null;
  seoDescription: string | null;
  keywords: string | null;
  canonicalUrl: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  group: { id: string; isFeatured: boolean };
  tagNames: string[];
}

/** Headers stay readable, but a caption used twice would swallow one column on the way back in. */
function exportHeaders(columns: ImportColumn[]): string[] {
  const seen = new Set<string>();
  return columns.map((column) => {
    const key = normaliseHeader(column.label);
    if (seen.has(key)) return column.field;
    seen.add(key);
    return column.label;
  });
}

function cellOf(
  column: ImportColumn,
  item: ItemRecord,
  detail: Record<string, unknown> | null,
  locale: AdminLocale,
  categoryName: (id: unknown, langs: string[]) => string,
): string {
  const { field, kind } = column;
  const yesNo = YES_NO[locale];

  if (field === 'lang') return item.lang;
  if (field === 'tags') return item.tagNames.join('; ');
  if (field === 'isFeatured') return yesNo[item.group.isFeatured ? 0 : 1];
  if (kind === 'category') return categoryName(detail?.categoryId, [item.lang, locale]);

  const raw = ITEM_FIELDS.has(field) ? item[field as keyof ItemRecord] : detail?.[field];
  if (raw === null || raw === undefined || raw === '') return '';

  if (kind === 'checkbox') return yesNo[raw ? 0 : 1];
  if (kind === 'date' || kind === 'datetime') return dateToCell(kind, raw instanceof Date ? raw : null);
  if (kind === 'select') {
    const option = column.options.find((entry) => entry.value === raw);
    return optionLabel(locale, String(raw), option?.label ?? String(raw));
  }
  if (kind === 'richtext') {
    // An editor that never was filled leaves empty paragraphs behind — a file should show nothing.
    const html = String(raw);
    return html.replace(/<[^>]*>/g, '').trim() ? html : '';
  }
  if (raw instanceof Date) return raw.toISOString();
  return String(raw);
}

function fileName(typeKey: string, lang: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `beruni-${slugify(typeKey) || 'content'}-${slugify(lang) || 'all'}-${stamp}.csv`;
}

export async function buildExportFile(
  request: ExportRequest,
): Promise<ExportFile | { reason: JobProblem }> {
  const def = CONTENT_TYPE_MAP.get(request.typeKey);
  if (!def) return { reason: 'badType' };

  const languages = await activeLanguages();
  const columns = importColumns(def, request.locale, languages);
  const headers = exportHeaders(columns);

  if (request.headersOnly) {
    return { filename: fileName(def.key, request.lang), content: toCsv([headers]), rowCount: 0, truncated: false };
  }

  const subset =
    request.subset === 'published'
      ? { status: 'published' }
      : request.subset === 'unpublished'
        ? { status: { in: ['draft', 'in_review', 'approved', 'scheduled'] } }
        : {};

  const found = await prisma.contentItem.findMany({
    where: {
      deletedAt: null,
      group: { type: def.key, deletedAt: null },
      ...(request.lang === 'all' ? {} : { lang: request.lang }),
      ...subset,
    },
    orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    take: MAX_IMPORT_ROWS + 1,
    select: {
      lang: true,
      title: true,
      subtitle: true,
      slug: true,
      excerpt: true,
      body: true,
      publishedAt: true,
      seoTitle: true,
      seoDescription: true,
      keywords: true,
      canonicalUrl: true,
      ogTitle: true,
      ogDescription: true,
      group: { select: { id: true, isFeatured: true } },
      tags: { select: { tag: { select: { translations: true } } } },
    },
  });

  const items: ItemRecord[] = found.map((row) => ({
    lang: row.lang,
    title: row.title,
    subtitle: row.subtitle,
    slug: row.slug,
    excerpt: row.excerpt,
    body: row.body,
    publishedAt: row.publishedAt,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    keywords: row.keywords,
    canonicalUrl: row.canonicalUrl,
    ogTitle: row.ogTitle,
    ogDescription: row.ogDescription,
    group: row.group,
    tagNames: row.tags
      .map((link) => {
        const translations = link.tag.translations;
        return translations.find((entry) => entry.lang === row.lang)?.name ?? translations[0]?.name ?? '';
      })
      .filter(Boolean),
  }));

  const groupIds = items.map((item) => item.group.id);
  const reader = def.detailModel ? detailReader(def.detailModel) : null;
  const details = reader && groupIds.length ? await reader.findMany({ where: { groupId: { in: groupIds } } }) : [];
  const detailOf = new Map(details.map((row) => [String(row.groupId), row]));
  const categories = await categoryIndex(def.categoryScope ?? '');

  const rows = items.map((item) =>
    columns.map((column) =>
      cellOf(column, item, detailOf.get(item.group.id) ?? null, request.locale, (id, langs) =>
        typeof id === 'string' ? rubricName(categories, id, langs) : '',
      ),
    ),
  );

  return {
    filename: fileName(def.key, request.lang),
    content: toCsv([headers, ...rows]),
    rowCount: rows.length,
    truncated: found.length > MAX_IMPORT_ROWS,
  };
}

// ── import ────────────────────────────────────────────────────────────────────────────────

export interface CheckedFile {
  jobId: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  duplicateRows: number;
  /** Headers the file carries that this type of material has no place for. */
  unknownHeaders: string[];
}

export async function validateImportFile(args: {
  def: ContentTypeDef;
  filename: string;
  content: string;
  defaultLang: string;
  locale: AdminLocale;
  userId: string;
}): Promise<CheckedFile | { reason: JobProblem }> {
  const { def, content, defaultLang, locale, userId } = args;

  const table = parseTable(content);
  if (table.length === 0) return { reason: 'emptyFile' };

  const [header, ...dataRows] = table;
  if (dataRows.length === 0) return { reason: 'noData' };
  if (dataRows.length > MAX_IMPORT_ROWS) return { reason: 'tooManyRows' };

  const languages = await activeLanguages();
  const columns = importColumns(def, locale, languages);
  const map = resolveHeaders(header, columns);
  if (Object.keys(map.byField).length === 0) return { reason: 'noColumns' };

  const categories = await categoryIndex(def.categoryScope ?? '');
  const ctx = {
    columns,
    categories: categories.byName,
    languageCodes: new Set(languages.map((language) => language.code)),
    defaultLang,
  };

  const parsed = dataRows.map((cells, index) => {
    const raw = rawFromCells(cells, map.byField);
    return { ...parseRow(raw, ctx), rowNumber: index + 2, slugGiven: Boolean(raw.slug) };
  });

  const slugs = [...new Set(parsed.map((row) => row.slug).filter(Boolean))];
  const taken = new Set<string>();
  for (let start = 0; start < slugs.length; start += 500) {
    const clash = await prisma.contentItem.findMany({
      where: { slug: { in: slugs.slice(start, start + 500) }, deletedAt: null },
      select: { lang: true, slug: true },
    });
    for (const row of clash) taken.add(`${row.lang}|${row.slug}`);
  }

  const seen = new Set<string>();
  const rows = parsed.map((row) => {
    const key = `${row.lang}|${row.slug}`;
    let status = 'error';
    if (taken.has(key) || seen.has(key)) status = 'duplicate';
    else if (!row.problems.length) status = 'valid';
    seen.add(key);

    const payload: RowPayload = {
      values: row.values,
      title: row.title.slice(0, 300),
      slug: row.slug,
      slugGiven: row.slugGiven,
      lang: row.lang,
      tags: row.tags,
    };
    return {
      rowNumber: row.rowNumber,
      status,
      // Every problem at once: a person fixing the spreadsheet should not have to upload it twice
      // to learn about the second mistake in the same row.
      message: status === 'duplicate' ? 'duplicate' : row.problems.map((issue) => `${issue.problem}:${issue.field}`).join(';') || null,
      payload: JSON.stringify(payload),
    };
  });

  const job = await prisma.importJob.create({
    data: {
      contentType: def.key,
      filename: args.filename.slice(0, 200),
      status: 'validated',
      totalRows: rows.length,
      validRows: rows.filter((row) => row.status === 'valid').length,
      errorRows: rows.filter((row) => row.status === 'error').length,
      duplicateRows: rows.filter((row) => row.status === 'duplicate').length,
      report: JSON.stringify({ unknownHeaders: map.unknown, defaultLang }),
      createdById: userId,
      rows: { create: rows },
    },
  });

  return {
    jobId: job.id,
    totalRows: job.totalRows,
    validRows: job.validRows,
    errorRows: job.errorRows,
    duplicateRows: job.duplicateRows,
    unknownHeaders: map.unknown,
  };
}

export interface ImportResult {
  created: number;
  skipped: number;
  failed: number;
}

/**
 * Writes one draft per accepted row. A row whose address was taken in the meantime is left out
 * rather than renamed, because the person importing must recognise what appeared in the list.
 */
export async function applyImportJob(
  jobId: string,
  user: { id: string; locale: AdminLocale; revisionLabel: string },
): Promise<ImportResult | { reason: JobProblem }> {
  const job = await prisma.importJob.findUnique({
    where: { id: jobId },
    include: { rows: { orderBy: { rowNumber: 'asc' } } },
  });
  const def = job ? CONTENT_TYPE_MAP.get(job.contentType) : undefined;
  if (!job || !def) return { reason: 'badType' };
  if (job.status !== 'validated') return { reason: 'noData' };

  const languages = await activeLanguages();
  const kinds = new Map<string, FieldKind>(
    importColumns(def, user.locale, languages).map((column) => [column.field, column.kind]),
  );
  const model = def.detailModel;
  const before = { error: job.errorRows, duplicate: job.duplicateRows };

  await prisma.importJob.update({ where: { id: job.id }, data: { status: 'importing', confirmedAt: new Date() } });

  const result: ImportResult = { created: 0, skipped: 0, failed: 0 };

  for (const row of job.rows.filter((entry) => entry.status === 'valid')) {
    const payload = readPayload(row.payload);
    if (!payload?.title) {
      await prisma.importJobRow.update({ where: { id: row.id }, data: { status: 'error', message: 'required:title' } });
      result.failed += 1;
      continue;
    }

    try {
      const created = await prisma.$transaction(async (tx) => {
        const base = payload.slug || slugify(payload.title) || 'material';
        const clash = await tx.contentItem.findFirst({ where: { lang: payload.lang, slug: base }, select: { id: true } });
        if (clash && payload.slugGiven) return null;
        const slug = clash ? await uniqueSlug(tx, payload.lang, base, null) : base;

        const itemData: Record<string, unknown> = {};
        const detailData: Record<string, unknown> = {};
        for (const [field, value] of Object.entries(payload.values)) {
          if (SPECIAL_FIELDS.has(field) || field === 'slug' || field === 'title') continue;
          const target = ITEM_FIELDS.has(field) ? itemData : detailData;
          target[field] = revive(field, value, kinds);
        }

        const group = await tx.contentGroup.create({
          data: {
            type: def.key,
            sourceLang: payload.lang,
            isFeatured: payload.values.isFeatured === true,
            createdBy: user.id,
          },
        });

        const item = await tx.contentItem.create({
          data: {
            groupId: group.id,
            lang: payload.lang,
            title: payload.title,
            slug,
            origin: 'source',
            status: 'draft',
            revision: 1,
            authorId: user.id,
            updatedById: user.id,
            ...itemData,
          } as Prisma.ContentItemUncheckedCreateInput,
        });

        if (model && Object.keys(detailData).length) {
          const writer = detailWriter(tx, model);
          if (writer) await writer.create({ data: { ...detailData, groupId: group.id } });
        }

        await syncTags(tx, item.id, payload.lang, payload.tags);
        await tx.contentRevision.create({
          data: {
            itemId: item.id,
            version: 1,
            changedById: user.id,
            changeSummary: user.revisionLabel,
            title: item.title,
            subtitle: item.subtitle,
            slug: item.slug,
            excerpt: item.excerpt,
            body: item.body,
            status: item.status,
          },
        });

        return item.id;
      });

      if (created === null) {
        await prisma.importJobRow.update({ where: { id: row.id }, data: { status: 'skipped', message: 'duplicate' } });
        result.skipped += 1;
      } else {
        await prisma.importJobRow.update({ where: { id: row.id }, data: { status: 'imported', message: null } });
        result.created += 1;
      }
    } catch {
      await prisma.importJobRow.update({ where: { id: row.id }, data: { status: 'error', message: 'badRow' } });
      result.failed += 1;
    }
  }

  await prisma.importJob.update({
    where: { id: job.id },
    data: {
      status: 'done',
      importedRows: result.created,
      errorRows: before.error + result.failed,
      duplicateRows: before.duplicate + result.skipped,
    },
  });

  return result;
}

/** A cell value becomes the type its column holds: dates are instants, long text becomes markup. */
function revive(
  field: string,
  value: string | number | boolean | null,
  kinds: Map<string, FieldKind>,
): unknown {
  const kind = kinds.get(field) ?? 'text';
  if (kind === 'date' || kind === 'datetime') return typeof value === 'string' ? new Date(value) : null;
  if (kind === 'richtext') return toBodyHtml(String(value ?? ''));
  return value;
}

function readPayload(raw: string): RowPayload | null {
  try {
    const parsed = JSON.parse(raw) as RowPayload;
    return parsed && typeof parsed === 'object' && parsed.values ? parsed : null;
  } catch {
    return null;
  }
}

export async function cancelImportJob(jobId: string): Promise<boolean> {
  const job = await prisma.importJob.findUnique({ where: { id: jobId }, select: { status: true } });
  if (!job || job.status !== 'validated') return false;
  await prisma.importJob.update({ where: { id: jobId }, data: { status: 'cancelled' } });
  return true;
}
