/**
 * The homepage the Homepage Builder assembles.
 *
 * A block is stored as a type, a JSON layout config, per-language texts and an optional curated list
 * of materials. This module turns those rows into something a component can draw: texts in the
 * language of the page, the picture the block was given, and the materials the block shows — the
 * ones a content manager picked, or the newest published ones when the block is left to itself.
 */
import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/db';
import { BLOCK_SOURCE, isSectionType, readConfig, SECTION_SHAPES, type SectionType } from '@/lib/admin/homepage-sections';
import { internalHref } from '@/lib/site/link';
import { defaultSiteLanguage } from '@/lib/site/languages';
import { curatedMaterials, publishedMaterials, publishedPeople, type PublicImage, type PublicMaterial } from '@/lib/site/materials';

export interface HomepageBlock {
  id: string;
  type: SectionType;
  heading: string;
  subheading: string;
  body: string;
  buttons: { text: string; href: string }[];
  image: PublicImage | null;
  items: PublicMaterial[];
  columns: number;
  showImages: boolean;
  /** The layout options of this block type: picture height, image side, map and form switches. */
  config: Record<string, string | number | boolean>;
}

type SectionRow = {
  id: string;
  type: string;
  config: string | null;
  contents: {
    lang: string;
    heading: string | null;
    subheading: string | null;
    body: string | null;
    buttonText: string | null;
    buttonUrl: string | null;
    button2Text: string | null;
    button2Url: string | null;
  }[];
  items: { groupId: string }[];
};

/**
 * The texts of a block. A block that was written in Russian and not yet translated still shows its
 * Russian heading — an untitled block looks like a broken page, while a heading in the institute's
 * working language looks like what it is: a translation that has not been done yet.
 */
function textsFor(row: SectionRow, lang: string, fallback: string) {
  const content =
    row.contents.find((entry) => entry.lang === lang) ??
    row.contents.find((entry) => entry.lang === fallback) ??
    row.contents[0];
  return {
    heading: content?.heading?.trim() ?? '',
    subheading: content?.subheading?.trim() ?? '',
    body: content?.body?.trim() ?? '',
    buttons: [
      { text: content?.buttonText?.trim() ?? '', href: content?.buttonUrl?.trim() ?? '' },
      { text: content?.button2Text?.trim() ?? '', href: content?.button2Url?.trim() ?? '' },
    ].filter((button) => button.text && button.href),
  };
}

async function blockImage(imageId: string): Promise<PublicImage | null> {
  if (!imageId) return null;
  const media = await prisma.media.findFirst({
    where: { id: imageId, kind: 'image', status: 'ready' },
    select: {
      publicUrl: true,
      altText: true,
      title: true,
      variants: { where: { role: { in: ['large', 'medium'] } }, select: { role: true, publicUrl: true } },
    },
  });
  if (!media) return null;
  const url = (media.variants.find((variant) => variant.role === 'large') ?? media.variants[0])?.publicUrl ?? media.publicUrl;
  return { url, alt: media.altText ?? media.title ?? '' };
}

async function buildBlock(row: SectionRow, lang: string, fallback: string): Promise<HomepageBlock | null> {
  if (!isSectionType(row.type)) return null;
  const config = readConfig(row.type, row.config);
  const shape = SECTION_SHAPES[row.type];
  const texts = textsFor(row, lang, fallback);

  const count = typeof config.count === 'number' ? config.count : 6;
  const curated = await curatedMaterials(row.items.map((item) => item.groupId), lang);
  const source = BLOCK_SOURCE[row.type];
  const items =
    curated.length > 0
      ? curated.slice(0, count)
      : source
        ? source.youngOnly
          ? await publishedPeople('researcher', lang, count, true)
          : await publishedMaterials(source.typeKey, lang, count)
        : [];

  const showImages = typeof config.showImages === 'boolean' ? config.showImages : true;

  // A block of materials with nothing to list is a heading over an empty space, so it stays off the page.
  if (shape.items && items.length === 0) return null;

  return {
    id: row.id,
    type: row.type,
    heading: texts.heading,
    subheading: shape.subheading ? texts.subheading : '',
    body: shape.body ? texts.body : '',
    buttons: texts.buttons
      .slice(0, shape.buttons)
      .map((button) => ({ text: button.text, href: buttonHref(button.href, lang) }))
      .filter((button) => button.href),
    image: typeof config.imageId === 'string' ? await blockImage(config.imageId) : null,
    items,
    columns: typeof config.columns === 'number' ? config.columns : 3,
    showImages: shape.config.some((field) => field.name === 'showImages') ? showImages : true,
    config,
  };
}

function externalSafe(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** An anchor stays on the page, an internal path gains the language prefix, an external link is kept. */
function buttonHref(value: string, lang: string): string {
  if (value.startsWith('#')) return value;
  return internalHref(value, lang) ?? (externalSafe(value) ? value : '');
}

export const homepageBlocks = cache(async (lang: string): Promise<HomepageBlock[]> => {
  const [rows, fallback] = await Promise.all([
    prisma.homepageSection.findMany({
      where: { isEnabled: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        type: true,
        config: true,
        contents: {
          select: {
            lang: true,
            heading: true,
            subheading: true,
            body: true,
            buttonText: true,
            buttonUrl: true,
            button2Text: true,
            button2Url: true,
          },
        },
        items: { orderBy: { sortOrder: 'asc' }, select: { groupId: true } },
      },
    }),
    defaultSiteLanguage(),
  ]);

  const blocks = await Promise.all(rows.map((row) => buildBlock(row, lang, fallback)));
  return blocks.filter((block): block is HomepageBlock => block !== null);
});
