import path from 'node:path';
import bcrypt from 'bcryptjs';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../src/generated/prisma/client';
import { ALL_PERMISSIONS, ROLES, SUPER_ADMIN_KEY, SUPER_ADMIN_PERMISSION } from '../src/lib/rbac';
import { DEFAULT_LANGUAGES, CONTENT_STATUS } from '../src/lib/enums';
import { CONTENT_TYPE_MAP, DETAIL_KEY_BY_TYPE } from '../src/lib/content-types';
import { slugify } from '../src/lib/slug';

// Same resolution rule as src/lib/db.ts and prisma7.config.ts.
function resolveDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL ?? 'file:./prisma/dev.db';
  if (!raw.startsWith('file:')) return raw;
  const candidate = raw.slice('file:'.length);
  return path.isAbsolute(candidate) ? raw : `file:${path.join(process.cwd(), 'prisma', 'dev.db')}`;
}

const adapter = new PrismaBetterSqlite3({ url: resolveDatabaseUrl() });
const prisma = new PrismaClient({ adapter });

const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'Demo1234!';

async function seedLanguages() {
  for (const lang of DEFAULT_LANGUAGES) {
    await prisma.language.upsert({
      where: { code: lang.code },
      update: lang,
      create: lang,
    });
  }
}

async function seedRbac() {
  for (const perm of [...ALL_PERMISSIONS, SUPER_ADMIN_PERMISSION]) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      update: { label: perm.label, group: perm.group, description: perm.description ?? null },
      create: perm,
    });
  }

  const wildcard = await prisma.permission.findUniqueOrThrow({ where: { key: SUPER_ADMIN_KEY } });

  for (const role of ROLES) {
    const saved = await prisma.role.upsert({
      where: { key: role.key },
      update: { name: role.name, description: role.description, isSystem: true },
      create: { key: role.key, name: role.name, description: role.description, isSystem: true },
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: saved.id } });
    if (role.permissions.includes(SUPER_ADMIN_KEY)) {
      // Super Admin holds the wildcard row, which is what `can()` reads from a session;
      // without it every requirePermission() check would send the owner of the system to /no-access.
      await prisma.rolePermission.create({ data: { roleId: saved.id, permissionId: wildcard.id } });
      continue;
    }
    const permissions = await prisma.permission.findMany({
      where: { key: { in: role.permissions } },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: saved.id, permissionId: p.id })),
    });
  }
}

async function seedUsers() {
  const superRole = await prisma.role.findUniqueOrThrow({ where: { key: 'super_admin' } });
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@beruni.uz';

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { displayName: 'System Administrator', roleId: superRole.id },
    create: {
      email: adminEmail,
      username: 'admin',
      displayName: 'System Administrator',
      passwordHash,
      roleId: superRole.id,
      language: 'ru',
      mustChangePassword: true,
    },
  });

  const demos: { username: string; name: string; roleKey: string; lang: string }[] = [
    { username: 'manager', name: 'Content Manager', roleKey: 'content_manager', lang: 'ru' },
    { username: 'editor', name: 'Scientific Editor', roleKey: 'scientific_editor', lang: 'ru' },
    { username: 'translator', name: 'Translator', roleKey: 'translator', lang: 'uz' },
    { username: 'media', name: 'Media Manager', roleKey: 'media_manager', lang: 'ru' },
    { username: 'viewer', name: 'Viewer', roleKey: 'viewer', lang: 'en' },
  ];

  const demoHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  for (const demo of demos) {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: demo.roleKey } });
    await prisma.user.upsert({
      where: { email: `${demo.username}@beruni.uz` },
      update: { roleId: role.id },
      create: {
        email: `${demo.username}@beruni.uz`,
        username: demo.username,
        displayName: demo.name,
        passwordHash: demoHash,
        roleId: role.id,
        language: demo.lang,
      },
    });
  }

  return admin;
}

async function seedCategories() {
  const scopes: { scope: string; items: { slug: string; names: Record<string, string> }[] }[] = [
    {
      scope: 'news',
      items: [
        { slug: 'official', names: { uz: 'Rasmiy', ru: 'Официально', en: 'Official' } },
        { slug: 'scientific-events', names: { uz: 'Ilmiy tadbirlar', ru: 'Научные события', en: 'Scientific events' } },
        { slug: 'international', names: { uz: 'Xalqaro hamkorlik', ru: 'Международное сотрудничество', en: 'International cooperation' } },
        { slug: 'dissertations', names: { uz: 'Disertatsiyalar', ru: 'Диссертации', en: 'Dissertations' } },
        { slug: 'publications', names: { uz: 'Nashrlar', ru: 'Публикации', en: 'Publications' } },
        { slug: 'announcements', names: { uz: 'Elonlar', ru: 'Объявления', en: 'Announcements' } },
      ],
    },
    {
      scope: 'publication',
      items: [
        { slug: 'monographs', names: { uz: 'Monografiyalar', ru: 'Монографии', en: 'Monographs' } },
        { slug: 'proceedings', names: { uz: 'Konferensiyalar toplari', ru: 'Труды конференций', en: 'Conference proceedings' } },
        { slug: 'reports', names: { uz: 'Hisobotlar', ru: 'Отчёты', en: 'Reports' } },
      ],
    },
    {
      scope: 'announcement',
      items: [
        { slug: 'vacancy', names: { uz: 'Vakansiyalar', ru: 'Вакансии', en: 'Vacancies' } },
        { slug: 'procurement', names: { uz: 'Xaridlar', ru: 'Закупки', en: 'Procurement' } },
      ],
    },
    {
      scope: 'document',
      items: [
        { slug: 'official', names: { uz: 'Rasmiy hujjatlar', ru: 'Официальные документы', en: 'Official documents' } },
        { slug: 'regulations', names: { uz: 'Nizomlar', ru: 'Положения', en: 'Regulations' } },
      ],
    },
    {
      scope: 'manuscript',
      items: [
        { slug: 'arabic', names: { uz: 'Arab tilidagi', ru: 'Арабские рукописи', en: 'Arabic manuscripts' } },
        { slug: 'persian', names: { uz: 'Fors tilidagi', ru: 'Персидские рукописи', en: 'Persian manuscripts' } },
        { slug: 'turkic', names: { uz: 'Turkiy tilidagi', ru: 'Тюркоязычные рукописи', en: 'Turkic manuscripts' } },
      ],
    },
    {
      scope: 'event',
      items: [
        { slug: 'conferences', names: { uz: 'Konferensiyalar', ru: 'Конференции', en: 'Conferences' } },
        { slug: 'seminars', names: { uz: 'Seminarlar', ru: 'Семинары', en: 'Seminars' } },
      ],
    },
    {
      scope: 'project',
      items: [
        { slug: 'fundamental', names: { uz: 'Fundamental tadqiqot', ru: 'Фундаментальные исследования', en: 'Fundamental research' } },
        { slug: 'applied', names: { uz: 'Amaliy loyihalar', ru: 'Прикладные проекты', en: 'Applied projects' } },
      ],
    },
    {
      scope: 'partner',
      items: [
        { slug: 'university', names: { uz: 'Universitetlar', ru: 'Университеты', en: 'Universities' } },
        { slug: 'research_institute', names: { uz: 'Ilmiy markazlar', ru: 'Научные организации', en: 'Research institutes' } },
      ],
    },
    {
      scope: 'article',
      items: [
        { slug: 'palaeography', names: { uz: 'Paleografiya', ru: 'Палеография', en: 'Palaeography' } },
        { slug: 'source-studies', names: { uz: 'Manbashunoslik', ru: 'Источниковедение', en: 'Source studies' } },
      ],
    },
    {
      scope: 'book',
      items: [
        { slug: 'monographs', names: { uz: 'Monografiyalar', ru: 'Монографии', en: 'Monographs' } },
        { slug: 'catalogues', names: { uz: 'Kataloglar', ru: 'Каталоги', en: 'Catalogues' } },
      ],
    },
  ];

  for (const group of scopes) {
    let order = 0;
    for (const item of group.items) {
      const category = await prisma.category.upsert({
        where: { scope_slug: { scope: group.scope, slug: item.slug } },
        update: { sortOrder: order },
        create: { scope: group.scope, slug: item.slug, sortOrder: order },
      });
      for (const [lang, name] of Object.entries(item.names)) {
        await prisma.categoryTranslation.upsert({
          where: { categoryId_lang: { categoryId: category.id, lang } },
          update: { name },
          create: { categoryId: category.id, lang, name },
        });
      }
      order += 1;
    }
  }
}

