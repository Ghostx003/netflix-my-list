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
    const originalTitle = typeof raw === 'string' ? raw : raw.title;
    const videoId = typeof raw === 'string' ? undefined : raw.videoId;

    if (!originalTitle || !originalTitle.trim()) continue;

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
