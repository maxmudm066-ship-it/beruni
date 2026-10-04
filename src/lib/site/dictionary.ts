/**
 * Interface strings of the public site.
 *
 * The panel has its own dictionary (./admin/labels) because the language a content manager works
 * in and the language a visitor reads are chosen independently. Only words that belong to the
 * interface live here — titles, headings and body texts are content and come from the database in
 * the language the visitor picked.
 *
 * Safe to import from a Client Component: data and a pure lookup, nothing that reads a cookie.
 */
export const SITE_LOCALES = ['uz', 'ru', 'en'] as const;
export type SiteLocale = (typeof SITE_LOCALES)[number];

/**
 * The language to write interface text in when nothing else was chosen. Russian is the language the
 * institute works in, so it is the fallback — and the one the proxy uses when a visitor's address
 * carries no language and their browser asked for one the site does not have.
 */
export const SITE_FALLBACK_LOCALE: SiteLocale = 'ru';

const dictionary = {
  'site.home': { ru: 'Главная', en: 'Home', uz: "Bosh sahifa" },
  'site.skipToContent': { ru: 'Перейти к содержимому', en: 'Skip to content', uz: 'Matnga o‘tish' },
  'site.menu': { ru: 'Меню', en: 'Menu', uz: 'Menyu' },
  'site.close': { ru: 'Закрыть меню', en: 'Close menu', uz: 'Menyuni yopish' },
  'site.language': { ru: 'Язык', en: 'Language', uz: 'Til' },

  'footer.contacts': { ru: 'Контакты', en: 'Contacts', uz: 'Kontaktlar' },
  'footer.address': { ru: 'Адрес', en: 'Address', uz: 'Manzil' },
  'footer.phone': { ru: 'Телефон', en: 'Phone', uz: 'Telefon' },
  'footer.email': { ru: 'Электронная почта', en: 'Email', uz: 'Elektron pochta' },
  'footer.hours': { ru: 'Часы работы', en: 'Working hours', uz: 'Ish vaqti' },
  'footer.follow': { ru: 'Мы в соцсетях', en: 'Follow us', uz: 'Ijtimoiy tarmoqlar' },
  'footer.rights': { ru: 'Все права защищены', en: 'All rights reserved', uz: 'Barcha huquqlar himoyalangan' },

  'common.readMore': { ru: 'Читать далее', en: 'Read more', uz: "Batafsil o‘qish" },
  'common.all': { ru: 'Смотреть все', en: 'View all', uz: "Barchasini ko‘rish" },
  'common.empty': { ru: 'Пока нет опубликованных материалов', en: 'Nothing published here yet', uz: 'Hozircha chop etilgan materiallar yo‘q' },
  'common.files': { ru: 'Файлы', en: 'Files', uz: 'Fayllar' },
  'common.backToTop': { ru: 'Наверх', en: 'Back to top', uz: 'Yuqoriga' },

  'list.all': { ru: 'Все', en: 'All', uz: 'Barchasi' },
  'list.categories': { ru: 'Рубрики', en: 'Categories', uz: 'Bo‘limlar' },
  'list.kinds': { ru: 'Типы', en: 'Types', uz: 'Turlari' },
  'list.search': { ru: 'Поиск', en: 'Search', uz: 'Qidiruv' },
  'list.searchPlaceholder': { ru: 'Поиск в разделе', en: 'Search this section', uz: 'Bo‘lim bo‘ylab qidiruv' },
  'list.searchSubmit': { ru: 'Найти', en: 'Search', uz: 'Qidirish' },
  'list.reset': { ru: 'Сбросить', en: 'Clear', uz: 'Tozalash' },
  'list.found': { ru: 'Найдено', en: 'Found', uz: 'Topildi' },
  'list.noneFound': {
    ru: 'Ничего не найдено. Измените запрос или сбросьте фильтры.',
    en: 'Nothing matched. Change the wording or clear the filters.',
    uz: 'Hech narsa topilmadi. So‘rovni o‘zgartiring yoki filtrlarni tozalang.',
  },
  'list.previous': { ru: 'Назад', en: 'Previous', uz: 'Oldingi' },
  'list.next': { ru: 'Вперёд', en: 'Next', uz: 'Keyingi' },
  'list.page': { ru: 'Страница', en: 'Page', uz: 'Sahifa' },

  'detail.section': { ru: 'Раздел', en: 'Section', uz: 'Bo‘lim' },
  'detail.otherLanguages': { ru: 'На других языках', en: 'Available in', uz: 'Boshqa tillarda' },
  'detail.backToList': { ru: 'Ко всем материалам', en: 'Back to the list', uz: 'Barcha materialga' },
  'detail.download': { ru: 'Скачать', en: 'Download', uz: 'Yuklab olish' },
  'detail.watch': { ru: 'Смотреть', en: 'Watch', uz: 'Ko‘rish' },
  'detail.eventStarts': { ru: 'Начало', en: 'Starts', uz: 'Boshlanishi' },
  'detail.eventLocation': { ru: 'Место проведения', en: 'Location', uz: 'O‘tkaziladigan joy' },

  'notFound.title': { ru: 'Страница не найдена', en: 'Page not found', uz: 'Sahifa topilmadi' },
  'notFound.text': {
    ru: 'Такой страницы нет или она была перемещена. Начните с главной страницы.',
    en: 'This page does not exist or has been moved. Start from the home page.',
    uz: 'Bunday sahifa mavjud emas yoki ko‘chirilgan. Bosh sahifadan boshlang.',
  },
  'notFound.home': { ru: 'На главную', en: 'Go to home page', uz: 'Bosh sahifaga' },
  'notFound.sections': { ru: 'Разделы сайта', en: 'Sections of the site', uz: 'Sayt bo‘limlari' },
  'notFound.languages': { ru: 'Языки сайта', en: 'Site languages', uz: 'Sayt tillari' },

  'contact.formTitle': { ru: 'Написать нам', en: 'Write to us', uz: 'Bizga yozing' },
  'contact.formIntro': {
    ru: 'Письмо попадёт в почтовый ящик института, его прочитает сотрудник.',
    en: 'Your letter goes to the inbox of the institute, where a colleague reads it.',
    uz: 'Xatingiz institut pochtasiga boradi, uni xodim o‘qiydi.',
  },
  'contact.name': { ru: 'Ваше имя', en: 'Your name', uz: 'Ismingiz' },
  'contact.email': { ru: 'Электронная почта', en: 'Email', uz: 'Elektron pochta' },
  'contact.phone': { ru: 'Телефон', en: 'Phone', uz: 'Telefon' },
  'contact.subject': { ru: 'Тема', en: 'Subject', uz: 'Mavzu' },
  'contact.message': { ru: 'Сообщение', en: 'Message', uz: 'Xabar' },
  'contact.optional': { ru: 'по желанию', en: 'optional', uz: 'ixtiyoriy' },
  'contact.send': { ru: 'Отправить', en: 'Send', uz: 'Yuborish' },
  'contact.map': { ru: 'Карта', en: 'Map', uz: 'Xarita' },
  'contact.openMap': { ru: 'Открыть карту', en: 'Open the map', uz: 'Xaritani ochish' },
  'contact.sent': {
    ru: 'Спасибо, письмо отправлено. Мы ответим на адрес, который вы указали.',
    en: 'Thank you — the letter is in. We will answer the address you gave.',
    uz: 'Rahmat, xabar yuborildi. Ko‘rsatgan manzilingizga javob beramiz.',
  },
  'contact.problemName': {
    ru: 'Напишите, пожалуйста, имя — так в ответе к вам обратятся.',
    en: 'Please write your name, so the answer can address you.',
    uz: 'Ismingizni yozing — javobda sizga shunday murojaat qilamiz.',
  },
  'contact.problemEmail': {
    ru: 'Проверьте адрес почты: без него ответ не дойдёт.',
    en: 'Check the email address — without it the answer cannot reach you.',
    uz: 'Elektron pochta manzilingizni tekshiring — javob yetib kelmaydi.',
  },
  'contact.problemMessage': {
    ru: 'Напишите хотя бы пару слов о том, что вам нужно.',
    en: 'Please write at least a couple of words about what you need.',
    uz: 'Nima kerakligini kamida bir-ikki so‘z bilan yozing.',
  },
  'contact.problemTooMany': {
    ru: 'Вы уже писали нам недавно. Попробуйте отправить письмо через час.',
    en: 'We have already heard from you recently. Please try again in an hour.',
    uz: 'Siz yaqinda yozgansiz. Bir soatdan so‘ng qayta urinib ko‘ring.',
  },

  'error.title': { ru: 'Ошибка', en: 'Something went wrong', uz: 'Xatolik' },
  'error.text': {
    ru: 'Страница временно недоступна. Попробуйте обновить её позже.',
    en: 'This page is temporarily unavailable. Please try again later.',
    uz: 'Sahifa vaqtinchalik mavjud emas. Birozdan so‘ng qayta urinib ko‘ring.',
  },
};