async function seedSettings() {
  const settings: {
    group: string;
    key: string;
    value: string;
    valueType?: string;
    label: string;
    hint?: string;
    isPublic?: boolean;
    /** Only for the settings the panel stores per language; the shared value is the default language's. */
    translations?: Record<string, string>;
  }[] = [
    {
      group: 'general',
      key: 'site_name',
      // The panel keeps the default language (ru) in the row and every other language in translations,
      // so a public page in Russian and one in Uzbek never read the same field by accident.
      value: 'Институт востоковедения имени Абу Райхона Беруни Академии наук Республики Узбекистан',
      label: 'Institute name',
      translations: {
        uz: 'O‘zR FA Abu Rayhon Beruniy nomidagi Sharqshunoslik instituti',
        en: 'Abu Rayhon Beruniy Institute of Oriental Studies of the Academy of Sciences of Uzbekistan',
      },
    },
    {
      group: 'general',
      key: 'site_short_name',
      value: 'Институт востоковедения им. А. Беруни',
      label: 'Short name',
      translations: {
        uz: 'Beruniy nomidagi Sharqshunoslik instituti',
        en: 'Beruniy Institute of Oriental Studies',
      },
    },
    { group: 'general', key: 'default_language', value: 'ru', label: 'Default language' },
    {
      group: 'general',
      key: 'address',
      value: 'Ташкент, ул. Ислама Каримова, 115',
      label: 'Address',
      translations: {
        uz: 'Toshkent sh., Islom Karimov ko‘chasi, 115',
        en: '115 Islam Karimov Street, Tashkent, Uzbekistan',
      },
    },
    {
      group: 'general',
      key: 'footer_note',
      value: 'Официальный сайт Института востоковедения имени Абу Райхона Беруни.',
      label: 'Footer note',
      translations: {
        uz: 'Beruniy nomidagi Sharqshunoslik institutining rasmiy sayti.',
        en: 'The official website of the Abu Rayhon Beruniy Institute of Oriental Studies.',
      },
    },
    { group: 'contact', key: 'phone', value: '+998 (71) 240-23-54', label: 'Phone' },
    { group: 'contact', key: 'email', value: 'info@beruni.uz', label: 'Email' },
    { group: 'contact', key: 'fax', value: '+998 (71) 240-24-45', label: 'Fax' },
    { group: 'contact', key: 'working_hours', value: 'Пн–Пт, 09:00–18:00', label: 'Working hours' },
    { group: 'social', key: 'telegram', value: '', label: 'Telegram', valueType: 'url' },
    { group: 'social', key: 'youtube', value: '', label: 'YouTube', valueType: 'url' },
    { group: 'social', key: 'facebook', value: '', label: 'Facebook', valueType: 'url' },
    { group: 'social', key: 'instagram', value: '', label: 'Instagram', valueType: 'url' },
    { group: 'social', key: 'linkedin', value: '', label: 'LinkedIn', valueType: 'url' },
    { group: 'seo', key: 'site_title_suffix', value: '| Beruniy Institute', label: 'Title suffix' },
    { group: 'seo', key: 'google_analytics_id', value: '', label: 'Google Analytics ID' },
    { group: 'seo', key: 'matomo_url', value: '', label: 'Matomo URL', valueType: 'url' },
    { group: 'security', key: 'session_timeout_minutes', value: '480', label: 'Session lifetime (minutes)', isPublic: false },
    { group: 'security', key: 'max_failed_logins', value: '5', label: 'Failed logins before lock', isPublic: false },
    { group: 'security', key: 'lock_minutes', value: '15', label: 'Lock duration (minutes)', isPublic: false },
    { group: 'media', key: 'max_upload_mb', value: '50', label: 'Maximum upload size (MB)' },
    { group: 'media', key: 'generate_avif', value: 'true', label: 'Generate AVIF variants', valueType: 'boolean' },
    { group: 'media', key: 'thumbnail_width', value: '320', label: 'Thumbnail width (px)', valueType: 'number' },
    { group: 'email', key: 'smtp_from', value: 'no-reply@beruni.uz', label: 'From address' },
    { group: 'email', key: 'notify_review_recipients', value: '', label: 'Notify reviewers at' },
    { group: 'analytics', key: 'provider', value: 'none', label: 'Analytics provider' },
  ];

  for (const s of settings) {
    const row = await prisma.setting.upsert({
      where: { group_key: { group: s.group, key: s.key } },
      update: { value: s.value, label: s.label, valueType: s.valueType ?? 'string' },
      create: {
        group: s.group,
        key: s.key,
        value: s.value,
        label: s.label,
        hint: s.hint ?? null,
        valueType: s.valueType ?? 'string',
        isPublic: s.isPublic ?? true,
      },
      select: { id: true },
    });

    for (const [lang, value] of Object.entries(s.translations ?? {})) {
      await prisma.settingTranslation.upsert({
        where: { settingId_lang: { settingId: row.id, lang } },
        update: { value },
        create: { settingId: row.id, lang, value },
      });
    }
  }
}

const MENU_STRUCTURE: {
  slug: string;
  targetUrl: string;
  names: Record<string, string>;
  mega?: boolean;
  children?: { slug: string; targetUrl: string; names: Record<string, string> }[];
}[] = [
  {
    slug: 'institute',
    targetUrl: '/about',
    names: { uz: 'Institut', ru: 'Институт', en: 'Institute' },
    mega: true,
    children: [
      { slug: 'history', targetUrl: '/about/history', names: { uz: 'Tarix', ru: 'История', en: 'History' } },
      { slug: 'leadership', targetUrl: '/leadership', names: { uz: 'Rahbariyat', ru: 'Руководство', en: 'Leadership' } },
      { slug: 'structure', targetUrl: '/structure', names: { uz: 'Tuzilma', ru: 'Структура', en: 'Structure' } },
      { slug: 'staff', targetUrl: '/researchers', names: { uz: 'Xodimlar', ru: 'Сотрудники', en: 'Staff' } },
    ],
  },
  {
    slug: 'science',
    targetUrl: '/research',
    names: { uz: 'Fan', ru: 'Наука', en: 'Science' },
    mega: true,
    children: [
      { slug: 'directions', targetUrl: '/research/directions', names: { uz: 'Yo‘nalishlar', ru: 'Направления', en: 'Directions' } },
      { slug: 'projects', targetUrl: '/research/projects', names: { uz: 'Loyihalar', ru: 'Проекты', en: 'Projects' } },
      { slug: 'centers', targetUrl: '/research/centers', names: { uz: 'Markazlar', ru: 'Центры', en: 'Centers' } },
      { slug: 'seminars', targetUrl: '/events?kind=seminar', names: { uz: 'Seminarlar', ru: 'Семинары', en: 'Seminars' } },
    ],
  },
  {
    slug: 'publications',
    targetUrl: '/publications',
    names: { uz: 'Nashrlar', ru: 'Публикации', en: 'Publications' },
    mega: true,
    children: [
      { slug: 'books', targetUrl: '/books', names: { uz: 'Kitoblar', ru: 'Книги', en: 'Books' } },
      { slug: 'articles', targetUrl: '/articles', names: { uz: 'Maqolalar', ru: 'Статьи', en: 'Articles' } },
      { slug: 'journals', targetUrl: '/journals', names: { uz: 'Jur_nallar', ru: 'Журналы', en: 'Journals' } },
      { slug: 'dissertations', targetUrl: '/dissertations', names: { uz: 'Disertatsiyalar', ru: 'Диссертации', en: 'Dissertations' } },
    ],
  },
  {
    slug: 'manuscripts',
    targetUrl: '/manuscripts',
    names: { uz: 'Qo‘lyozma merosi', ru: 'Рукописное наследие', en: 'Manuscript heritage' },
    mega: true,
    children: [
      { slug: 'catalogue', targetUrl: '/manuscripts', names: { uz: 'Elektron katalog', ru: 'Электронный каталог', en: 'Electronic catalogue' } },
      { slug: 'collections', targetUrl: '/manuscripts/collections', names: { uz: 'Kolleksiyalar', ru: 'Коллекции', en: 'Collections' } },
      { slug: 'digitized', targetUrl: '/manuscripts/digitized', names: { uz: 'Raqamlashtirilgan', ru: 'Оцифрованные материалы', en: 'Digitized materials' } },
    ],
  },
  { slug: 'international', targetUrl: '/international', names: { uz: 'Xalqaro hamkorlik', ru: 'Международное сотрудничество', en: 'International cooperation' } },
  { slug: 'events', targetUrl: '/events', names: { uz: 'Tadbirlar', ru: 'Мероприятия', en: 'Events' } },
  { slug: 'news', targetUrl: '/news', names: { uz: 'Yangiliklar', ru: 'Новости', en: 'News' } },
  { slug: 'contact', targetUrl: '/contact', names: { uz: 'Kontaktlar', ru: 'Контакты', en: 'Contacts' } },
];

