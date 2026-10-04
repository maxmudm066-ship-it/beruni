/**
 * Reading published materials for the public site.
 *
 * Only the version in the language being rendered is listed: a page that has not been translated
 * into Uzbek is missing from the Uzbek site, and the panel's Translations screen is where that gap
 * is visible. A material whose own language version is unpublished never appears, even if another
 * language of the same material is live.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { CONTENT_STATUS } from '@/lib/enums';
import { localizedPath } from '@/lib/content/routes';

export interface PublicImage {
  url: string;
  alt: string;
}

export interface PublicMaterial {
  groupId: string;
  itemId: string;
  lang: string;
  typeKey: string;
  title: string;
  subtitle: string;
  excerpt: string;
  href: string;
  publishedAt: Date | null;
  image: PublicImage | null;
  /** The rubric the material sits under, in the language of the page. */
  category: string;
  /** One line of type-specific detail: an event date, a researcher's position, a manuscript shelfmark. */
  meta: string;
}

type Translation = { lang: string; name: string };

/** Card fields, plus the few detail columns a listing has room to show. */
const CARD_GROUP: Record<string, Record<string, unknown>> = {
  news: { news: { select: { category: { select: { slug: true, translations: true } } } } },
  article: { article: { select: { category: { select: { slug: true, translations: true } } } } },
  book: { book: { select: { category: { select: { slug: true, translations: true } }, year: true, pages: true } } },
  publication: {
    publication: { select: { category: { select: { slug: true, translations: true } }, year: true, kind: true } },
  },
  manuscript: {
    manuscript: {
      select: {
        repositoryId: true,
        invNo: true,
        authorOriginal: true,
        languageOfText: true,
        category: { select: { slug: true, translations: true } },
      },
    },
  },
  dissertation: { dissertation: { select: { candidateName: true, specialty: true, defenseDate: true } } },
  event: {
    event: {
      select: {
        startDate: true,
        endDate: true,
        location: true,
        kind: true,
        category: { select: { slug: true, translations: true } },
      },
    },
  },
  announcement: {
    announcement: { select: { kind: true, expiresAt: true, category: { select: { slug: true, translations: true } } } },
  },
  researcher: { researcher: { select: { position: true, degree: true, academicTitle: true } } },
  department: { department: { select: { kind: true } } },
  research_direction: { researchDirection: { select: { code: true } } },
  research_project: {
    researchProject: { select: { code: true, startYear: true, endYear: true, stage: true } },
  },
  partner: {
    partner: {
      select: { country: true, orgType: true, organization: true, category: { select: { slug: true, translations: true } } },
    },
  },
  document: { document: { select: { kind: true, docNumber: true, issuedAt: true } } },
  journal: { journal: { select: { issn: true, foundedYear: true } } },
};

function cardSelect(typeKey: string) {
  return {
    id: true,
    groupId: true,
    lang: true,
    title: true,
    subtitle: true,
    slug: true,
    excerpt: true,
    publishedAt: true,
    group: {
      select: {
        type: true,
        page: { select: { pathOverride: true } },
        mediaLinks: {
          where: { role: { in: ['main', 'cover', 'photo'] } },
          orderBy: { sortOrder: 'asc' as const },
          take: 1,
          select: {
            caption: true,
            media: {
              select: {
                publicUrl: true,
                altText: true,
                title: true,
                status: true,
                variants: { where: { role: { in: ['small', 'medium'] } }, select: { role: true, publicUrl: true } },
              },
            },
          },
        },
        ...(CARD_GROUP[typeKey] ?? {}),
      },
    },
  };
}

type CardRow = {
  id: string;
  groupId: string;
  lang: string;
  title: string;
  subtitle: string | null;
  slug: string;
  excerpt: string | null;
  publishedAt: Date | null;
  group: {
    type: string;
    page: { pathOverride: string | null } | null;
    mediaLinks: {
      caption: string | null;
      media: {
        publicUrl: string;
        altText: string | null;
        title: string | null;
        status: string;
        variants: { role: string; publicUrl: string }[];
      };
    }[];
  } & Record<string, Record<string, unknown> | null>;
};

function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

/** The rubric name in the language of the page, falling back to any language the category has. */
function categoryName(detail: Record<string, unknown> | null | undefined, lang: string): string {
  const category = detail?.category as { slug: string; translations: Translation[] } | null | undefined;
  if (!category) return '';
  const translations = category.translations ?? [];
  const entry = translations.find((row) => row.lang === lang) ?? translations[0];
  return entry?.name ?? category.slug;
}

