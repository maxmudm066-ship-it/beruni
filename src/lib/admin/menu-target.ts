/**
 * Where a menu item may point.
 *
 * The value ends up in an href on the public site and is echoed back into the editor form after a
 * rejected save, so both paths go through the same check: internal paths may not be
 * protocol-relative (`//example.com` navigates off-site), external links must really be http(s),
 * and an anchor must start with `#`.
 */
export const MENU_TARGET_TYPES = ['page', 'content', 'external', 'section'] as const;

export type MenuTargetType = (typeof MENU_TARGET_TYPES)[number];

export function isMenuTargetType(value: unknown): value is MenuTargetType {
  return typeof value === 'string' && (MENU_TARGET_TYPES as readonly string[]).includes(value);
}

export function normalizeMenuTarget(
  targetType: MenuTargetType,
  raw: string,
): { url: string | null; invalid: boolean } {
  const value = raw.trim().slice(0, 500);
  if (targetType === 'page') {
    if (!value) return { url: null, invalid: true };
    if (!value.startsWith('/') || value.startsWith('//')) return { url: null, invalid: true };
    if (/[\s<>"]/u.test(value)) return { url: null, invalid: true };
    return { url: value, invalid: false };
  }
  if (targetType === 'external') {
    if (!value) return { url: null, invalid: true };
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { url: null, invalid: true };
      return { url: parsed.toString(), invalid: false };
    } catch {
      return { url: null, invalid: true };
    }
  }
  if (targetType === 'section') {
    const anchor = value.startsWith('#') ? value : `#${value}`;
    if (anchor.length < 2 || /[\s<>"]/u.test(anchor)) return { url: null, invalid: true };
    return { url: anchor, invalid: false };
  }
  // 'content' takes its address from the linked material, never from the form.
  return { url: null, invalid: false };
}