async function seedMenus() {
  const main = await prisma.menu.upsert({
    where: { key: 'main' },
    update: { name: 'Main navigation', isActive: true },
    create: { key: 'main', name: 'Main navigation', location: 'header', isActive: true },
  });
  await prisma.menuItem.deleteMany({ where: { menuId: main.id } });

  let order = 0;
  for (const entry of MENU_STRUCTURE) {
    const parent = await prisma.menuItem.create({
      data: {
        menuId: main.id,
        targetType: 'page',
        targetUrl: entry.targetUrl,
        sortOrder: order,
        isMegaMenu: entry.mega ?? false,
        translations: { create: Object.entries(entry.names).map(([lang, title]) => ({ lang, title })) },
      },
    });
    let childOrder = 0;
    for (const child of entry.children ?? []) {
      await prisma.menuItem.create({
        data: {
          menuId: main.id,
          parentId: parent.id,
          targetType: 'page',
          targetUrl: child.targetUrl,
          sortOrder: childOrder,
          translations: { create: Object.entries(child.names).map(([lang, title]) => ({ lang, title })) },
        },
      });
      childOrder += 1;
    }
    order += 1;
  }

  const footer = await prisma.menu.upsert({
    where: { key: 'footer' },
    update: { name: 'Footer columns' },
    create: { key: 'footer', name: 'Footer columns', location: 'footer', isActive: true },
  });
  await prisma.menuItem.deleteMany({ where: { menuId: footer.id } });

  const footerColumns = [
    { slug: 'about', url: '/about', names: { uz: 'Institut haqida', ru: 'Об институте', en: 'About' } },
    { slug: 'research', url: '/research', names: { uz: 'Ilmiy faoliyat', ru: 'Научная деятельность', en: 'Research' } },
    { slug: 'publications', url: '/publications', names: { uz: 'Nashrlar', ru: 'Публикации', en: 'Publications' } },
    { slug: 'resources', url: '/manuscripts', names: { uz: 'Resurslar', ru: 'Ресурсы', en: 'Resources' } },
    { slug: 'contact', url: '/contact', names: { uz: 'Kontaktlar', ru: 'Контакты', en: 'Contact' } },
  ];
  let footerOrder = 0;
  for (const col of footerColumns) {
    await prisma.menuItem.create({
      data: {
        menuId: footer.id,
        targetType: 'page',
        targetUrl: col.url,
        sortOrder: footerOrder,
        translations: { create: Object.entries(col.names).map(([lang, title]) => ({ lang, title })) },
      },
    });
    footerOrder += 1;
  }
}

const HOMEPAGE_SECTIONS: {
  type: string;
  heading: Record<string, string>;
  subheading?: Record<string, string>;
}[] = [
  {
    type: 'hero',
    heading: {
      uz: "O‘zbekiston Respublikasi Fanlar akademiyasi Abu Rayhon Beruniy nomidagi Sharqshunoslik instituti",
      ru: 'Институт востоковедения имени Абу Райхона Беруни Академии наук Республики Узбекистан',
      en: 'Abu Rayhon Beruniy Institute of Oriental Studies, Academy of Sciences of the Republic of Uzbekistan',
    },
    subheading: {
      uz: 'Sharqiy qo‘lyozmalar, tilshunoslik va tarix bo‘yicha ilmiy tadqiqotlar markazi',
      ru: 'Центр научных исследований в области восточных рукописей, языкознания и истории',
      en: 'A centre for research on oriental manuscripts, linguistics and history',
    },
  },
  { type: 'latest_news', heading: { uz: 'So‘nggi yangiliklar', ru: 'Последние новости', en: 'Latest News' } },
  { type: 'about', heading: { uz: 'Institut haqida', ru: 'Об институте', en: 'About the Institute' } },
  { type: 'research', heading: { uz: 'Ilmiy faoliyat', ru: 'Научная деятельность', en: 'Research Activity' } },
  { type: 'manuscripts', heading: { uz: 'Qo‘lyozmalarning elektron katalogi', ru: 'Электронный каталог рукописей', en: 'Electronic Catalogue of Manuscripts' } },
  { type: 'publications', heading: { uz: 'Kitoblar va nashrlar', ru: 'Книги и публикации', en: 'Books and Publications' } },
  { type: 'international', heading: { uz: 'Xalqaro hamkorlik', ru: 'Международное сотрудничество', en: 'International Cooperation' } },
  { type: 'events', heading: { uz: 'Ilmiy tadbirlar', ru: 'Научные мероприятия', en: 'Scientific Events' } },
  { type: 'young_scientists', heading: { uz: 'Yosh olimlar', ru: 'Молодые учёные', en: 'Young Scientists' } },
  { type: 'announcements', heading: { uz: 'Elonlar', ru: 'Объявления', en: 'Announcements' } },
  { type: 'media', heading: { uz: 'Media', ru: 'Медиа', en: 'Media' } },
  { type: 'contact', heading: { uz: 'Kontaktlar', ru: 'Контакты', en: 'Contact' } },
];

/**
 * Where a block's "read more" leads: the public listing of the materials the block shows.
 * Blocks without an entry get no button, because a link to a page that does not exist is worse
 * than no link at all.
 */
const HOMEPAGE_BUTTON_PATH: Partial<Record<string, string>> = {
  hero: '/about',
  about: '/about',
  latest_news: '/news',
  research: '/research/projects',
  manuscripts: '/manuscripts',
  publications: '/publications',
  international: '/international',
  events: '/events',
  young_scientists: '/researchers',
  announcements: '/announcements',
  dissertations: '/dissertations',
};

const HOMEPAGE_BUTTON_TEXT: Record<string, string> = {
  uz: 'Batafsil',
  ru: 'Подробнее',
  en: 'Read more',
};

/** The hero's second step, which has to say where it goes: two identical buttons read as a mistake. */
const HOMEPAGE_NEWS_BUTTON_TEXT: Record<string, string> = {
  uz: 'Yangiliklar',
  ru: 'Новости',
  en: 'News',
};