/** One short line under the title, built from the columns that make the card readable. */
function metaOf(row: CardRow): string {
  const group = row.group;
  const detail = (key: string) => (group[key] ?? null) as Record<string, unknown> | null;

  if (group.type === 'researcher') {
    const researcher = detail('researcher');
    return [text(researcher?.position), text(researcher?.degree)].filter(Boolean).join(' · ');
  }
  if (group.type === 'event') {
    const event = detail('event');
    return text(event?.location);
  }
  if (group.type === 'manuscript') {
    const manuscript = detail('manuscript');
    return [text(manuscript?.repositoryId), text(manuscript?.languageOfText)].filter(Boolean).join(' · ');
  }
  if (group.type === 'dissertation') {
    const dissertation = detail('dissertation');
    return [text(dissertation?.candidateName), text(dissertation?.specialty)].filter(Boolean).join(' · ');
  }
  if (group.type === 'partner') {
    const partner = detail('partner');
    return text(partner?.country);
  }
  if (group.type === 'research_project') {
    const project = detail('researchProject');
    const from = text(project?.startYear);
    const to = text(project?.endYear);
    return [text(project?.code), from || to ? `${from}–${to}` : ''].filter(Boolean).join(' · ');
  }
  if (group.type === 'publication' || group.type === 'book') {
    const entry = detail(group.type === 'book' ? 'book' : 'publication');
    return text(entry?.year);
  }
  if (group.type === 'department') return text(detail('department')?.kind);
  if (group.type === 'journal') return text(detail('journal')?.issn);
  if (group.type === 'document') return text(detail('document')?.docNumber);
  if (group.type === 'research_direction') return text(detail('researchDirection')?.code);
  return '';
}

function imageOf(row: CardRow): PublicImage | null {
  const link = row.group.mediaLinks[0];
  if (!link || link.media.status !== 'ready') return null;
  const variants = link.media.variants;
  const url = (variants.find((variant) => variant.role === 'medium') ?? variants[0])?.publicUrl ?? link.media.publicUrl;
  return { url, alt: link.caption || link.media.altText || link.media.title || row.title };
}

/** The detail row that carries the rubric of this type, if the type has one. */
const CATEGORY_DETAIL = [
  'news',
  'article',
  'book',
  'publication',
  'manuscript',
  'event',
  'announcement',
  'document',
  'partner',
  'researchProject',
];

function toCard(row: CardRow, lang: string): PublicMaterial {
  const categoryRow = CATEGORY_DETAIL.map((key) => row.group[key]).find(Boolean);
  return {
    groupId: row.groupId,
    itemId: row.id,
    lang: row.lang,
    typeKey: row.group.type,
    title: row.title,
    subtitle: row.subtitle ?? '',
    excerpt: row.excerpt ?? '',
    href: localizedPath(
      { typeKey: row.group.type, slug: row.slug, pathOverride: row.group.page?.pathOverride ?? null },
      row.lang,
    ),
    publishedAt: row.publishedAt,
    image: imageOf(row),
    category: categoryName(categoryRow as Record<string, unknown> | null, lang),
    meta: metaOf(row),
  };
}

async function cardsFor(
  type: string,
  lang: string,
  itemWhere: Record<string, unknown>,
  groupWhere: Record<string, unknown>,
  orderBy: unknown[],
  take: number | null,
) {
  const rows = await prisma.contentItem.findMany({
    where: { lang, status: CONTENT_STATUS.PUBLISHED, deletedAt: null, ...itemWhere, group: groupWhere },
    orderBy: orderBy as never,
    ...(take === null ? {} : { take }),
    select: cardSelect(type),
  });
  return (rows as unknown as CardRow[]).map((row) => toCard(row, lang));
}

/** One filtered page of a section. The caller states the whole condition, filters included. */
export async function listingCards(
  type: string,
  lang: string,
  where: Record<string, unknown>,
  orderBy: unknown[],
  take: number,
  skip: number,
): Promise<PublicMaterial[]> {
  const rows = await prisma.contentItem.findMany({
    where: where as never,
    orderBy: orderBy as never,
    take,
    skip,
    select: cardSelect(type),
  });
  return (rows as unknown as CardRow[]).map((row) => toCard(row, lang));
}

/** Newest published materials of one type, in this language. */
export function publishedMaterials(type: string, lang: string, take: number): Promise<PublicMaterial[]> {
  return cardsFor(type, lang, {}, { type, deletedAt: null }, [{ publishedAt: 'desc' }, { createdAt: 'desc' }], take);
}

/** Researchers, optionally only the young scientists the panel ticks, listed by name. */
export function publishedPeople(
  type: 'researcher',
  lang: string,
  take: number,
  youngOnly: boolean,
): Promise<PublicMaterial[]> {
  return cardsFor(
    type,
    lang,
    {},
    { type, deletedAt: null, researcher: { isYoungScientist: youngOnly } },
    [{ title: 'asc' }],
    take,
  );
}

/** Materials chosen for a homepage block, in the order a content manager put them. */
export async function curatedMaterials(groupIds: string[], lang: string): Promise<PublicMaterial[]> {
  if (!groupIds.length) return [];

  const groups = await prisma.contentGroup.findMany({
    where: { id: { in: groupIds }, deletedAt: null },
    select: { id: true, type: true },
  });

  // One query per type, because the columns a card shows differ between them.
  const byType = new Map<string, string[]>();
  for (const group of groups) {
    byType.set(group.type, [...(byType.get(group.type) ?? []), group.id]);
  }

  const lists = await Promise.all(
    [...byType].map(([type, ids]) =>
      cardsFor(type, lang, { groupId: { in: ids } }, { type, deletedAt: null }, [{ publishedAt: 'desc' }], null),
    ),
  );

  const byGroup = new Map(lists.flat().map((card) => [card.groupId, card]));
  return groupIds.flatMap((groupId) => {
    const card = byGroup.get(groupId);
    return card ? [card] : [];
  });
}
