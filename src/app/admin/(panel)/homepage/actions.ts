/**
 * Homepage Builder writes: which blocks the homepage is made of, in what order, whether each is
 * shown, and the texts and settings of each block. All of it arrives as a plain form post.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { assertPermission } from '@/lib/auth/session';
import { recordAudit } from '@/lib/auth/audit';
import { localeOf, translate, type AdminLocale } from '@/lib/admin/labels';
import { parseFlatOrderPayload } from '@/lib/admin/reorder';
import { SECTION_SHAPES, defaultConfig, isSectionType } from '@/lib/admin/homepage-sections';
import { readBlockItems } from '@/lib/admin/homepage-items';

const PERMISSION = 'homepage.manage';

function text(form: FormData, name: string, max: number): string {
  const raw = form.get(name);
  return typeof raw === 'string' ? raw.trim().slice(0, max) : '';
}

function flag(form: FormData, name: string): boolean {
  const raw = form.get(name);
  return raw === 'on' || raw === 'true' || raw === '1';
}

function backTo(form: FormData, fallback: string, notice?: string): never {
  const raw = form.get('back');
  const path = typeof raw === 'string' && raw.startsWith('/admin/homepage') ? raw.slice(0, 300) : fallback;
  redirect(notice ? `${path}${path.includes('?') ? '&' : '?'}${notice}` : path);
}

/**
 * Block buttons point at the site or at another public site. Anything else — a script URL, a
 * protocol-relative address, whitespace — is refused, because the value ends up in an href.
 */
function normalizeUrl(raw: string): { url: string; invalid: boolean } {
  const value = raw.trim().slice(0, 500);
  if (!value) return { url: '', invalid: false };
  if (value.startsWith('/')) {
    if (value.startsWith('//') || /[\s<>"]/u.test(value)) return { url: '', invalid: true };
    return { url: value, invalid: false };
  }
  if (value.startsWith('#')) return { url: value, invalid: /[\s<>"]/u.test(value) };
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { url: '', invalid: true };
    return { url: parsed.toString(), invalid: false };
  } catch {
    return { url: '', invalid: true };
  }
}

function auditFor(language: string | null) {
  const locale: AdminLocale = localeOf(language);
  return (key: Parameters<typeof translate>[1]) => translate(locale, key);
}

async function siteLanguages(): Promise<string[]> {
  const languages = await prisma.language.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: { code: true },
  });
  return languages.map((language) => language.code);
}

async function nextSortOrder(): Promise<number> {
  const last = await prisma.homepageSection.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
  return (last?.sortOrder ?? -1) + 1;
}

export async function createSection(form: FormData): Promise<void> {
  const guard = await assertPermission(PERMISSION);
  if (!guard.ok) backTo(form, '/admin/homepage', 'notice=denied');

  const type = form.get('type');
  if (!isSectionType(type)) backTo(form, '/admin/homepage', 'notice=invalid');

  const section = await prisma.homepageSection.create({
    data: { type, isEnabled: true, sortOrder: await nextSortOrder(), config: JSON.stringify(defaultConfig(type)) },
  });

  const t = auditFor(guard.user.language);
  await recordAudit({
    userId: guard.user.id,
    action: 'homepage.create',
    entityType: 'HomepageSection',
    entityId: section.id,
    description: `${t('audit.homeCreated')} · ${t(SECTION_SHAPES[type].labelKey)}`,
  });

  revalidatePath('/', 'layout');
  redirect(`/admin/homepage/${section.id}?notice=created`);
}

export async function toggleSection(form: FormData): Promise<void> {
  const guard = await assertPermission(PERMISSION);
  const id = text(form, 'id', 40);
  if (!guard.ok) backTo(form, '/admin/homepage', 'notice=denied');

  const section = await prisma.homepageSection.findUnique({ where: { id }, select: { id: true, type: true, isEnabled: true } });
  if (!section || !isSectionType(section.type)) backTo(form, '/admin/homepage', 'notice=missing');
  const labelKey = SECTION_SHAPES[section.type].labelKey;

  await prisma.homepageSection.update({ where: { id: section.id }, data: { isEnabled: !section.isEnabled } });

  const t = auditFor(guard.user.language);
  await recordAudit({
    userId: guard.user.id,
    action: 'homepage.update',
    entityType: 'HomepageSection',
    entityId: section.id,
    description: `${t('audit.home')} · ${t(labelKey)} · ${t(section.isEnabled ? 'audit.homeHidden' : 'audit.homeShown')}`,
  });

  revalidatePath('/', 'layout');
  backTo(form, '/admin/homepage', 'notice=saved');
}

export async function deleteSection(form: FormData): Promise<void> {
  const guard = await assertPermission(PERMISSION);
  const id = text(form, 'id', 40);
  if (!guard.ok) backTo(form, '/admin/homepage', 'notice=denied');

  const section = await prisma.homepageSection.findUnique({ where: { id }, select: { id: true, type: true } });
  if (!section || !isSectionType(section.type)) backTo(form, '/admin/homepage', 'notice=missing');
  const labelKey = SECTION_SHAPES[section.type].labelKey;

  // Texts and curated materials of the block cascade with it; site materials themselves are untouched.
  await prisma.homepageSection.delete({ where: { id: section.id } });
  const rest = await prisma.homepageSection.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true } });
  await prisma.$transaction(
    rest.map((row, index) => prisma.homepageSection.update({ where: { id: row.id }, data: { sortOrder: index } })),
  );

  const t = auditFor(guard.user.language);
  await recordAudit({
    userId: guard.user.id,
    action: 'homepage.delete',
    entityType: 'HomepageSection',
    entityId: section.id,
    description: `${t('audit.homeDeleted')} · ${t(labelKey)}`,
  });

  revalidatePath('/', 'layout');
  backTo(form, '/admin/homepage', 'notice=deleted');
}