async function seedHomepage() {
  await prisma.homepageSection.deleteMany({});
  let order = 0;
  for (const section of HOMEPAGE_SECTIONS) {
    const created = await prisma.homepageSection.create({
      data: { type: section.type, sortOrder: order, isEnabled: true },
    });
    const buttonPath = HOMEPAGE_BUTTON_PATH[section.type];
    for (const [lang, heading] of Object.entries(section.heading)) {
      await prisma.homepageSectionContent.create({
        data: {
          sectionId: created.id,
          lang,
          heading,
          subheading: section.subheading?.[lang] ?? null,
          buttonText: buttonPath ? HOMEPAGE_BUTTON_TEXT[lang] : null,
          buttonUrl: buttonPath ?? null,
          // The hero invites a second step: the news nobody has read yet.
          button2Text: section.type === 'hero' ? HOMEPAGE_NEWS_BUTTON_TEXT[lang] : null,
          button2Url: section.type === 'hero' ? '/news' : null,
        },
      });
    }
    order += 1;
  }
}

interface DemoMaterial {
  type: string;
  categorySlug?: string;
  versions: Record<string, { title: string; excerpt?: string; body?: string; status: string; publishedAt?: string }>;
  sourceLang: string;
  featured?: boolean;
  /** Fixed URL for a page, instead of one derived from its title. */
  pathOverride?: string;
  /** Columns written onto the type's own detail row, as the panel would have saved them. */
  detail?: Record<string, unknown>;
  /** People credited under the material, in the order the panel lists them. */
  authorNames?: string[];
  /** A link to another demo material, by its title in the source language. */
  refTitle?: { field: string; type: string; title: string };
  /** The moment every language version of the material was published, so a section reads as a timeline. */
  publishedAt?: string;
  /** Keywords of the material, as the slugs the panel would have stored. */
  tagSlugs?: string[];
}

/** The detail tables that keep a rubric; the rest have no category to set. */
const CATEGORY_DETAIL_MODELS = new Set(['news', 'article', 'book', 'publication', 'manuscript', 'event', 'announcement', 'document', 'partner', 'researchProject']);

/** Keywords the demo carries; the panel makes the same rows when staff type a tag into a material. */
const TAG_DEFS: Record<string, { ru: string; uz: string; en: string }> = {
  beruni: { ru: 'Беруни', uz: 'Beruniy', en: 'Beruniy' },
  manuscripts: { ru: 'рукописи', uz: 'qo‘lyozmalar', en: 'manuscripts' },
  expedition: { ru: 'экспедиция', uz: 'ekspeditsiya', en: 'expedition' },
  digitisation: { ru: 'оцифровка', uz: 'raqamlashtirish', en: 'digitisation' },
  conference: { ru: 'конференция', uz: 'konferensiya', en: 'conference' },
};

/** The detail row of an already created material, for linking one demo item to another. */
async function detailIdOf(type: string, title: string): Promise<string | null> {
  const key = DETAIL_KEY_BY_TYPE[type as keyof typeof DETAIL_KEY_BY_TYPE];
  if (!key) return null;
  const item = await prisma.contentItem.findFirst({ where: { title }, select: { groupId: true } });
  if (!item) return null;
  const delegate = (prisma as unknown as Record<string, { findFirst: (args: never) => Promise<{ id: string } | null> }>)[key];
  const row = await delegate.findFirst({ where: { groupId: item.groupId }, select: { id: true } } as never);
  return row?.id ?? null;
}

async function createMaterial(demo: DemoMaterial, authorId: string | null) {
  const source = demo.versions[demo.sourceLang];
  // Re-running the seed must not double the demo content, so a material is recognised by its own title.
  const already = await prisma.contentItem.findFirst({ where: { lang: demo.sourceLang, title: source.title }, select: { id: true } });
  if (already) return null;

  // One transaction: a sample that fails on a bad value must not leave a group without a language version.
  await prisma.$transaction(async (tx) => {
    const group = await tx.contentGroup.create({
      data: { type: demo.type, sourceLang: demo.sourceLang, isFeatured: demo.featured ?? false, createdBy: authorId },
    });

    const detailKey = DETAIL_KEY_BY_TYPE[demo.type as keyof typeof DETAIL_KEY_BY_TYPE];
    if (detailKey) {
      const data: Record<string, unknown> = {
        groupId: group.id,
        ...(demo.type === 'page' ? { pathOverride: demo.pathOverride ?? null } : {}),
        ...(demo.detail ?? {}),
      };
      if (demo.categorySlug) {
        const scope = CONTENT_TYPE_MAP.get(demo.type)?.categoryScope;
        const category = scope ? await tx.category.findFirst({ where: { scope, slug: demo.categorySlug } }) : null;
        if (category && CATEGORY_DETAIL_MODELS.has(detailKey)) data.categoryId = category.id;
      }
      if (demo.refTitle) {
        const target = await detailIdOf(demo.refTitle.type, demo.refTitle.title);
        if (target) data[demo.refTitle.field] = target;
      }
      const delegate = (tx as unknown as Record<string, { create: (args: never) => Promise<unknown> }>)[detailKey];
      await delegate.create({ data } as never);
    }

    let order = 0;
    for (const name of demo.authorNames ?? []) {
      await tx.authorship.create({ data: { groupId: group.id, fullName: name, role: 'author', sortOrder: order } });
      order += 1;
    }

    const taken = new Set<string>();
    for (const [lang, version] of Object.entries(demo.versions)) {
      const base = slugify(version.title);
      let slug = base;
      let n = 2;
      while (taken.has(slug)) slug = `${base}-${n++}`;
      taken.add(slug);
      const publishedAt =
        version.status === CONTENT_STATUS.PUBLISHED ? (demo.publishedAt ? new Date(demo.publishedAt) : new Date()) : null;
      // The publisher only picks up a scheduled item that carries its moment, so demo content gets one.
      const scheduledAt = version.status === CONTENT_STATUS.SCHEDULED ? new Date(Date.now() + 7 * 86_400_000) : null;
      const item = await tx.contentItem.create({
        data: {
          groupId: group.id,
          lang,
          title: version.title,
          slug,
          excerpt: version.excerpt ?? null,
          body: version.body ?? null,
          status: version.status,
          authorId,
          origin: lang === demo.sourceLang ? 'source' : 'translation',
          publishedAt,
          scheduledAt,
          seoTitle: version.title,
        },
      });

      for (const slug of demo.tagSlugs ?? []) {
        const def = TAG_DEFS[slug];
        if (!def) continue;
        const tag = await tx.tag.upsert({
          where: { slug },
          create: {
            slug,
            translations: {
              create: [
                { lang: 'ru', name: def.ru },
                { lang: 'uz', name: def.uz },
                { lang: 'en', name: def.en },
              ],
            },
          },
          update: {},
        });
        await tx.contentItemTag.create({ data: { itemId: item.id, tagId: tag.id } });
      }
    }
  });
  return null;
}

/**
 * A published example of every remaining type, so each section of the site has something to show and
 * every field the panel writes has something to write. Titles are what the seed recognises a material
 * by, so they must stay unique per language.
 */
