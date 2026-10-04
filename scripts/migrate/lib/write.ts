import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Prisma } from '../../../src/generated/prisma/client';
import { prisma } from '../../../src/lib/db';
import { slugify, withSuffix } from '../../../src/lib/slug';
import { localizedPath } from '../../../src/lib/content/routes';
import { sanitizeContentHtml } from '../../../src/lib/content/sanitize-rules';
import { CONTENT_TYPE_MAP, type ContentTypeDef } from '../../../src/lib/content-types';
import { ARCHIVE } from './archive';
import type { InventoryRow } from './inventory';
import type { LedgerEntry } from './ledger';

/** Where a migrated material belongs on the new site, decided by the mapping table. */
export interface Placement {
  typeKey: string;
  /** Rubric names in the three site languages; the same rubric on the old site is one Category here. */
  rubric?: { slug: string; names: Record<string, string> };
  /** Columns of the type's own detail table that the old page can fill. */
  detail?: Record<string, unknown>;
}

export interface WriteOptions {
  dryRun: boolean;
  /** The account the CMS shows as the author; a migration must be attributable like any other edit. */
  userId: string;
  limit?: number;
  onlyLanguages?: string[];
  onlyTypes?: string[];
  changeSummary: string;
}

export interface WriteSummary {
  written: number;
  alreadyThere: number;
  unmapped: { key: string; title: string; why: string }[];
  failed: { key: string; title: string; error: string }[];
  byType: Map<string, number>;
  byLang: Map<string, number>;
}

function detailWriter(client: unknown, model: string): { create: (args: { data: object }) => Promise<unknown> } | null {
  return (client as Record<string, { create: (args: { data: object }) => Promise<unknown> }>)[model] ?? null;
}

/** A material's own address on the old site is the key the whole migration is idempotent on. */
function baseSlug(row: InventoryRow): string {
  const fromTitle = slugify(row.title);
  if (fromTitle) return fromTitle;
  const alias = /(\d+)-([^/]+?)\.html?$/.exec(new URL(row.url).pathname);
  return slugify(alias ? `${row.source}-${alias[2]}` : row.key);
}

async function ensureCategory(
  tx: Prisma.TransactionClient,
  def: ContentTypeDef,
  rubric: NonNullable<Placement['rubric']>,
): Promise<string | null> {
  if (!def.categoryScope) return null;
  const slug = slugify(rubric.slug) || 'rubric';
  const found = await tx.category.findFirst({ where: { scope: def.categoryScope, slug }, select: { id: true } });
  const id = found?.id
    ?? (await tx.category.create({ data: { scope: def.categoryScope, slug }, select: { id: true } })).id;
  if (!found) {
    for (const [lang, name] of Object.entries(rubric.names)) {
      if (!name) continue;
      await tx.categoryTranslation.upsert({
        where: { categoryId_lang: { categoryId: id, lang } },
        create: { categoryId: id, lang, name },
        update: { name },
      });
    }
  }
  return id;
}

/**
 * Writes one material version as a draft. Everything the editor would have filled in is taken from
 * the old page; the status stays 'draft' because the institute checks the transfer itself.
 */
