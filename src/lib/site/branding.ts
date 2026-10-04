/**
 * What the site is called and how to reach it.
 *
 * All of it comes from Settings, in the language of the page being rendered: a content manager
 * types the institute name once per language and every header, footer and page title follows. One
 * settings load covers a request, and the two picture settings are resolved to their files here,
 * because the panel stores a Media Library id, not a URL.
 */
import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/db';
import { loadSettings, settingValue, type SettingStore } from '@/lib/settings';
import { findSetting, type SettingField } from '@/lib/admin/settings-catalog';

export interface Branding {
  siteName: string;
  shortName: string;
  logoUrl: string | null;
  address: string;
  footerNote: string;
  phone: string;
  email: string;
  fax: string;
  workingHours: string;
  /** Where the institute sits on a map, as a normal link typed in Settings. */
  map: string;
  titleSuffix: string;
  ogImage: string | null;
  socials: { key: string; url: string }[];
}

const SOCIAL_KEYS = ['telegram', 'youtube', 'facebook', 'instagram', 'linkedin'] as const;

function field(group: string, key: string): SettingField {
  const found = findSetting(group, key);
  if (!found) throw new Error(`Unknown setting: ${group}.${key}`);
  return found;
}

function text(store: SettingStore, group: string, key: string, lang: string): string {
  return settingValue(store, field(group, key), lang).trim();
}

/**
 * The file a picture setting points at, largest usable copy first.
 *
 * `social` asks for the address a link-preview crawler will fetch: those crawlers read a plain
 * JPEG, while the optimised copies of the same picture are AVIF and WebP for browsers only.
 */
async function pictureUrl(mediaId: string, social = false): Promise<string | null> {
  if (!mediaId) return null;
  const media = await prisma.media.findFirst({
    where: { id: mediaId, kind: 'image' },
    select: { publicUrl: true, variants: { select: { role: true, publicUrl: true } } },
  });
  if (!media) return null;
  if (social) return media.publicUrl;
  const preferred = ['large', 'medium', 'small', 'original'].map((role) =>
    media.variants.find((variant) => variant.role === role),
  );
  return preferred.find((variant) => variant?.publicUrl)?.publicUrl ?? media.publicUrl;
}

export const loadBranding = cache(async (lang: string): Promise<Branding> => {
  const store = await loadSettings();

  const socials: { key: string; url: string }[] = [];
  for (const key of SOCIAL_KEYS) {
    const url = text(store, 'social', key, lang);
    if (url) socials.push({ key, url });
  }

  const logoId = text(store, 'general', 'logo', lang);
  const ogId = text(store, 'seo', 'og_image', lang);
  const [logoUrl, ogImage] = await Promise.all([pictureUrl(logoId), pictureUrl(ogId, true)]);

  return {
    siteName: text(store, 'general', 'site_name', lang),
    shortName: text(store, 'general', 'site_short_name', lang),
    logoUrl,
    address: text(store, 'general', 'address', lang),
    footerNote: text(store, 'general', 'footer_note', lang),
    phone: text(store, 'contact', 'phone', lang),
    email: text(store, 'contact', 'email', lang),
    fax: text(store, 'contact', 'fax', lang),
    workingHours: text(store, 'contact', 'working_hours', lang),
    map: text(store, 'contact', 'map', lang),
    titleSuffix: text(store, 'seo', 'site_title_suffix', lang),
    ogImage,
    socials,
  };
});