const TYPE_SAMPLES: DemoMaterial[] = [
  {
    type: 'journal',
    sourceLang: 'ru',
    detail: { issn: '2181-1563', eissn: '2181-1571', website: 'https://sharqshunoslik.uz', foundedYear: 1958 },
    versions: {
      ru: {
        title: 'Sharqshunoslik jurnali',
        excerpt: 'Научный журнал института по востоковедению, палеографии и источниковедению.',
        body: '<p>Журнал издаётся с 1958 года, выходит четыре раза в год.</p>',
        status: CONTENT_STATUS.PUBLISHED,
      },
    },
  },
  {
    type: 'publication',
    sourceLang: 'ru',
    categorySlug: 'monographs',
    refTitle: { field: 'journalId', type: 'journal', title: 'Sharqshunoslik jurnali' },
    detail: { kind: 'article', doi: '10.5281/zenodo.0000000', year: 2025, pages: '42–58', volume: '67', issue: '2' },
    authorNames: ['А. Р. Каримов', 'Д. Б. Юлдашева'],
    versions: {
      ru: {
        title: 'Календарные системы в среднеазиатской астрономии',
        excerpt: 'Статья о сопоставлении солнечных и лунных календарей по рукописным источникам.',
        body: '<p>Рассмотрены календарные таблицы XIV–XV веков из собрания института.</p>',
        status: CONTENT_STATUS.PUBLISHED,
      },
      uz: { title: "Markaziy Osiyo astronomiyasida taqvim tizimlari", status: CONTENT_STATUS.PUBLISHED },
    },
  },
  {
    type: 'book',
    sourceLang: 'ru',
    categorySlug: 'monographs',
    detail: { isbn: '978-9943-01-234-5', publisher: 'Фан', place: 'Ташкент', year: 2024, pages: 320, edition: '1' },
    authorNames: ['А. Р. Каримов'],
    versions: {
      ru: {
        title: 'Наследие Беруни в рукописных собраниях Узбекистана',
        excerpt: 'Монография о судьбе рукописей, связанных с именем Абу Райхона Беруни.',
        body: '<p>Книга описывает 84 рукописных списка, хранящихся в трёх собраниях.</p>',
        status: CONTENT_STATUS.PUBLISHED,
      },
    },
  },
  {
    type: 'article',
    sourceLang: 'ru',
    detail: { doi: '10.5281/zenodo.0000001', references: 'Абу Райхон Беруни. Тахдид аль-анахат. — Ташкент: Фан, 1963.\nИбн Сина. Аль-Канон фи-т-тибб. — Каир, 1894.' },
    authorNames: ['Д. Б. Юлдашева'],
    versions: {
      ru: {
        title: 'Описание персидских рукописей: опыт каталога',
        excerpt: 'Предложения по унификации библиографического описания персоязычных рукописей.',
        body: '<p>Разбираются колофон, инципит и эксплицит как основа библиографического описания.</p>',
        status: CONTENT_STATUS.PUBLISHED,
      },
    },
  },
  {
    type: 'manuscript',
    sourceLang: 'ru',
    categorySlug: 'arabic',
    tagSlugs: ['beruni', 'manuscripts'],
    detail: {
      repositoryId: 'ТИБ ОРИЕНТ 1234',
      invNo: '1234-5',
      authorOriginal: 'Абу Райхон Беруни',
      titleOriginal: 'Тахдид аль-анахат ли-натайих аль-асима',
      languageOfText: 'арабский',
      script: 'настаалик',
      subject: 'астрономия, геодезия',
      periodLabel: 'XI век',
      century: 11,
      dateGregorian: '1025 г.',
      folios: '112 л.',
      dimensions: '21 × 14 см',
      material: 'бумага, чернила',
      colophon: 'Переписано в городе Катт в 420 году по хиджре.',
      incipit: 'Во имя Господа, да будет Он превознесён…',
      explicit: '…и этим завершается книга.',
      bibliographicInfo: 'См.: Вадимова А. Н. Беруни и его школа. — Ташкент: Фан, 1969.',
      digitalCopyNote: 'Полнотекстовая копия 2025 года, 600 dpi.',
      hasDigitalCopy: true,
    },
    versions: {
      ru: {
        title: 'Тахдид аль-анахат ли-натайих аль-асима',
        excerpt: 'Рукопись XI века с трактатом Беруни об определении координат городов.',
        body: '<p>Одна из древнейших копий трактата, хранящихся в институте.</p>',
        status: CONTENT_STATUS.PUBLISHED,
      },
      uz: { title: 'Tahdid al-amkan', excerpt: "Beruniyning XI asrga oid qo'lyozmasi.", status: CONTENT_STATUS.PUBLISHED },
      en: { title: 'The Determination of the Coordinates of Cities', status: CONTENT_STATUS.PUBLISHED },
    },
  },
  {
    type: 'manuscript',
    sourceLang: 'ru',
    categorySlug: 'turkic',
    detail: {
      repositoryId: 'ТИБ ОРИЕНТ 2087',
      invNo: '2087-12',
      authorOriginal: 'Алишер Навои',
      titleOriginal: 'Muhakamat al-lughatayn',
      languageOfText: 'чагатайский',
      script: 'настаалик',
      subject: 'языкознание, поэтика',
      periodLabel: 'XV век',
      century: 15,
      folios: '96 л.',
      material: 'бумага',
      hasDigitalCopy: false,
    },
    versions: {
      ru: {
        title: 'Muhakamat al-lughatayn',
        excerpt: 'Список сравнительного словаря Алишера Навои.',
        status: CONTENT_STATUS.PUBLISHED,
      },
    },
  },
  {
    type: 'dissertation',
    sourceLang: 'ru',
    detail: {
      degree: 'phd',
      specialtyCode: '07.00.06',
      specialty: 'История науки и техники',
      candidateName: 'Б. С. Ахмедов',
      supervisor: 'д.и.н. А. Р. Каримов',
      organization: 'Институт востоковедения им. А. Беруни',
      defenseDate: '2026-12-10T00:00:00.000Z',
      defenseTime: '14:00',
      defensePlace: 'Главный зал института',
      councilCode: '05.12.04.01',
      stage: 'announced',
      abstract: '<p>Работа посвящена издательской деятельности в Средней Азии конца XIX — начала XX века.</p>',
    },
    versions: {
      ru: {
        title: 'Печатное дело в Туркестане в конце XIX — начале XX века',
        excerpt: 'Автореферат диссертации на соискание степени доктора философии по историческим наукам.',
        status: CONTENT_STATUS.PUBLISHED,
      },
    },
  },
  {
    type: 'event',
    sourceLang: 'ru',
    categorySlug: 'conferences',
    detail: {
      kind: 'conference',
      startDate: '2026-11-20T00:00:00.000Z',
      endDate: '2026-11-21T00:00:00.000Z',
      startTime: '09:30',
      endTime: '17:00',
      location: 'Ташкент, главный зал института',
      venue: 'Институт востоковедения им. А. Беруни',
      organizers: 'Институт востоковедения, Отделение гуманитарных наук АН РУз',
      registrationUrl: 'https://beruni.uz/registration',
      contactPerson: 'Ученый секретарь',
      contactEmail: 'conference@beruni.uz',
      isInternational: true,
      program: '<p>20 ноября — пленарное заседание.</p><p>21 ноября — работа по секциям.</p>',
    },
    versions: {
      ru: {
        title: 'Беруни и наука своего времени',
        excerpt: 'Международная конференция к 1040-летию со дня рождения Абу Райхона Беруни.',
        body: '<p>К конференции издаётся сборник трудов.</p>',
        status: CONTENT_STATUS.PUBLISHED,
      },
      en: { title: 'Beruniy and the Science of His Time', status: CONTENT_STATUS.PUBLISHED },
    },
  },
  {
    type: 'department',
    sourceLang: 'ru',
    detail: { kind: 'department', phone: '+998 (71) 240-23-55', email: 'manuscripts@beruni.uz', room: '215', sortOrder: 1 },
    versions: {
      ru: {
        title: 'Отдел рукописей',
        excerpt: 'Хранение, каталогизация и изучение восточных рукописей института.',
        body: '<p>Фонд отдела насчитывает более 2000 рукописных единиц.</p>',
        status: CONTENT_STATUS.PUBLISHED,
      },
      uz: { title: "Qo'lyozmalar bo'limi", status: CONTENT_STATUS.PUBLISHED },
    },
  },
  {
    type: 'department',
    sourceLang: 'ru',
    detail: { kind: 'center', email: 'center@beruni.uz', room: '301', sortOrder: 2 },
    versions: {
      ru: {
        title: 'Центр исламской цивилизации',
        excerpt: 'Исследование наследия исламской цивилизации в Средней Азии.',
        status: CONTENT_STATUS.PUBLISHED,
      },
    },
  },
  {
    type: 'research_direction',
    sourceLang: 'ru',
    detail: { code: '01.00.00', sortOrder: 1 },
    versions: {
      ru: {
        title: 'Рукописное наследие Узбекистана',
        excerpt: 'Каталогизация, изучение и цифровизация восточных рукописей.',
        body: '<p>Направление объединяет работу с фондами рукописных собраний.</p>',
        status: CONTENT_STATUS.PUBLISHED,
      },
    },
  },
  {
    type: 'research_project',
    sourceLang: 'ru',
    categorySlug: 'fundamental',
    refTitle: { field: 'directionId', type: 'research_direction', title: 'Рукописное наследие Узбекистана' },
    detail: { code: 'GR-F-01', fundingSource: 'Академия наук Республики Узбекистан', startYear: 2025, endYear: 2027, stage: 'active' },
    versions: {
      ru: {
        title: 'Каталог арабских рукописей собрания института',
        excerpt: 'Научное описание и электронная каталогизация 400 рукописей на арабском языке.',
        body: '<p>Промежуточные результаты публикуются в журнале института.</p>',
        status: CONTENT_STATUS.PUBLISHED,
      },
    },
  },
  {
    type: 'researcher',
    sourceLang: 'ru',
    detail: {
      position: 'Директор института',
      leadershipRole: 'director',
      degree: 'Доктор исторических наук',
      academicTitle: 'профессор',
      specialty: 'История науки Среднего Востока',
      email: 'director@beruni.uz',
      phone: '+998 (71) 240-23-54',
      birthYear: 1968,
      isStaff: true,
      sortOrder: 1,
      links: 'Институт | https://beruni.uz\nORCID | https://orcid.org/0000-0000-0000-0000',
    },
    versions: {
      ru: {
        title: 'Каримов Абдулла Рахимович',
        excerpt: 'Директор института, доктор исторических наук, профессор.',
        body: '<p>Автор более 120 научных работ по истории востоковедения.</p>',
        status: CONTENT_STATUS.PUBLISHED,
      },
      uz: { title: 'Abdulla Karimov', status: CONTENT_STATUS.PUBLISHED },
      en: { title: 'Abdulla Karimov', status: CONTENT_STATUS.PUBLISHED },
    },
  },
  {
    type: 'researcher',
    sourceLang: 'ru',
    detail: {
      position: 'Старший научный сотрудник',
      leadershipRole: 'none',
      degree: 'Кандидат философии по историческим наукам',
      specialty: 'Палеография и кодикология',
      email: 'd.yuldasheva@beruni.uz',
      isStaff: true,
      isYoungScientist: true,
      sortOrder: 2,
    },
    versions: {
      ru: {
        title: 'Юлдашева Дилноза Бактиеровна',
        excerpt: 'Изучает персоязычные рукописи и историю книжности в Средней Азии.',
        status: CONTENT_STATUS.PUBLISHED,
      },
      uz: { title: 'Dildora Yuldasheva', status: CONTENT_STATUS.PUBLISHED },
    },
  },
  {
    type: 'partner',
    sourceLang: 'ru',
    categorySlug: 'university',
    detail: {
      organization: 'Каирский университет',
      country: 'Египет',
      orgType: 'university',
      website: 'https://cu.edu.eg',
      agreementNumber: 'Соглашение № 4/2023',
      signedAt: '2023-06-14T00:00:00.000Z',
      validFrom: '2023-06-14T00:00:00.000Z',
      validTo: '2028-06-14T00:00:00.000Z',
      isActive: true,
    },
    versions: {
      ru: { title: 'Каирский университет', excerpt: 'Совместная каталогизация арабских рукописей и обмен исследователями.', status: CONTENT_STATUS.PUBLISHED },
    },
  },
  {
    type: 'partner',
    sourceLang: 'ru',
    categorySlug: 'research_institute',
    detail: { organization: 'Институт восточных рукописей РАН', country: 'Россия', orgType: 'research_institute', website: 'https://ivran.ru', isActive: true },
    versions: {
      ru: { title: 'Институт восточных рукописей РАН', excerpt: 'Обмен цифровыми копиями рукописей и совместные экспедиции.', status: CONTENT_STATUS.PUBLISHED },
    },
  },
  {
    type: 'document',
    sourceLang: 'ru',
    categorySlug: 'regulations',
    detail: { kind: 'regulation', docNumber: '№ 12', issuedAt: '2025-09-01T00:00:00.000Z' },
    versions: {
      ru: {
        title: 'Положение о рукописном фонде',
        excerpt: 'Порядок учёта, хранения и предоставления восточных рукописей.',
        body: '<p>Документ утверждён решением учёного совета.</p>',
        status: CONTENT_STATUS.PUBLISHED,
      },
      uz: { title: "Qo'lyozma fondi to‘g‘risidagi Nizom", status: CONTENT_STATUS.PUBLISHED },
    },
  },
];

