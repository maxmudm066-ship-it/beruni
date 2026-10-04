import {
  AlertTriangle,
  BookMarked,
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardList,
  Compass,
  FileStack,
  FolderTree,
  GraduationCap,
  Handshake,
  House,
  Images,
  Inbox,
  Languages,
  LayoutTemplate,
  Link2,
  Megaphone,
  Menu,
  Newspaper,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Upload,
  Trash2,
  UserCog,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { CONTENT_TYPES } from '@/lib/content-types';
import type { TranslationKey } from './labels';

export interface NavEntry {
  /** Key from ADMIN_NAV_SECTIONS — decides who may see this entry. */
  section: string;
  href: string;
  labelKey: TranslationKey;
  icon: LucideIcon;
}

export interface NavGroup {
  titleKey: TranslationKey;
  entries: NavEntry[];
}

const TYPE_ICON: Record<string, LucideIcon> = {
  news: Newspaper,
  article: FileStack,
  book: BookOpen,
  publication: BookMarked,
  manuscript: ScrollText,
  dissertation: GraduationCap,
  event: CalendarDays,
  announcement: Megaphone,
  researcher: Users,
  department: Building2,
  research_direction: Compass,
  research_project: ClipboardList,
  partner: Handshake,
  document: FolderTree,
  page: LayoutTemplate,
  journal: Languages,
};

const SYSTEM_ENTRIES: Record<string, { href: string; labelKey: TranslationKey; icon: LucideIcon }> = {
  media_library: { href: '/admin/media', labelKey: 'nav.mediaLibrary', icon: Images },
  menus: { href: '/admin/menus', labelKey: 'nav.menus', icon: Menu },
  homepage: { href: '/admin/homepage', labelKey: 'nav.homepage', icon: House },
  translations: { href: '/admin/translations', labelKey: 'nav.translations', icon: Languages },
  redirects: { href: '/admin/redirects', labelKey: 'nav.redirects', icon: Link2 },
  seo: { href: '/admin/seo', labelKey: 'nav.seo', icon: Search },
  trash: { href: '/admin/trash', labelKey: 'nav.trash', icon: Trash2 },
  reviews: { href: '/admin/reviews', labelKey: 'nav.reviews', icon: ClipboardList },
  importexport: { href: '/admin/import-export', labelKey: 'nav.importExport', icon: Upload },
  linkcheck: { href: '/admin/links', labelKey: 'nav.links', icon: AlertTriangle },
  contact_messages: { href: '/admin/messages', labelKey: 'nav.contactMessages', icon: Inbox },
  users: { href: '/admin/users', labelKey: 'nav.users', icon: UserCog },
  roles: { href: '/admin/roles', labelKey: 'nav.roles', icon: ShieldCheck },
  settings: { href: '/admin/settings', labelKey: 'nav.settings', icon: Settings },
  audit: { href: '/admin/audit', labelKey: 'nav.audit', icon: ScrollText },
};

const TYPE_GROUPS: Record<string, TranslationKey> = {
  content: 'nav.content',
  science: 'nav.science',
  structure: 'nav.structure',
  media: 'nav.media',
  system: 'nav.system',
  workflow: 'nav.workflow',
};

function typeEntry(typeKey: string): NavEntry {
  return {
    section: typeKey,
    href: `/admin/${typeKey}`,
    labelKey: `type.${typeKey}` as TranslationKey,
    icon: TYPE_ICON[typeKey] ?? FileStack,
  };
}

function systemEntry(section: string): NavEntry {
  const entry = SYSTEM_ENTRIES[section];
  return { section, ...entry };
}

/**
 * Sidebar layout. Content sections come from the type registry so a new material type
 * appears in navigation without touching this file; visibility is still filtered by
 * permissions in visibleNavSections().
 */
export function buildNavGroups(): NavGroup[] {
  const byGroup = new Map<string, NavEntry[]>();
  for (const type of CONTENT_TYPES) {
    const list = byGroup.get(type.navGroup) ?? [];
    list.push(typeEntry(type.key));
    byGroup.set(type.navGroup, list);
  }

  const orderedTypes = [...byGroup.keys()].sort(
    (a, b) => Object.keys(TYPE_GROUPS).indexOf(a) - Object.keys(TYPE_GROUPS).indexOf(b),
  );

  return [
    ...orderedTypes.map((group) => ({
      titleKey: TYPE_GROUPS[group],
      entries: (byGroup.get(group) ?? []).sort((a, b) => {
        const order = (k: string) => CONTENT_TYPES.find((t) => t.key === k)?.navOrder ?? 0;
        return order(a.section) - order(b.section);
      }),
    })),
    {
      titleKey: 'nav.workflow',
      entries: ['reviews', 'trash'].map(systemEntry),
    },
    {
      titleKey: 'nav.site',
      entries: ['media_library', 'menus', 'homepage', 'importexport', 'linkcheck', 'contact_messages'].map(systemEntry),
    },
    {
      titleKey: 'nav.languageSeo',
      entries: ['translations', 'seo', 'redirects'].map(systemEntry),
    },
    {
      titleKey: 'nav.system',
      entries: ['users', 'roles', 'settings', 'audit'].map(systemEntry),
    },
  ];
}

export const ADMIN_NAV_GROUPS: NavGroup[] = buildNavGroups();

export const DASHBOARD_ENTRY: NavEntry = {
  section: 'dashboard',
  href: '/admin',
  labelKey: 'nav.dashboard',
  icon: LayoutTemplate,
};
