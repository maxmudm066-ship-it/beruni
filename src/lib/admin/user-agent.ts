/** Turns a stored User-Agent string into something a non-technical staff member can read. */
export function describeUserAgent(userAgent: string | null): string {
  if (!userAgent) return '—';
  const ua = userAgent.toLowerCase();

  const browser = ua.includes('edg/')
    ? 'Edge'
    : ua.includes('opr/') || ua.includes('opera')
      ? 'Opera'
      : ua.includes('firefox')
        ? 'Firefox'
        : ua.includes('chrome') || ua.includes('crios')
          ? 'Chrome'
          : ua.includes('safari')
            ? 'Safari'
            : 'Browser';

  const device = ua.includes('iphone')
    ? 'iPhone'
    : ua.includes('ipad')
      ? 'iPad'
      : ua.includes('android')
        ? 'Android'
        : ua.includes('windows')
          ? 'Windows'
          : ua.includes('mac os') || ua.includes('macos')
            ? 'macOS'
            : ua.includes('linux')
              ? 'Linux'
              : '';

  return device ? `${browser} · ${device}` : browser;
}
