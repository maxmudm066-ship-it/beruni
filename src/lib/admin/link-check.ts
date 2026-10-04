import 'server-only';
import fs from 'node:fs/promises';
import { prisma } from '@/lib/db';
import type { TranslationKey } from '@/lib/admin/labels';
import { TYPE_PATH_SEGMENT, publicPath } from '@/lib/content/routes';
import { absolutePath } from '@/lib/media/storage';

/**
 * Which machine-readable reason is stored in `link_checks.errorMessage`. The screen turns the
 * token into a sentence, so a staff member never reads a server log.
 */
export const LINK_REASONS = ['not_found', 'missing_file', 'bad_address', 'old_address', 'no_target'] as const;
export type LinkReason = (typeof LINK_REASONS)[number];

export function isLinkReason(value: string): value is LinkReason {
  return (LINK_REASONS as readonly string[]).includes(value);
}

/** How each reason is explained to the person looking at the screen. */
export const LINK_REASON_KEYS: Record<LinkReason, TranslationKey> = {
  not_found: 'links.reasonNotFound',
  missing_file: 'links.reasonMissingFile',
  bad_address: 'links.reasonBadAddress',
  old_address: 'links.reasonOldAddress',
  no_target: 'links.reasonNoTarget',
};

export interface LinkProblem {
  url: string;
  status: 'broken' | 'redirect';
  reason: LinkReason;
  pagePath: string | null;
  pageGroupId: string | null;
}

export interface LinkCheckResult {
  runId: string;
  checked: number;
  broken: number;
}

const LINK_ATTRIBUTE = /(?:href|src|data-src)\s*=\s*["']([^"'<>\s]+)["']/gi;

function linksInHtml(html: string): string[] {
  const found: string[] = [];
  for (const match of html.matchAll(LINK_ATTRIBUTE)) {
    const value = match[1];
    if (value) found.push(value);
  }
  return found;
}

/** Anchors, mail and phone addresses are not pages, so the checker leaves them alone. */
function isCheckable(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('#')) return false;
  if (/^(mailto:|tel:|sms:|data:|blob:)/i.test(url)) return false;
  return true;
}

interface FoundLink {
  url: string;
  pagePath: string | null;
  pageGroupId: string | null;
}

/** Every address the site itself is expected to answer, without the language prefix. */
async function knownPaths(): Promise<Set<string>> {
  const paths = new Set<string>();
  const languages = await prisma.language.findMany({
    where: { isActive: true },
    select: { code: true },
  });
  const codes = languages.map((language) => language.code);

  const overrides = await prisma.page.findMany({ select: { groupId: true, pathOverride: true } });
  const overrideByGroup = new Map(overrides.map((page) => [page.groupId, page.pathOverride]));

  const published = await prisma.contentItem.findMany({
    where: { status: 'published', deletedAt: null },
    select: { slug: true, lang: true, groupId: true, group: { select: { type: true } } },
  });
  for (const item of published) {
    const base = publicPath({
      typeKey: item.group.type,
      slug: item.slug,
      pathOverride: overrideByGroup.get(item.groupId) ?? null,
    });
    paths.add(base);
    for (const code of codes) paths.add(`/${code}${base}`);
  }

  // Listing pages: /news, /ru/news, and every parent of a nested segment.
  const segments = new Set<string>();
  for (const value of Object.values(TYPE_PATH_SEGMENT)) {
    const parts = value.split('/');
    let joined = '';
    for (const part of parts) {
      joined = joined ? `${joined}/${part}` : part;
      segments.add(`/${joined}`);
    }
  }
  for (const segment of segments) {
    paths.add(segment);
    for (const code of codes) paths.add(`/${code}${segment}`);
  }
  paths.add('/');
  for (const code of codes) paths.add(`/${code}`);

  // Uploaded files, including the variants the site actually renders.
  const [media, variants] = await Promise.all([
    prisma.media.findMany({ select: { publicUrl: true, storagePath: true } }),
    prisma.mediaVariant.findMany({ select: { publicUrl: true, storagePath: true } }),
  ]);
  for (const row of [...media, ...variants]) {
    paths.add(row.publicUrl);
  }

  return paths;
}

async function filePresent(storagePath: string): Promise<boolean> {
  const target = absolutePath(storagePath);
  if (!target) return false;
  try {
    return (await fs.stat(target)).isFile();
  } catch {
    return false;
  }
}