interface NewsItem {
  date: string;
  categorySlug: string;
  tagSlugs?: string[];
  ru: { title: string; excerpt: string };
  uz: { title: string; excerpt: string };
  en: { title: string; excerpt: string };
}

/**
 * A month of institute life. Two news items cannot show that a rubric, a search or a second page of a
 * section work, so the demo feed is long enough to run over more than one page.
 */
const NEWS_ITEMS: NewsItem[] = [
  {
    date: '2026-10-01',
    categorySlug: 'scientific-events',
    ru: {
      title: 'Круглый стол: рукописное наследие в цифровых каталогах',
      excerpt: 'Учёные обсудили правила описания восточных рукописей для электронных каталогов.',
    },
    uz: {
      title: 'Doira suhbat: qo‘lyozma meros raqamli kataloglarda',
      excerpt: 'Sharq qo‘lyozmalarini elektron kataloglarda tavsirlash qoidalari muhokama qilindi.',
    },
    en: {
      title: 'Round table: manuscript heritage in digital catalogues',
      excerpt: 'Researchers discussed how oriental manuscripts should be described in online catalogues.',
    },
  },
  {
    date: '2026-09-28',
    categorySlug: 'publications',
    ru: {
      title: 'Новый выпуск журнала «Sharqshunoslik» вышел в свет',
      excerpt: 'В номере статьи по рукописеведению, истории и языкознанию, а также обзоры источников.',
    },
    uz: {
      title: '«Sharqshunoslik» jurnalining yangi soni bosmadan chiqdi',
      excerpt: 'Sonda qo‘lyozmashunoslik, tarix va tilshunoslikka oid maqolalar hamda manba sharhlari kiritilgan.',
    },
    en: {
      title: 'A new issue of the Sharqshunoslik journal has been released',
      excerpt: 'The issue carries articles on manuscript studies, history and linguistics, and source reviews.',
    },
  },
  {
    date: '2026-09-24',
    categorySlug: 'scientific-events',
    ru: {
      title: 'Семинар по палеографии и кодикологии собрал молодых исследователей',
      excerpt: 'Участники разбирали начертание, бумагу и переплёты рукописей XV–XIX веков.',
    },
    uz: {
      title: 'Paleografiya va kodikologiya bo‘yicha seminar yosh tadqiqotchilarni jam qildi',
      excerpt: 'Ishtirokchilar XV–XIX asr qo‘lyozmalarining yozuvi, qog‘ozi va muqovalarini ko‘rib chiqdi.',
    },
    en: {
      title: 'Palaeography and codicology seminar brought young researchers together',
      excerpt: 'Participants examined the script, paper and bindings of fifteenth- to nineteenth-century manuscripts.',
    },
  },
  {
    date: '2026-09-19',
    categorySlug: 'official',
    ru: {
      title: 'Завершена каталогизация арабской части рукописного фонда',
      excerpt: 'Описано более двухсот единиц хранения, карточки внесены в электронную базу.',
    },
    uz: {
      title: 'Arab tilidagi qo‘lyozmalar katalogidan o‘tkazish yakunlandi',
      excerpt: 'Ikki yuzdan ortiq saqlash birligi tavsiflanib, elektron bazaga kiritildi.',
    },
    en: {
      title: 'Cataloguing of the Arabic part of the manuscript fund is complete',
      excerpt: 'More than two hundred items were described and entered into the electronic database.',
    },
  },
  {
    date: '2026-09-15',
    categorySlug: 'announcements',
    ru: {
      title: 'Объявлен приём статей к сборнику к 1150-летию Беруни',
      excerpt: 'Материалы принимаются до конца года, требования к оформлению опубликованы на сайте.',
    },
    uz: {
      title: 'Beruniyning 1150 yilligiga bag‘ishlangan to‘plamga maqolalar qabul qilinishi e’lon qilindi',
      excerpt: 'Materiallar yil oxirigacha qabul qilinadi, rasmiylashtirish talablari saytga joylashtirildi.',
    },
    en: {
      title: 'Call for papers opened for the Beruniy 1150th anniversary volume',
      excerpt: 'Papers are accepted until the end of the year; the formatting rules are published on the site.',
    },
  },
  {
    date: '2026-09-10',
    categorySlug: 'international',
    ru: {
      title: 'Делегация Каирского университета посетила институт',
      excerpt: 'Стороны договорились об обмене цифровыми копиями рукописей и о совместных семинарах.',
    },
    uz: {
      title: 'Qohira universiteti delegatsiyasi institutga tashrif buyurdi',
      excerpt: 'Tomonlar qo‘lyozmalarning raqamli nusxalarini almashinuv va qo‘shma seminarlar o‘tkazish bo‘yicha kelishuvga keldi.',
    },
    en: {
      title: 'A delegation from Cairo University visited the institute',
      excerpt: 'The sides agreed to exchange digital copies of manuscripts and to hold joint seminars.',
    },
  },
  {
    date: '2026-09-04',
    categorySlug: 'scientific-events',
    ru: {
      title: 'Презентация монографии о научном наследии Хорезма',
      excerpt: 'Книга посвящена астрономическим и математическим традициям региона.',
    },
    uz: {
      title: 'Xorazm ilmiy merosiga bag‘ishlangan monografiya taqdimoti bo‘lib o‘tdi',
      excerpt: 'Asarda hududning astronomiya va matematika anʼanalariga to‘xtalib o‘tilgan.',
    },
    en: {
      title: 'Monograph on the scientific heritage of Khorezm was presented',
      excerpt: 'The book deals with the astronomical and mathematical traditions of the region.',
    },
  },
  {
    date: '2026-08-29',
    categorySlug: 'official',
    ru: {
      title: 'Институт перешёл на регистрацию авторов в ORCID',
      excerpt: 'Каждому сотруднику предлагается завести идентификатор и привязать к нему свои публикации.',
    },
    uz: {
      title: 'Institut mualliflarini ORCID tizimida ro‘yxatdan o‘tkazishga o‘tdi',
      excerpt: 'Har bir xodisga identifikator ochish va nashrlarini unga bog‘lash taklif etiladi.',
    },
    en: {
      title: 'The institute moved its authors to ORCID identifiers',
      excerpt: 'Every researcher is invited to register an identifier and link their publications to it.',
    },
  },
  {
    date: '2026-08-25',
    categorySlug: 'dissertations',
    ru: {
      title: 'Заседание диссертационного совета по историческим наукам',
      excerpt: 'Совет рассмотрел две заявки к защите и утвердил состав оппонентов.',
    },
    uz: {
      title: 'Tarix fanlari bo‘yicha dissertaciya kengashining yig‘ilishi bo‘ldi',
      excerpt: 'Kengashda himoyaga ikki ariza ko‘rib chiqilib, opponentlar tarkibi tasdiqlandi.',
    },
    en: {
      title: 'Session of the dissertation council for historical sciences',
      excerpt: 'The council reviewed two applications for defence and approved the opponents.',
    },
  },
  {
    date: '2026-08-19',
    categorySlug: 'announcements',
    ru: {
      title: 'Лекция для студентов-востоковедов о персидской поэзии',
      excerpt: 'Открытая лекция прошла в читальном зале института и собрала более сорока слушателей.',
    },
    uz: {
      title: 'Sharqshunoslik talabalari uchun fors poeziyasiga bag‘ishlangan ma’ruza o‘qildi',
      excerpt: 'Ochiq ma’ruza institutning o‘qish zalida bo‘lib o‘tdi va qirqdan ortiq tinglovchini jam qildi.',
    },
    en: {
      title: 'Lecture for oriental studies students on Persian poetry',
      excerpt: 'The open lecture was held in the institute reading room and gathered more than forty listeners.',
    },
  },
  {
    date: '2026-08-14',
    categorySlug: 'publications',
    tagSlugs: ['beruni'],
    ru: {
      title: 'Подготовлен новый указатель трудов Беруни',
      excerpt: 'В указатель сведены издания, переводы и исследования текстов на трёх языках.',
    },
    uz: {
      title: 'Beruniy asarlari yangi ko‘rsatkichi tayyorlandi',
      excerpt: 'Ko‘rsatkichda uch tildagi nashrlar, tarjimalar va matn tadqiqotlari jamlangan.',
    },
    en: {
      title: 'A new index of Beruniy’s works has been prepared',
      excerpt: 'The index brings together editions, translations and studies of the texts in three languages.',
    },
  },
  {
    date: '2026-08-08',
    categorySlug: 'international',
    ru: {
      title: 'Сотрудничество с Институтом восточных рукописей РАН расширено',
      excerpt: 'Программа предусматривает совместную каталогизацию и стажировки молодых учёных.',
    },
    uz: {
      title: 'Rossiya FA Sharq qo‘lyozmalari instituti bilan hamkorlik kengaytirildi',
      excerpt: 'Dastur qo‘shma kataloglash va yosh olimlar uchun stajirovkani nazarda tutadi.',
    },
    en: {
      title: 'Cooperation with the RAS Institute of Oriental Manuscripts has been expanded',
      excerpt: 'The programme covers joint cataloguing and internships for early-career researchers.',
    },
  },
  {
    date: '2026-08-01',
    categorySlug: 'scientific-events',
    tagSlugs: ['digitisation', 'manuscripts'],
    ru: {
      title: 'Начата оцифровка рукописей собрания института',
      excerpt: 'Первыми оцифровываются астрономические трактаты в хорошем состоянии сохранности.',
    },
    uz: {
      title: 'Institut fondidagi qo‘lyozmalarni raqamlashtirish boshlandi',
      excerpt: 'Birinchi bo‘lib yaxshi saqlangan astronomiya rislalari raqamlashtirilmoqda.',
    },
    en: {
      title: 'Digitisation of the institute’s manuscript collection has begun',
      excerpt: 'The well preserved astronomical treatises are the first to be digitised.',
    },
  },
  {
    date: '2026-07-28',
    categorySlug: 'official',
    tagSlugs: ['expedition', 'manuscripts'],
    ru: {
      title: 'Итоги летней научной экспедиции в Бухару',
      excerpt: 'Обнаружены описи двух частных собраний и сняты копии с двадцати рукописей.',
    },
    uz: {
      title: 'Yozgi Buxoro ilmiy ekspeditsiyasi yakunlari ko‘rib chiqildi',
      excerpt: 'Ikki xususiy to‘plam ro‘yxatlari topilib, yigirma qo‘lyozmadan nusxa olindi.',
    },
    en: {
      title: 'Results of the summer research expedition to Bukhara were reviewed',
      excerpt: 'Two private collection inventories were found and twenty manuscripts were copied.',
    },
  },
  {
    date: '2026-07-22',
    categorySlug: 'announcements',
    ru: {
      title: 'Молодые учёные получили стипендии имени Беруни',
      excerpt: 'Стипендии назначены пятерым исследователям за работы по рукописному наследию.',
    },
    uz: {
      title: 'Yosh olimlarga Beruniy nomidagi stipendiyalar topshirildi',
      excerpt: 'Qo‘lyozma merosi bo‘yicha ishlar uchun besh tadqiqotchiga stipendiya tayinlandi.',
    },
    en: {
      title: 'Young researchers received Beruniy fellowships',
      excerpt: 'Five researchers were granted fellowships for their work on the manuscript heritage.',
    },
  },
];