export type SiteKey = keyof typeof dictionary;

/** Network names are brands, not text to translate. */
export const SOCIAL_NAMES: Record<string, string> = {
  telegram: 'Telegram',
  youtube: 'YouTube',
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
};

/**
 * The three written languages are seeded, but the panel can activate another one, and a code the
 * dictionary has not been written in still has to produce a label — Russian is the language the
 * institute works in, so it is the fallback.
 */
export function asSiteLocale(code: string): SiteLocale {
  return code === 'uz' || code === 'en' || code === 'ru' ? code : SITE_FALLBACK_LOCALE;
}

export function siteTranslate(locale: string, key: SiteKey): string {
  const entry = dictionary[key];
  return entry[asSiteLocale(locale)] || entry.ru;
}

/** A lookup that reads like text, so a component does not repeat the locale everywhere. */
export function siteLabeler(locale: string): (key: SiteKey) => string {
  return (key) => siteTranslate(locale, key);
}

interface Triple {
  ru: string;
  en: string;
  uz: string;
}

/**
 * Section titles of the public site. These are the names a visitor sees in a heading, so they read
 * as parts of an institute rather than as rows of the admin sidebar («Структура», not «Подразделения»).
 */
const TYPE_NAMES: Record<string, Triple> = {
  news: { ru: 'Новости', en: 'News', uz: 'Yangiliklar' },
  article: { ru: 'Статьи', en: 'Articles', uz: 'Maqolalar' },
  book: { ru: 'Книги', en: 'Books', uz: 'Kitoblar' },
  publication: { ru: 'Публикации', en: 'Publications', uz: 'Nashrlar' },
  journal: { ru: 'Журналы', en: 'Journals', uz: 'Jurnallar' },
  manuscript: { ru: 'Рукописи', en: 'Manuscripts', uz: 'Qo‘lyozmalar' },
  dissertation: { ru: 'Диссертации', en: 'Dissertations', uz: 'Dissertatsiyalar' },
  event: { ru: 'Мероприятия', en: 'Events', uz: 'Tadbirlar' },
  announcement: { ru: 'Объявления', en: 'Announcements', uz: 'E’lonlar' },
  researcher: { ru: 'Сотрудники', en: 'Researchers', uz: 'Xodimlar' },
  department: { ru: 'Структура', en: 'Structure', uz: 'Tuzilma' },
  research_direction: { ru: 'Направления исследований', en: 'Research directions', uz: 'Tadqiqot yo‘nalishlari' },
  research_project: { ru: 'Научные проекты', en: 'Research projects', uz: 'Ilmiy loyihalar' },
  partner: { ru: 'Международное сотрудничество', en: 'International partners', uz: 'Xalqaro hamkorlik' },
  document: { ru: 'Документы', en: 'Documents', uz: 'Hujjatlar' },
};

/** The heading of a section; an unknown type keeps its own name rather than showing nothing. */
export function typeName(locale: string, typeKey: string): string {
  const entry = TYPE_NAMES[typeKey];
  if (!entry) return typeKey;
  return entry[asSiteLocale(locale)] || entry.ru;
}

/**
 * The name of a section: the one written into its address table when the site calls that listing
 * something other than the type, else the name of the type itself.
 */
export function sectionName(
  lang: string,
  title: { ru: string; en: string; uz: string } | undefined,
  typeKey: string,
): string {
  const locale = asSiteLocale(lang);
  return title?.[locale] ?? typeName(lang, typeKey);
}
