import type { InventoryRow } from './inventory';
import type { Placement } from './write';

/** Where a material goes on the new site, and the words that explain the choice to a person. */
export interface Mapping extends Placement {
  why: string;
}

/**
 * K2 kept its rubrics as ids, and the same rubric exists once per language: news is 97 in Uzbek,
 * 99 in Russian, 98 in English. They become one rubric here, under the Uzbek name the site used.
 */
const K2_RUBRICS: Record<number, { typeKey: string; rubric: NonNullable<Placement['rubric']> }> = {
  97: { typeKey: 'news', rubric: { slug: 'yangiliklar', names: { uz: 'Yangiliklar', ru: 'Новости', en: 'News' } } },
  99: { typeKey: 'news', rubric: { slug: 'yangiliklar', names: { uz: 'Yangiliklar', ru: 'Новости', en: 'News' } } },
  98: { typeKey: 'news', rubric: { slug: 'yangiliklar', names: { uz: 'Yangiliklar', ru: 'Новости', en: 'News' } } },
  103: { typeKey: 'book', rubric: { slug: 'kitoblar', names: { uz: 'Kitoblar', ru: 'Книги', en: 'Books' } } },
  104: { typeKey: 'book', rubric: { slug: 'kitoblar', names: { uz: 'Kitoblar', ru: 'Книги', en: 'Books' } } },
  105: { typeKey: 'book', rubric: { slug: 'kitoblar', names: { uz: 'Kitoblar', ru: 'Книги', en: 'Books' } } },
};

/**
 * A com_content item prints no rubric at all, so its section lives in the address. The words are
 * checked in every segment of the path, longest and most specific first, because the old site put
 * the same article under nested menu paths (`/en-ca/ilmiy-hayot/jurnal/306-…`).
 */
const SECTIONS: { pattern: RegExp; typeKey: string; rubric?: NonNullable<Placement['rubric']>; why: string }[] = [
  {
    pattern: /^(jurnal|journal|meros)$/i,
    typeKey: 'journal',
    why: 'подшивка журнала',
  },
  {
    pattern: /^(nashrlar|izdaniya|publications|nashi-dostijeniya)$/i,
    typeKey: 'publication',
    rubric: { slug: 'nashrlar', names: { uz: 'Nashrlar', ru: 'Издания', en: 'Publications' } },
    why: 'издания института',
  },
  {
    pattern: /^(elektron-katalog|9-explore)$/i,
    typeKey: 'document',
    rubric: { slug: 'katalog', names: { uz: 'Katalog', ru: 'Каталог', en: 'Catalogue' } },
    why: 'электронный каталог',
  },
  {
    pattern: /^(ilmiy-hayot-3|doska-obyevleniy|obyavleniya|ob-yevleniya)$/i,
    typeKey: 'announcement',
    rubric: { slug: 'xabarlar', names: { uz: 'Xabarlar', ru: 'Объявления', en: 'Announcements' } },
    why: 'доска объявлений и закупки',
  },
  {
    pattern: /^(konfirensiyalar|konferentsii|conference|konferensiya)$/i,
    typeKey: 'event',
    rubric: { slug: 'konferentsii', names: { uz: 'Konferensiyalar', ru: 'Конференции', en: 'Conferences' } },
    why: 'конференции',
  },
  {
    pattern: /^(ilmiy-seminarlar|scientific-seminars|nauchniye-seminari|seminarlar|seminari|seminars)$/i,
    typeKey: 'event',
    rubric: { slug: 'seminarlar', names: { uz: 'Ilmiy seminarlar', ru: 'Научные семинары', en: 'Seminars' } },
    why: 'научный семинар',
  },
  {
    pattern: /^(bo-limlar|otdeli|podrazdeleniya|department|departments)$/i,
    typeKey: 'department',
    why: 'подразделение',
  },
  {
    pattern: /^(xalqaro-hamkorlik|mejdunarodnoye-sotrud|international-cooperation|hamkorlik)$/i,
    typeKey: 'page',
    why: 'международное сотрудничество',
  },
  {
    pattern: /^(tuzilma|glavnaya|home11|structure|home|about)$/i,
    typeKey: 'page',
    why: 'страница структуры сайта',
  },
  {
    pattern: /^(ilmiy-hayot|nauchnaya-jizn|scientific-life|ilmiy-yangiliklar|ilmiy-ekspeditsiyalar)$/i,
    typeKey: 'article',
    rubric: { slug: 'ilmiy-hayot', names: { uz: 'Ilmiy hayot', ru: 'Научная жизнь', en: 'Scientific life' } },
    why: 'научная жизнь',
  },
];

/** Defence notices and author's abstracts live in the seminar section but are not seminars. */
const DISSERTATION_WORDS = /(автореферат|диссертаци|диссертация|himoya|химоя|defence|dissertation| doctoral|PhD|DSc)/i;

function pathSegments(url: string): string[] {
  return new URL(url)
    .pathname.split('/')
    .filter(Boolean)
    .map((part) => decodeURIComponent(part).replace(/\.html?$/i, '').replace(/^\d+[-_.]/, '').toLowerCase());
}


export function mapMaterial(row: InventoryRow): Mapping {
  // The same text reached through a nested menu path is not a second material.
  if (row.source === 'k2' && row.categoryId && K2_RUBRICS[row.categoryId]) {
    const known = K2_RUBRICS[row.categoryId];
    return {
      typeKey: known.typeKey,
      rubric: known.rubric,
      detail: known.typeKey === 'news' ? newsDetail(row) : undefined,
      why: `K2 рубрика #${row.categoryId} · ${row.categoryLabel}`,
    };
  }

  const segments = pathSegments(row.url);
  for (const section of SECTIONS) {
    if (!segments.some((s) => section.pattern.test(s))) continue;
    if (section.typeKey === 'event' && DISSERTATION_WORDS.test(row.title)) {
      return { typeKey: 'dissertation', detail: { degree: 'phd' }, why: `объявление о защите, раздел «${row.section}»` };
    }
    return {
      typeKey: section.typeKey,
      rubric: section.rubric,
      detail: section.typeKey === 'news' ? newsDetail(row) : undefined,
      why: `раздел сайта «${section.pattern.source}» → ${section.why}`,
    };
  }

  return {
    typeKey: 'article',
    rubric: { slug: 'beruni-uz', names: { uz: 'Beruniy.uz', ru: 'Beruniy.uz', en: 'Beruniy.uz' } },
    why: 'не распознано — временная рубрика Beruniy.uz',
  };
}

/** News carries the old address and its date; that is where a person checks the transfer. */
function newsDetail(row: InventoryRow): Record<string, unknown> {
  return {
    sourceUrl: row.url,
    ...(row.publishedAt ? { eventDate: new Date(row.publishedAt) } : {}),
  };
}
