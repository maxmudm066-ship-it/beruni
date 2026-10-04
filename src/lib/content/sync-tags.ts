import 'server-only';
import type { Prisma } from '@/generated/prisma/client';
import { slugify } from '@/lib/slug';

/** Tags of one language version: names meet on the same tag through their Latin slug. */
export async function syncTags(client: Prisma.TransactionClient, itemId: string, lang: string, names: string[]) {
  await client.contentItemTag.deleteMany({ where: { itemId } });
  for (const name of names) {
    const slug = slugify(name);
    if (!slug) continue;
    const tag = await client.tag.upsert({ where: { slug }, create: { slug }, update: {} });
    await client.tagTranslation.upsert({
      where: { tagId_lang: { tagId: tag.id, lang } },
      create: { tagId: tag.id, lang, name },
      update: { name },
    });
    await client.contentItemTag.upsert({
      where: { itemId_tagId: { itemId, tagId: tag.id } },
      create: { itemId, tagId: tag.id },
      update: {},
    });
  }
}
