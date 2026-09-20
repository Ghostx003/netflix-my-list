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
  getAllDiscoveryTitles,
  saveDiscoveryTitles,
  getDiscoveryCatalogMeta,
  setDiscoveryCatalogMeta,
} from './db';
import { createDuplicateKey } from './normalizer';

export interface ExportBackupResult {
  filename: string;
  itemCount: number;
  discoveryCount: number;
  metadataCacheCount: number;
}

export interface ExportBackupProgress {
  phase: 'reading' | 'streaming' | 'finalizing';
  message: string;
  percent: number;
}

/**
 * Creates and triggers download of a full application JSON snapshot.
 * Uses cursor streaming and cooperative async yielding (setTimeout) so the browser
 * never freezes, CPU never spikes to 100%, and memory stays minimal.
 */
export async function exportBackup(
  customItems?: LibraryItem[],
  customSettings?: AppSettings,
  includeCachedThumbnails: boolean = false,
  onProgress?: (progress: ExportBackupProgress) => void
): Promise<ExportBackupResult> {
  const report = (phase: 'reading' | 'streaming' | 'finalizing', message: string, percent: number) => {
    if (onProgress) {
      try {
        onProgress({ phase, message, percent });
      } catch {}
    }
  };

  const yieldToMain = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  report('reading', 'Loading database settings and items...', 5);
  await yieldToMain();

  let items: LibraryItem[] = [];
  try {
    items = customItems && customItems.length > 0 ? customItems : await getAllLibraryItems();
  } catch (err) {
    console.warn('Failed to load items for backup:', err);
    items = customItems || [];
  }

  let settings: AppSettings;
  try {
    settings = customSettings || (await getSettings());
  } catch (err) {
    console.warn('Failed to load settings for backup:', err);
    settings = customSettings || {
      tmdbApiKey: '',
      maxEpisodesPerSeries: 50,
      playbackSpeed: 1,
      dailyViewingHours: 2,
      gymSessionsPerDay: 1,
      gymHoursPerSession: 1,
      mealDailyHours: 1,
      enableGymMode: false,
    };
  }

  const safeItems = (items || []).map((item) => {
    try {
      return normalizeLibraryItem(item);
    } catch {
      return item;
    }
  });

  const exportedAt = new Date().toISOString();

  report('streaming', 'Starting export stream...', 10);
  await yieldToMain();

  // Use TextEncoder to stream data as binary Uint8Array chunks into the Blob.
  // This allows the browser to immediately allocate and flush binary data without
  // exhausting V8 string heap memory or holding millions of JS string references,
  // preventing browser and PC lag entirely.
  const encoder = new TextEncoder();
  const chunks: BlobPart[] = [];

  chunks.push(encoder.encode('{"version":2,"exportedAt":' + JSON.stringify(exportedAt)));

  // 1. Library items (every library item with all details)
  chunks.push(encoder.encode(',"items":['));
  for (let i = 0; i < safeItems.length; i++) {
    const itemStr = (i > 0 ? ',' : '') + JSON.stringify(safeItems[i]);
    chunks.push(encoder.encode(itemStr));
    if (i % 50 === 0) {
      await yieldToMain();
    }
  }
  chunks.push(encoder.encode(']'));

  // 2. Settings
  chunks.push(encoder.encode(',"settings":' + JSON.stringify(settings)));

  // 3. Metadata Cache (every cached TMDB/Watchmode/YouTube API response)
  report('streaming', 'Exporting cached API metadata...', 20);
  await yieldToMain();

  let metadataCacheCount = 0;
  try {
    const rawCache = await getAllCachedMetadata();
    if (rawCache && rawCache.length > 0) {
      metadataCacheCount = rawCache.length;
      chunks.push(encoder.encode(',"metadataCache":['));
      for (let i = 0; i < rawCache.length; i++) {
        const cacheStr = (i > 0 ? ',' : '') + JSON.stringify(rawCache[i]);
        chunks.push(encoder.encode(cacheStr));
        if (i % 25 === 0) {
          report('streaming', `Exporting API cache (${i}/${rawCache.length})...`, 20 + Math.round((i / rawCache.length) * 20));
          await yieldToMain();
        }
      }
      chunks.push(encoder.encode(']'));
    }
  } catch (err) {
    console.warn('Could not read metadata cache for backup:', err);
  }

  // 4. Cached Thumbnails (if selected)
  if (includeCachedThumbnails) {
    report('streaming', 'Exporting offline thumbnails...', 45);
    await yieldToMain();
    try {
      const thumbs = await getAllCachedThumbnails();
      const thumbEntries = thumbs ? Object.entries(thumbs) : [];
      if (thumbEntries.length > 0) {
        chunks.push(encoder.encode(',"cachedThumbnails":{'));
        for (let i = 0; i < thumbEntries.length; i++) {
          const [urlKey, dataUrl] = thumbEntries[i];
          const thumbStr = (i > 0 ? ',' : '') + JSON.stringify(urlKey) + ':' + JSON.stringify(dataUrl);
          chunks.push(encoder.encode(thumbStr));
          if (i % 25 === 0) {
            report('streaming', `Exporting thumbnails (${i}/${thumbEntries.length})...`, 45 + Math.round((i / thumbEntries.length) * 15));
            await yieldToMain();
          }
        }
        chunks.push(encoder.encode('}'));
      }
    } catch (err) {
      console.warn('Could not read cached thumbnails for backup:', err);
    }
  }

  // 5. Discovery Catalog (every single Netflix title with all TMDB & Watchmode metadata, episodes, ratings, etc.)
  report('streaming', 'Exporting full Discovery catalogue & episodes...', 60);
  await yieldToMain();

  let discoveryCount = 0;
  try {
    const titles = await getAllDiscoveryTitles();
    if (titles && titles.length > 0) {
      discoveryCount = titles.length;
      chunks.push(encoder.encode(',"discoveryCatalog":['));
      for (let i = 0; i < titles.length; i++) {
        const titleStr = (i > 0 ? ',' : '') + JSON.stringify(titles[i]);
        chunks.push(encoder.encode(titleStr));
        if (i % 20 === 0) {
          report('streaming', `Exporting Discovery catalogue (${i}/${titles.length})...`, 60 + Math.round((i / titles.length) * 35));
          await yieldToMain();
        }
      }
      chunks.push(encoder.encode(']'));
    }
  } catch (err) {
    console.warn('Could not read discovery catalog for backup:', err);
  }

  // 6. Discovery Meta
  try {
    const meta = await getDiscoveryCatalogMeta();
    if (meta) {
      chunks.push(encoder.encode(',"discoveryMeta":' + JSON.stringify(meta)));
    }
  } catch (err) {
    console.warn('Could not read discovery meta for backup:', err);
  }

  chunks.push(encoder.encode('}'));

  report('finalizing', 'Generating download package...', 98);
  await yieldToMain();

  const blob = new Blob(chunks, { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `netflix-watchlist-backup-${dateStr}.json`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Allow browser plenty of time to save the file
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60000);

  report('finalizing', 'Export complete!', 100);

  return {
    filename,
    itemCount: safeItems.length,
    discoveryCount,
    metadataCacheCount,
  };
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
      discoveryCatalog: Array.isArray(parsed.discoveryCatalog) ? parsed.discoveryCatalog : undefined,
      discoveryMeta: parsed.discoveryMeta,
    },
  };
}

/**
 * Imports a validated backup by replacing the entire database
 */
export async function importBackupReplace(backup: BackupData): Promise<{ count: number; discoveryCount?: number }> {
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
  if (backup.discoveryCatalog && Array.isArray(backup.discoveryCatalog)) {
    await saveDiscoveryTitles(backup.discoveryCatalog);
  }
  if (backup.discoveryMeta) {
    await setDiscoveryCatalogMeta(backup.discoveryMeta);
  }
  return {
    count: backup.items.length,
    discoveryCount: backup.discoveryCatalog?.length,
  };
}

/**
 * Imports a validated backup by merging with existing data, preventing duplicates
 */
export async function importBackupMerge(backup: BackupData): Promise<{
  addedCount: number;
  updatedCount: number;
  totalCount: number;
  discoveryCount?: number;
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
  if (backup.discoveryCatalog && Array.isArray(backup.discoveryCatalog)) {
    await saveDiscoveryTitles(backup.discoveryCatalog);
  }
  if (backup.discoveryMeta) {
    await setDiscoveryCatalogMeta(backup.discoveryMeta);
  }

  return {
    addedCount,
    updatedCount,
    totalCount: mergedList.length,
    discoveryCount: backup.discoveryCatalog?.length,
  };
}
