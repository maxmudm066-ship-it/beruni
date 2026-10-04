/**
 * The addresses this site no longer answers with a page.
 *
 * The Redirect table is written by a content manager in the Redirects screen, by the panel whenever
 * somebody renames a material, and by the import of the old site. A visitor who arrives at an old
 * address — from a bookmark, a printed leaflet, another institute's page — is sent to where the text
 * lives now instead of being told it is gone, and every row counts how often that still happens,
 * which is how staff learn which old links are worth repairing.
 */
import 'server-only';
import { after } from 'next/server';
import { permanentRedirect, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { siteLanguages } from '@/lib/site/languages';

/** A page renamed twice is still one click away; a page renamed in a circle must not be followed. */
const MAX_HOPS = 5;

interface Row {
  id: string;
  sourcePath: string;
  targetPath: string;
  redirectType: string;
}

export interface StoredRedirect {
  /** The address to send the visitor to, with their query kept. */
  href: string;
  permanent: boolean;
  /** Every rule that fired along the chain, so each of them is counted. */
  rows: Row[];
}

function normalised(pathname: string): string {
  const trimmed = pathname.trim();
  if (!trimmed) return '/';
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withSlash.length > 1 && withSlash.endsWith('/') ? withSlash.slice(0, -1) : withSlash;
}

async function find(sourcePath: string): Promise<Row | null> {
  const path = normalised(sourcePath);
  if (path === '/') return null;
  return prisma.redirect.findFirst({
    where: { sourcePath: path, isActive: true },
    select: { id: true, sourcePath: true, targetPath: true, redirectType: true },
  });
}

/** The language prefix of an address, or nothing when its first segment is not a language. */
async function languageOf(pathname: string): Promise<string> {
  const segment = pathname.split('/')[1] ?? '';
  if (!segment) return '';
  const languages = await siteLanguages();
  return languages.some((language) => language.code === segment || language.urlPrefix === segment) ? `/${segment}` : '';
}

/**
 * The address one rule points at, in the language the visitor arrived in.
 *
 * A rule written without a language prefix — which is how the old site's addresses and a quick hand
 * both look — is read as belonging to every language, so `/news/old` sends a Russian visitor to
 * `/ru/news/new` and an English one to `/en/news/new`. A full link to another institution is taken
 * exactly as it was written.
 */
function resolve(row: Row, language: string, search: string): string {
  const target = row.targetPath.trim();
  if (!target) return '';

  const external = /^https?:\/\//i.test(target);
  const alreadyPrefixed = !language || target === language || target.startsWith(`${language}/`);
  const href = external || alreadyPrefixed || !target.startsWith('/') ? target : `${language}${target}`;

  if (external || !search || href.includes('?')) return href;
  return `${href}${search}`;
}

/**
 * Where an old address leads, following a chain of renames to its end. Null means the address is not
 * a rule of this site, or that it leads nowhere the visitor is not already standing.
 */
export async function storedRedirect(pathname: string, search = ''): Promise<StoredRedirect | null> {
  const start = normalised(pathname);
  const language = await languageOf(start);
  const withoutLanguage = language ? normalised(start.slice(language.length)) : '';

  const first = (await find(start)) ?? (withoutLanguage ? await find(withoutLanguage) : null);
  if (!first) return null;

  const seen = new Set([first.sourcePath]);
  const rows = [first];
  let href = resolve(first, language, search);

  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    const next = await find(href.split('?')[0] ?? '');
    if (!next || seen.has(next.sourcePath)) break;
    seen.add(next.sourcePath);
    rows.push(next);
    href = resolve(next, language, '');
  }

  if (!href || href === start) return null;
  return { href, permanent: first.redirectType !== 'temporary', rows };
}

/**
 * Send the visitor on, and let the count of how often the old address was used catch up afterwards:
 * nobody should wait for one number in a table to reach the page they asked for.
 */
export async function applyStoredRedirect(pathname: string, search = ''): Promise<void> {
  const found = await storedRedirect(pathname, search);
  if (!found) return;

  for (const row of found.rows) {
    const count = () => prisma.redirect.update({ where: { id: row.id }, data: { hits: { increment: 1 } } });
    try {
      after(async () => {
        await count().catch(() => undefined);
      });
    } catch {
      await count().catch(() => undefined);
    }
  }

  if (found.permanent) permanentRedirect(found.href);
  redirect(found.href);
}
