/**
 * The materials a homepage block shows, chosen by hand.
 *
 * A block can be left to fill itself with the newest material of its own kind, or it can be given a
 * list, in order, that someone decided on. Both halves live here: what the block screen offers, and
 * what it may write back. Only published material is offered, because nothing else may reach a
 * visitor — a draft chosen by mistake would simply not appear, and a list that quietly loses items
 * is worse than a picker that never shows them.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { CONTENT_STATUS } from '@/lib/enums';
import { BLOCK_ITEMS_MAX, BLOCK_SOURCE, type SectionType } from '@/lib/admin/homepage-sections';

export interface BlockChoice {
  groupId: string;
  title: string;
  typeKey: string;
}

/** How many rows are scanned before the list is trimmed: the newest published material first. */
const SCAN = 400;

function sourceWhere(type: SectionType) {
  const source = BLOCK_SOURCE[type];
  if (!source) return { deletedAt: null };
  return {
    deletedAt: null,
    type: source.typeKey,
    ...(source.youngOnly ? { researcher: { isYoungScientist: true } } : {}),
  };
}

function choiceOf(row: { groupId: string; title: string; group: { type: string } }): BlockChoice {
  return { groupId: row.groupId, title: row.title, typeKey: row.group.type };
}

/**
 * What the block may be given: published material of its own kind, or of any kind when it has none.
 *
 * Material written in the language of the screen comes first, because those are the titles the
 * person recognises; a second look fills the list with published material that exists only in
 * another language of the institute, which is still worth putting on a block.
 */
export async function blockCandidates(
  type: SectionType,
  lang: string,
  picked: string[],
  limit = 100,
): Promise<BlockChoice[]> {
  const group = sourceWhere(type);
  const skip = new Set(picked);
  const found = new Map<string, BlockChoice>();

  async function scan(inLang: string | null) {
    const rows = await prisma.contentItem.findMany({
      where: { deletedAt: null, status: CONTENT_STATUS.PUBLISHED, group, ...(inLang ? { lang: inLang } : {}) },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: SCAN,
      select: { groupId: true, title: true, group: { select: { type: true } } },
    });
    for (const row of rows) {
      if (skip.has(row.groupId)) continue;
      skip.add(row.groupId);
      found.set(row.groupId, choiceOf(row));
      if (found.size >= limit) return;
    }
  }

  await scan(lang);
  if (found.size < limit) await scan(null);
  return [...found.values()];
}

/** The list a block already holds, in the order it was put there. */
export async function blockItems(sectionId: string, lang: string): Promise<BlockChoice[]> {
  const rows = await prisma.homepageSectionItem.findMany({
    where: { sectionId },
    orderBy: { sortOrder: 'asc' },
    select: {
      groupId: true,
      group: {
        select: {
          type: true,
          items: { where: { deletedAt: null }, orderBy: { lang: 'asc' }, select: { lang: true, title: true } },
        },
      },
    },
  });

  return rows.flatMap((row) => {
    const item = row.group.items.find((entry) => entry.lang === lang) ?? row.group.items[0];
    if (!item) return [];
    return [{ groupId: row.groupId, title: item.title, typeKey: row.group.type }];
  });
}

/**
 * The ordered list the block screen posts back. Anything that is not a plain list of identifiers is
 * dropped rather than trusted, and a material the database does not know is left out so a stale page
 * cannot park a dangling row on the block.
 */
export async function readBlockItems(raw: FormDataEntryValue | null): Promise<string[]> {
  if (typeof raw !== 'string' || !raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const ids = parsed.filter(
    (value): value is string => typeof value === 'string' && value.length > 0 && value.length <= 40,
  );
  const unique = [...new Set(ids)].slice(0, BLOCK_ITEMS_MAX);
  if (!unique.length) return [];

  const known = await prisma.contentGroup.findMany({
    where: { id: { in: unique }, deletedAt: null },
    select: { id: true },
  });
  const alive = new Set(known.map((row) => row.id));
  return unique.filter((id) => alive.has(id));
}
