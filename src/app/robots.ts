import type { MetadataRoute } from 'next';
import { absoluteUrl, siteOrigin } from '@/lib/site/seo';

/** The site address is filled in by staff in Settings, so this file cannot be fixed at build time. */
export const dynamic = 'force-dynamic';

/**
 * What the site tells a crawler it may look at.
 *
 * Everything a visitor can read is open. The panel and the file endpoints behind it are not, because
 * a page that answers a form or serves an upload is not content, and a search engine that follows it
 * only wastes its own time.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await siteOrigin();

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/api'],
    },
    // Without a configured address there is nothing absolute to point at, so the file says nothing
    // about one; the sitemap is still reachable at /sitemap.xml for anyone who asks.
    sitemap: origin ? absoluteUrl('/sitemap.xml', origin) : undefined,
    host: origin || undefined,
  };
}
