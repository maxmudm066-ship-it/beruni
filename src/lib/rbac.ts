import { CONTENT_TYPES } from './content-types';

export const CONTENT_ACTIONS = ['view', 'create', 'edit', 'delete', 'publish', 'review'] as const;
export type ContentAction = (typeof CONTENT_ACTIONS)[number];

export interface PermissionDef {
  key: string;
  label: string;
  group: string;
  description?: string;
}

const ACTION_LABEL: Record<ContentAction, string> = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  delete: 'Move to trash',
  publish: 'Publish',
  review: 'Approve / reject on review',
};

/** Content permissions are generated per content type so each role can be scoped precisely. */
export const CONTENT_PERMISSIONS: PermissionDef[] = CONTENT_TYPES.flatMap((type) =>
  CONTENT_ACTIONS.map((action) => ({
    key: `${type.key}.${action}`,
    label: `${ACTION_LABEL[action]} ${type.label}`,
    group: type.key,
  })),
);

export const SYSTEM_PERMISSIONS: PermissionDef[] = [
  { key: 'dashboard.view', label: 'View dashboard', group: 'dashboard' },
  { key: 'media.view', label: 'Browse Media Library', group: 'media' },
  { key: 'media.upload', label: 'Upload files', group: 'media' },
  { key: 'media.edit', label: 'Edit file details and folders', group: 'media' },
  { key: 'media.delete', label: 'Delete files', group: 'media' },
  { key: 'translations.view', label: 'View translation status', group: 'translations' },
  { key: 'translations.edit', label: 'Add and edit translations', group: 'translations' },
  { key: 'seo.view', label: 'View SEO settings', group: 'seo' },
  { key: 'seo.edit', label: 'Edit SEO settings', group: 'seo' },
  { key: 'menus.manage', label: 'Menu Manager', group: 'menus' },
  { key: 'homepage.manage', label: 'Homepage sections', group: 'homepage' },
  { key: 'trash.manage', label: 'Restore or permanently delete from Trash', group: 'trash' },
  { key: 'importexport.manage', label: 'Import / export content', group: 'importexport' },
  { key: 'linkcheck.run', label: 'Check internal links', group: 'linkcheck' },
  { key: 'users.manage', label: 'Manage users', group: 'users', description: 'Technical area — hidden from Content Manager.' },
  { key: 'roles.manage', label: 'Manage roles and permissions', group: 'roles' },
  { key: 'settings.manage', label: 'Edit site settings', group: 'settings' },
  { key: 'settings.security', label: 'Edit security and technical settings', group: 'settings' },
  { key: 'audit.view', label: 'View audit logs', group: 'audit' },
  { key: 'redirects.manage', label: 'Manage redirects', group: 'redirects' },
  { key: 'contact_messages.manage', label: 'Read contact form messages', group: 'contact' },
];

export const ALL_PERMISSIONS: PermissionDef[] = [...CONTENT_PERMISSIONS, ...SYSTEM_PERMISSIONS];
export const SUPER_ADMIN_KEY = '*';
/** The role that holds {@link SUPER_ADMIN_KEY}. Not the same string: one is a permission, one a role. */
export const SUPER_ADMIN_ROLE_KEY = 'super_admin';

/**
 * Deliberately outside ALL_PERMISSIONS: the Roles screen builds its checkboxes from that list,
 * so the wildcard can never be handed to an ordinary role. It is seeded and granted to
 * Super Admin only, and it is what `can()` and `visibleNavSections()` look for in a session.
 */
export const SUPER_ADMIN_PERMISSION: PermissionDef = {
  key: SUPER_ADMIN_KEY,
  label: 'Full access to every area',
  group: 'system',
  description: 'Grants every permission, including future ones. Reserved for Super Admin.',
};

export interface RoleDef {
  key: string;
  name: string;
  description: string;
  permissions: string[];
}

const contentKeys = (types: string[], actions: ContentAction[]) =>
  types.flatMap((t) => actions.map((a) => `${t}.${a}`));

const ALL_CONTENT_TYPES = CONTENT_TYPES.map((t) => t.key);
const EDIT_ACTIONS: ContentAction[] = ['view', 'create', 'edit', 'delete'];

