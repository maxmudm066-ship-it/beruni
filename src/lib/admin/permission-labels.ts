import type { AdminLocale } from './i18n';

type Tri = [ru: string, en: string, uz: string];

export function pick(locale: AdminLocale, text: Tri): string {
  return text[locale === 'ru' ? 0 : locale === 'uz' ? 2 : 1];
}

/** Verbs used by every content permission. */
export const ACTION_VERBS: Record<string, Tri> = {
  view: ['Просмотр', 'View', 'Ko‘rish'],
  create: ['Создание', 'Create', 'Yaratish'],
  edit: ['Редактирование', 'Edit', 'Tahrirlash'],
  delete: ['Перенос в корзину', 'Move to trash', 'Savatga tashlash'],
  publish: ['Публикация', 'Publish', 'E‘lon qilish'],
  review: ['Проверка и одобрение', 'Approve / reject', 'Ko‘rik va tasdiq'],
};

/** Labels for the non-content permissions, so the matrix reads like the menu does. */
export const SYSTEM_GROUP_LABELS: Record<string, Tri> = {
  dashboard: ['Панель', 'Dashboard', 'Boshqaruv'],
  media: ['Медиатека', 'Media Library', 'Media kutubxonasi'],
  translations: ['Переводы', 'Translations', 'Tarjimalar'],
  seo: ['SEO', 'SEO', 'SEO'],
  menus: ['Меню сайта', 'Menus', 'Sayt menyusi'],
  homepage: ['Главная страница', 'Homepage', 'Bosh sahifa'],
  trash: ['Корзина', 'Trash', 'Savat'],
  importexport: ['Импорт и экспорт', 'Import and export', 'Import va eksport'],
  linkcheck: ['Проверка ссылок', 'Link checking', 'Havolalarni tekshirish'],
  users: ['Пользователи', 'Users', 'Foydalanuvchilar'],
  roles: ['Роли и права', 'Roles and permissions', 'Rollar va huquqlar'],
  settings: ['Настройки сайта', 'Site settings', 'Sayt sozlamalari'],
  audit: ['Журнал действий', 'Audit logs', 'Harakatlar jurnali'],
  redirects: ['Перенаправления', 'Redirects', 'Qayta yo‘naltirishlar'],
  contact: ['Сообщения с сайта', 'Contact messages', 'Sayt xabarlari'],
};

export const SYSTEM_PERMISSION_LABELS: Record<string, Tri> = {
  'media.view': ['Просмотр медиатеки', 'Browse the media library', 'Media kutubxonasini ko‘rish'],
  'media.upload': ['Загрузка файлов', 'Upload files', 'Fayl yuklash'],
  'media.edit': ['Изменение названия, ALT и папки', 'Edit title, ALT text and folder', 'Nomi, ALT va papkasini tahrirlash'],
  'media.delete': ['Удаление файлов', 'Delete files', 'Fayllarni o‘chirish'],
  'translations.view': ['Просмотр статуса переводов', 'See translation status', 'Tarjimalar holatini ko‘rish'],
  'translations.edit': ['Добавление и правка переводов', 'Add and edit translations', 'Tarjimalarni qo‘shish va tahrirlash'],
  'seo.view': ['Просмотр SEO-настроек', 'View SEO settings', 'SEO sozlamalarni ko‘rish'],
  'seo.edit': ['Изменение SEO-настроек', 'Edit SEO settings', 'SEO sozlamalarni tahrirlash'],
  'menus.manage': ['Управление меню', 'Manage menus', 'Menyu boshqaruvi'],
  'homepage.manage': ['Блоки главной страницы', 'Homepage sections', 'Bosh sahifa bloklari'],
  'trash.manage': ['Восстановление и окончательное удаление', 'Restore and permanent delete', 'Tiklash va butunlay o‘chirish'],
  'importexport.manage': ['Импорт и экспорт таблиц', 'Import and export spreadsheets', 'Jadval importi va eksporti'],
  'linkcheck.run': ['Запуск проверки ссылок', 'Run link checks', 'Havolani tekshirishni boshlash'],
  'users.manage': ['Добавление и изменение сотрудников', 'Manage staff accounts', 'Xodim hisoblarini boshqarish'],
  'roles.manage': ['Назначение прав ролям', 'Assign permissions to roles', 'Rollarga huquq berish'],
  'settings.manage': ['Общие настройки сайта', 'General site settings', 'Saytning umumiy sozlamalari'],
  'settings.security': ['Настройки безопасности', 'Security settings', 'Xavfsizlik sozlamalari'],
  'audit.view': ['Просмотр журнала действий', 'View the audit log', 'Harakatlar jurnalini ko‘rish'],
  'redirects.manage': ['Перенаправления со старых адресов', 'Manage redirects', 'Qayta yo‘naltirishlar'],
  'contact_messages.manage': ['Чтение сообщений с формы', 'Read contact messages', 'Forma xabarlarini o‘qish'],
};