export async function writeDraft(
  row: InventoryRow,
  placement: Placement,
  options: WriteOptions,
): Promise<LedgerEntry> {
  const def = CONTENT_TYPE_MAP.get(placement.typeKey);
  if (!def) throw new Error(`unknown type ${placement.typeKey}`);

  const lifted = liftInlineImages(row, options.dryRun);
  const body = sanitizeContentHtml(lifted.html);

  const groupData = {
    type: def.key,
    sourceLang: row.lang,
    createdBy: options.userId,
  };
  const itemData = {
    lang: row.lang,
    title: row.title,
    excerpt: row.excerpt || null,
    body,
    status: 'draft',
    revision: 1,
    origin: 'source',
    authorId: options.userId,
    updatedById: options.userId,
    // The old address is not copied into the SEO fields: a page whose canonical points at the previous
    // site asks search engines to prefer the very address the 301 list redirects from. It stays in the
    // migration ledger, which is where the transfer is traced, and in the Redirect table.
    seoTitle: row.seoTitle || null,
    seoDescription: row.seoDescription || null,
    keywords: row.keywords || null,
    translationNote: row.printedDate ? `На старом сайте: ${row.printedDate}` : null,
  };

  if (options.dryRun) {
    return ledgerEntry(row, placement, def, 'dry-run', 'dry-run', baseSlug(row), lifted.files);
  }

  return prisma.$transaction(async (tx) => {
    const slug = await withSuffixTx(tx, row.lang, baseSlug(row));
    const group = await tx.contentGroup.create({ data: groupData, select: { id: true } });
    const item = await tx.contentItem.create({
      data: { ...itemData, slug, groupId: group.id } as Prisma.ContentItemUncheckedCreateInput,
      select: { id: true, slug: true, title: true, subtitle: true, excerpt: true, body: true, status: true },
    });

    const categoryId = placement.rubric ? await ensureCategory(tx, def, placement.rubric) : null;
    if (def.detailModel) {
      const writer = detailWriter(tx, def.detailModel);
      if (writer) {
        await writer.create({
          data: { groupId: group.id, ...(categoryId ? { categoryId } : {}), ...(placement.detail ?? {}) },
        });
      }
    }

    await tx.contentRevision.create({
      data: {
        itemId: item.id,
        version: 1,
        changedById: options.userId,
        changeSummary: options.changeSummary,
        title: item.title,
        subtitle: item.subtitle,
        slug: item.slug,
        excerpt: item.excerpt,
        body: item.body,
        status: item.status,
      },
    });

    return ledgerEntry(row, placement, def, group.id, item.id, item.slug, lifted.files);
  });
}

/** Slugs are unique per language, and the site already holds seeded material. */
async function withSuffixTx(tx: Prisma.TransactionClient, lang: string, base: string): Promise<string> {
  const taken = new Set<string>();
  const candidates = await tx.contentItem.findMany({
    where: { lang, slug: { startsWith: base } },
    select: { slug: true },
  });
  for (const candidate of candidates) taken.add(candidate.slug);
  return withSuffix(base, taken) || `material-${Date.now()}`;
}

function ledgerEntry(
  row: InventoryRow,
  placement: Placement,
  def: ContentTypeDef,
  groupId: string,
  itemId: string,
  slug: string,
  inline: string[],
): LedgerEntry {
  return {
    key: row.key,
    oldUrl: row.url,
    lang: row.lang,
    typeKey: def.key,
    groupId,
    itemId,
    slug,
    newPath: localizedPath({ typeKey: def.key, slug }, row.lang),
    title: row.title,
    aliases: row.aliases,
    assets: row.fileUrls,
    inline,
    at: new Date().toISOString(),
  };
}

const INLINE_DIR = path.join(ARCHIVE, 'inline');
const INLINE_IMAGE = /<img[^>]*src="data:image\/(png|jpe?g|gif|webp);base64,([^"]+)"[^>]*\/?>/gi;

/**
 * Three old pages carried a photograph as base64 inside the text — several megabytes per image, which
 * does not belong in a page and cannot be uploaded through the editor as it stands. Each one is written
 * out to the archive beside the rest of the material, and the draft says which file to attach, so the
 * picture survives the transfer instead of being silently dropped by the HTML cleaner.
 */
function liftInlineImages(row: InventoryRow, dryRun: boolean): { html: string; files: string[] } {
  const files: string[] = [];
  const html = row.bodyHtml.replace(INLINE_IMAGE, (_all, ext: string, data: string) => {
    const name = `${row.key.slice(0, 12)}-${files.length + 1}.${ext === 'jpeg' ? 'jpg' : ext}`;
    if (!dryRun) {
      mkdirSync(INLINE_DIR, { recursive: true });
      writeFileSync(path.join(INLINE_DIR, name), Buffer.from(data, 'base64'));
    }
    files.push(name);
    return '';
  });
  if (!files.length) return { html, files };
  const note = `На старом сайте здесь была картинка, вставленная в текст (файл: ${files.join(', ')} из архива inline/). Приложите её из Медиа-библиотеки.`;
  return { html: `${html}<p><em>${note}</em></p>`, files };
}

export function typeIsKnown(typeKey: string): boolean {
  return CONTENT_TYPE_MAP.has(typeKey);
}