/** Links the panel holds: material texts, menu items and the buttons of homepage blocks. */
async function collectLinks(): Promise<FoundLink[]> {
  const found: FoundLink[] = [];

  const items = await prisma.contentItem.findMany({
    where: { deletedAt: null, body: { not: null } },
    select: { id: true, groupId: true, lang: true, slug: true, body: true, group: { select: { type: true } } },
  });
  for (const item of items) {
    const pagePath = `/${item.lang}${publicPath({ typeKey: item.group.type, slug: item.slug })}`;
    for (const url of linksInHtml(item.body ?? '')) {
      found.push({ url, pagePath, pageGroupId: item.groupId });
    }
  }

  const menuItems = await prisma.menuItem.findMany({
    where: { isVisible: true, menu: { isActive: true } },
    select: { id: true, targetType: true, targetUrl: true, contentGroupId: true, menuId: true },
  });
  for (const item of menuItems) {
    const pagePath = `/admin/menus/${item.menuId}`;
    if (item.targetUrl) {
      found.push({ url: item.targetUrl, pagePath, pageGroupId: null });
    } else if (item.targetType === 'content' && !item.contentGroupId) {
      // The material was deleted and the link lost its target.
      found.push({ url: '', pagePath, pageGroupId: null });
    }
  }

  const blocks = await prisma.homepageSectionContent.findMany({
    where: { OR: [{ buttonUrl: { not: null } }, { button2Url: { not: null } }] },
    select: { sectionId: true, buttonUrl: true, button2Url: true },
  });
  for (const block of blocks) {
    const pagePath = `/admin/homepage/${block.sectionId}`;
    for (const url of [block.buttonUrl, block.button2Url]) {
      if (url) found.push({ url, pagePath, pageGroupId: null });
    }
  }

  return found;
}

/**
 * One sweep over every address the site points at itself. Links to another site are not checked:
 * the institute cannot repair them from this panel, and a slow external request would hold the
 * screen open for minutes.
 */
export async function runLinkCheck(userId: string | null): Promise<LinkCheckResult> {
  const run = await prisma.linkCheckRun.create({
    data: { triggeredBy: userId, status: 'running' },
  });

  try {
    const [paths, redirects, links] = await Promise.all([knownPaths(), activeRedirects(), collectLinks()]);
    const files = await uploadedFiles();

    const seen = new Set<string>();
    const problems: LinkProblem[] = [];
    let checked = 0;

    for (const link of links) {
      if (!isCheckable(link.url)) continue;
      const key = `${link.pagePath ?? ''}|${link.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      checked += 1;

      const problem = await classify(link, paths, redirects, files);
      if (problem) problems.push(problem);
    }

    if (problems.length) {
      await prisma.linkCheck.createMany({
        data: problems.map((problem) => ({
          runId: run.id,
          url: problem.url,
          status: problem.status,
          errorMessage: problem.reason,
          pagePath: problem.pagePath,
          pageGroupId: problem.pageGroupId,
        })),
      });
    }
    await prisma.linkCheckRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), checkedCount: checked, brokenCount: problems.length, status: 'done' },
    });
    await keepLatestRuns();

    return { runId: run.id, checked, broken: problems.length };
  } catch (error) {
    await prisma.linkCheckRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), status: 'failed' },
    });
    throw error;
  }
}

async function activeRedirects(): Promise<Map<string, string>> {
  const rows = await prisma.redirect.findMany({ where: { isActive: true }, select: { sourcePath: true, targetPath: true } });
  return new Map(rows.map((row) => [row.sourcePath.toLowerCase(), row.targetPath]));
}

async function uploadedFiles(): Promise<Map<string, string>> {
  const rows = await prisma.media.findMany({ select: { publicUrl: true, storagePath: true } });
  const variants = await prisma.mediaVariant.findMany({ select: { publicUrl: true, storagePath: true } });
  return new Map([...rows, ...variants].map((row) => [row.publicUrl, row.storagePath]));
}

async function classify(
  link: FoundLink,
  paths: Set<string>,
  redirects: Map<string, string>,
  files: Map<string, string>,
): Promise<LinkProblem | null> {
  const base = { pagePath: link.pagePath, pageGroupId: link.pageGroupId };

  if (!link.url) return { url: '', status: 'broken', reason: 'no_target', ...base };

  // A link to another site is left alone on purpose.
  if (/^[a-z][a-z0-9+.-]*:/i.test(link.url)) {
    return /^https?:/i.test(link.url) ? null : { url: link.url, status: 'broken', reason: 'bad_address', ...base };
  }
  if (link.url.startsWith('//')) return { url: link.url, status: 'broken', reason: 'bad_address', ...base };

  const clean = link.url.split('#')[0]?.split('?')[0] ?? '';
  if (!clean || clean === '/') return null;
  const normalized = clean.length > 1 && clean.endsWith('/') ? clean.slice(0, -1) : clean;

  const storagePath = files.get(normalized);
  if (storagePath !== undefined) {
    return (await filePresent(storagePath))
      ? null
      : { url: link.url, status: 'broken', reason: 'missing_file', ...base };
  }

  if (paths.has(normalized)) return null;
  if (redirects.has(normalized.toLowerCase())) {
    return { url: link.url, status: 'redirect', reason: 'old_address', ...base };
  }
  try {
    if (paths.has(decodeURIComponent(normalized))) return null;
  } catch {
    // A malformed escape is itself a reason to report the address.
  }
  return { url: link.url, status: 'broken', reason: 'not_found', ...base };
}

/** Only the five newest sweeps are kept; their results go with them. */
async function keepLatestRuns(): Promise<void> {
  const stale = await prisma.linkCheckRun.findMany({ orderBy: { startedAt: 'desc' }, skip: 5, select: { id: true } });
  if (stale.length) await prisma.linkCheckRun.deleteMany({ where: { id: { in: stale.map((row) => row.id) } } });
}
