import 'server-only';
import { Prisma } from '@/generated/prisma/client';
import { withSuffix } from '@/lib/slug';

/**
 * A material's address is unique per language, so a new or restored one takes the first free suffix
 * instead of failing on the unique index. Pass the item's own id when renaming an existing material.
 */
export async function uniqueSlug(
  client: Prisma.TransactionClient,
  lang: string,
  base: string,
  exceptItemId: string | null,
): Promise<string> {
  const fallback = base || 'material';
  const clashes = await client.contentItem.findMany({
    where: { lang, slug: { startsWith: fallback }, id: exceptItemId ? { not: exceptItemId } : {} },
    select: { slug: true },
  });
  return withSuffix(fallback, new Set(clashes.map((row) => row.slug)));
}