async function seedDemoContent(authorId: string | null) {
  // A group with no language version, no picture and no author is the shell a failed create left
  // behind; the panel never produces one, because it writes the source version in the same step.
  await prisma.contentGroup.deleteMany({ where: { items: { none: {} }, mediaLinks: { none: {} }, authorships: { none: {} } } });

  await createMaterial(
    {
      type: 'news',
      sourceLang: 'ru',
      categorySlug: 'official',
      featured: true,
      tagSlugs: ['conference', 'manuscripts'],
      versions: {
        ru: {
          title: 'Международная научная конференция по востоковедению',
          excerpt: 'Институт востоковедения имени Беруни проводит международную конференцию, посвящённую изучению рукописного наследия.',
          body: '<p>Открытие конференции состоится в главном зале института.</p>',
          status: CONTENT_STATUS.PUBLISHED,
        },
        uz: {
          title: 'Sharqshunoslik bo‘yicha xalqaro ilmiy konferensiya',
          excerpt: 'Beruniy nomidagi Sharqshunoslik instituti qo‘lyozma merosini o‘rganishga bag‘ishlangan xalqaro konferensiyani o‘tkazadi.',
          status: CONTENT_STATUS.PUBLISHED,
        },
        en: {
          title: 'International Scientific Conference on Oriental Studies',
          excerpt: 'The Beruniy Institute of Oriental Studies hosts an international conference on the study of manuscript heritage.',
          status: CONTENT_STATUS.PUBLISHED,
        },
      },
    },
    authorId,
  );

  await createMaterial(
    {
      type: 'news',
      sourceLang: 'ru',
      versions: {
        ru: {
          title: 'Опубликован новый том серии «Sharqshunoslik jurnali»',
          excerpt: 'Вышел очередной номер научного журнала института со статьями по палеографии и источниковедению.',
          status: CONTENT_STATUS.PUBLISHED,
        },
        uz: { title: '«Sharqshunoslik jurnali» seriyasining yangi soni chop etildi', status: CONTENT_STATUS.DRAFT },
      },
    },
    authorId,
  );

  await createMaterial(
    {
      type: 'article',
      sourceLang: 'ru',
      versions: {
        ru: {
          title: 'Каталогизация арабских рукописей: методы и проблемы',
          excerpt: 'Обзор современных подходов к описанию и каталогизации арабоязычных рукописей.',
          status: CONTENT_STATUS.IN_REVIEW,
        },
      },
    },
    authorId,
  );

  await createMaterial(
    {
      type: 'event',
      sourceLang: 'ru',
      versions: {
        ru: {
          title: 'Научный семинар по истории среднеазиатской астрономии',
          excerpt: 'Заседание семинара, посвящённое источникам по астрономии в Средней Азии.',
          status: CONTENT_STATUS.SCHEDULED,
        },
        en: { title: 'Seminar on the history of Central Asian astronomy', status: CONTENT_STATUS.DRAFT },
      },
    },
    authorId,
  );

  await createMaterial(
    {
      type: 'announcement',
      sourceLang: 'ru',
      versions: {
        ru: {
          title: 'Объявление о приёме заявок на соискание учёной степени',
          excerpt: 'Приём заявок продлится до конца текущего года.',
          status: CONTENT_STATUS.PUBLISHED,
        },
      },
    },
    authorId,
  );

  await createMaterial(
    {
      type: 'page',
      sourceLang: 'ru',
      pathOverride: 'about',
      versions: {
        ru: {
          title: 'Об институте',
          excerpt: 'Институт востоковедения имени Абу Райхона Беруни — ведущий центр изучения рукописного наследия, истории и языков Востока в Центральной Азии.',
          body: '<p>Институт востоковедения имени Абу Райхона Беруни объединяет исследования в области рукописеведения, истории, философии и языков Востока.</p>',
          status: CONTENT_STATUS.PUBLISHED,
        },
        uz: {
          title: 'Institut haqida',
          excerpt: 'Abu Rayhon Beruniy nomidagi Sharqshunoslik instituti — qo‘lyozma merosi, tarix va sharq tillari bo‘yicha yetakchi ilmiy markaz.',
          body: '<p>Institut sharqshunoslik, qo‘lyozmalarni o‘rganish, tarix va til sohalarida ilmiy tadqiqotlar olib boradi.</p>',
          status: CONTENT_STATUS.PUBLISHED,
        },
        en: {
          title: 'About the Institute',
          excerpt: 'The Abu Rayhon Beruniy Institute of Oriental Studies is the leading centre in Central Asia for the study of manuscript heritage, history and the languages of the East.',
          body: '<p>The Institute brings together research in manuscript studies, history, philosophy and the languages of the East.</p>',
          status: CONTENT_STATUS.PUBLISHED,
        },
      },
    },
    authorId,
  );

  await createMaterial(
    {
      type: 'page',
      sourceLang: 'ru',
      pathOverride: 'about/history',
      versions: {
        ru: {
          title: 'История института',
          excerpt: 'Институт востоковедения основан в 1920 году и является одним из старейших центров востоковедения в Центральной Азии.',
          body: '<p>Институт был основан в 1920 году.</p>',
          status: CONTENT_STATUS.PUBLISHED,
        },
        uz: {
          title: 'Institut tarixi',
          excerpt: 'Sharqshunoslik instituti 1920-yilda tashkil etilgan bo‘lib, Markaziy Osiyodagi eng qadimgi sharqshunoslik markazlaridan biridir.',
          status: CONTENT_STATUS.PUBLISHED,
        },
        en: {
          title: 'History of the Institute',
          excerpt: 'The Institute of Oriental Studies was founded in 1920 and is one of the oldest oriental studies centres in Central Asia.',
          status: CONTENT_STATUS.PUBLISHED,
        },
      },
    },
    authorId,
  );

  // Journal and direction come first: other samples point at them.
  for (const demo of TYPE_SAMPLES) await createMaterial(demo, authorId);

  for (const item of NEWS_ITEMS) {
    await createMaterial(
      {
        type: 'news',
        sourceLang: 'ru',
        categorySlug: item.categorySlug,
        publishedAt: item.date,
        tagSlugs: item.tagSlugs,
        versions: {
          ru: { title: item.ru.title, excerpt: item.ru.excerpt, status: CONTENT_STATUS.PUBLISHED },
          uz: { title: item.uz.title, excerpt: item.uz.excerpt, status: CONTENT_STATUS.PUBLISHED },
          en: { title: item.en.title, excerpt: item.en.excerpt, status: CONTENT_STATUS.PUBLISHED },
        },
      },
      authorId,
    );
  }
}

async function main() {
  await seedLanguages();
  await seedRbac();
  const admin = await seedUsers();
  await seedCategories();
  await seedSettings();
  await seedMenus();
  await seedHomepage();
  await seedDemoContent(admin.id);

  console.log('Seed complete.');
  console.log(`  admin login: ${admin.email} / ${ADMIN_PASSWORD}`);
  console.log('  demo logins: manager@beruni.uz, editor@beruni.uz, translator@beruni.uz, media@beruni.uz, viewer@beruni.uz');
  console.log(`  demo password: ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
