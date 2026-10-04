const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ы: 'y',
  ь: '', э: 'e', ю: 'yu', я: 'ya',
  і: 'i', ї: 'i', є: 'e', ґ: 'g',
};

// Uzbek Latin letters with apostrophes are part of ordinary words: o', g', sh'
const APOSTROPHES = /[ʻʼ’'`´]/g;

export interface SlugOptions {
  /** Do not transliterate Cyrillic; used when the title is already Latin. */
  keepNonLatin?: boolean;
  maxLength?: number;
}

/** Turn a title in any of the site languages into a Latin, hyphen-separated URL slug. */
export function slugify(input: string, options: SlugOptions = {}): string {
  const maxLength = options.maxLength ?? 120;
  let value = (input ?? '').normalize('NFC').trim().toLowerCase();

  value = value.replace(APOSTROPHES, '');

  if (!options.keepNonLatin) {
    value = value.replace(/[а-яё]/gu, (ch) => CYRILLIC[ch] ?? ch);
  }

  value = value
    .replace(/&/g, '-and-')
    .replace(/[#%@+*/\\<>{}[\]()|!:;,".?^~=]/g, ' ')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');

  if (value.length > maxLength) {
    value = value.slice(0, maxLength).replace(/-$/, '');
  }

  return value;
}

/** Guarantee uniqueness by appending -2, -3, … */
export function withSuffix(slug: string, taken: Set<string>): string {
  if (!taken.has(slug)) return slug;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${slug}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${slug}-${Date.now()}`;
}
