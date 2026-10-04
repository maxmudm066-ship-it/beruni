import { Geist_Mono, Noto_Sans, Playfair_Display } from 'next/font/google';
import { cn } from '@/lib/utils';

// cyrillic + latin-ext are required: the admin panel and two of the three site languages
// are Cyrillic-script, and Google subsetting silently drops glyphs that are not requested.
const playfairDisplayHeading = Playfair_Display({
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  variable: '--font-heading',
  display: 'swap',
});

const notoSans = Noto_Sans({
  subsets: ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext'],
  variable: '--font-sans',
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
});

/**
 * The panel and the public site each render their own <html> so that the lang attribute can
 * follow the language of that branch — one shared root layout cannot know both. The shell
 * classes therefore live here instead of in either layout.
 */
export const rootClassName = cn(
  'h-full',
  'antialiased',
  geistMono.variable,
  notoSans.variable,
  playfairDisplayHeading.variable,
  'font-sans',
);

/**
 * The public site additionally carries the institute's own colours, which the panel is kept out of —
 * see the `.site` block of `globals.css`.
 */
export const siteRootClassName = cn(rootClassName, 'site');