export const ROLES: RoleDef[] = [
  {
    key: SUPER_ADMIN_ROLE_KEY,
    name: 'Super Admin',
    description: 'Full access, including users, roles, technical settings and audit logs.',
    permissions: [SUPER_ADMIN_KEY],
  },
  {
    key: 'content_manager',
    name: 'Content Manager',
    description: 'News, articles, books and media. Cannot see users, roles, settings or audit logs.',
    permissions: [
      'dashboard.view',
      ...contentKeys(['news', 'article', 'book', 'page', 'event', 'announcement'], EDIT_ACTIONS),
      ...contentKeys(['news', 'article', 'book'], ['publish']),
      'media.view', 'media.upload', 'media.edit',
      'translations.view', 'seo.view', 'seo.edit',
      'menus.manage', 'homepage.manage',
    ],
  },
  {
    key: 'scientific_editor',
    name: 'Scientific Editor',
    description: 'Publications, dissertations, manuscripts and other scientific material.',
    permissions: [
      'dashboard.view',
      ...contentKeys(
        ['publication', 'dissertation', 'manuscript', 'journal', 'research_direction',
         'research_project', 'researcher', 'department', 'partner', 'document', 'article', 'event'],
        EDIT_ACTIONS,
      ),
      ...contentKeys(['publication', 'dissertation', 'manuscript', 'research_project'], ['publish', 'review']),
      'media.view', 'media.upload', 'media.edit',
      'translations.view', 'seo.view', 'seo.edit',
    ],
  },
  {
    key: 'translator',
    name: 'Translator',
    description: 'Works with translations only. Never publishes.',
    permissions: [
      'dashboard.view',
      ...contentKeys(ALL_CONTENT_TYPES, ['view']),
      ...contentKeys(ALL_CONTENT_TYPES, ['edit']),
      'translations.view', 'translations.edit', 'media.view',
    ],
  },
  {
    key: 'media_manager',
    name: 'Media Manager',
    description: 'Photos, videos and galleries.',
    permissions: [
      'dashboard.view',
      'media.view', 'media.upload', 'media.edit', 'media.delete',
      ...contentKeys(ALL_CONTENT_TYPES, ['view']),
      ...contentKeys(['news', 'event'], ['edit']),
    ],
  },
  {
    key: 'viewer',
    name: 'Viewer',
    description: 'Read-only access to content listings.',
    permissions: ['dashboard.view', ...contentKeys(ALL_CONTENT_TYPES, ['view']), 'media.view'],
  },
];

export function permissionKeysForRole(roleKey: string): string[] {
  const role = ROLES.find((r) => r.key === roleKey);
  return role ? role.permissions : [];
}

export interface PermissionSubject {
  roleKey: string;
  permissions: string[];
}

export function can(subject: PermissionSubject | null | undefined, permission: string): boolean {
  if (!subject) return false;
  if (subject.permissions.includes(SUPER_ADMIN_KEY)) return true;
  return subject.permissions.includes(permission);
}

/** Review and Trash are open to whoever can act on at least one content type, not only to Super Admin. */
const PUBLISH_OR_REVIEW = CONTENT_TYPES.flatMap((t) => [`${t.key}.publish`, `${t.key}.review`]);
const DELETE_RIGHTS = CONTENT_TYPES.map((t) => `${t.key}.delete`);

export const ADMIN_NAV_SECTIONS = [
  { key: 'dashboard', permissions: ['dashboard.view'] },
  ...CONTENT_TYPES.map((t) => ({
    key: t.key,
    permissions: [`${t.key}.view`, `${t.key}.create`, `${t.key}.edit`],
  })),
  { key: 'media_library', permissions: ['media.view', 'media.upload'] },
  { key: 'menus', permissions: ['menus.manage'] },
  { key: 'homepage', permissions: ['homepage.manage'] },
  { key: 'translations', permissions: ['translations.view', 'translations.edit'] },
  { key: 'seo', permissions: ['seo.view', 'seo.edit'] },
  { key: 'redirects', permissions: ['redirects.manage'] },
  { key: 'reviews', permissions: PUBLISH_OR_REVIEW },
  { key: 'trash', permissions: ['trash.manage', ...DELETE_RIGHTS] },
  { key: 'importexport', permissions: ['importexport.manage'] },
  { key: 'linkcheck', permissions: ['linkcheck.run'] },
  { key: 'contact_messages', permissions: ['contact_messages.manage'] },
  { key: 'users', permissions: ['users.manage'] },
  { key: 'roles', permissions: ['roles.manage'] },
  { key: 'settings', permissions: ['settings.manage'] },
  { key: 'audit', permissions: ['audit.view'] },
] as const satisfies { key: string; permissions: string[] }[];

/**
 * Sidebar sections a subject may open. A section is visible when the subject holds at
 * least one permission belonging to it — so Content Manager never sees
 * Users / Roles / Settings / Audit Logs, per the requirement.
 */
export function visibleNavSections(subject: PermissionSubject | null | undefined): Set<string> {
  const visible = new Set<string>();
  if (!subject) return visible;
  const isSuper = subject.permissions.includes(SUPER_ADMIN_KEY);
  for (const section of ADMIN_NAV_SECTIONS) {
    if (isSuper || section.permissions.some((p) => subject.permissions.includes(p))) {
      visible.add(section.key);
    }
  }
  return visible;
}
