export function normalizeTitle(title: string): string {
  if (!title) return '';
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`]/g, "'")
    .replace(/[–—_:]/g, ' ')
    .replace(/[^a-z0-9\s']/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function createDuplicateKey(title: string): string {
  return normalizeTitle(title)
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Generates the official direct Netflix link for an item.
 * If videoId exists (e.g. numeric ID '80057281' or slug), direct title/watch URL is used:
 * https://www.netflix.com/title/{videoId}
 * Otherwise falls back to official Netflix search:
 * https://www.netflix.com/search?q={query}
 */
export function getNetflixUrl(item: { videoId?: string; originalTitle: string; externalTitle?: string }): string {
  if (item.videoId) {
    const cleanId = item.videoId.toString().trim();
    // Pure numeric or alphanumeric Netflix video ID
    if (/^\d+$/.test(cleanId)) {
      return `https://www.netflix.com/title/${cleanId}`;
    }
    // If it has letters/numbers or hyphens
    if (/^[a-zA-Z0-9_-]+$/.test(cleanId) && cleanId.length >= 4) {
      return `https://www.netflix.com/title/${cleanId}`;
    }
  }
  const query = item.externalTitle || item.originalTitle;
  return `https://www.netflix.com/search?q=${encodeURIComponent(query)}`;
}