/** One step up or down — the button counterpart of dragging a block. */
export async function moveSection(form: FormData): Promise<void> {
  const guard = await assertPermission(PERMISSION);
  const id = text(form, 'id', 40);
  const direction = text(form, 'direction', 10);
  if (!guard.ok) backTo(form, '/admin/homepage', 'notice=denied');

  const sections = await prisma.homepageSection.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true } });
  const index = sections.findIndex((row) => row.id === id);
  const target = direction === 'up' ? index - 1 : direction === 'down' ? index + 1 : -1;
  if (index < 0 || target < 0 || target >= sections.length) backTo(form, '/admin/homepage', 'notice=missing');

  const order = sections.map((row) => row.id);
  [order[index], order[target]] = [order[target], order[index]];
  await prisma.$transaction(
    order.map((sectionId, position) =>
      prisma.homepageSection.update({ where: { id: sectionId }, data: { sortOrder: position } }),
    ),
  );

  const t = auditFor(guard.user.language);
  await recordAudit({
    userId: guard.user.id,
    action: 'homepage.reorder',
    entityType: 'HomepageSection',
    entityId: id,
    description: `${t('audit.homeOrder')} · ${t('home.title')}`,
  });

  revalidatePath('/', 'layout');
  backTo(form, '/admin/homepage', 'notice=order');
}

export async function saveSectionOrder(form: FormData): Promise<void> {
  const guard = await assertPermission(PERMISSION);
  if (!guard.ok) backTo(form, '/admin/homepage', 'notice=denied');

  const known = await prisma.homepageSection.findMany({ select: { id: true } });
  const entries = parseFlatOrderPayload(
    form.get('order'),
    new Set(known.map((row) => row.id)),
  );
  if (!entries) backTo(form, '/admin/homepage', 'notice=order-invalid');

  await prisma.$transaction(
    entries.map((entry) => prisma.homepageSection.update({ where: { id: entry.id }, data: { sortOrder: entry.sortOrder } })),
  );

  const t = auditFor(guard.user.language);
  await recordAudit({
    userId: guard.user.id,
    action: 'homepage.reorder',
    entityType: 'HomepageSection',
    description: `${t('audit.homeOrder')} · ${t('home.title')}`,
    payload: { blocks: entries.length },
  });

  revalidatePath('/', 'layout');
  backTo(form, '/admin/homepage', 'notice=order');
}