export function systemPermissionLabel(key: string, locale: AdminLocale): string {
  const text = SYSTEM_PERMISSION_LABELS[key];
  return text ? pick(locale, text) : key;
}

export function systemGroupLabel(group: string, locale: AdminLocale): string {
  const text = SYSTEM_GROUP_LABELS[group];
  return text ? pick(locale, text) : group;
}

/**
 * The six roles the system ships with. They are stored in the database in English because that is
 * what the seed and the permission matrix use; a person sees them in their own language instead.
 */
export const ROLE_NAMES: Record<string, Tri> = {
  super_admin: ['Супер-администратор', 'Super Admin', 'Super administrator'],
  content_manager: ['Редактор контента', 'Content Manager', 'Kontent muharriri'],
  scientific_editor: ['Научный редактор', 'Scientific Editor', 'Ilmiy muharrir'],
  translator: ['Переводчик', 'Translator', 'Tarjimon'],
  media_manager: ['Медиа-менеджер', 'Media Manager', 'Media menejeri'],
  viewer: ['Наблюдатель', 'Viewer', 'Kuzatuvchi'],
};

export const ROLE_DESCRIPTIONS: Record<string, Tri> = {
  super_admin: [
    'Полный доступ, включая пользователей, роли, технические настройки и журнал действий.',
    'Full access, including users, roles, technical settings and audit logs.',
    'To‘liq ruxsat: foydalanuvchilar, rollar, texnik sozlamalar va harakatlar jurnali ham kiradi.',
  ],
  content_manager: [
    'Новости, статьи, книги и медиа. Не видит пользователей, роли, настройки и журнал действий.',
    'News, articles, books and media. Cannot see users, roles, settings or audit logs.',
    'Yangiliklar, maqolalar, kitoblar va media. Foydalanuvchilar, rollar, sozlamalar va jurnal ko‘rinmaydi.',
  ],
  scientific_editor: [
    'Публикации, диссертации, рукописи и другие научные материалы.',
    'Publications, dissertations, manuscripts and other scientific material.',
    'Nashrlar, dissertatsiyalar, qo‘lyozmalar va boshqa ilmiy materiallar.',
  ],
  translator: [
    'Работает только с переводами. Сам ничего не публикует.',
    'Works with translations only. Never publishes.',
    'Faqat tarjimalar bilan ishlaydi. O‘zi hech narsa e‘lon qilmaydi.',
  ],
  media_manager: [
    'Фотографии, видео и галереи.',
    'Photos, videos and galleries.',
    'Fotolar, videolar va galereyalar.',
  ],
  viewer: [
    'Только просмотр списков материалов.',
    'Read-only access to content listings.',
    'Materiallar ro‘yxatini faqat ko‘rish.',
  ],
};

/** Falls back to the stored text, so a role added directly in the database still shows something. */
export function roleName(key: string, stored: string, locale: AdminLocale): string {
  const text = ROLE_NAMES[key];
  return text ? pick(locale, text) : stored;
}

export function roleDescription(key: string, stored: string | null, locale: AdminLocale): string {
  const text = ROLE_DESCRIPTIONS[key];
  return text ? pick(locale, text) : stored ?? '';
}
