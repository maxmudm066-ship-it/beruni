/**
 * Public URL layout of the site, in one place.
 *
 * Both the redirect created when an administrator changes a slug and the Preview button need the
 * same answer, so it must not be duplicated in the migration scripts or the page templates.
 * Language prefixes (/uz, /ru, /en) are added by the site's i18n layer.
 */

/** Path segment per content type; 'page' lives at the root and is handled by pathOverride/slug. */
export const TYPE_PATH_SEGMENT: Record<string, string> = {
  news: 'news',
  article: 'articles',
  book: 'books',
  publication: 'publications',
  journal: 'publications/journals',
  manuscript: 'manuscripts',
  dissertation: 'dissertations',
  event: 'events',
  announcement: 'announcements',
  researcher: 'researchers',
  department: 'structure',
  research_direction: 'research/directions',
  research_project: 'research/projects',
  partner: 'international',
  document: 'documents',
  page: 'page',
};

export interface PublicPathInput {
  typeKey: string;
  slug: string;
  lang?: string;
  /** Pages may carry a fixed path chosen by an administrator. */
  pathOverride?: string | null;
}

/** Path without the language prefix, always starting with a slash. */
export function publicPath({ typeKey, slug, pathOverride }: PublicPathInput): string {
  if (pathOverride) {
    const trimmed = pathOverride.replace(/^\/+|\/+$/g, '');
    if (trimmed) return `/${trimmed}`;
  }
  if (typeKey === 'page') return `/${slug}`;
  const segment = TYPE_PATH_SEGMENT[typeKey] ?? typeKey;
  return `/${segment}/${slug}`;
}

export function localizedPath(input: PublicPathInput, lang: string): string {
  return `/${lang}${publicPath(input)}`;
}

export function adminListPath(typeKey: string): string {
  return `/admin/${typeKey}`;
}

export function adminEditPath(typeKey: string, itemId: string): string {
  return `/admin/${typeKey}/${itemId}`;
}

export function adminNewPath(typeKey: string): string {
  return `/admin/${typeKey}/new`;
}

export function adminPreviewPath(typeKey: string, itemId: string): string {
  return `/admin/preview/${typeKey}/${itemId}`;
}