export async function saveSection(form: FormData): Promise<void> {
  const guard = await assertPermission(PERMISSION);
  const id = text(form, 'id', 40);
  const screen = `/admin/homepage/${id}`;
  if (!guard.ok) backTo(form, screen, 'notice=denied');

  const section = await prisma.homepageSection.findUnique({ where: { id } });
  if (!section || !isSectionType(section.type)) backTo(form, '/admin/homepage', 'notice=missing');

  const shape = SECTION_SHAPES[section.type];
  const languages = await siteLanguages();

  const contents: Record<string, Record<string, string | null>> = {};
  for (const lang of languages) {
    const first = normalizeUrl(text(form, `buttonUrl:${lang}`, 500));
    const second = normalizeUrl(text(form, `button2Url:${lang}`, 500));
    if (first.invalid || second.invalid) backTo(form, screen, 'notice=bad-url');

    contents[lang] = {
      heading: text(form, `heading:${lang}`, 300) || null,
      subheading: shape.subheading ? text(form, `subheading:${lang}`, 400) || null : null,
      body: shape.body ? text(form, `body:${lang}`, 8000) || null : null,
      buttonText: shape.buttons >= 1 ? text(form, `buttonText:${lang}`, 80) || null : null,
      buttonUrl: shape.buttons >= 1 ? first.url || null : null,
      button2Text: shape.buttons >= 2 ? text(form, `button2Text:${lang}`, 80) || null : null,
      button2Url: shape.buttons >= 2 ? second.url || null : null,
    };
  }

  const config: Record<string, string | number | boolean> = {};
  for (const field of shape.config) {
    if (field.kind === 'image') {
      const mediaId = text(form, `cfg:${field.name}`, 40);
      const media = mediaId
        ? await prisma.media.findFirst({ where: { id: mediaId, kind: 'image' }, select: { id: true } })
        : null;
      config[field.name] = media?.id ?? '';
    } else if (field.kind === 'boolean') {
      config[field.name] = flag(form, `cfg:${field.name}`);
    } else if (field.kind === 'number') {
      const value = Number.parseInt(text(form, `cfg:${field.name}`, 10), 10);
      config[field.name] = Number.isFinite(value)
        ? Math.min(field.max, Math.max(field.min, value))
        : field.defaultValue;
    } else {
      const value = text(form, `cfg:${field.name}`, 40);
      config[field.name] = field.options.some((option) => option.value === value) ? value : field.defaultValue;
    }
  }

  const isEnabled = flag(form, 'isEnabled');
  // The order the screen sent, with anything the database does not know dropped.
  const items = shape.items ? await readBlockItems(form.get('items')) : [];
  await prisma.$transaction(async (tx) => {
    await tx.homepageSection.update({
      where: { id: section.id },
      data: { isEnabled, config: JSON.stringify(config) },
    });
    for (const [lang, values] of Object.entries(contents)) {
      await tx.homepageSectionContent.upsert({
        where: { sectionId_lang: { sectionId: section.id, lang } },
        update: values,
        create: { sectionId: section.id, lang, ...values },
      });
    }
    if (shape.items) {
      await tx.homepageSectionItem.deleteMany({ where: { sectionId: section.id } });
      for (const [index, groupId] of items.entries()) {
        await tx.homepageSectionItem.create({ data: { sectionId: section.id, groupId, sortOrder: index } });
      }
    }
  });

  const t = auditFor(guard.user.language);
  await recordAudit({
    userId: guard.user.id,
    action: 'homepage.update',
    entityType: 'HomepageSection',
    entityId: section.id,
    description: `${t('audit.home')} · ${t(shape.labelKey)} · ${contents.ru?.heading ?? Object.values(contents)[0]?.heading ?? ''}`,
    payload: { isEnabled, config, materials: items.length },
  });

  revalidatePath('/', 'layout');
  backTo(form, screen, 'notice=saved');
}
