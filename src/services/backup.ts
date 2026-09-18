import { LibraryItem, AppSettings, BackupData } from '../types';
import { getAllLibraryItems, saveLibraryItems, clearLibrary, getSettings, saveSettings, normalizeLibraryItem } from './db';
import { createDuplicateKey } from './normalizer';

/**
 * Creates and triggers download of a full application JSON snapshot
 */
export async function exportBackup(): Promise<string> {
  const items = await getAllLibraryItems();
  const settings = await getSettings();

  const backup: BackupData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    items,
    settings,
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
 * Validates a parsed JSON file to see if it is avalid backup
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

  for (const item of existing) {
    const key = createDuplicateKey(item.originalTitle);
    existingMap.set(key, item);
  }

  let addedCount = 0;
  let updatedCount = 0;

  for (const incoming of backup.items) {
    const key = createDuplicateKey(incoming.originalTitle);
    if (existingMap.has(key)) {
      const current = existingMap.get(key)!;
      const merged: LibraryItem = {
        ...current,
        ...incoming,
        id: current.id,
        viewingStatus: incoming.viewingStatus || current.viewingStatus,
        progress: incoming.progress || current.progress,
        droppedReason: incoming.droppedReason || current.droppedReason,
        droppedNotes: incoming.droppedNotes || current.droppedNotes,
        droppedAt: incoming.droppedAt || current.droppedAt,
        isCompleted: incoming.isCompleted ?? current.isCompleted,
        completedAt: incoming.completedAt || current.completedAt,
        userStarRating: incoming.userStarRating || current.userStarRating,
        genres: Array.from(new Set([...(current.genres || []), ...(incoming.genres || [])])),
        countries: Array.from(new Set([...(current.countries || []), ...(incoming.countries || [])])),
        updatedAt: new Date().toISOString(),
      };
      existingMap.set(key, merged);
      updatedCount++;
    } else {
      existingMap.set(key, incoming);
      addedCount++;
    }
  }

  const mergedList = Array.from(existingMap.values());
  await saveLibraryItems(mergedList);

  return {
    addedCount,
    updatedCount,
    totalCount: mergedList.length,
  };
}
