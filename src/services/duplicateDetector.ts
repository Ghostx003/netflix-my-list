import { LibraryItem, NetflixRawItem } from '../types';
import { createDuplicateKey, normalizeTitle } from './normalizer';

export interface DeduplicationResult {
  newItems: LibraryItem[];
  duplicateCount: number;
  skippedTitles: string[];
}

/**
 * Deduplicates incoming raw Netflix items against both the existing library
 * and other items within the current import batch.
 */
export function deduplicateAndPrepareItems(
  incomingItems: (NetflixRawItem | string)[],
  existingLibrary: LibraryItem[]
): DeduplicationResult {
  const seenKeys = new Set<string>(
    existingLibrary.map((item) => createDuplicateKey(item.normalizedTitle || item.originalTitle))
  );

  const newItems: LibraryItem[] = [];
  const skippedTitles: string[] = [];
  const now = new Date().toISOString();

  for (const raw of incomingItems) {
    let originalTitle = typeof raw === 'string' ? raw : raw.title;
    let videoId = typeof raw === 'string' ? undefined : raw.videoId;

    if (!originalTitle || !originalTitle.trim()) continue;

    // Detect if user pasted a Netflix URL into the title input (e.g., https://www.netflix.com/title/81234567 or netflix.com/watch/81234567)
    const netflixUrlMatch = originalTitle.match(/netflix\.com\/(?:title|watch)\/([a-zA-Z0-9_-]+)/i);
    if (netflixUrlMatch) {
      videoId = videoId || netflixUrlMatch[1];
      // Clean up title if it's just the URL
      if (/^https?:\/\//i.test(originalTitle.trim())) {
        const urlObj = new URL(originalTitle.trim().startsWith('http') ? originalTitle.trim() : `https://${originalTitle.trim()}`);
        const parts = urlObj.pathname.split('/').filter(Boolean);
        // If path is like /title/81234567, attempt to use remaining or slug
        const possibleName = parts[parts.length - 1];
        if (possibleName && !/^\d+$/.test(possibleName)) {
          originalTitle = decodeURIComponent(possibleName).replace(/[-_]/g, ' ');
        }
      }
    }

    const normalized = normalizeTitle(originalTitle);
    const key = createDuplicateKey(normalized);

    if (!key) continue;

    if (seenKeys.has(key)) {
      skippedTitles.push(originalTitle);
      continue;
    }

    seenKeys.add(key);

    newItems.push({
      id: 'item_' + Math.random().toString(36).slice(2, 9) + '_' + Date.now(),
      originalTitle: originalTitle.trim(),
      normalizedTitle: normalized,
      videoId,
      mediaType: 'unknown',
      status: 'pending',
      addedAt: now,
      updatedAt: now,
    });
  }

  return {
    newItems,
    duplicateCount: skippedTitles.length,
    skippedTitles,
  };
}
