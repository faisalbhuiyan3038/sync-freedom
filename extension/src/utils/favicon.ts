/**
 * utils/favicon.ts — Favicon URL resolver for remote tabs
 *
 * Since remote tabs' favicons are not available locally, we use Google's
 * favicon service as a reliable fallback. Works for any public domain.
 */

const GOOGLE_FAVICON_BASE = 'https://www.google.com/s2/favicons';
const FAVICON_SIZE = 32;

/**
 * Returns a favicon URL for a given page URL.
 * Prefers the tab's own favIconUrl if provided, falls back to Google's service.
 */
export function getFaviconUrl(pageUrl: string, favIconUrl?: string): string {
  // If the extension provided a favicon URL, use it (but only if it's a valid HTTP(S) URL)
  if (favIconUrl && (favIconUrl.startsWith('http://') || favIconUrl.startsWith('https://'))) {
    return favIconUrl;
  }

  // Extract hostname and use Google's service
  try {
    const url = new URL(pageUrl);
    return `${GOOGLE_FAVICON_BASE}?domain=${encodeURIComponent(url.hostname)}&sz=${FAVICON_SIZE}`;
  } catch {
    // Invalid URL — return a generic icon data URL
    return getGenericFavicon();
  }
}

/**
 * Returns a simple SVG data URL as a fallback favicon.
 */
function getGenericFavicon(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect width="32" height="32" rx="6" fill="#2a2d42"/>
    <circle cx="16" cy="16" r="8" fill="none" stroke="#6366f1" stroke-width="2"/>
    <line x1="16" y1="8" x2="16" y2="24" stroke="#6366f1" stroke-width="2"/>
    <line x1="8" y1="16" x2="24" y2="16" stroke="#6366f1" stroke-width="2"/>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Checks if a URL is a browser internal URL (chrome://, about:, etc.)
 * These shouldn't be synced as remote tabs.
 */
export function isInternalUrl(url: string): boolean {
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('about:') ||
    url.startsWith('edge://') ||
    url.startsWith('brave://') ||
    url.startsWith('vivaldi://') ||
    url.startsWith('opera://') ||
    url.startsWith('kiwi://') ||
    url === '' ||
    url === 'about:blank' ||
    url === 'about:newtab'
  );
}
