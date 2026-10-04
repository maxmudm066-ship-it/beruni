import type { MetadataRoute } from 'next';
import { siteAddresses } from '@/lib/site/addresses';
import { absoluteUrl, siteOrigin } from '@/lib/site/seo';

/** Without this Next bakes the file at build time and a newly published page never reaches search engines. */
export const dynamic = 'force-dynamic';

/**
 * The list of pages offered to search engines.
 *
 * Written from the database on every request, because the site is the database: publishing a news
 * item adds its address here without anyone touching a file.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await siteOrigin();
  if (!origin) return [];

  const addresses = await siteAddresses();
  return addresses.map((address) => ({
    url: absoluteUrl(address.path, origin),
    lastModified: address.updatedAt ?? undefined,
    changeFrequency: address.changefreq,
    priority: address.priority,
  }));
}
