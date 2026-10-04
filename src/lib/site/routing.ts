/**
 * Which public page a URL belongs to.
 *
 * A listing lives at a fixed path (`/news`, `/research/projects`), a material at that path plus one
 * slug (`/news/beruni-1150`), and a page at whatever address its author chose. This module turns the
 * segments after the language prefix into one of those three, so a single route can serve every
 * content type and the URLs stay in one place.
 */
import 'server-only';
import { TYPE_PATH_SEGMENT } from '@/lib/content/routes';

export interface ListFilter {
  /** Value of the type's own 'kind' select, fixed by the address rather than by a query parameter. */
  kind?: string;
  youngOnly?: boolean;
  leadership?: boolean;
  hasDigitalCopy?: boolean;
}

export interface ListingSpec {
  path: string;
  segments: string[];
  typeKey: string;
  filter: ListFilter;
  /** Section name when the site calls the listing something other than the type. */
  title?: { ru: string; en: string; uz: string };
}

interface SpecInput {
  path: string;
  typeKey: string;
  filter?: ListFilter;
  title?: { ru: string; en: string; uz: string };
}

/**
 * Paths of the site. The two-segment ones are matched first, so `/publications/journals/x` is a
 * journal and not a publication with the slug 'journals'.
 */
const SPECS: SpecInput[] = [
  { path: 'news', typeKey: 'news' },
  { path: 'announcements', typeKey: 'announcement' },
  { path: 'events', typeKey: 'event' },
  { path: 'articles', typeKey: 'article' },
  { path: 'books', typeKey: 'book' },
  { path: 'publications', typeKey: 'publication' },
  { path: 'publications/journals', typeKey: 'journal' },
  { path: 'journals', typeKey: 'journal' },
  { path: 'manuscripts', typeKey: 'manuscript' },
  {
    path: 'manuscripts/digitized',
    typeKey: 'manuscript',
    filter: { hasDigitalCopy: true },
    title: { ru: 'Оцифрованные рукописи', en: 'Digitised manuscripts', uz: 'Raqamlashtirilgan qo‘lyozmalar' },
  },
  {
    path: 'manuscripts/collections',
    typeKey: 'manuscript',
    title: { ru: 'Коллекции рукописей', en: 'Manuscript collections', uz: 'Qo‘lyozma kolleksiyalari' },
  },
  { path: 'dissertations', typeKey: 'dissertation' },
  { path: 'documents', typeKey: 'document' },
  { path: 'researchers', typeKey: 'researcher' },
  {
    path: 'researchers/young',
    typeKey: 'researcher',
    filter: { youngOnly: true },
    title: { ru: 'Молодые учёные', en: 'Young scientists', uz: 'Yosh olimlar' },
  },
  {
    path: 'leadership',
    typeKey: 'researcher',
    filter: { leadership: true },
    title: { ru: 'Руководство', en: 'Leadership', uz: 'Rahbariyat' },
  },
  { path: 'structure', typeKey: 'department' },
  { path: 'research', typeKey: 'research_direction' },
  { path: 'research/directions', typeKey: 'research_direction' },
  { path: 'research/projects', typeKey: 'research_project' },
  {
    path: 'research/centers',
    typeKey: 'department',
    filter: { kind: 'center' },
    title: { ru: 'Научные центры', en: 'Research centres', uz: 'Ilmiy markazlar' },
  },
  { path: 'international', typeKey: 'partner' },
];

function toSpec(input: SpecInput): ListingSpec {
  return { path: input.path, segments: input.path.split('/'), typeKey: input.typeKey, filter: input.filter ?? {}, title: input.title };
}

const ALL = SPECS.map(toSpec).sort((a, b) => b.segments.length - a.segments.length);
const BY_PATH = new Map(ALL.map((spec) => [spec.path, spec]));

export type PublicRoute =
  | { kind: 'listing'; spec: ListingSpec }
  | { kind: 'material'; spec: ListingSpec; slug: string }
  /** A page: its address is whatever the person who wrote it chose. */
  | { kind: 'page'; path: string }
  | { kind: 'contact' };

const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/i;

function isPrefix(spec: ListingSpec, segments: string[]): boolean {
  return spec.segments.every((segment, index) => segments[index] === segment);
}

/**
 * Resolves the path after the language prefix. Something that matches no listing and no page is a
 * 404 here, in the one place where the site decides what its URLs look like.
 */
export function resolveRoute(segments: string[]): PublicRoute {
  const joined = segments.join('/');
  if (!joined) return { kind: 'page', path: '' };

  const exact = BY_PATH.get(joined);
  if (exact) return { kind: 'listing', spec: exact };

  for (const spec of ALL) {
    if (!isPrefix(spec, segments)) continue;
    const rest = segments.slice(spec.segments.length);
    if (rest.length === 1 && SLUG.test(rest[0])) return { kind: 'material', spec, slug: rest[0] };
  }

  if (segments.length === 1 && segments[0] === 'contact') return { kind: 'contact' };

  return { kind: 'page', path: joined };
}

/**
 * Every section of the site, longest path first. The sitemap walks it, so a new section is advertised
 * as soon as it can be reached — nobody has to remember to add it to a second list.
 */
export function listingRoutes(): ListingSpec[] {
  return ALL;
}

/**
 * The listing served at exactly these segments, if any. Used to name the parent of a nested section
 * in a breadcrumb, so `/research/projects/…` shows «Research» above «Projects».
 */
export function listingAtExact(segments: string[]): ListingSpec | null {
  return BY_PATH.get(segments.join('/')) ?? null;
}

/**
 * The listing a material of this type belongs to, used for the breadcrumb and the "back to the
 * list" link. The address the material itself is served from comes from the same table as the
 * link that produced it, so the two can never disagree.
 */
export function listingSpecFor(typeKey: string): ListingSpec | null {
  const segment = TYPE_PATH_SEGMENT[typeKey];
  if (!segment) return null;
  return BY_PATH.get(segment) ?? null;
}
