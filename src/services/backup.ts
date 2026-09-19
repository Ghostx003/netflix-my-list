import { LibraryItem, AppSettings, BackupData } from '../types';
import {
  getAllLibraryItems,
  saveLibraryItems,
  clearLibrary,
  getSettings,
  saveSettings,
  normalizeLibraryItem,
  getAllCachedMetadata,
  restoreCachedMetadata,
  getAllCachedThumbnails,
  restoreCachedThumbnails,
} from './db';
import { createDuplicateKey } from './normalizer';

/**
 * Creates and triggers download of a full application JSON snapshot
 */
export async function exportBackup(
  customItems?: LibraryItem[],
  customSettings?: AppSettings,
  includeCachedThumbnails: boolean = false
): Promise<string> {
  const items = customItems && customItems.length > 0 ? customItems : await getAllLibraryItems();
  const settings = customSettings || (await getSettings());

  const metadataCache = await getAllCachedMetadata();
  const cachedThumbnails = includeCachedThumbnails ? await getAllCachedThumbnails() : undefined;

  const backup: BackupData = {
    version: 2,
    exportedAt: new Date().toISOString(),
    items: items.map(normalizeLibraryItem),
    settings,
    metadataCache,
    cachedThumbnails,
  };

  const jsonString = JSON.stringify(backup, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `netflix-watchlist-backup-${dateStr}.json`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return filename;
}

/**
 * Validates a parsed JSON file to see if it is a valid backup
 */
export function validateBackup(parsed: any): { valid: boolean; error?: string; data?: BackupData } {
  if (!parsed || typeof parsed !== 'object') {
    return { valid: false, error: 'File does not contain valid JSON.' };
  }

  if (!Array.isArray(parsed.items)) {
    return { valid: false, error: 'Backup does not contain a valid "items" array.' };
  }

  const items = parsed.items.map(normalizeLibraryItem);
  const settings = parsed.settings || {};

  return {
    valid: true,
    data: {
      version: parsed.version || 1,
      exportedAt: parsed.exportedAt || new Date().toISOString(),
      items,
      settings,
      metadataCache: parsed.metadataCache,
      cachedThumbnails: parsed.cachedThumbnails,
    },
  };
}

/**
 * Imports a validated backup by replacing the entire database
 */
export async function importBackupReplace(backup: BackupData): Promise<{ count: number }> {
  await clearLibrary();
  await saveLibraryItems(backup.items);
  if (backup.settings) {
    await saveSettings(backup.settings);
  }
  if (backup.metadataCache && Array.isArray(backup.metadataCache)) {
    await restoreCachedMetadata(backup.metadataCache);
  }
  if (backup.cachedThumbnails && typeof backup.cachedThumbnails === 'object') {
    await restoreCachedThumbnails(backup.cachedThumbnails);
  }
  return { count: backup.items.length };
}

/**
 * Imports a validated backup by merging with existing data, preventing duplicates
 */
export async function importBackupMerge(backup: BackupData): Promise<{
  addedCount: number;
  updatedCount: number;
  totalCount: number;
}> {
  const existing = await getAllLibraryItems();
  const existingMap = new Map<string, LibraryItem>();
  const existingById = new Map<string, LibraryItem>();
  for (const item of existing) {
    existingById.set(item.id, item);
  }

  for (const item of existing) {
    existingMap.set(createDuplicateKey(item.originalTitle), item);
    if (item.externalTitle) {
      existingMap.set(createDuplicateKey(item.externalTitle), item);
    }
    if (item.previousTitle) {
      existingMap.set(createDuplicateKey(item.previousTitle), item);
    }
    if (item.videoId) {
      existingMap.set(`vid_${item.videoId}`, item);
    }
    existingMap.set(`id_${item.id}`, item);
  }

  let addedCount = 0;
  let updatedCount = 0;
  const processedIds = new Set<string>();

  for (const incoming of backup.items) {
    const key = createDuplicateKey(incoming.originalTitle);
    const prevKey = incoming.previousTitle ? createDuplicateKey(incoming.previousTitle) : null;
    const vidKey = incoming.videoId ? `vid_${incoming.videoId}` : null;
    const idKey = `id_${incoming.id}`;

    const existingMatch =
      existingMap.get(idKey) ||
      (vidKey ? existingMap.get(vidKey) : null) ||
      existingMap.get(key) ||
      (prevKey ? existingMap.get(prevKey) : null);

    if (existingMatch && !processedIds.has(existingMatch.id)) {
      processedIds.add(existingMatch.id);
      const merged: LibraryItem = {
        ...existingMatch,
        ...incoming,
        id: existingMatch.id,
        originalTitle: incoming.originalTitle || existingMatch.originalTitle,
        externalTitle: incoming.externalTitle || existingMatch.externalTitle,
        normalizedTitle: incoming.normalizedTitle || existingMatch.normalizedTitle,
        viewingStatus: incoming.viewingStatus || existingMatch.viewingStatus,
        progress: incoming.progress || existingMatch.progress,
        droppedReason: incoming.droppedReason || existingMatch.droppedReason,
        droppedNotes: incoming.droppedNotes || existingMatch.droppedNotes,
        droppedAt: incoming.droppedAt || existingMatch.droppedAt,
        isCompleted: incoming.isCompleted ?? existingMatch.isCompleted,
        completedAt: incoming.completedAt || existingMatch.completedAt,
        userStarRating: incoming.userStarRating || existingMatch.userStarRating,
        genres: Array.from(new Set([...(existingMatch.genres || []), ...(incoming.genres || [])])),
        countries: Array.from(new Set([...(existingMatch.countries || []), ...(incoming.countries || [])])),
        updatedAt: new Date().toISOString(),
      };
      existingById.set(existingMatch.id, merged);
      updatedCount++;
    } else if (!existingMatch) {
      existingById.set(incoming.id, incoming);
      processedIds.add(incoming.id);
      addedCount++;
    }
  }

  const mergedList = Array.from(existingById.values());
  await saveLibraryItems(mergedList);

  if (backup.metadataCache && Array.isArray(backup.metadataCache)) {
    await restoreCachedMetadata(backup.metadataCache);
  }
  if (backup.cachedThumbnails && typeof backup.cachedThumbnails === 'object') {
    await restoreCachedThumbnails(backup.cachedThumbnails);
  }

  return {
    addedCount,
    updatedCount,
    totalCount: mergedList.length,
  };
}
